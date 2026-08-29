package api

import (
	"net/http"
	"slices"
	"strconv"

	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// fixedLogSources maps a whitelisted `?source=` value to its op-mode
// path, for every log this app exposes that doesn't need an
// additional user-supplied parameter (unlike facility/priority/
// container - see handleLogs) and has no line-count parameter of its
// own (unlike "system" - see handleLogs, which special-cases it to
// use vyos.ShowLogTailBounded instead). Deliberately a small, curated
// subset of VyOS's several dozen `show log ...` subcommands, not a
// generic pass-through of an arbitrary op-mode path: scoped to the
// service areas this app already has dedicated configuration UI for
// (SSH, HTTPS API, DHCP server, VPN, FRR/routing, Firewall).
var fixedLogSources = map[string][]string{
	"firewall":    {"log", "firewall"},
	"ssh":         {"log", "ssh"},
	"https":       {"log", "https"},
	"dhcp-server": {"log", "dhcp", "server"},
	"vpn":         {"log", "vpn"},
	"frr":         {"log", "frr"},
}

const (
	defaultLogLines = 500
	maxLogLines     = 5000
)

// handleLogs serves GET /api/logs?source=...&lines=... (plus
// source-specific params: facility=/priority=/container=). Unlike
// every other operational-data endpoint in this file, this one takes
// query parameters that pick *which* op-mode path to run rather than
// running a single fixed one - see fixedLogSources's doc comment for
// why that's still a closed, whitelisted set rather than an arbitrary
// pass-through.
func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	source := query.Get("source")
	lines := parseLogLines(query.Get("lines"))

	// "system" is special-cased rather than living in fixedLogSources:
	// unlike every other source here, VyOS has a line-bounded command
	// for it (`show log tail <n>`) - see
	// vyos.ShowLogTailBounded's doc comment for why using that instead
	// of bare `show log` matters (a real timeout incident, not just a
	// style preference).
	if source == "system" {
		result, err := s.VyOS.ShowLogTailBounded(r.Context(), lines)
		if err != nil {
			s.handleVyOSError(w, "fetching logs", err)
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}

	var path []string
	switch source {
	case "facility":
		facility := query.Get("facility")
		if !slices.Contains(vyos.LogFacilities, facility) {
			writeError(w, http.StatusBadRequest, "unknown or missing facility")
			return
		}
		path = []string{"log", "facility", facility}
	case "priority":
		priority := query.Get("priority")
		if !slices.Contains(vyos.LogPriorities, priority) {
			writeError(w, http.StatusBadRequest, "unknown or missing priority")
			return
		}
		path = []string{"log", "priority", priority}
	case "container":
		// No whitelist here, unlike facility/priority above: a
		// container's name is already entirely user-controlled
		// through this app's own Container configuration pages, so
		// passing the same string through to `show container log
		// <name>` doesn't introduce any new surface - VyOS itself
		// will error cleanly ("no such container") for a name that
		// doesn't exist, same as any other not-found op-mode lookup.
		container := query.Get("container")
		if container == "" {
			writeError(w, http.StatusBadRequest, "container is required for source=container")
			return
		}
		path = []string{"container", "log", container}
	default:
		fixed, ok := fixedLogSources[source]
		if !ok {
			writeError(w, http.StatusBadRequest, "unknown log source")
			return
		}
		path = fixed
	}

	result, err := s.VyOS.ShowLogTail(r.Context(), path, lines)
	if err != nil {
		s.handleVyOSError(w, "fetching logs", err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// parseLogLines parses the `?lines=` query param, defaulting to
// defaultLogLines and clamping anything invalid, non-positive, or too
// large into range rather than rejecting the request outright - this
// controls a display preference, not something worth a 400 over.
func parseLogLines(raw string) int {
	if raw == "" {
		return defaultLogLines
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return defaultLogLines
	}
	if n > maxLogLines {
		return maxLogLines
	}
	return n
}
