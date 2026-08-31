// Package api: handlers for live operational (not configuration) data
// - interface status, routes, and system info - sourced from VyOS's
// `/show` and `/info` op-mode endpoints rather than `/retrieve`. See
// docs/architecture.md for the config-vs-operational distinction.
package api

import (
	"net/http"

	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

type systemInfoResponse struct {
	Hostname string `json:"hostname"`
	Version  string `json:"version"`
	// LoginBanner is VyOS's own configured `system login banner` text
	// (surfaced by VyOS's /info endpoint under the name "banner" - not
	// to be confused with anything of this app's own). Empty when the
	// router has none configured. Not sensitive - it's text VyOS
	// itself shows to anyone reaching the router's CLI/API pre-auth.
	LoginBanner string `json:"loginBanner"`
	// ConfigWarningsEnabled mirrors Server.ConfigWarningsEnabled (an
	// env-var-controlled deployment setting, not VyOS state) - piggy-
	// backed onto this endpoint rather than a dedicated one since it's
	// already fetched once (useSystemInfo()) and cached everywhere the
	// frontend needs to decide whether to show the config warnings
	// banner, including pre-login (harmless to expose here - it's not
	// sensitive, same as hostname/version below).
	ConfigWarningsEnabled bool `json:"configWarningsEnabled"`
	// SelfUpgradeEnabled mirrors Server.SelfUpgradeEnabled - same
	// piggy-backing reasoning as ConfigWarningsEnabled above, so
	// SystemLayout.tsx can decide whether to render the Upgrades tab
	// as enabled or disabled-with-instructions without an extra
	// round trip. Not sensitive - it's just a deployment-time feature
	// flag, not VyOS state.
	SelfUpgradeEnabled bool `json:"selfUpgradeEnabled"`
}

// handleSystemInfo wraps VyOS's unauthenticated GET /info (hostname,
// version, banner). Unlike every other data endpoint, this one is
// intentionally NOT wrapped in RequireSession (see server.go's route
// table): the login page shows the router's hostname before the user
// has signed in, and since the underlying VyOS call itself requires
// no API key either, gating it here would only hide the same
// information the router's own HTTPS API already exposes to anyone
// who can reach it.
func (s *Server) handleSystemInfo(w http.ResponseWriter, r *http.Request) {
	info, err := s.VyOS.Info(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching system info", err)
		return
	}
	writeJSON(w, http.StatusOK, systemInfoResponse{
		Hostname:              info.Hostname,
		Version:               info.Version,
		LoginBanner:           info.Banner,
		ConfigWarningsEnabled: s.ConfigWarningsEnabled,
		SelfUpgradeEnabled:    s.SelfUpgradeEnabled,
	})
}

type interfacesResponse struct {
	Interfaces []vyos.Interface `json:"interfaces"`
}

func (s *Server) handleInterfaces(w http.ResponseWriter, r *http.Request) {
	interfaces, err := s.VyOS.ShowInterfaces(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching interfaces", err)
		return
	}
	writeJSON(w, http.StatusOK, interfacesResponse{Interfaces: interfaces})
}

type routesResponse struct {
	IPv4 []vyos.Route `json:"ipv4"`
	IPv6 []vyos.Route `json:"ipv6"`
}

func (s *Server) handleRoutes(w http.ResponseWriter, r *http.Request) {
	ipv4, err := s.VyOS.ShowRoutes(r.Context(), vyos.RouteFamilyIPv4)
	if err != nil {
		s.handleVyOSError(w, "fetching IPv4 routes", err)
		return
	}
	ipv6, err := s.VyOS.ShowRoutes(r.Context(), vyos.RouteFamilyIPv6)
	if err != nil {
		s.handleVyOSError(w, "fetching IPv6 routes", err)
		return
	}
	writeJSON(w, http.StatusOK, routesResponse{IPv4: ipv4, IPv6: ipv6})
}

type systemResourcesResponse struct {
	Uptime  *vyos.SystemUptime  `json:"uptime"`
	CPU     *vyos.SystemCPU     `json:"cpu"`
	Memory  *vyos.SystemMemory  `json:"memory"`
	Storage *vyos.SystemStorage `json:"storage,omitempty"`
}

// handleSystemResources returns live uptime/CPU/memory/disk-usage
// data (`show system uptime|cpu|memory|storage`). Storage is the one
// field that can legitimately be absent (omitted, not null-valued -
// see vyos.ShowStorage's doc comment for when VyOS itself reports it
// unavailable) without failing the whole request; uptime/CPU/memory
// failing is treated as a hard error, since they should always
// succeed together if the backend can reach VyOS at all - the same
// all-or-nothing handling handleRoutes uses for its two ShowRoutes
// calls.
func (s *Server) handleSystemResources(w http.ResponseWriter, r *http.Request) {
	uptime, err := s.VyOS.ShowUptime(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching system uptime", err)
		return
	}
	cpu, err := s.VyOS.ShowCPU(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching system CPU info", err)
		return
	}
	memory, err := s.VyOS.ShowMemory(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching system memory", err)
		return
	}
	storage, err := s.VyOS.ShowStorage(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching system storage", err)
		return
	}
	writeJSON(w, http.StatusOK, systemResourcesResponse{
		Uptime:  uptime,
		CPU:     cpu,
		Memory:  memory,
		Storage: storage,
	})
}
