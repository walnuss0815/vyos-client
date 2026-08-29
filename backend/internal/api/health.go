package api

import "net/http"

// handleHealthz is an unauthenticated liveness check for the
// container's own health-check mechanism (`set container name ...
// health-check`). It intentionally does not call out to the VyOS API —
// a transient VyOS API hiccup shouldn't cause the container runtime to
// restart this process, since restarting it wouldn't fix the
// underlying issue. version is also surfaced here (piggy-backed rather
// than a dedicated endpoint, same reasoning as systemInfoResponse's
// ConfigWarningsEnabled) so `curl`ing this already-unauthenticated,
// already-polled endpoint identifies which build is running.
func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.Version})
}
