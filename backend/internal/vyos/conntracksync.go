package vyos

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// ConntrackSyncStatus is a parsed `show conntrack-sync status` - a
// fixed 4-line "label : value" text block (confirmed directly against
// vyos-1x's src/op_mode/conntrack_sync.py, show_status()'s own
// f-string template; there is no JSON form reachable through this
// app's REST-only integration, same as VRRP/HAProxy status). VyOS
// always writes the failover mechanism as "vrrp [sync-group <name>]"
// today - it's the only mechanism actually implemented, despite the
// config tree's `failover-mechanism` node shape suggesting others were
// anticipated - so FailoverMechanism/SyncGroup are split out of that
// one line rather than kept as the combined raw string.
type ConntrackSyncStatus struct {
	SyncInterfaces []string
	// FailoverMechanism is normally always "vrrp" - kept as a string
	// (not a bool/enum) rather than assumed, in case VyOS ever adds a
	// second mechanism.
	FailoverMechanism string
	SyncGroup         string
	// LastTransition is either free text describing the last failover
	// transition, or the literal "no transition yet!" - kept exactly
	// as VyOS printed it.
	LastTransition string
	// ExpectSyncProtocols is empty when expect-sync isn't configured
	// (VyOS prints the literal "disabled" in that case, normalized
	// away here rather than kept as a magic string).
	ExpectSyncProtocols []string
}

// conntrackSyncFailoverRE matches conntrack_sync.py's fixed
// `f'failover-mechanism    : {failover_mechanism} [sync-group
// {vrrp_sync_grp}]'` output shape.
var conntrackSyncFailoverRE = regexp.MustCompile(`^(\S+)\s+\[sync-group\s+(.*)\]$`)

// ParseConntrackSyncStatus parses `show conntrack-sync status`'s
// fixed-format text block. Unlike this app's other lenient text
// parsers, a genuinely unrecognized shape here *is* treated as an
// error rather than silently returning a mostly-empty struct: unlike a
// table with possibly zero rows, every field in this 4-line block is
// always present when conntrack-sync is configured at all (VyOS's own
// script raises UnconfiguredSubsystem before ever printing anything if
// it isn't), so failing to find the expected lines means something
// about the output format itself has changed, not just "no data yet".
func ParseConntrackSyncStatus(raw string) (*ConntrackSyncStatus, error) {
	status := &ConntrackSyncStatus{}
	found := map[string]bool{}

	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		idx := strings.Index(line, ":")
		if idx == -1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		value := strings.TrimSpace(line[idx+1:])

		switch key {
		case "sync-interface":
			status.SyncInterfaces = splitTrimmedCommaList(value)
			found[key] = true
		case "failover-mechanism":
			if m := conntrackSyncFailoverRE.FindStringSubmatch(value); m != nil {
				status.FailoverMechanism = m[1]
				status.SyncGroup = m[2]
			} else {
				status.FailoverMechanism = value
			}
			found[key] = true
		case "last state transition":
			status.LastTransition = value
			found[key] = true
		case "ExpectationSync":
			if value != "disabled" {
				status.ExpectSyncProtocols = splitTrimmedCommaList(value)
			}
			found[key] = true
		}
	}

	if !found["sync-interface"] || !found["failover-mechanism"] {
		return nil, fmt.Errorf("vyos: unrecognized 'show conntrack-sync status' output")
	}
	return status, nil
}

// splitTrimmedCommaList splits a comma-joined list (VyOS's own
// `', '.join(...)` convention for this command), trimming whitespace
// and dropping empty entries. Returns a non-nil empty slice for an
// empty input.
func splitTrimmedCommaList(s string) []string {
	out := []string{}
	if s == "" {
		return out
	}
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

// ShowConntrackSyncStatus runs `show conntrack-sync status` and parses
// its fixed text block.
func (c *Client) ShowConntrackSyncStatus(ctx context.Context) (*ConntrackSyncStatus, error) {
	raw, err := c.Show(ctx, []string{"conntrack-sync", "status"})
	if err != nil {
		return nil, err
	}
	return ParseConntrackSyncStatus(raw)
}
