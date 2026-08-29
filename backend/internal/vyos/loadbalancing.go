package vyos

import (
	"context"
	"strconv"
	"strings"
)

// WANInterfaceStatus is one interface's entry from `show wan-load-
// balance` (the WAN failover feature's live health-check state, not
// its configuration - see interface_health in the config tree for
// that). Parsed from vyos-1x's src/op_mode/load-balancing_wan.py's
// own text template (status_format) - confirmed directly against that
// source, not guessed:
//
//	Interface: eth0
//	Status: active
//	Last Status Change: 2024-01-01 12:00:00
//	Last Interface Success: 0:00:05.123456
//	Last Interface Failure: N/A
//	Interface Failures: 0
//
// one such block per interface, blank-line separated. LastStatusChange/
// LastSuccess/LastFailure are kept exactly as VyOS printed them ("N/A",
// an absolute timestamp, or a Python timedelta-formatted duration like
// "2:15:00.123456") rather than reparsed - the duration strings in
// particular are relative to whatever instant VyOS generated the
// response, not a stable value this backend could re-derive later.
type WANInterfaceStatus struct {
	Interface        string
	Active           bool
	LastStatusChange string
	LastSuccess      string
	LastFailure      string
	Failures         int
}

// ParseWANLoadBalanceStatus parses `show wan-load-balance`'s plain-text
// output. Deliberately lenient, matching this app's other text-parsing
// layers (Files, Logs): a line that doesn't match one of the known
// "Label: value" prefixes is just ignored rather than failing the
// whole request. An empty input (WLB configured but no health-check
// cycle has completed yet - VyOS's own script prints nothing at all in
// that case, per _get_formatted_output's behavior on an empty status
// file) parses to an empty, non-nil slice, not an error.
func ParseWANLoadBalanceStatus(raw string) []WANInterfaceStatus {
	statuses := []WANInterfaceStatus{}
	var current *WANInterfaceStatus

	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		switch {
		case strings.HasPrefix(line, "Interface:"):
			if current != nil {
				statuses = append(statuses, *current)
			}
			current = &WANInterfaceStatus{Interface: strings.TrimSpace(strings.TrimPrefix(line, "Interface:"))}
		case current == nil:
			// Nothing recognized yet (blank lines between blocks,
			// stray output) - skip until the next "Interface:" line.
			continue
		case strings.HasPrefix(line, "Status:"):
			current.Active = strings.TrimSpace(strings.TrimPrefix(line, "Status:")) == "active"
		case strings.HasPrefix(line, "Last Status Change:"):
			current.LastStatusChange = strings.TrimSpace(strings.TrimPrefix(line, "Last Status Change:"))
		case strings.HasPrefix(line, "Last Interface Success:"):
			current.LastSuccess = strings.TrimSpace(strings.TrimPrefix(line, "Last Interface Success:"))
		case strings.HasPrefix(line, "Last Interface Failure:"):
			current.LastFailure = strings.TrimSpace(strings.TrimPrefix(line, "Last Interface Failure:"))
		case strings.HasPrefix(line, "Interface Failures:"):
			n, err := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "Interface Failures:")))
			if err == nil {
				current.Failures = n
			}
		}
	}
	if current != nil {
		statuses = append(statuses, *current)
	}
	return statuses
}

// ShowWANLoadBalanceStatus runs `show wan-load-balance` and parses its
// per-interface health-check status blocks.
func (c *Client) ShowWANLoadBalanceStatus(ctx context.Context) ([]WANInterfaceStatus, error) {
	raw, err := c.Show(ctx, []string{"wan-load-balance"})
	if err != nil {
		return nil, err
	}
	return ParseWANLoadBalanceStatus(raw), nil
}
