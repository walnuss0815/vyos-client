package imageupdate

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// basicAuthEncoding matches net/http.Request.SetBasicAuth's own
// encoding (standard base64, not URL-safe) - used here instead of
// that method directly because the Basic-auth challenge path builds
// the header value once and reuses it as a cached string (see
// fetchTagsPage's authHeader parameter), rather than setting it fresh
// on every retried request.
var basicAuthEncoding = base64.StdEncoding

const (
	// defaultTimeout bounds each individual HTTP request this client
	// makes (a token exchange, or one page of a tag listing) - tag
	// listing is a small, fast API call on every registry this
	// project has tested against, nothing like the multi-minute
	// `podman pull` self-upgrade/the Images tab have to accommodate.
	defaultTimeout = 10 * time.Second
	// maxResponseBodyBytes caps how much of any single response this
	// client reads into memory - same defense-in-depth reasoning as
	// vyos.Client's and selfupgrade.Client's own limits of the same
	// name.
	maxResponseBodyBytes = 4 * 1024 * 1024
	// tagsPageSize is requested explicitly on every page - both so a
	// registry that would otherwise return its entire tag list
	// unprompted in one response is bounded, and so a repository with
	// many tag variants actually fits within maxTagPages below.
	// Confirmed against a real, unusually tag-heavy public image
	// (netbirdio/netbird, ~1800 tags across ~5 variants per release -
	// base/-amd64/-arm/-arm64v8/-rootless) that a smaller page size
	// (100) could truncate before reaching its newest tags at all,
	// silently reporting "up to date" against an incomplete list -
	// 1000 comfortably covers it (and the vast majority of
	// real-world images) in 1-2 requests.
	tagsPageSize = 1000
	// maxTagPages bounds how many pages ListTags will follow via the
	// registry's own Link:...rel="next" pagination - a bounded,
	// predictable number of requests rather than an unbounded loop
	// driven entirely by what the registry's response says, matching
	// selfupgrade.Client's own maxPages reasoning. Manual/on-demand
	// triggering (see docs/architecture.md) makes a modestly higher
	// bound than selfupgrade's 5 reasonable here.
	maxTagPages = 10
	// defaultCacheTTL is Config.CacheTTL's default when left at its
	// zero value - see that field's own doc comment. Shorter than
	// selfupgrade.Client's own 30-minute default: this exists mainly
	// to collapse near-simultaneous duplicate lookups (a background
	// check and a manual "Check for update" click overlapping, or
	// several containers sharing the same image), not to meaningfully
	// reduce steady-state registry load the way GitHub's release
	// polling cache does.
	defaultCacheTTL = 10 * time.Minute
)

// Credentials authenticates against a registry - looked up from a
// matching VyOS `container registry <name>` entry's `authentication
// username`/`authentication password` (see
// api.lookupRegistryCredentials). Both fields are empty for an
// anonymous request, which still works for public images on Docker
// Hub/GHCR/Quay - the auth-challenge/token exchange happens
// regardless, just without a Basic-auth step feeding into it.
type Credentials struct {
	Username string
	Password string
}

func (c *Credentials) empty() bool {
	return c == nil || (c.Username == "" && c.Password == "")
}

// Config configures a Client.
type Config struct {
	// HTTPClient overrides the client used for ordinary (non-
	// insecure-registry) requests. Mainly for tests, which point this
	// at an httptest.NewTLSServer's own pre-configured client (which
	// trusts that server's self-signed certificate) rather than
	// standing up a real trusted-CA-signed test registry. Production
	// always leaves this nil, getting a plain &http.Client{Timeout:
	// ...} that verifies certificates normally.
	HTTPClient *http.Client
	// Timeout bounds each individual HTTP request. Defaults to
	// defaultTimeout.
	Timeout time.Duration
	// CacheTTL bounds how long a successful ListTags result is reused
	// for the same (APIHost, Repository) pair before a fresh registry
	// request is made again - avoids hitting the same registry twice
	// in quick succession, e.g. when a background check
	// (internal/containerupdatecheck) and a manual "Check for update"
	// click happen to overlap, or two containers share the same image
	// reference. Zero means defaultCacheTTL, the same "zero means use
	// the default, not disabled" convention
	// internal/selfupgrade.Client's own CacheTTL already uses. Only
	// successful results are cached - a failed lookup is always
	// retried on the very next call, same as before this field
	// existed.
	CacheTTL time.Duration
}

// Client lists tags from a Docker Distribution v2-compatible registry
// - Docker Hub, GHCR, Quay, and most self-hosted registries all
// implement this same protocol, including its challenge/response
// authentication flow. Only tag listing is implemented (no
// manifest/blob fetching), since only tag *names* are ever needed
// here.
type Client struct {
	timeout    time.Duration
	httpClient *http.Client
	cacheTTL   time.Duration

	mu                 sync.Mutex
	insecureHTTPClient *http.Client

	cacheMu sync.Mutex
	cache   map[string]tagsCacheEntry
}

type tagsCacheEntry struct {
	tags     []string
	cachedAt time.Time
}

// NewClient constructs a Client from cfg.
func NewClient(cfg Config) *Client {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = defaultTimeout
	}
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: timeout}
	}
	cacheTTL := cfg.CacheTTL
	if cacheTTL == 0 {
		cacheTTL = defaultCacheTTL
	}
	return &Client{
		timeout:    timeout,
		httpClient: httpClient,
		cacheTTL:   cacheTTL,
		cache:      map[string]tagsCacheEntry{},
	}
}

func (c *Client) httpClientFor(insecure bool) *http.Client {
	if !insecure {
		return c.httpClient
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.insecureHTTPClient == nil {
		c.insecureHTTPClient = &http.Client{
			Timeout:   c.timeout,
			Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}, //nolint:gosec // deliberate, opt-in per VyOS's own `container registry <name> insecure` flag - see ListTags's doc comment.
		}
	}
	return c.insecureHTTPClient
}

// ListTags returns every tag published for ref.Repository on
// ref.APIHost, authenticating with creds if the registry challenges
// for it. insecure mirrors a matching VyOS `container registry <name>
// insecure` flag: when true, requests fall back to plain HTTP if an
// HTTPS connection can't be established at all (VyOS/Podman's own
// "insecure registry" meaning: tolerate self-signed certificates or a
// registry with no TLS at all), and TLS certificate verification is
// skipped for any HTTPS attempt.
//
// A successful result is cached for Config.CacheTTL, keyed on
// ref.APIHost+ref.Repository (not on creds/insecure - in practice
// both are constant for a given host+repository within one process's
// lifetime, since they're derived from the same VyOS `container
// registry <name>` entry every time). See Config.CacheTTL's own doc
// comment for why this exists.
func (c *Client) ListTags(ctx context.Context, ref Reference, creds *Credentials, insecure bool) ([]string, error) {
	key := ref.APIHost + "/" + ref.Repository
	if tags, ok := c.cachedTags(key); ok {
		return tags, nil
	}
	tags, err := c.listTagsUncached(ctx, ref, creds, insecure)
	if err != nil {
		return nil, err
	}
	c.storeTags(key, tags)
	return tags, nil
}

func (c *Client) cachedTags(key string) ([]string, bool) {
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()
	entry, ok := c.cache[key]
	if !ok || time.Since(entry.cachedAt) >= c.cacheTTL {
		return nil, false
	}
	return entry.tags, true
}

func (c *Client) storeTags(key string, tags []string) {
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()
	c.cache[key] = tagsCacheEntry{tags: tags, cachedAt: time.Now()}
}

// listTagsUncached is ListTags' original body, unconditionally
// hitting the registry - see ListTags for the caching wrapper around
// this.
func (c *Client) listTagsUncached(ctx context.Context, ref Reference, creds *Credentials, insecure bool) ([]string, error) {
	httpClient := c.httpClientFor(insecure)

	scheme := "https"
	firstURL := fmt.Sprintf("%s://%s/v2/%s/tags/list?n=%d", scheme, ref.APIHost, ref.Repository, tagsPageSize)

	var authHeader string
	tags, next, err := c.fetchTagsPage(ctx, httpClient, firstURL, creds, &authHeader)
	if err != nil && insecure && isConnectionError(err) {
		// VyOS's own "insecure" flag also covers a registry with no
		// TLS at all, not only an untrusted certificate (which the
		// InsecureSkipVerify transport above already tolerates) - a
		// connection-level failure (as opposed to an HTTP-level
		// error response) against https is the only reliable signal
		// that this is that case, since a plain-HTTP-only server
		// doesn't produce an HTTP response to an HTTPS request at
		// all.
		scheme = "http"
		firstURL = fmt.Sprintf("%s://%s/v2/%s/tags/list?n=%d", scheme, ref.APIHost, ref.Repository, tagsPageSize)
		authHeader = ""
		tags, next, err = c.fetchTagsPage(ctx, httpClient, firstURL, creds, &authHeader)
	}
	if err != nil {
		return nil, err
	}

	all := tags
	pageURL := next
	for page := 1; page < maxTagPages && pageURL != ""; page++ {
		resolved, err := resolvePageURL(scheme, ref.APIHost, pageURL)
		if err != nil {
			return nil, err
		}
		pageTags, next, err := c.fetchTagsPage(ctx, httpClient, resolved, creds, &authHeader)
		if err != nil {
			return nil, err
		}
		all = append(all, pageTags...)
		pageURL = next
	}
	return all, nil
}

// manifestAcceptHeader lists every manifest media type in common
// use - OCI and legacy Docker v2 schema2, both single-manifest and
// multi-arch manifest-list/index shapes. A registry can 404 a
// manifest request for a real, existing tag if the Accept header
// doesn't include whatever type it actually stored that image as, so
// this needs to be permissive rather than assuming one specific
// shape - confirmed necessary against real GHCR images, which are
// multi-arch manifest lists even for this project's own amd64-only
// build.
const manifestAcceptHeader = "application/vnd.oci.image.manifest.v1+json, " +
	"application/vnd.oci.image.index.v1+json, " +
	"application/vnd.docker.distribution.manifest.v2+json, " +
	"application/vnd.docker.distribution.manifest.list.v2+json"

// TagExists reports whether ref.Tag exists as a real, pullable image
// on ref.APIHost/ref.Repository - a lightweight manifest existence
// check (GET /v2/<repository>/manifests/<tag>), not a full tag-list
// fetch, since only a yes/no answer is needed here. Used by self-
// upgrade to verify a GitHub release's corresponding image was
// actually published to GHCR before enabling its "Upgrade" button -
// see docs/architecture.md's "Self-upgrade" section for why a GitHub
// Release and its GHCR image aren't guaranteed to appear together (or
// at all, if the image build failed).
func (c *Client) TagExists(ctx context.Context, ref Reference, creds *Credentials, insecure bool) (bool, error) {
	httpClient := c.httpClientFor(insecure)

	scheme := "https"
	firstURL := fmt.Sprintf("%s://%s/v2/%s/manifests/%s", scheme, ref.APIHost, ref.Repository, ref.Tag)

	var authHeader string
	exists, err := c.fetchManifestExists(ctx, httpClient, firstURL, creds, &authHeader)
	if err != nil && insecure && isConnectionError(err) {
		// Same insecure-registry HTTP fallback as ListTags - see its
		// own doc comment for the full reasoning.
		scheme = "http"
		firstURL = fmt.Sprintf("%s://%s/v2/%s/manifests/%s", scheme, ref.APIHost, ref.Repository, ref.Tag)
		authHeader = ""
		exists, err = c.fetchManifestExists(ctx, httpClient, firstURL, creds, &authHeader)
	}
	return exists, err
}

// fetchManifestExists issues the manifest existence check, handling a
// 401 challenge exactly like fetchTagsPage does (same Bearer token
// exchange/Basic auth machinery, reused as-is - the scope needed for
// a manifest pull is derived from whatever the registry's own
// challenge specifies, nothing tags-list-specific is hardcoded in
// that path).
func (c *Client) fetchManifestExists(ctx context.Context, httpClient *http.Client, manifestURL string, creds *Credentials, authHeader *string) (bool, error) {
	resp, err := c.doGet(ctx, httpClient, manifestURL, manifestAcceptHeader, *authHeader)
	if err != nil {
		return false, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusUnauthorized {
		challenge := resp.Header.Get("WWW-Authenticate")
		newAuth, cErr := c.authenticate(ctx, httpClient, challenge, creds)
		if cErr != nil {
			return false, cErr
		}
		*authHeader = newAuth
		resp2, err := c.doGet(ctx, httpClient, manifestURL, manifestAcceptHeader, *authHeader)
		if err != nil {
			return false, err
		}
		defer func() { _ = resp2.Body.Close() }()
		return decodeManifestExists(resp2)
	}

	return decodeManifestExists(resp)
}

// decodeManifestExists interprets a manifest-check response: 200
// means the tag exists, 404 means it doesn't (a normal, expected
// outcome, not an error), anything else is a real error. The body
// itself is never decoded (only its status matters for an existence
// check) but is still drained, bounded the same way
// decodeTagsResponse's is, so the connection can be reused and a
// pathological response can't be read unbounded.
func decodeManifestExists(resp *http.Response) (bool, error) {
	limited := io.LimitReader(resp.Body, maxResponseBodyBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return false, fmt.Errorf("imageupdate: reading registry response: %w", err)
	}
	if len(body) > maxResponseBodyBytes {
		return false, fmt.Errorf("imageupdate: registry response exceeded %d bytes, aborting read", maxResponseBodyBytes)
	}
	switch resp.StatusCode {
	case http.StatusOK:
		return true, nil
	case http.StatusNotFound:
		return false, nil
	default:
		return false, fmt.Errorf("imageupdate: registry returned %d: %s", resp.StatusCode, truncate(string(body), 500))
	}
}

// isConnectionError reports whether err looks like a transport-level
// failure (couldn't establish a connection/TLS handshake at all) as
// opposed to a successfully-received HTTP error response - the only
// case ListTags falls back from https to plain http for an insecure
// registry.
func isConnectionError(err error) bool {
	var urlErr *url.Error
	return errors.As(err, &urlErr)
}

type tagsListResponse struct {
	Name string   `json:"name"`
	Tags []string `json:"tags"`
}

// fetchTagsPage fetches one page of pageURL, handling a 401
// challenge (bearer token exchange or Basic auth) transparently. On
// success, *authHeader is updated to the Authorization header value
// that worked, reused as a first attempt on the next page (avoiding a
// redundant token exchange per page) - if a reused header is ever
// rejected, this method still re-runs the full challenge once more
// (see the 401 handling below), so an expired token mid-pagination
// doesn't hard-fail the whole listing.
func (c *Client) fetchTagsPage(ctx context.Context, httpClient *http.Client, pageURL string, creds *Credentials, authHeader *string) (tags []string, next string, err error) {
	resp, err := c.doGet(ctx, httpClient, pageURL, "application/json", *authHeader)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusUnauthorized {
		challenge := resp.Header.Get("WWW-Authenticate")
		newAuth, cErr := c.authenticate(ctx, httpClient, challenge, creds)
		if cErr != nil {
			return nil, "", cErr
		}
		*authHeader = newAuth
		resp2, err := c.doGet(ctx, httpClient, pageURL, "application/json", *authHeader)
		if err != nil {
			return nil, "", err
		}
		defer func() { _ = resp2.Body.Close() }()
		return decodeTagsResponse(resp2)
	}

	return decodeTagsResponse(resp)
}

// doGet issues a GET request against reqURL with the given Accept
// header (JSON for a tags-list request, manifestAcceptHeader for a
// manifest existence check - see TagExists) and, if set, an
// Authorization header carrying a previously-obtained token/Basic
// value.
func (c *Client) doGet(ctx context.Context, httpClient *http.Client, reqURL, accept, authHeader string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("imageupdate: building request: %w", err)
	}
	req.Header.Set("Accept", accept)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("imageupdate: calling registry: %w", err)
	}
	return resp, nil
}

func decodeTagsResponse(resp *http.Response) ([]string, string, error) {
	limited := io.LimitReader(resp.Body, maxResponseBodyBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", fmt.Errorf("imageupdate: reading registry response: %w", err)
	}
	if len(body) > maxResponseBodyBytes {
		return nil, "", fmt.Errorf("imageupdate: registry response exceeded %d bytes, aborting read", maxResponseBodyBytes)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("imageupdate: registry returned %d: %s", resp.StatusCode, truncate(string(body), 500))
	}

	var out tagsListResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, "", fmt.Errorf("imageupdate: decoding registry response: %w", err)
	}

	next := ""
	if m := linkNextPattern.FindStringSubmatch(resp.Header.Get("Link")); m != nil {
		next = m[1]
	}
	return out.Tags, next, nil
}

// linkNextPattern extracts the URL/path of a `rel="next"` entry from
// a Docker Distribution v2 Link header, e.g.
// `</v2/library/nginx/tags/list?last=1.2.3&n=100>; rel="next"` - the
// same simple pattern-match approach as selfupgrade.Client's own
// linkNextPattern, for the same reason (a full RFC 8288
// Link-header-parsing dependency isn't warranted for this one use).
var linkNextPattern = regexp.MustCompile(`<([^>]+)>;\s*rel="next"`)

// resolvePageURL resolves a Link header's next-page reference (which
// the spec allows to be a relative path, e.g.
// "/v2/library/nginx/tags/list?last=...&n=100", though some
// registries return an absolute URL instead) against the same
// scheme/host the first page request used.
func resolvePageURL(scheme, apiHost, ref string) (string, error) {
	u, err := url.Parse(ref)
	if err != nil {
		return "", fmt.Errorf("imageupdate: parsing pagination Link: %w", err)
	}
	if u.IsAbs() {
		return ref, nil
	}
	u.Scheme = scheme
	u.Host = apiHost
	return u.String(), nil
}

// bearerChallengePattern extracts realm/service/scope from a
// `WWW-Authenticate: Bearer realm="...",service="...",scope="..."`
// header - the standard Docker Distribution v2 token-auth challenge.
// service/scope are optional per the spec (a registry may omit
// either), so both submatches may be empty.
var bearerChallengePattern = regexp.MustCompile(`realm="([^"]*)"(?:,service="([^"]*)")?(?:,scope="([^"]*)")?`)

// authenticate handles a 401 response's WWW-Authenticate challenge,
// returning the Authorization header value to retry the original
// request with. Supports the two schemes the Docker Distribution v2
// spec defines: token-based Bearer auth (used by Docker Hub, GHCR,
// Quay, and most registries, even for anonymous/public-image access -
// the token exchange itself just skips the Basic-auth step when creds
// is empty) and direct Basic auth (used by some simpler/self-hosted
// registries, which challenge for credentials on every request rather
// than issuing a short-lived token).
func (c *Client) authenticate(ctx context.Context, httpClient *http.Client, challenge string, creds *Credentials) (string, error) {
	switch {
	case strings.HasPrefix(challenge, "Bearer "):
		m := bearerChallengePattern.FindStringSubmatch(challenge)
		if m == nil || m[1] == "" {
			return "", fmt.Errorf("imageupdate: registry sent an unrecognized Bearer challenge: %q", challenge)
		}
		return c.fetchBearerToken(ctx, httpClient, m[1], m[2], m[3], creds)
	case strings.HasPrefix(challenge, "Basic "):
		if creds.empty() {
			return "", fmt.Errorf("imageupdate: registry requires authentication, but no matching " +
				"`container registry <name>` credentials are configured")
		}
		return "Basic " + basicAuthValue(creds.Username, creds.Password), nil
	default:
		return "", fmt.Errorf("imageupdate: registry returned 401 with an unrecognized WWW-Authenticate scheme: %q", challenge)
	}
}

type tokenResponse struct {
	Token       string `json:"token"`
	AccessToken string `json:"access_token"`
}

// fetchBearerToken exchanges realm/service/scope for a short-lived
// bearer token, per the Docker Distribution v2 token-auth spec.
// Anonymous (creds empty) requests are still made - Docker
// Hub/GHCR/Quay all issue a pull-scoped token for a public image with
// no credentials at all, which is what makes checking a public
// image's tags for updates work without any `container registry`
// entry configured.
func (c *Client) fetchBearerToken(ctx context.Context, httpClient *http.Client, realm, service, scope string, creds *Credentials) (string, error) {
	u, err := url.Parse(realm)
	if err != nil {
		return "", fmt.Errorf("imageupdate: parsing token realm %q: %w", realm, err)
	}
	q := u.Query()
	if service != "" {
		q.Set("service", service)
	}
	if scope != "" {
		q.Set("scope", scope)
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", fmt.Errorf("imageupdate: building token request: %w", err)
	}
	if !creds.empty() {
		req.SetBasicAuth(creds.Username, creds.Password)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("imageupdate: fetching registry token: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	limited := io.LimitReader(resp.Body, maxResponseBodyBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return "", fmt.Errorf("imageupdate: reading token response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("imageupdate: registry token endpoint returned %d: %s", resp.StatusCode, truncate(string(body), 500))
	}

	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return "", fmt.Errorf("imageupdate: decoding token response: %w", err)
	}
	token := tr.Token
	if token == "" {
		token = tr.AccessToken
	}
	if token == "" {
		return "", fmt.Errorf("imageupdate: registry token response had no token/access_token field")
	}
	return "Bearer " + token, nil
}

func basicAuthValue(username, password string) string {
	return basicAuthEncoding.EncodeToString([]byte(username + ":" + password))
}

// truncate shortens s to at most n bytes, walking back to the nearest
// UTF-8 rune boundary first so a multi-byte character in a registry's
// error response is never split into invalid UTF-8 - same reasoning
// as selfupgrade.Client's own truncate helper.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	cut := n
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + "…"
}
