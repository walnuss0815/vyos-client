package api

import (
	"net/http"

	"github.com/walnuss0815/vyos-client/backend/internal/containerupdatecheck"
	"github.com/walnuss0815/vyos-client/backend/internal/imageupdate"
)

type checkContainerImageUpdateRequest struct {
	Image string `json:"image"`
}

type checkContainerImageUpdateResponse struct {
	// Enabled mirrors Server.ContainerUpdateChecksEnabled - when
	// false, every other field is left at its zero value and no
	// registry is ever contacted at all (see the handler's own doc
	// comment).
	Enabled bool `json:"enabled"`
	// CurrentTag is the submitted image reference's own tag
	// ("latest" if none was given explicitly).
	CurrentTag string `json:"currentTag,omitempty"`
	// Recognized is false when CurrentTag isn't a version tag this
	// app knows how to compare (e.g. "latest", a branch name, or a
	// digest-pinned reference) - no update comparison was possible at
	// all. The frontend uses this to distinguish "checked, you're up
	// to date" from "can't check updates for this tag", which
	// otherwise look identical (UpdateAvailable=false, no LatestTag).
	Recognized bool `json:"recognized"`
	// LatestTag is the newest tag found sharing CurrentTag's exact
	// "flavor" (leading "v", suffix, patch-presence - see
	// imageupdate.NewestMatching) - "" if none is newer, or
	// Recognized is false.
	LatestTag string `json:"latestTag,omitempty"`
	// UpdateAvailable is only ever true when Recognized is also true.
	UpdateAvailable bool `json:"updateAvailable"`
	// NewImageRef is the full image reference to pull/queue if the
	// operator accepts the suggested update ("" unless
	// UpdateAvailable is true) - the submitted image string with only
	// its trailing tag replaced, preserving everything else exactly
	// as the operator originally typed it (see imageupdate.ReplaceTag).
	NewImageRef string `json:"newImageRef,omitempty"`
}

// handleCheckContainerImageUpdate serves POST
// /api/container/images/check-update ({"image": "..."}) - the
// Containers page's "Check for update" button. When disabled (the
// default - see config.Config.ContainerUpdateChecksEnabled), this
// returns {"enabled": false} immediately without ever contacting a
// registry, same convention as handleSelfUpgradeStatus.
//
// Unlike self-upgrade (which only ever calls GitHub's API for this
// project's own repo), this contacts whatever registry the submitted
// image string's own host resolves to - see docs/security.md's note
// on this being the same "authenticated operator's input determines
// an outbound request's destination" trust model already accepted for
// the system-image URL feature.
func (s *Server) handleCheckContainerImageUpdate(w http.ResponseWriter, r *http.Request) {
	if !s.ContainerUpdateChecksEnabled {
		writeJSON(w, http.StatusOK, checkContainerImageUpdateResponse{Enabled: false})
		return
	}

	var req checkContainerImageUpdateRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "malformed request")
		return
	}
	if !validateContainerImageName(req.Image) {
		writeError(w, http.StatusBadRequest, "invalid or missing image name")
		return
	}

	ref, err := imageupdate.ParseReference(req.Image)
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not parse image reference")
		return
	}

	resp := checkContainerImageUpdateResponse{Enabled: true, CurrentTag: ref.Tag}
	if ref.HasDigest {
		// A digest-pinned reference has no "newer tag" to suggest -
		// see Reference.HasDigest's doc comment. Recognized stays
		// false, same as any other tag this app can't compare.
		writeJSON(w, http.StatusOK, resp)
		return
	}

	creds, insecure, err := containerupdatecheck.LookupRegistryCredentials(r.Context(), s.VyOS, s.Logger, ref.RegistryName)
	if err != nil {
		s.handleVyOSError(w, "looking up registry credentials", err)
		return
	}

	tags, err := s.ImageRegistry.ListTags(r.Context(), ref, creds, insecure)
	if err != nil {
		s.Logger.Error("checking for container image updates", "image", req.Image, "registry", ref.APIHost, "error", err)
		writeError(w, http.StatusBadGateway, "failed checking the registry for available tags")
		return
	}

	newest, ok := imageupdate.NewestMatching(tags, ref.Tag)
	resp.Recognized = ok
	if ok && newest != "" {
		resp.LatestTag = newest
		resp.UpdateAvailable = true
		newRef, err := imageupdate.ReplaceTag(req.Image, newest)
		if err != nil {
			s.Logger.Error("building new image reference after a container image update check", "error", err)
			writeError(w, http.StatusInternalServerError, "internal error building the new image reference")
			return
		}
		resp.NewImageRef = newRef
	}

	writeJSON(w, http.StatusOK, resp)
}
