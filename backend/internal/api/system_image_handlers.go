package api

import (
	"net/http"
	"net/url"
	"regexp"
	"time"
)

// systemImageNamePattern bounds what this app will pass through to
// VyOS as a system image name, for the same defense-in-depth reason as
// validateContainerImageName (container_image_handlers.go): VyOS
// image names are ordinary version-like strings (e.g.
// "2025.07.16-0020-rolling", "1.4.1"), so an alphanumeric/./-/_
// allowlist covers every real name while rejecting shell
// metacharacters.
var systemImageNamePattern = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$`)

const maxSystemImageNameLength = 128

func validateSystemImageName(name string) bool {
	return name != "" &&
		len(name) <= maxSystemImageNameLength &&
		systemImageNamePattern.MatchString(name)
}

// maxSystemImageURLLength is a sane upper bound against a pathological
// input, not a precisely-sourced spec value.
const maxSystemImageURLLength = 2048

// validateSystemImageURL restricts the install URL to http(s) with a
// host - VyOS's own CLI also accepts a local filesystem path (e.g.
// `/tmp/vyos-1.2.3-amd64.iso`, resolved on the router's own disk), but
// this app has no file-upload mechanism of its own to ever produce
// such a path meaningfully, so only the URL form this UI can actually
// offer is accepted.
func validateSystemImageURL(rawURL string) bool {
	if rawURL == "" || len(rawURL) > maxSystemImageURLLength {
		return false
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

type systemImageResponse struct {
	Name          string `json:"name"`
	IsDefaultBoot bool   `json:"isDefaultBoot"`
	IsRunning     bool   `json:"isRunning"`
}

type systemImagesResponse struct {
	Images []systemImageResponse `json:"images"`
}

// handleSystemImages serves GET /api/system/images - the list of VyOS
// releases installed on this router (`show system image`), entirely
// distinct from the Container area's /api/container/images (podman
// images).
func (s *Server) handleSystemImages(w http.ResponseWriter, r *http.Request) {
	images, err := s.VyOS.ShowSystemImages(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching system images", err)
		return
	}
	out := make([]systemImageResponse, 0, len(images))
	for _, img := range images {
		out = append(out, systemImageResponse{
			Name:          img.Name,
			IsDefaultBoot: img.IsDefaultBoot,
			IsRunning:     img.IsRunning,
		})
	}
	writeJSON(w, http.StatusOK, systemImagesResponse{Images: out})
}

type addSystemImageRequest struct {
	URL string `json:"url"`
}

type systemImageActionResponse struct {
	// Message is whatever text VyOS's own installer script printed,
	// surfaced as-is - see handlePullContainerImage's doc comment for
	// the identical convention.
	Message string `json:"message"`
}

// systemImageAddWriteDeadline is set comfortably past
// vyos.AddSystemImage's own timeout, so this backend's own server
// never cuts the connection before that client-side timeout has a
// chance to produce a clear error of its own - see
// containerImagePullWriteDeadline's doc comment for the identical
// reasoning; this one is longer since a full VyOS ISO is larger than
// a typical container image layer.
const systemImageAddWriteDeadline = 31 * time.Minute

// handleAddSystemImage serves POST /api/system/images
// ({"url": "https://..."}) - `add system image <url>`, which can
// legitimately take many minutes to download and install a full VyOS
// ISO, with no timeout of its own on VyOS's side either (see
// vyos.AddSystemImage's own doc comment). Deliberately a single
// synchronous request/response, same as the container-image pull
// endpoint this mirrors - this app has no server-side job-tracking
// state anywhere else, and matches VyOS's own (also fully synchronous)
// model for this operation.
func (s *Server) handleAddSystemImage(w http.ResponseWriter, r *http.Request) {
	rc := http.NewResponseController(w)
	if err := rc.SetWriteDeadline(time.Now().Add(systemImageAddWriteDeadline)); err != nil {
		// Not every ResponseWriter implementation supports this - not
		// fatal, see handlePullContainerImage's identical handling.
		s.Logger.Warn("could not extend write deadline for system image install", "error", err)
	}

	var body addSystemImageRequest
	if err := decodeJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !validateSystemImageURL(body.URL) {
		writeError(w, http.StatusBadRequest, "invalid or missing image URL")
		return
	}

	message, err := s.VyOS.AddSystemImage(r.Context(), body.URL)
	if err != nil {
		s.handleVyOSError(w, "installing system image", err)
		return
	}
	writeJSON(w, http.StatusOK, systemImageActionResponse{Message: message})
}

// handleDeleteSystemImage serves DELETE /api/system/images?name=... -
// a query parameter, same rationale as handleDeleteContainerImage's
// doc comment (though system image names don't actually contain "/"
// or ":", the same convention is used here for consistency).
func (s *Server) handleDeleteSystemImage(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if !validateSystemImageName(name) {
		writeError(w, http.StatusBadRequest, "invalid or missing image name")
		return
	}

	message, err := s.VyOS.DeleteSystemImage(r.Context(), name)
	if err != nil {
		s.handleVyOSError(w, "deleting system image", err)
		return
	}
	writeJSON(w, http.StatusOK, systemImageActionResponse{Message: message})
}
