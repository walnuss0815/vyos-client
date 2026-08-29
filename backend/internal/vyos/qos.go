package vyos

import (
	"context"
	"fmt"
	"strings"
)

// QosShaperClassStats is one row of `show qos shaper interface
// <ifname>`'s per-class stats table. Bandwidth/MaxBW/Bytes are kept
// exactly as VyOS's own op-mode script already formatted them (e.g.
// "1.000 Mb", "0  B" - see src/op_mode/qos.py's format_data_type())
// rather than re-parsed into numbers.
//
// IMPORTANT SCOPE NOTE: this command is only useful for interfaces
// whose egress policy is specifically of type `shaper` - confirmed
// directly against src/op_mode/qos.py's get_tc_info(), which is
// hardcoded to look up `qos policy shaper <name>` and only ever reads
// an interface's `egress` binding, never `ingress`. For every other
// policy type (shaper-hfsc, limiter, cake, fq-codel, priority-queue,
// round-robin, rate-control), this command silently returns an empty
// class list rather than an error - VyOS's own op-mode script has no
// equivalent stats view for those types at all (cake has a separate,
// differently-shaped `show qos cake interface <ifname>` command, not
// implemented here - see docs/roadmap.md's "Not yet built" note).
type QosShaperClassStats struct {
	Class     string
	Type      string
	Bandwidth string
	MaxBW     string
	Bytes     string
	Packets   string
	Drops     string
	Queued    string
}

// QosShaperStatus is a parsed `show qos shaper interface <ifname>`.
type QosShaperStatus struct {
	Interface  string
	PolicyName string
	Classes    []QosShaperClassStats
}

// ParseQosShaperStatus parses `show qos shaper interface <ifname>`'s
// text output: an "Interface: <name>" line, a "Policy Name: <name>"
// line, then a tabulate-formatted class stats table - reusing the
// shared parseTabulateTable helper (see tabulate.go) for the table
// itself. The leading `'-' * 80` divider line VyOS prints above
// "Interface:" is deliberately skipped over (by starting the search
// for the table's own header/separator only after "Policy Name:"),
// since it would otherwise itself look like a tabulate separator line
// to parseTabulateTable and produce garbage.
func ParseQosShaperStatus(raw string) (*QosShaperStatus, error) {
	lines := strings.Split(raw, "\n")
	status := &QosShaperStatus{}
	tableStart := -1

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "Interface:"):
			status.Interface = strings.TrimSpace(strings.TrimPrefix(trimmed, "Interface:"))
		case strings.HasPrefix(trimmed, "Policy Name:"):
			status.PolicyName = strings.TrimSpace(strings.TrimPrefix(trimmed, "Policy Name:"))
			tableStart = i + 1
		}
	}
	if status.Interface == "" || tableStart == -1 || tableStart > len(lines) {
		return nil, fmt.Errorf("vyos: unrecognized 'show qos shaper' output")
	}

	tableText := strings.Join(lines[tableStart:], "\n")
	parsed := parseTabulateTable(tableText)
	status.Classes = make([]QosShaperClassStats, 0, len(parsed))
	for _, v := range parsed {
		status.Classes = append(status.Classes, QosShaperClassStats{
			Class:     v["Class"],
			Type:      v["Type"],
			Bandwidth: v["Bandwidth"],
			MaxBW:     v["Max. BW"],
			Bytes:     v["Bytes"],
			Packets:   v["Pkts"],
			Drops:     v["Drops"],
			Queued:    v["Queued"],
		})
	}
	return status, nil
}

// ShowQosShaperStatus runs `show qos shaper interface <ifname>` and
// parses its per-class stats table - see ParseQosShaperStatus's own
// doc comment for the important "shaper policy type only" scope note.
func (c *Client) ShowQosShaperStatus(ctx context.Context, ifname string) (*QosShaperStatus, error) {
	raw, err := c.Show(ctx, []string{"qos", "shaper", "interface", ifname})
	if err != nil {
		return nil, err
	}
	return ParseQosShaperStatus(raw)
}
