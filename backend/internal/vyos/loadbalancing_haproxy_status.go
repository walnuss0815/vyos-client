package vyos

import "context"

// HAProxyStatusRow is one row of `show load-balancing haproxy`'s
// output - one line per frontend, backend, or backend server (VyOS's
// own op-mode script, src/op_mode/load-balancing_haproxy.py, groups
// HAProxy's "show stat json" response into exactly these three kinds
// and renders one flat table across all of them via Python's
// `tabulate` library). ProxyName/Role/Status/ReqRate/RespTime/
// LastChange are kept exactly as VyOS's own script already formatted
// them (e.g. "23m54s" for LastChange, "2 ms" for RespTime) rather than
// re-parsed into numbers/durations - it already did the unit
// conversion this app would otherwise have to redo, and there's no
// benefit to reversing that.
type HAProxyStatusRow struct {
	ProxyName  string
	Role       string
	Status     string
	ReqRate    string
	RespTime   string
	LastChange string
}

// ParseHAProxyStatus parses `show load-balancing haproxy`'s tabulate-
// formatted text table via the shared parseTabulateTable helper (see
// tabulate.go, which DHCP leases and this both use) - HAProxy
// reporting zero services still prints the header/separator with no
// data rows, which parseTabulateTable already handles gracefully (a
// nil result, not an error - normalized to an empty slice below).
func ParseHAProxyStatus(raw string) []HAProxyStatusRow {
	parsed := parseTabulateTable(raw)
	rows := make([]HAProxyStatusRow, 0, len(parsed))
	for _, values := range parsed {
		rows = append(rows, HAProxyStatusRow{
			ProxyName:  values["Proxy name"],
			Role:       values["Role"],
			Status:     values["Status"],
			ReqRate:    values["Req rate"],
			RespTime:   values["Resp time"],
			LastChange: values["Last change"],
		})
	}
	return rows
}

// ShowHAProxyStatus runs `show load-balancing haproxy` and parses its
// frontend/backend/server status table.
func (c *Client) ShowHAProxyStatus(ctx context.Context) ([]HAProxyStatusRow, error) {
	raw, err := c.Show(ctx, []string{"load-balancing", "haproxy"})
	if err != nil {
		return nil, err
	}
	return ParseHAProxyStatus(raw), nil
}
