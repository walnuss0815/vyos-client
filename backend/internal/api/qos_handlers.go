package api

import "net/http"

// Traffic Policy / QoS's configuration (`qos policy <type> <name>`,
// `qos interface <name> {ingress,egress}`, `qos traffic-match-group
// <name>`) is handled entirely by the generic GET /api/config/tree and
// POST /api/config/commit endpoints, like every other config-tree area
// - no dedicated backend code is needed for that (see
// frontend/src/lib/qosTypes.ts/qosParse.ts/qos*Form.ts for the
// frontend-only typed modeling). The one handler below exists only
// because *status* has no JSON form reachable through this app's
// REST-only integration - see vyos.ParseQosShaperStatus's own doc
// comment, including its important scope note (only interfaces with a
// `shaper`-type egress policy have any stats available through this
// command at all).

type qosShaperClassStatsResponse struct {
	Class     string `json:"class"`
	Type      string `json:"type"`
	Bandwidth string `json:"bandwidth"`
	MaxBW     string `json:"maxBw"`
	Bytes     string `json:"bytes"`
	Packets   string `json:"packets"`
	Drops     string `json:"drops"`
	Queued    string `json:"queued"`
}

type qosShaperStatusResponse struct {
	Interface  string                        `json:"interface"`
	PolicyName string                        `json:"policyName"`
	Classes    []qosShaperClassStatsResponse `json:"classes"`
}

// handleQosShaperStatus serves GET /api/qos/shaper-status?interface=...
// - `show qos shaper interface <ifname>`'s per-class stats table.
func (s *Server) handleQosShaperStatus(w http.ResponseWriter, r *http.Request) {
	ifname := r.URL.Query().Get("interface")
	if ifname == "" {
		writeError(w, http.StatusBadRequest, "interface is required")
		return
	}

	status, err := s.VyOS.ShowQosShaperStatus(r.Context(), ifname)
	if err != nil {
		s.handleVyOSError(w, "fetching QoS shaper status", err)
		return
	}

	classes := make([]qosShaperClassStatsResponse, 0, len(status.Classes))
	for _, c := range status.Classes {
		classes = append(classes, qosShaperClassStatsResponse{
			Class:     c.Class,
			Type:      c.Type,
			Bandwidth: c.Bandwidth,
			MaxBW:     c.MaxBW,
			Bytes:     c.Bytes,
			Packets:   c.Packets,
			Drops:     c.Drops,
			Queued:    c.Queued,
		})
	}
	writeJSON(w, http.StatusOK, qosShaperStatusResponse{
		Interface:  status.Interface,
		PolicyName: status.PolicyName,
		Classes:    classes,
	})
}
