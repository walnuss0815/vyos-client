// Package webapp embeds and serves the built frontend single-page app.
//
// The dist/ directory is a placeholder (just an index.html) as checked
// into git; the real frontend build output is copied over it before
// `go build` runs (see /Makefile and /deploy/Dockerfile), and the
// embed directive below picks up whatever is present at build time.
package webapp

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// Handler returns an http.Handler serving the embedded SPA. Requests
// for a path that doesn't correspond to a real file (i.e. everything
// that isn't a built static asset) are rewritten to /index.html so the
// frontend's own client-side router handles it.
func Handler() (http.Handler, error) {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return nil, err
	}
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		if clean == "." {
			clean = "index.html"
		}
		if _, err := fs.Stat(sub, clean); err != nil {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
			fileServer.ServeHTTP(w, r2)
			return
		}
		fileServer.ServeHTTP(w, r)
	}), nil
}
