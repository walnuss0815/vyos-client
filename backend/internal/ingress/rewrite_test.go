package ingress

import (
	"bytes"
	"compress/gzip"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// This file is a whitebox test (package ingress, not ingress_test) so
// it can temporarily lower maxRewritableBodyBytes for
// TestRewriteResponseBody_OversizedBodyPassesThroughUnmodified below.

func TestRewriteAbsolutePaths(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "double-quoted href",
			in:   `<a href="/dashboard">Home</a>`,
			want: `<a href="/ingress/nas/dashboard">Home</a>`,
		},
		{
			name: "double-quoted src",
			in:   `<script src="/dist/login.js"></script>`,
			want: `<script src="/ingress/nas/dist/login.js"></script>`,
		},
		{
			name: "single-quoted src",
			in:   `<script src='/dist/login.js'></script>`,
			want: `<script src='/ingress/nas/dist/login.js'></script>`,
		},
		{
			name: "action and formaction",
			in:   `<form action="/login"><button formaction="/submit">Go</button></form>`,
			want: `<form action="/ingress/nas/login"><button formaction="/ingress/nas/submit">Go</button></form>`,
		},
		{
			name: "attribute name is case-insensitive",
			in:   `<SCRIPT SRC="/dist/login.js"></SCRIPT>`,
			want: `<SCRIPT SRC="/ingress/nas/dist/login.js"></SCRIPT>`,
		},
		{
			name: "bare root path",
			in:   `<a href="/">Home</a>`,
			want: `<a href="/ingress/nas/">Home</a>`,
		},
		{
			name: "relative path is left alone",
			in:   `<script src="dist/login.js"></script>`,
			want: `<script src="dist/login.js"></script>`,
		},
		{
			name: "dot-relative path is left alone",
			in:   `<a href="./page">Page</a>`,
			want: `<a href="./page">Page</a>`,
		},
		{
			name: "protocol-relative URL is left alone",
			in:   `<script src="//cdn.example.com/lib.js"></script>`,
			want: `<script src="//cdn.example.com/lib.js"></script>`,
		},
		{
			name: "absolute URL is left alone",
			in:   `<a href="https://example.com/page">External</a>`,
			want: `<a href="https://example.com/page">External</a>`,
		},
		{
			name: "css url unquoted",
			in:   `body { background: url(/img/bg.png); }`,
			want: `body { background: url(/ingress/nas/img/bg.png); }`,
		},
		{
			name: "css url double-quoted",
			in:   `body { background: url("/img/bg.png"); }`,
			want: `body { background: url("/ingress/nas/img/bg.png"); }`,
		},
		{
			name: "css url single-quoted",
			in:   `body { background: url('/img/bg.png'); }`,
			want: `body { background: url('/ingress/nas/img/bg.png'); }`,
		},
		{
			name: "css url with whitespace inside parens",
			in:   `body { background: url( /img/bg.png ); }`,
			want: `body { background: url(/ingress/nas/img/bg.png); }`,
		},
		{
			name: "css url with protocol-relative source is left alone",
			in:   `body { background: url(//cdn.example.com/bg.png); }`,
			want: `body { background: url(//cdn.example.com/bg.png); }`,
		},
		{
			name: "inline style block inside HTML is also rewritten",
			in:   `<html><style>body{background:url(/img/bg.png)}</style><a href="/x">x</a></html>`,
			want: `<html><style>body{background:url(/ingress/nas/img/bg.png)}</style><a href="/ingress/nas/x">x</a></html>`,
		},
		{
			name: "multiple occurrences all rewritten",
			in:   `<link href="/a.css"><link href="/b.css"><script src="/c.js"></script>`,
			want: `<link href="/ingress/nas/a.css"><link href="/ingress/nas/b.css"><script src="/ingress/nas/c.js"></script>`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := string(rewriteAbsolutePaths([]byte(tc.in), "/ingress/nas"))
			if got != tc.want {
				t.Errorf("rewriteAbsolutePaths(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestIsRewritableContentType(t *testing.T) {
	cases := []struct {
		contentType string
		want        bool
	}{
		{"text/html", true},
		{"text/html; charset=utf-8", true},
		{"text/css", true},
		{"text/css; charset=utf-8", true},
		{"application/javascript", false},
		{"text/javascript", false},
		{"image/png", false},
		{"application/json", false},
		{"", false},
		{"not a content type;;;", false},
	}
	for _, tc := range cases {
		t.Run(tc.contentType, func(t *testing.T) {
			if got := isRewritableContentType(tc.contentType); got != tc.want {
				t.Errorf("isRewritableContentType(%q) = %v, want %v", tc.contentType, got, tc.want)
			}
		})
	}
}

func TestDecodeBody(t *testing.T) {
	t.Run("no encoding", func(t *testing.T) {
		body, decoded, err := decodeBody([]byte("hello"), "")
		if err != nil || !decoded || string(body) != "hello" {
			t.Errorf("got (%q, %v, %v), want (hello, true, nil)", body, decoded, err)
		}
	})

	t.Run("identity", func(t *testing.T) {
		body, decoded, err := decodeBody([]byte("hello"), "identity")
		if err != nil || !decoded || string(body) != "hello" {
			t.Errorf("got (%q, %v, %v), want (hello, true, nil)", body, decoded, err)
		}
	})

	t.Run("gzip", func(t *testing.T) {
		var buf bytes.Buffer
		gw := gzip.NewWriter(&buf)
		_, _ = gw.Write([]byte("hello, gzipped"))
		_ = gw.Close()

		body, decoded, err := decodeBody(buf.Bytes(), "gzip")
		if err != nil || !decoded || string(body) != "hello, gzipped" {
			t.Errorf("got (%q, %v, %v), want (hello, gzipped, true, nil)", body, decoded, err)
		}
	})

	t.Run("invalid gzip is an error", func(t *testing.T) {
		_, decoded, err := decodeBody([]byte("not actually gzip"), "gzip")
		if err == nil || decoded {
			t.Errorf("got decoded=%v err=%v, want decoded=false and a non-nil error", decoded, err)
		}
	})

	t.Run("unsupported encoding is not an error", func(t *testing.T) {
		body, decoded, err := decodeBody([]byte("raw brotli-ish bytes"), "br")
		if err != nil || decoded {
			t.Errorf("got (decoded=%v, err=%v), want (false, nil)", decoded, err)
		}
		if string(body) != "raw brotli-ish bytes" {
			t.Errorf("expected the original raw bytes to be returned unchanged, got %q", body)
		}
	})
}

func testLoggerForRewrite() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestRewriteResponseBody_RewritesHTML(t *testing.T) {
	resp := &http.Response{
		Header: http.Header{"Content-Type": []string{"text/html; charset=utf-8"}},
		Body:   io.NopCloser(strings.NewReader(`<script src="/app.js"></script>`)),
	}
	if err := rewriteResponseBody(resp, "/ingress/nas", testLoggerForRewrite()); err != nil {
		t.Fatalf("rewriteResponseBody: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != `<script src="/ingress/nas/app.js"></script>` {
		t.Errorf("body = %q", body)
	}
	if want := len(`<script src="/ingress/nas/app.js"></script>`); resp.Header.Get("Content-Length") != strconv.Itoa(want) {
		t.Errorf("Content-Length = %q, want %d (len of the rewritten body)", resp.Header.Get("Content-Length"), want)
	}
}

func TestRewriteResponseBody_DecodesGzipAndRewrites(t *testing.T) {
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	_, _ = gw.Write([]byte(`<script src="/app.js"></script>`))
	_ = gw.Close()

	resp := &http.Response{
		Header: http.Header{
			"Content-Type":     []string{"text/html"},
			"Content-Encoding": []string{"gzip"},
		},
		Body: io.NopCloser(bytes.NewReader(buf.Bytes())),
	}
	if err := rewriteResponseBody(resp, "/ingress/nas", testLoggerForRewrite()); err != nil {
		t.Fatalf("rewriteResponseBody: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != `<script src="/ingress/nas/app.js"></script>` {
		t.Errorf("body = %q", body)
	}
	if resp.Header.Get("Content-Encoding") != "" {
		t.Errorf("expected Content-Encoding to be removed, got %q", resp.Header.Get("Content-Encoding"))
	}
}

func TestRewriteResponseBody_NonRewritableContentTypeUntouched(t *testing.T) {
	original := `<script src="/app.js"></script>` // deliberately HTML-shaped, but wrong content type
	resp := &http.Response{
		Header: http.Header{"Content-Type": []string{"application/javascript"}},
		Body:   io.NopCloser(strings.NewReader(original)),
	}
	if err := rewriteResponseBody(resp, "/ingress/nas", testLoggerForRewrite()); err != nil {
		t.Fatalf("rewriteResponseBody: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != original {
		t.Errorf("body = %q, want the original left completely untouched", body)
	}
	if _, ok := resp.Header["Content-Length"]; ok {
		t.Error("expected no Content-Length header to have been added for an untouched response")
	}
}

func TestRewriteResponseBody_UnsupportedEncodingPassesThroughUnmodified(t *testing.T) {
	original := "not brotli-decodable by us, but still valid bytes"
	resp := &http.Response{
		Header: http.Header{
			"Content-Type":     []string{"text/html"},
			"Content-Encoding": []string{"br"},
		},
		Body: io.NopCloser(strings.NewReader(original)),
	}
	if err := rewriteResponseBody(resp, "/ingress/nas", testLoggerForRewrite()); err != nil {
		t.Fatalf("rewriteResponseBody: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != original {
		t.Errorf("body = %q, want the original bytes passed through unmodified", body)
	}
	if resp.Header.Get("Content-Encoding") != "br" {
		t.Errorf("expected Content-Encoding to be left as-is, got %q", resp.Header.Get("Content-Encoding"))
	}
}

func TestRewriteResponseBody_InvalidGzipReturnsError(t *testing.T) {
	resp := &http.Response{
		Header: http.Header{
			"Content-Type":     []string{"text/html"},
			"Content-Encoding": []string{"gzip"},
		},
		Body: io.NopCloser(strings.NewReader("not actually gzip data")),
	}
	// A decode failure is handled internally (logged, passed through
	// unmodified) - it must NOT surface as an error, or ReverseProxy
	// would abort the response entirely instead of serving the
	// (unrewritten, but otherwise perfectly valid) original bytes.
	if err := rewriteResponseBody(resp, "/ingress/nas", testLoggerForRewrite()); err != nil {
		t.Fatalf("rewriteResponseBody: %v, want nil (decode failures degrade gracefully)", err)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "not actually gzip data" {
		t.Errorf("body = %q, want the original bytes passed through unmodified", body)
	}
}

// TestRewriteResponseBody_OversizedBodyPassesThroughUnmodified is a
// whitebox test (package ingress) so it can temporarily lower
// maxRewritableBodyBytes instead of needing a genuinely huge fixture
// response.
func TestRewriteResponseBody_OversizedBodyPassesThroughUnmodified(t *testing.T) {
	original := maxRewritableBodyBytes
	maxRewritableBodyBytes = 10
	defer func() { maxRewritableBodyBytes = original }()

	body := `<script src="/this-is-longer-than-ten-bytes.js"></script>`
	resp := &http.Response{
		Header: http.Header{"Content-Type": []string{"text/html"}},
		Body:   io.NopCloser(strings.NewReader(body)),
	}
	if err := rewriteResponseBody(resp, "/ingress/nas", testLoggerForRewrite()); err != nil {
		t.Fatalf("rewriteResponseBody: %v", err)
	}
	got, _ := io.ReadAll(resp.Body)
	if string(got) != body {
		t.Errorf("body = %q, want the original left completely untouched", got)
	}
}

// TestRewriteResponseBody_ThroughRealHTTPResponse guards against any
// of the above only happening to work with the hand-built
// *http.Response fixtures used elsewhere in this file, by exercising
// the same logic against a genuine response parsed by net/http from
// an httptest.Server round trip.
func TestRewriteResponseBody_ThroughRealHTTPResponse(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<script src="/app.js"></script>`))
	}))
	defer upstream.Close()

	resp, err := http.Get(upstream.URL)
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	if err := rewriteResponseBody(resp, "/ingress/nas", testLoggerForRewrite()); err != nil {
		t.Fatalf("rewriteResponseBody: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != `<script src="/ingress/nas/app.js"></script>` {
		t.Errorf("body = %q", body)
	}
}
