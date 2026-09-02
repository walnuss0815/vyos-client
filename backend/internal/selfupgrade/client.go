// Package selfupgrade fetches this app's own GitHub releases so the
// System > Upgrades page can tell an operator when a newer version is
// available and let them queue the config change to pull/apply it -
// see docs/architecture.md's "Self-upgrade" section for the full
// design and docs/security.md for why this is the one deliberate
// exception to this backend's otherwise VyOS-only network model.
//
// This package is only ever constructed when SELF_UPGRADE_ENABLED=true
// (see cmd/vyos-client/serve.go) - when the feature is disabled, no
// outbound request to GitHub is ever made.
package selfupgrade

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// defaultBaseURL is GitHub's REST API base - overridable via
// Config.BaseURL, only intended for tests (see client_test.go).
const defaultBaseURL = "https://api.github.com"

const (
	defaultTimeout  = 10 * time.Second
	defaultCacheTTL = 30 * time.Minute
	// defaultNegativeCacheTTL bounds how often a failed fetch is
	// retried - deliberately much shorter than defaultCacheTTL, but
	// still long enough to avoid repeatedly hammering GitHub's API
	// while it's down or (more likely) this Client's own source IP is
	// already rate-limited, which would otherwise only prolong that
	// limit.
	defaultNegativeCacheTTL = 2 * time.Minute
)

// Config configures a Client.
type Config struct {
	// Repo is the GitHub "owner/repo" this app's own releases are
	// published to, e.g. "walnuss0815/vyos-client" - see
	// SELF_UPGRADE_GITHUB_REPO. Also doubles as the GHCR image path
	// (ghcr.io/<Repo>), since .github/workflows/release.yml always
	// publishes images to ghcr.io/${{ github.repository }}.
	Repo string
	// BaseURL overrides the GitHub API base URL. Only for tests -
	// production always uses the real GitHub API (defaultBaseURL).
	BaseURL string
	// HTTPClient, if set, overrides the client constructed from
	// Timeout (mainly for tests).
	HTTPClient *http.Client
	// Timeout bounds each call to the GitHub API. Defaults to 10s.
	Timeout time.Duration
	// CacheTTL bounds how long a successful ListReleases result is
	// reused before the next call re-fetches from GitHub. Defaults to
	// 30 minutes - see ListReleases's own doc comment for why this
	// matters.
	CacheTTL time.Duration
	// NegativeCacheTTL bounds how often a failed fetch is retried when
	// there's no previous successful result to fall back to serving.
	// Defaults to 2 minutes. Only for tests - production has no
	// reason to override this.
	NegativeCacheTTL time.Duration
}

// Client fetches this app's own GitHub releases. See the package doc
// comment for when this is constructed at all.
type Client struct {
	repo             string
	baseURL          string
	httpClient       *http.Client
	cacheTTL         time.Duration
	negativeCacheTTL time.Duration

	mu        sync.Mutex
	cached    []Release
	cachedAt  time.Time
	lastErr   error
	lastErrAt time.Time
}

// New constructs a Client from cfg.
func New(cfg Config) (*Client, error) {
	if cfg.Repo == "" {
		return nil, fmt.Errorf("selfupgrade: Repo is required")
	}

	httpClient := cfg.HTTPClient
	if httpClient == nil {
		timeout := cfg.Timeout
		if timeout == 0 {
			timeout = defaultTimeout
		}
		httpClient = &http.Client{Timeout: timeout}
	}

	cacheTTL := cfg.CacheTTL
	if cacheTTL == 0 {
		cacheTTL = defaultCacheTTL
	}
	negativeCacheTTL := cfg.NegativeCacheTTL
	if negativeCacheTTL == 0 {
		negativeCacheTTL = defaultNegativeCacheTTL
	}

	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = defaultBaseURL
	}

	return &Client{
		repo:             cfg.Repo,
		baseURL:          strings.TrimRight(baseURL, "/"),
		httpClient:       httpClient,
		cacheTTL:         cacheTTL,
		negativeCacheTTL: negativeCacheTTL,
	}, nil
}

// Repo returns the configured "owner/repo".
func (c *Client) Repo() string { return c.repo }

// Release is one published (non-draft, non-prerelease) GitHub release
// for this Client's configured repo.
type Release struct {
	// Tag is the raw git tag name, e.g. "v1.2.3".
	Tag string
	// Version is Tag with a leading "v" stripped, e.g. "1.2.3" -
	// matching this app's own `main.version`/image-tag format (see
	// cmd/vyos-client/main.go and .github/workflows/release.yml).
	// Empty if Tag isn't a recognizable major.minor.patch version.
	Version string
	// Name is the release's title (may be empty if the release only
	// has notes and no separate title).
	Name string
	// Body is the release's notes, as GitHub-flavored Markdown -
	// rendered as-is by the frontend (see UpgradesPage.tsx).
	Body string
	// PublishedAt is when the release was published. Zero if GitHub's
	// response didn't include a parseable timestamp.
	PublishedAt time.Time
	// HTMLURL links to the release's page on github.com.
	HTMLURL string
}

// ListReleases returns every non-draft, non-prerelease release for
// this Client's configured repo, newest first, using a cached result
// when one is still fresh (see Config.CacheTTL) rather than calling
// GitHub on every request - GitHub's unauthenticated REST API is
// limited to 60 requests/hour per source IP, and this endpoint may be
// polled by an operator checking the Upgrades tab repeatedly.
//
// Draft releases are already invisible to unauthenticated callers
// like this one (GitHub itself filters them out), but prereleases are
// still returned by the API and are explicitly excluded here - a
// self-upgrade should only ever offer stable releases.
//
// Failures are handled in two ways, both aimed at not compounding a
// GitHub-side problem (an outage, or - far more likely - this
// Client's own source IP already being rate-limited) into a worse one
// for the operator:
//   - If a previous successful result exists at all, even one older
//     than CacheTTL, a failed refresh falls back to serving that
//     stale result rather than erroring - "tell the operator what we
//     last knew" beats "tell the operator nothing" when GitHub is
//     temporarily unreachable.
//   - If there's no previous result to fall back to, the failure
//     itself is cached for a short negativeCacheTTL, so repeated page
//     loads during an outage/rate-limit don't each retry immediately
//     and prolong it further.
func (c *Client) ListReleases(ctx context.Context) ([]Release, error) {
	c.mu.Lock()
	if !c.cachedAt.IsZero() && time.Since(c.cachedAt) < c.cacheTTL {
		cached := c.cached
		c.mu.Unlock()
		return cached, nil
	}
	hasStaleCache := !c.cachedAt.IsZero()
	if !hasStaleCache && !c.lastErrAt.IsZero() && time.Since(c.lastErrAt) < c.negativeCacheTTL {
		err := c.lastErr
		c.mu.Unlock()
		return nil, err
	}
	c.mu.Unlock()

	return c.fetchAndCache(ctx)
}

// ForceRefresh always performs a live GitHub fetch, bypassing both the
// positive cache (Config.CacheTTL) and the negative cache
// (Config.NegativeCacheTTL) that ListReleases itself respects - see
// that method's own doc comment for why those exist at all (avoiding
// hammering GitHub's rate-limited unauthenticated API on passive page
// loads/polling).
//
// This exists for an explicit, human-initiated "check right now"
// action (the Upgrades page's "Refresh" button) - unlike passive
// polling, a button click is inherently rate-limited by how fast a
// human can click it, so there's no reason to make that action wait
// out either cache window, up to 30 minutes, before it can possibly
// see a release that was published (or an image that was verified to
// exist) after the cache was last populated. This was the ORIGINAL,
// documented intent of ListReleases's caller in
// internal/api/self_upgrade_handlers.go, but nothing ever actually
// plumbed a bypass through to here - see that handler's own doc
// comment for how it now does.
//
// On failure, this still falls back to serving a stale cached result
// if one exists, exactly like ListReleases does - a failed forced
// check shouldn't discard a previously-known-good result.
func (c *Client) ForceRefresh(ctx context.Context) ([]Release, error) {
	return c.fetchAndCache(ctx)
}

// fetchAndCache is ListReleases/ForceRefresh's shared implementation:
// perform a live fetch, then update the cache (or fall back to
// serving a stale one) accordingly. Callers are responsible for
// deciding whether a fetch is needed at all (ListReleases) or always
// forcing one (ForceRefresh) before calling this.
func (c *Client) fetchAndCache(ctx context.Context) ([]Release, error) {
	c.mu.Lock()
	hasStaleCache := !c.cachedAt.IsZero()
	c.mu.Unlock()

	releases, err := c.fetchReleases(ctx)

	c.mu.Lock()
	defer c.mu.Unlock()
	if err != nil {
		c.lastErr = err
		c.lastErrAt = time.Now()
		if hasStaleCache {
			return c.cached, nil
		}
		return nil, err
	}
	c.lastErr = nil
	c.lastErrAt = time.Time{}
	c.cached = releases
	c.cachedAt = time.Now()
	return releases, nil
}

type rawRelease struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	Draft       bool   `json:"draft"`
	Prerelease  bool   `json:"prerelease"`
	PublishedAt string `json:"published_at"`
	HTMLURL     string `json:"html_url"`
}

// maxResponseBodyBytes caps how much of the GitHub API response this
// client reads into memory - defense-in-depth against a pathological
// or compromised response, same reasoning as vyos.Client's own
// maxResponseBodyBytes.
const maxResponseBodyBytes = 4 * 1024 * 1024

// maxPages bounds how many pages of releases fetchReleases will
// follow via GitHub's Link:...rel="next" pagination header - 100 per
// page (see nextURL/fetchReleasesPage), so 5 pages covers up to 500
// releases, comfortably beyond what this project (or a reasonable
// fork) will publish for a long time, while still keeping this a
// bounded, predictable number of requests rather than an unbounded
// loop driven entirely by whatever GitHub's response says.
const maxPages = 5

func (c *Client) fetchReleases(ctx context.Context) ([]Release, error) {
	url := fmt.Sprintf("%s/repos/%s/releases?per_page=100", c.baseURL, c.repo)

	var raw []rawRelease
	for page := 0; page < maxPages && url != ""; page++ {
		pageRaw, next, err := c.fetchReleasesPage(ctx, url)
		if err != nil {
			return nil, err
		}
		raw = append(raw, pageRaw...)
		url = next
	}

	out := make([]Release, 0, len(raw))
	for _, r := range raw {
		if r.Draft || r.Prerelease {
			continue
		}
		publishedAt, _ := time.Parse(time.RFC3339, r.PublishedAt)
		out = append(out, Release{
			Tag:         r.TagName,
			Version:     normalizeVersion(r.TagName),
			Name:        r.Name,
			Body:        r.Body,
			PublishedAt: publishedAt,
			HTMLURL:     r.HTMLURL,
		})
	}

	sort.Slice(out, func(i, j int) bool {
		vi, oki := parseSemver(out[i].Version)
		vj, okj := parseSemver(out[j].Version)
		switch {
		case oki && okj:
			return vi.compare(vj) > 0
		case oki != okj:
			// Parseable versions always sort before unparseable ones,
			// regardless of publish date - without this tier, mixing
			// the two comparison strategies (semver vs. publish date)
			// isn't a strict weak ordering, which sort.Slice requires
			// for well-defined (as opposed to merely non-panicking)
			// results.
			return oki
		default:
			// Neither side is parseable (shouldn't normally happen
			// for this project's own tags) - fall back to publish
			// date, newest first.
			return out[i].PublishedAt.After(out[j].PublishedAt)
		}
	})
	return out, nil
}

// linkNextPattern extracts the URL of a `rel="next"` entry from a
// GitHub API response's Link header, e.g.
// `<https://api.github.com/...&page=2>; rel="next", <...>; rel="last"`.
// GitHub's own Link header format is consistent enough that a simple
// pattern match is sufficient here, without pulling in a full RFC 8288
// Link-header-parsing dependency for this one use.
var linkNextPattern = regexp.MustCompile(`<([^>]+)>;\s*rel="next"`)

// fetchReleasesPage fetches one page of pageURL, returning its raw
// releases and the next page's URL (empty if this was the last page).
func (c *Client) fetchReleasesPage(ctx context.Context, pageURL string) ([]rawRelease, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("selfupgrade: building request: %w", err)
	}
	// GitHub rejects requests with no User-Agent, and recommends
	// pinning Accept/API-Version to the current REST API shape.
	req.Header.Set("User-Agent", "vyos-client-self-upgrade")
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("selfupgrade: calling GitHub releases API: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	limited := io.LimitReader(resp.Body, maxResponseBodyBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", fmt.Errorf("selfupgrade: reading GitHub releases response: %w", err)
	}
	if len(body) > maxResponseBodyBytes {
		return nil, "", fmt.Errorf("selfupgrade: GitHub releases response exceeded %d bytes, aborting read", maxResponseBodyBytes)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("selfupgrade: GitHub releases API returned %d: %s", resp.StatusCode, truncate(string(body), 500))
	}

	var raw []rawRelease
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, "", fmt.Errorf("selfupgrade: decoding GitHub releases response: %w", err)
	}

	next := ""
	if m := linkNextPattern.FindStringSubmatch(resp.Header.Get("Link")); m != nil {
		next = m[1]
	}
	return raw, next, nil
}

// truncate shortens s to at most n bytes, walking back to the nearest
// UTF-8 rune boundary first so a multi-byte character is never split
// (GitHub error response bodies can contain non-ASCII, e.g. quoted
// user input) - a plain byte-slice would otherwise be able to produce
// invalid UTF-8 in the resulting error message.
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
