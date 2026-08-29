package vyos

import "context"

// VRRPGroupStatus is one row of `show vrrp`'s output - one per
// configured VRRP group, active or disabled (VyOS's own
// python/vyos/ifconfig/vrrp.py's VRRP.format() renders both live
// keepalived data and disabled groups into the same tabulate table).
// State/Priority/LastTransition are kept exactly as VyOS's own code
// already formatted them (State is one of INIT/BACKUP/MASTER/FAULT/
// DISABLED/UNKNOWN; LastTransition is a human-readable duration like
// "2s", not a timestamp - see vrrp.py's seconds_to_human) rather than
// re-parsed.
type VRRPGroupStatus struct {
	Name           string
	Interface      string
	VRID           string
	State          string
	Priority       string
	LastTransition string
}

// ParseVRRPStatus parses `show vrrp`'s tabulate-formatted text table
// via the shared parseTabulateTable helper (see tabulate.go) - the
// same table-rendering library HAProxy's status uses, confirmed
// directly against vyos-1x's python/vyos/ifconfig/vrrp.py
// (`VRRP.format()`).
func ParseVRRPStatus(raw string) []VRRPGroupStatus {
	parsed := parseTabulateTable(raw)
	rows := make([]VRRPGroupStatus, 0, len(parsed))
	for _, values := range parsed {
		rows = append(rows, VRRPGroupStatus{
			Name:           values["Name"],
			Interface:      values["Interface"],
			VRID:           values["VRID"],
			State:          values["State"],
			Priority:       values["Priority"],
			LastTransition: values["Last Transition"],
		})
	}
	return rows
}

// ShowVRRPStatus runs `show vrrp` and parses its per-group status
// table.
func (c *Client) ShowVRRPStatus(ctx context.Context) ([]VRRPGroupStatus, error) {
	raw, err := c.Show(ctx, []string{"vrrp"})
	if err != nil {
		return nil, err
	}
	return ParseVRRPStatus(raw), nil
}
