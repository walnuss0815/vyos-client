package api

import (
	"net/http"
	"path"
	"strings"
)

// fileBrowserRoots is the closed set of directories this app will
// browse/view files under via `show file <path>`. VyOS's own op-mode
// command imposes no restriction of any kind - confirmed against
// vyos-1x's src/op_mode/file.py, it will happily show any path on the
// router's filesystem (e.g. /etc/shadow) that the process running it
// can read. Restricting to a small, curated allowlist here is this
// app's own defense-in-depth choice (mirroring the container-image
// name validation elsewhere in this package, where VyOS again
// provides none of its own) rather than something VyOS enforces for
// us.
//
// /config holds the running configuration, user scripts, PKI
// material, and per-user SSH/other config data - the most likely
// thing an operator actually wants to inspect. /var/log holds
// anything not already covered by the curated Logs page's fixed
// sources (see log_handlers.go).
var fileBrowserRoots = []string{"/config", "/var/log"}

// FileBrowserRoots exposes fileBrowserRoots for the frontend's own
// root-picker to mirror exactly - kept as a single source of truth
// rather than hardcoding the same two paths twice, the way
// vyos.LogFacilities/LogPriorities are shared with the frontend's
// LOG_FACILITIES/LOG_PRIORITIES (there they're duplicated deliberately
// since they're VyOS-version-independent constants; here it's cheap
// to just serve them, so this endpoint does that instead).
type fileBrowserRootsResponse struct {
	Roots []string `json:"roots"`
}

func (s *Server) handleFileBrowserRoots(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, fileBrowserRootsResponse{Roots: fileBrowserRoots})
}

// validateFileBrowserPath reports whether p is one of fileBrowserRoots
// or lexically nested under one of them. Uses path.Clean (not
// filepath.Clean - this is a router filesystem path, always "/"-
// separated, evaluated by this Linux backend regardless of its own
// build platform) purely as a lexical safety net against ".."
// segments; VyOS's own file.py additionally does its own
// os.path.realpath server-side, which can still resolve a symlink
// *within* an allowed root out to somewhere else entirely - this
// validation narrows what this app will ever ask VyOS to look at, it
// isn't a guarantee about where VyOS's own answer came from.
func validateFileBrowserPath(p string) bool {
	if p == "" || !strings.HasPrefix(p, "/") {
		return false
	}
	clean := path.Clean(p)
	for _, root := range fileBrowserRoots {
		if clean == root || strings.HasPrefix(clean, root+"/") {
			return true
		}
	}
	return false
}

type fileBrowserEntryResponse struct {
	Name        string `json:"name"`
	IsDir       bool   `json:"isDir"`
	Permissions string `json:"permissions"`
	Size        string `json:"size"`
	Modified    string `json:"modified"`
	LinkTarget  string `json:"linkTarget,omitempty"`
}

// fileBrowserResponse is a discriminated union (on IsDirectory) of a
// directory listing (Entries populated) or a file view (every other
// field below populated) - GET /api/files?path=... returns whichever
// one `show file <path>` decided the path was; see
// vyos.ParseShowFile's own doc comment.
type fileBrowserResponse struct {
	Path        string                     `json:"path"`
	IsDirectory bool                       `json:"isDirectory"`
	Entries     []fileBrowserEntryResponse `json:"entries,omitempty"`

	Type        string `json:"type,omitempty"`
	Owner       string `json:"owner,omitempty"`
	Permissions string `json:"permissions,omitempty"`
	Modified    string `json:"modified,omitempty"`
	IsBinary    bool   `json:"isBinary,omitempty"`
	Content     string `json:"content,omitempty"`
	Truncated   bool   `json:"truncated,omitempty"`
}

// handleFiles serves GET /api/files?path=... - view a file or list a
// directory under one of fileBrowserRoots. Read-only: VyOS's REST API
// has no supported way to write arbitrary file content back to an
// arbitrary path at all (only /config-file's config.boot-specific,
// schema-validated save/load/merge), so there is no corresponding
// POST/PUT here - this is a viewer, not an editor.
func (s *Server) handleFiles(w http.ResponseWriter, r *http.Request) {
	reqPath := r.URL.Query().Get("path")
	if reqPath == "" {
		reqPath = fileBrowserRoots[0]
	}
	if !validateFileBrowserPath(reqPath) {
		writeError(w, http.StatusBadRequest, "path is outside the browsable roots")
		return
	}

	dir, file, err := s.VyOS.ShowFile(r.Context(), reqPath)
	if err != nil {
		s.handleVyOSError(w, "fetching file/directory listing", err)
		return
	}

	if dir != nil {
		entries := make([]fileBrowserEntryResponse, 0, len(dir.Entries))
		for _, e := range dir.Entries {
			entries = append(entries, fileBrowserEntryResponse{
				Name:        e.Name,
				IsDir:       e.IsDir,
				Permissions: e.Permissions,
				Size:        e.Size,
				Modified:    e.Modified,
				LinkTarget:  e.LinkTarget,
			})
		}
		writeJSON(w, http.StatusOK, fileBrowserResponse{
			Path:        dir.Path,
			IsDirectory: true,
			Entries:     entries,
		})
		return
	}

	writeJSON(w, http.StatusOK, fileBrowserResponse{
		Path:        file.Path,
		IsDirectory: false,
		Type:        file.Type,
		Owner:       file.Owner,
		Permissions: file.Permissions,
		Modified:    file.Modified,
		IsBinary:    file.IsBinary,
		Content:     file.Content,
		Truncated:   file.Truncated,
	})
}
