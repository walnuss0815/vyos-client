package api

import "net/http"

// Load-balancing's configuration (`load-balancing wan`/`load-balancing
// haproxy`) is handled entirely by the generic GET /api/config/tree
// and POST /api/config/commit endpoints, like every other config-tree
// area - no dedicated backend code is needed for that (see
// frontend/src/lib/loadBalancingParse.ts/loadBalancingWanForm.ts/
// loadBalancingHaproxyForm.ts for the frontend-only typed modeling).
// The two handlers below exist only because *status* for both areas
// is op-mode data with no JSON form at all - see
// vyos.ParseWANLoadBalanceStatus/ParseHAProxyStatus's own doc comments.

type wanInterfaceStatusResponse struct {
	Interface        string `json:"interface"`
	Active           bool   `json:"active"`
	LastStatusChange string `json:"lastStatusChange"`
	LastSuccess      string `json:"lastSuccess"`
	LastFailure      string `json:"lastFailure"`
	Failures         int    `json:"failures"`
}

type wanLoadBalanceStatusResponse struct {
	Interfaces []wanInterfaceStatusResponse `json:"interfaces"`
}

// handleWANLoadBalanceStatus serves GET /api/load-balancing/wan/status
// - `show wan-load-balance`'s per-interface health-check state.
func (s *Server) handleWANLoadBalanceStatus(w http.ResponseWriter, r *http.Request) {
	statuses, err := s.VyOS.ShowWANLoadBalanceStatus(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching WAN load-balancing status", err)
		return
	}
	out := make([]wanInterfaceStatusResponse, 0, len(statuses))
	for _, st := range statuses {
		out = append(out, wanInterfaceStatusResponse{
			Interface:        st.Interface,
			Active:           st.Active,
			LastStatusChange: st.LastStatusChange,
			LastSuccess:      st.LastSuccess,
			LastFailure:      st.LastFailure,
			Failures:         st.Failures,
		})
	}
	writeJSON(w, http.StatusOK, wanLoadBalanceStatusResponse{Interfaces: out})
}

type haproxyStatusRowResponse struct {
	ProxyName  string `json:"proxyName"`
	Role       string `json:"role"`
	Status     string `json:"status"`
	ReqRate    string `json:"reqRate"`
	RespTime   string `json:"respTime"`
	LastChange string `json:"lastChange"`
}

type haproxyStatusResponse struct {
	Rows []haproxyStatusRowResponse `json:"rows"`
}

// handleHAProxyStatus serves GET /api/load-balancing/haproxy/status -
// `show load-balancing haproxy`'s frontend/backend/server status table.
func (s *Server) handleHAProxyStatus(w http.ResponseWriter, r *http.Request) {
	rows, err := s.VyOS.ShowHAProxyStatus(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching HAProxy status", err)
		return
	}
	out := make([]haproxyStatusRowResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, haproxyStatusRowResponse{
			ProxyName:  row.ProxyName,
			Role:       row.Role,
			Status:     row.Status,
			ReqRate:    row.ReqRate,
			RespTime:   row.RespTime,
			LastChange: row.LastChange,
		})
	}
	writeJSON(w, http.StatusOK, haproxyStatusResponse{Rows: out})
}
