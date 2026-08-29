package api

import (
	"net/http"
	"regexp"
	"time"
)

// containerImageNamePattern bounds what this app will ever pass
// through to VyOS as a container image reference. VyOS's own
// container.py (add_image/delete_image) applies zero validation or
// shell-escaping of its own - it interpolates the value directly into
// a shell command string (confirmed against its source) - so unlike
// most of this app's fields (which trust the authenticated session
// and let VyOS's own commit validators be the source of truth), this
// one specifically needs its own allowlist rather than passing
// anything through. The pattern covers ordinary OCI/Docker image
// references (optional registry host/port, repo path segments,
// :tag, and/or @sha256:digest) while rejecting anything containing
// shell metacharacters (spaces, quotes, backticks, $, ;, |, &, etc.)
// or newlines.
var containerImageNamePattern = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9._/:@-]*[a-zA-Z0-9])?$`)

// maxContainerImageNameLength matches Docker/OCI's own effective
// reference length limits (well under 255 in practice) - just a sane
// upper bound against a pathological input, not a precisely-sourced
// spec value.
const maxContainerImageNameLength = 255

func validateContainerImageName(name string) bool {
	return name != "" &&
		len(name) <= maxContainerImageNameLength &&
		containerImageNamePattern.MatchString(name)
}

type containerImageResponse struct {
	ID         string   `json:"id"`
	Tags       []string `json:"tags"`
	SizeBytes  int64    `json:"sizeBytes"`
	Containers int      `json:"containers"`
	// CreatedAt is Unix seconds (see vyos.ContainerImage.Created) -
	// the frontend does its own new Date(createdAt * 1000).
	CreatedAt float64 `json:"createdAt"`
}

type containerImagesResponse struct {
	Images []containerImageResponse `json:"images"`
}

func (s *Server) handleContainerImages(w http.ResponseWriter, r *http.Request) {
	images, err := s.VyOS.ShowContainerImages(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching container images", err)
		return
	}
	out := make([]containerImageResponse, 0, len(images))
	for _, img := range images {
		out = append(out, containerImageResponse{
			ID:         img.ID,
			Tags:       img.Tags(),
			SizeBytes:  img.SizeBytes,
			Containers: img.Containers,
			CreatedAt:  img.Created,
		})
	}
	writeJSON(w, http.StatusOK, containerImagesResponse{Images: out})
}

type pullContainerImageRequest struct {
	Name string `json:"name"`
}

type containerImageActionResponse struct {
	// Message is whatever text VyOS's own script printed (pull
	// progress/result, or empty for a typically-silent delete) -
	// surfaced as-is for the user to see, not parsed/reshaped.
	Message string `json:"message"`
}

// handlePullContainerImage serves POST /api/container/images
// ({"name": "..."}) - `add container image <name>` (a `podman image
// pull`), which can legitimately take minutes for a large image over
// a slow uplink, and has no timeout of its own on VyOS's side either
// (see vyos.PullContainerImage's own doc comment). This backend's
// http.Server.WriteTimeout (60s, cmd/vyos-client/serve.go) would
// otherwise abort the response to the frontend well before a
// multi-minute pull can finish, even though vyos.Client's own call to
// VyOS is willing to wait far longer - so this specific request's
// write deadline is extended to match before doing anything else.
// Deliberately a single synchronous request/response rather than a
// background-job-plus-polling design: this app has no existing
// server-side job-tracking state anywhere else, and matches VyOS's
// own (also fully synchronous) model for this operation.
func (s *Server) handlePullContainerImage(w http.ResponseWriter, r *http.Request) {
	rc := http.NewResponseController(w)
	if err := rc.SetWriteDeadline(time.Now().Add(containerImagePullWriteDeadline)); err != nil {
		// Not every ResponseWriter implementation supports this (e.g.
		// some test/recorder transports) - that's not fatal, it just
		// means the extended deadline silently doesn't apply and this
		// falls back to the server's normal WriteTimeout, so log and
		// continue rather than failing the request outright.
		s.Logger.Warn("could not extend write deadline for container image pull", "error", err)
	}

	var body pullContainerImageRequest
	if err := decodeJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !validateContainerImageName(body.Name) {
		writeError(w, http.StatusBadRequest, "invalid or missing image name")
		return
	}

	message, err := s.VyOS.PullContainerImage(r.Context(), body.Name)
	if err != nil {
		s.handleVyOSError(w, "pulling container image", err)
		return
	}
	writeJSON(w, http.StatusOK, containerImageActionResponse{Message: message})
}

// containerImagePullWriteDeadline is set comfortably past
// vyos.PullContainerImage's own timeout, so this backend's own server
// never cuts the connection before that client-side timeout has a
// chance to produce a clear error of its own.
const containerImagePullWriteDeadline = 11 * time.Minute

// handleDeleteContainerImage serves DELETE
// /api/container/images?name=... - a query parameter rather than a
// path segment, since image references routinely contain "/" and ":"
// (e.g. "docker.io/library/nginx:latest"), which would be ambiguous
// or need extra encoding as a path segment.
func (s *Server) handleDeleteContainerImage(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if !validateContainerImageName(name) {
		writeError(w, http.StatusBadRequest, "invalid or missing image name")
		return
	}

	message, err := s.VyOS.DeleteContainerImage(r.Context(), name)
	if err != nil {
		s.handleVyOSError(w, "deleting container image", err)
		return
	}
	writeJSON(w, http.StatusOK, containerImageActionResponse{Message: message})
}
