package vyos

import "context"

// DHCPLease is one active IPv4 DHCP lease, sourced from VyOS's
// `show dhcp server leases` op-mode command.
//
// Unlike ShowInterfaces/ShowRoutes, there is no JSON output mode for
// this command at all (confirmed against vyos-1x's source: no "json"
// keyword is wired up in its op-mode-definitions, and against VyOS's
// own documentation, whose examples only ever show the tabulated text
// form) - the underlying lease data lives behind Kea's local Unix
// control socket, unreachable via this app's REST-only, no-SSH access.
// ShowDHCPLeases parses that text table via parseTabulateTable; see
// its own doc comment for why that's genuinely the only option here.
//
// Static mappings aren't included - VyOS's own `show dhcp server
// leases` doesn't list them either (see VyOS's docs); they're regular
// configuration, read via ShowConfig like anything else under
// `service dhcp-server`.
type DHCPLease struct {
	IPAddress  string `json:"ipAddress"`
	MACAddress string `json:"macAddress"`
	State      string `json:"state"`
	LeaseStart string `json:"leaseStart"`
	LeaseEnd   string `json:"leaseEnd"`
	Remaining  string `json:"remaining"`
	Pool       string `json:"pool"` // the shared-network-name this lease's subnet belongs to
	Hostname   string `json:"hostname"`
	Origin     string `json:"origin"` // "local" | "remote" (HA failover peer)
}

// ShowDHCPLeases returns every active IPv4 DHCP lease.
func (c *Client) ShowDHCPLeases(ctx context.Context) ([]DHCPLease, error) {
	text, err := c.Show(ctx, []string{"dhcp", "server", "leases"})
	if err != nil {
		return nil, err
	}

	rows := parseTabulateTable(text)
	out := make([]DHCPLease, 0, len(rows))
	for _, row := range rows {
		out = append(out, DHCPLease{
			IPAddress:  row["IP Address"],
			MACAddress: row["MAC address"],
			State:      row["State"],
			LeaseStart: row["Lease start"],
			LeaseEnd:   row["Lease expiration"],
			Remaining:  row["Remaining"],
			Pool:       row["Pool"],
			Hostname:   row["Hostname"],
			Origin:     row["Origin"],
		})
	}
	return out, nil
}
