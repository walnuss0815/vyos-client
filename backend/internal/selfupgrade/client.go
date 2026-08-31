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
	"sort"
	"strings"
	"sync"
	"time"
)

// defaultBaseURL is GitHub's REST API base - overridable via
// Config.BaseURL, only intended for tests (see client_test.go).
const defaultBaseURL = "https://api.github.com"

const (
	defaultTimeout  = 10 * time.Second
	defaultCacheTTL = 30 * time.Minute
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
}

// Client fetches this app's own GitHub releases. See the package doc
// comment for when this is constructed at all.
type Client struct {
	repo       string
	baseURL    string
	httpClient *http.Client
	cacheTTL   time.Duration

	mu       sync.Mutex
	cached   []Release
	cachedAt time.Time
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

	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = defaultBaseURL
	}

	return &Client{
		repo:       cfg.Repo,
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: httpClient,
		cacheTTL:   cacheTTL,
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
func (c *Client) ListReleases(ctx context.Context) ([]Release, error) {
	c.mu.Lock()
	if !c.cachedAt.IsZero() && time.Since(c.cachedAt) < c.cacheTTL {
		cached := c.cached
		c.mu.Unlock()
		return cached, nil
	}
	c.mu.Unlock()

	releases, err := c.fetchReleases(ctx)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.cached = releases
	c.cachedAt = time.Now()
	c.mu.Unlock()
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

func (c *Client) fetchReleases(ctx context.Context) ([]Release, error) {
	url := fmt.Sprintf("%s/repos/%s/releases?per_page=100", c.baseURL, c.repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("selfupgrade: building request: %w", err)
	}
	// GitHub rejects requests with no User-Agent, and recommends
	// pinning Accept/API-Version to the current REST API shape.
	req.Header.Set("User-Agent", "vyos-client-self-upgrade")
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("selfupgrade: calling GitHub releases API: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	limited := io.LimitReader(resp.Body, maxResponseBodyBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("selfupgrade: reading GitHub releases response: %w", err)
	}
	if len(body) > maxResponseBodyBytes {
		return nil, fmt.Errorf("selfupgrade: GitHub releases response exceeded %d bytes, aborting read", maxResponseBodyBytes)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("selfupgrade: GitHub releases API returned %d: %s", resp.StatusCode, truncate(string(body), 500))
	}

	var raw []rawRelease
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("selfupgrade: decoding GitHub releases response: %w", err)
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
		if oki && okj {
			return vi.compare(vj) > 0
		}
		// Unparseable versions (shouldn't normally happen for this
		// project's own tags) sort by publish date instead.
		return out[i].PublishedAt.After(out[j].PublishedAt)
	})
	return out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
