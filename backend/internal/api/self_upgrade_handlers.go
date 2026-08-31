package api

import (
	"net/http"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/selfupgrade"
)

type selfUpgradeReleaseResponse struct {
	Version string `json:"version"`
	Name    string `json:"name"`
	Body    string `json:"body"`
	// PublishedAt is RFC3339, or "" if GitHub didn't report one.
	PublishedAt string `json:"publishedAt"`
	HTMLURL     string `json:"htmlUrl"`
}

type selfUpgradeStatusResponse struct {
	// Enabled mirrors Server.SelfUpgradeEnabled - when false, every
	// other field is left at its zero value and no GitHub call is
	// made at all (see the handler's own doc comment).
	Enabled bool `json:"enabled"`
	// ContainerName is the VyOS `container name <NAME>` this app was
	// deployed as (SELF_UPGRADE_CONTAINER_NAME) - the frontend needs
	// this to build the `set container name <NAME> image <ref>` op
	// it queues when the user clicks Upgrade.
	ContainerName string `json:"containerName,omitempty"`
	// ImageRepo is "ghcr.io/<owner>/<repo>" - the frontend appends
	// ":<version>" to build the full image reference to pull.
	ImageRepo      string `json:"imageRepo,omitempty"`
	CurrentVersion string `json:"currentVersion,omitempty"`
	// LatestVersion is the newest published (non-draft, non-
	// prerelease) release found, regardless of whether it's newer
	// than CurrentVersion - "" if no releases were found at all.
	LatestVersion string `json:"latestVersion,omitempty"`
	// CurrentVersionRecognized is false when CurrentVersion isn't a
	// parseable version (e.g. "dev", a local/non-release build - see
	// cmd/vyos-client/main.go), meaning no comparison against
	// available releases was possible at all. The frontend uses this
	// to distinguish "checked, you're up to date" from "can't check
	// updates for this build" - both otherwise look identical
	// (UpdateAvailable=false, empty Releases).
	CurrentVersionRecognized bool `json:"currentVersionRecognized"`
	// UpdateAvailable is only ever true when CurrentVersionRecognized
	// is also true - see selfupgrade.NewerThan.
	UpdateAvailable bool `json:"updateAvailable"`
	// Releases lists every release newer than CurrentVersion, newest
	// first - the "what's changed since you're on" the Upgrades page
	// shows. Empty (not omitted) when up to date, so the frontend can
	// distinguish "checked, nothing newer" from "enabled: false".
	Releases []selfUpgradeReleaseResponse `json:"releases"`
}

// handleSelfUpgradeStatus serves GET /api/system/self-upgrade - the
// System > Upgrades page's data source. When self-upgrade is disabled
// (the default - see config.Config.SelfUpgradeEnabled), this returns
// {"enabled": false} immediately without ever calling GitHub, so a
// deployment that hasn't opted in makes no outbound-to-the-internet
// request at all (this is otherwise the only such call anywhere in
// this backend - see internal/selfupgrade's package doc comment).
func (s *Server) handleSelfUpgradeStatus(w http.ResponseWriter, r *http.Request) {
	if !s.SelfUpgradeEnabled {
		writeJSON(w, http.StatusOK, selfUpgradeStatusResponse{Enabled: false})
		return
	}
	// SelfUpgradeGitHub is only ever nil here if SelfUpgradeEnabled is
	// true without cmd/vyos-client/serve.go having constructed it -
	// shouldn't happen (Load() requires SELF_UPGRADE_CONTAINER_NAME
	// whenever SELF_UPGRADE_ENABLED=true, and serve.go always builds
	// the client alongside that), but guarded explicitly rather than
	// trusting that invariant, since a nil-pointer panic here would
	// take down the whole request instead of failing this one
	// endpoint cleanly.
	if s.SelfUpgradeGitHub == nil {
		s.Logger.Error("self-upgrade is enabled but no GitHub client was configured")
		writeError(w, http.StatusInternalServerError, "self-upgrade is misconfigured; contact your administrator")
		return
	}

	resp := selfUpgradeStatusResponse{
		Enabled:        true,
		ContainerName:  s.SelfUpgradeContainerName,
		ImageRepo:      "ghcr.io/" + s.SelfUpgradeGitHub.Repo(),
		CurrentVersion: s.Version,
		Releases:       []selfUpgradeReleaseResponse{},
	}

	releases, err := s.SelfUpgradeGitHub.ListReleases(r.Context())
	if err != nil {
		s.Logger.Error("checking for self-upgrade releases", "error", err)
		writeError(w, http.StatusBadGateway, "failed checking for updates on GitHub")
		return
	}
	// releases is sorted newest-first (see selfupgrade.Client.
	// ListReleases), but a release's Version can be "" if its tag
	// isn't a recognizable semver - skip past any such entries rather
	// than reporting an empty LatestVersion just because the very
	// newest release happened to have a malformed tag while an older
	// one is perfectly fine.
	for _, rel := range releases {
		if rel.Version != "" {
			resp.LatestVersion = rel.Version
			break
		}
	}

	// newer/ok is false (not an error) when s.Version isn't a
	// recognizable version - e.g. "dev", the default for local/
	// non-release builds (see cmd/vyos-client/main.go). Leaving
	// UpdateAvailable=false and Releases empty in that case is
	// correct: no comparison is possible, but that's not a failure.
	if newer, ok := selfupgrade.NewerThan(releases, s.Version); ok {
		resp.CurrentVersionRecognized = true
		resp.UpdateAvailable = len(newer) > 0
		resp.Releases = make([]selfUpgradeReleaseResponse, 0, len(newer))
		for _, rel := range newer {
			var publishedAt string
			if !rel.PublishedAt.IsZero() {
				publishedAt = rel.PublishedAt.Format(time.RFC3339)
			}
			resp.Releases = append(resp.Releases, selfUpgradeReleaseResponse{
				Version:     rel.Version,
				Name:        rel.Name,
				Body:        rel.Body,
				PublishedAt: publishedAt,
				HTMLURL:     rel.HTMLURL,
			})
		}
	}

	writeJSON(w, http.StatusOK, resp)
}
