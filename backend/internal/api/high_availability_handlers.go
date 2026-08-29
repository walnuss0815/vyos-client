package api

import "net/http"

// High Availability's configuration (`high-availability vrrp` and the
// separate `service conntrack-sync` tree) is handled entirely by the
// generic GET /api/config/tree and POST /api/config/commit endpoints,
// like every other config-tree area - no dedicated backend code is
// needed for that (see frontend/src/lib/haTypes.ts/haParse.ts/
// haVrrpForm.ts/haConntrackSyncForm.ts for the frontend-only typed
// modeling). The two handlers below exist only because *status* for
// both areas is op-mode data with no JSON form reachable through this
// app's REST-only integration - see vyos.ParseVRRPStatus/
// ParseConntrackSyncStatus's own doc comments.

type vrrpGroupStatusResponse struct {
	Name           string `json:"name"`
	Interface      string `json:"interface"`
	Vrid           string `json:"vrid"`
	State          string `json:"state"`
	Priority       string `json:"priority"`
	LastTransition string `json:"lastTransition"`
}

type vrrpStatusResponse struct {
	Groups []vrrpGroupStatusResponse `json:"groups"`
}

// handleVRRPStatus serves GET /api/high-availability/vrrp/status -
// `show vrrp`'s per-group state table.
func (s *Server) handleVRRPStatus(w http.ResponseWriter, r *http.Request) {
	groups, err := s.VyOS.ShowVRRPStatus(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching VRRP status", err)
		return
	}
	out := make([]vrrpGroupStatusResponse, 0, len(groups))
	for _, g := range groups {
		out = append(out, vrrpGroupStatusResponse{
			Name:           g.Name,
			Interface:      g.Interface,
			Vrid:           g.VRID,
			State:          g.State,
			Priority:       g.Priority,
			LastTransition: g.LastTransition,
		})
	}
	writeJSON(w, http.StatusOK, vrrpStatusResponse{Groups: out})
}

type conntrackSyncStatusResponse struct {
	SyncInterfaces      []string `json:"syncInterfaces"`
	FailoverMechanism   string   `json:"failoverMechanism"`
	SyncGroup           string   `json:"syncGroup"`
	LastTransition      string   `json:"lastTransition"`
	ExpectSyncProtocols []string `json:"expectSyncProtocols"`
}

// handleConntrackSyncStatus serves GET
// /api/high-availability/conntrack-sync/status - `show conntrack-sync
// status`'s fixed text block.
func (s *Server) handleConntrackSyncStatus(w http.ResponseWriter, r *http.Request) {
	status, err := s.VyOS.ShowConntrackSyncStatus(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching conntrack-sync status", err)
		return
	}
	writeJSON(w, http.StatusOK, conntrackSyncStatusResponse{
		SyncInterfaces:      status.SyncInterfaces,
		FailoverMechanism:   status.FailoverMechanism,
		SyncGroup:           status.SyncGroup,
		LastTransition:      status.LastTransition,
		ExpectSyncProtocols: status.ExpectSyncProtocols,
	})
}
