package api

import (
	"context"
	"net"
	"net/http"
)

type dhcpLeaseResponse struct {
	IPAddress  string `json:"ipAddress"`
	MACAddress string `json:"macAddress"`
	State      string `json:"state"`
	LeaseStart string `json:"leaseStart"`
	LeaseEnd   string `json:"leaseEnd"`
	Remaining  string `json:"remaining"`
	Pool       string `json:"pool"`
	Hostname   string `json:"hostname"`
	Origin     string `json:"origin"`
	// Subnet is the configured `service dhcp-server shared-network-name
	// <pool> subnet <subnet>` CIDR this lease's address falls under,
	// resolved server-side (see resolveDHCPSubnet) - the frontend needs
	// it to build the right config path for "make static", without
	// having to fetch and search the DHCP config tree itself. Empty if
	// it couldn't be resolved (e.g. no configured subnet actually
	// contains this address, which can legitimately happen for a
	// relayed or HA-remote-origin lease) - the frontend treats that as
	// "make static" being unavailable for this lease.
	Subnet string `json:"subnet,omitempty"`
}

type dhcpLeasesResponse struct {
	Leases []dhcpLeaseResponse `json:"leases"`
}

func (s *Server) handleDHCPLeases(w http.ResponseWriter, r *http.Request) {
	leases, err := s.VyOS.ShowDHCPLeases(r.Context())
	if err != nil {
		s.handleVyOSError(w, "fetching DHCP leases", err)
		return
	}

	// A failure resolving subnets isn't fatal to the leases response -
	// it just means every lease's Subnet is left empty, degrading
	// "make static" to unavailable rather than failing the whole page.
	subnetsByPool := s.dhcpSubnetsByPool(r.Context())

	out := make([]dhcpLeaseResponse, 0, len(leases))
	for _, l := range leases {
		out = append(out, dhcpLeaseResponse{
			IPAddress:  l.IPAddress,
			MACAddress: l.MACAddress,
			State:      l.State,
			LeaseStart: l.LeaseStart,
			LeaseEnd:   l.LeaseEnd,
			Remaining:  l.Remaining,
			Pool:       l.Pool,
			Hostname:   l.Hostname,
			Origin:     l.Origin,
			Subnet:     resolveDHCPSubnet(subnetsByPool[l.Pool], l.IPAddress),
		})
	}
	writeJSON(w, http.StatusOK, dhcpLeasesResponse{Leases: out})
}

// dhcpSubnetsByPool reads `service dhcp-server shared-network-name` and
// returns each pool's (shared-network's) configured subnet CIDRs, for
// resolveDHCPSubnet to match a lease's IP against. Returns nil on any
// error or if nothing is configured - callers must treat that as "no
// subnets known", not fail outright.
func (s *Server) dhcpSubnetsByPool(ctx context.Context) map[string][]string {
	tree, err := s.VyOS.ShowConfig(ctx, []string{"service", "dhcp-server", "shared-network-name"})
	if err != nil {
		return nil
	}
	pools, ok := tree.(map[string]any)
	if !ok {
		return nil
	}
	out := make(map[string][]string, len(pools))
	for pool, poolConfig := range pools {
		poolMap, ok := poolConfig.(map[string]any)
		if !ok {
			continue
		}
		subnets, ok := poolMap["subnet"].(map[string]any)
		if !ok {
			continue
		}
		for cidr := range subnets {
			out[pool] = append(out[pool], cidr)
		}
	}
	return out
}

// resolveDHCPSubnet picks which of a pool's configured subnets
// contains ip - the target subnet for a "make static" mapping. Skips
// the containment check entirely when there's exactly one subnet (the
// common case, and the only case a nil/unparseable ip still resolves
// correctly for), and returns "" if no configured subnet actually
// contains the address.
func resolveDHCPSubnet(subnets []string, ip string) string {
	if len(subnets) == 1 {
		return subnets[0]
	}
	addr := net.ParseIP(ip)
	if addr == nil {
		return ""
	}
	for _, cidr := range subnets {
		_, ipNet, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		if ipNet.Contains(addr) {
			return cidr
		}
	}
	return ""
}
