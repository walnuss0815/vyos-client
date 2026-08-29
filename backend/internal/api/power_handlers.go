package api

import "net/http"

// handleReboot serves POST /api/system/reboot - `reboot now`. VyOS's
// own /reboot endpoint returns no meaningful body on success (see
// vyos.Client.Reboot), so this mirrors handleSave's 204-No-Content
// response for a fire-and-forget op-mode action.
//
// Confirmation strength (the two-click "Delete -> Confirm delete?"
// pattern for reboot, vs. typing the router's hostname for poweroff)
// is deliberately a frontend-only UI concern, same as every other
// destructive action in this app (e.g. container image delete) - the
// authenticated session itself is the security boundary; the extra
// confirmation step exists purely to catch an accidental click.
func (s *Server) handleReboot(w http.ResponseWriter, r *http.Request) {
	if err := s.VyOS.Reboot(r.Context(), []string{"now"}); err != nil {
		s.handleVyOSError(w, "rebooting system", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handlePoweroff serves POST /api/system/poweroff - `poweroff now`.
// See handleReboot's doc comment: same response shape, same
// frontend-only confirmation model (poweroff's stronger
// type-the-hostname confirmation lives entirely in the UI).
func (s *Server) handlePoweroff(w http.ResponseWriter, r *http.Request) {
	if err := s.VyOS.Poweroff(r.Context(), []string{"now"}); err != nil {
		s.handleVyOSError(w, "powering off system", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
