package ingress

import (
	"bytes"
	"compress/gzip"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

// These patterns rewrite root-relative absolute paths - a single
// leading "/", not "//" (protocol-relative, left alone) and not a
// full "scheme://" URL (never starts with "/" at all, also left
// alone) - found in HTML attribute values and CSS url() references,
// so an upstream app that hardcodes them instead of using relative
// paths still resolves correctly once prefixed with
// "/ingress/<name>". Check whether the target has its own reverse-
// proxy/base-path setting first (e.g. ntopng's own -Z/--http-prefix
// flag) - that's more correct and complete than this best-effort
// rewrite when available; see docs/architecture.md's "Ingress"
// section.
//
// This is a plain text substitution, not a real HTML/CSS parser -
// deliberately scoped to the common cases (quoted HTML attribute
// values, quoted/unquoted CSS url()) rather than attempting full
// correctness. Explicitly out of scope: unquoted HTML attribute
// values, srcset's multi-URL syntax, meta-refresh, and - the one that
// can never be fixed this way at all - absolute paths an app's own
// JavaScript constructs at runtime (e.g. a hardcoded fetch("/api/...")
// call), rather than ones present verbatim in markup.
var (
	htmlAttrDoubleQuoted = regexp.MustCompile(`(?i)\b(href|src|action|formaction)="(/(?:[^/"][^"]*)?)"`)
	htmlAttrSingleQuoted = regexp.MustCompile(`(?i)\b(href|src|action|formaction)='(/(?:[^/'][^']*)?)'`)
	cssURLDoubleQuoted   = regexp.MustCompile(`url\(\s*"(/(?:[^/"][^"]*)?)"\s*\)`)
	cssURLSingleQuoted   = regexp.MustCompile(`url\(\s*'(/(?:[^/'][^']*)?)'\s*\)`)
	cssURLUnquoted       = regexp.MustCompile(`url\(\s*(/(?:[^/)'"\s][^)'"\s]*)?)\s*\)`)
)

// rewriteAbsolutePaths rewrites every root-relative absolute path
// matched by the patterns above in body to be prefixed with prefix
// (e.g. "/ingress/nas", no trailing slash), returning the result.
// Safe to call on both HTML (attributes and any inline <style>
// blocks' url()s - both handled by the same pass over the whole
// document, since inline styles are just more text in the same
// stream) and standalone CSS (only the url() patterns will ever
// match there).
func rewriteAbsolutePaths(body []byte, prefix string) []byte {
	s := string(body)
	s = htmlAttrDoubleQuoted.ReplaceAllString(s, `${1}="`+prefix+`${2}"`)
	s = htmlAttrSingleQuoted.ReplaceAllString(s, `${1}='`+prefix+`${2}'`)
	s = cssURLDoubleQuoted.ReplaceAllString(s, `url("`+prefix+`${1}")`)
	s = cssURLSingleQuoted.ReplaceAllString(s, `url('`+prefix+`${1}')`)
	s = cssURLUnquoted.ReplaceAllString(s, `url(`+prefix+`${1})`)
	return []byte(s)
}

// maxRewritableBodyBytes bounds how much of an HTML/CSS response body
// rewriteResponseBody will buffer in memory to rewrite. A var, not a
// const, purely so a whitebox test can lower it temporarily (see
// rewrite_test.go) without needing a pathologically large fixture
// response. Generous enough for any reasonably-sized page or
// stylesheet; a larger response is passed through unmodified rather
// than risking excessive memory use for what would be an unusually
// large HTML/CSS document.
var maxRewritableBodyBytes int64 = 20 * 1024 * 1024

// isRewritableContentType reports whether contentType (a raw
// Content-Type header value, possibly with a ";charset=..." or other
// parameter) is text/html or text/css - the only two types
// rewriteResponseBody ever touches.
func isRewritableContentType(contentType string) bool {
	if contentType == "" {
		return false
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	return mediaType == "text/html" || mediaType == "text/css"
}

// decodeBody decodes raw according to contentEncoding, a raw
// Content-Encoding header value. decoded is false (not an error) for
// an encoding this function doesn't know how to decode - anything
// other than gzip or no encoding at all, most notably Brotli, which
// is common enough from modern web servers that treating it as
// noteworthy on every single response would just be log noise. err is
// only ever set when contentEncoding claims to be gzip but raw isn't
// actually valid gzip data - a genuine problem worth surfacing.
func decodeBody(raw []byte, contentEncoding string) (body []byte, decoded bool, err error) {
	switch strings.ToLower(strings.TrimSpace(contentEncoding)) {
	case "", "identity":
		return raw, true, nil
	case "gzip":
		gz, err := gzip.NewReader(bytes.NewReader(raw))
		if err != nil {
			return nil, false, err
		}
		defer func() { _ = gz.Close() }()
		out, err := io.ReadAll(gz)
		if err != nil {
			return nil, false, err
		}
		return out, true, nil
	default:
		return raw, false, nil
	}
}

// rewriteResponseBody rewrites resp's body in place (replacing
// resp.Body and updating Content-Length/Content-Encoding as needed)
// when its Content-Type is text/html or text/css - see
// rewriteAbsolutePaths for what's actually rewritten and why. Every
// other content type, an oversized body, or a Content-Encoding this
// can't decode is left completely untouched: resp.Body is reset to a
// reader yielding the exact same bytes the upstream sent, with no
// header changes at all, so the client still gets a correct response
// either way.
func rewriteResponseBody(resp *http.Response, prefix string, logger *slog.Logger) error {
	if !isRewritableContentType(resp.Header.Get("Content-Type")) {
		return nil
	}

	limited := io.LimitReader(resp.Body, maxRewritableBodyBytes+1)
	raw, readErr := io.ReadAll(limited)
	if readErr != nil {
		_ = resp.Body.Close()
		return readErr
	}

	if int64(len(raw)) > maxRewritableBodyBytes {
		// Too large to safely buffer in full for rewriting - put the
		// bytes already read back on the front of the stream, with
		// the original resp.Body as both the continuation (it hasn't
		// been fully drained - there's more to read past what we
		// buffered) and the thing Close() actually calls through to,
		// so the underlying connection is still released normally
		// once the client finishes reading. The client ends up
		// seeing exactly what the upstream sent, in full, just
		// unmodified.
		logger.Warn("ingress response body exceeded the rewrite size limit, passing through unmodified",
			"content_type", resp.Header.Get("Content-Type"), "limit_bytes", maxRewritableBodyBytes)
		resp.Body = struct {
			io.Reader
			io.Closer
		}{io.MultiReader(bytes.NewReader(raw), resp.Body), resp.Body}
		return nil
	}

	// The entire body fit within the limit, so it's already been read
	// to EOF above - safe to close the original reader now. Every
	// path below serves a fresh, fully in-memory reader instead.
	if err := resp.Body.Close(); err != nil {
		return err
	}

	body, decoded, err := decodeBody(raw, resp.Header.Get("Content-Encoding"))
	if err != nil {
		logger.Warn("could not decode ingress response body for rewriting, passing through unmodified",
			"content_encoding", resp.Header.Get("Content-Encoding"), "error", err)
		resp.Body = io.NopCloser(bytes.NewReader(raw))
		return nil
	}
	if !decoded {
		resp.Body = io.NopCloser(bytes.NewReader(raw))
		return nil
	}

	rewritten := rewriteAbsolutePaths(body, prefix)

	resp.Body = io.NopCloser(bytes.NewReader(rewritten))
	resp.ContentLength = int64(len(rewritten))
	resp.Header.Set("Content-Length", strconv.Itoa(len(rewritten)))
	resp.Header.Del("Content-Encoding")
	resp.Header.Del("Transfer-Encoding")
	return nil
}
