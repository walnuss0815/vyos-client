package vyos

import (
	"context"
	"encoding/json"
	"fmt"
)

// RouteFamily selects IPv4 or IPv6 for ShowRoutes.
type RouteFamily string

const (
	RouteFamilyIPv4 RouteFamily = "inet"
	RouteFamilyIPv6 RouteFamily = "inet6"
)

// Route is one routing table entry, sourced from FRR (VyOS's routing
// daemon) via `show ip route json` / `show ipv6 route json`.
type Route struct {
	Prefix   string         `json:"prefix"`
	Protocol string         `json:"protocol"` // "static" | "connected" | "bgp" | "ospf" | ...
	Selected bool           `json:"selected"`
	Distance int            `json:"distance"`
	Metric   int            `json:"metric"`
	Uptime   string         `json:"uptime,omitempty"`
	Nexthops []RouteNexthop `json:"nexthops"`
}

// RouteNexthop is one next-hop of a route (a route can have more than
// one under ECMP).
type RouteNexthop struct {
	IP                string `json:"ip,omitempty"`
	InterfaceName     string `json:"interfaceName,omitempty"`
	Active            bool   `json:"active"`
	DirectlyConnected bool   `json:"directlyConnected,omitempty"`
}

// routeEntryJSON mirrors the fields we read from a single FRR route
// entry. VyOS's op-mode framework (vyos.opmode.run, when a command's
// --raw/json output is requested) recursively converts response keys
// to snake_case before printing them (see the `decamelize` step in
// vyos-1x's python/vyos/opmode.py) - so a field FRR itself calls
// "interfaceName" is expected to arrive here as "interface_name". We
// also tolerate the field appearing in its original FRR camelCase, in
// case a given path bypasses that normalization step (e.g. a vtysh
// passthrough command) - this is genuinely unverified against a real
// router as of writing; see ShowRoutes's doc comment.
type routeEntryJSON struct {
	Prefix   string `json:"prefix"`
	Protocol string `json:"protocol"`
	Selected bool   `json:"selected"`
	Distance int    `json:"distance"`
	Metric   int    `json:"metric"`
	Uptime   string `json:"uptime"`
	Nexthops []struct {
		IP                     string `json:"ip"`
		InterfaceName          string `json:"interfaceName"`
		InterfaceNameSnake     string `json:"interface_name"`
		Active                 bool   `json:"active"`
		DirectlyConnected      bool   `json:"directlyConnected"`
		DirectlyConnectedSnake bool   `json:"directly_connected"`
	} `json:"nexthops"`
}

func (e routeEntryJSON) toRoute() Route {
	nexthops := make([]RouteNexthop, 0, len(e.Nexthops))
	for _, n := range e.Nexthops {
		iface := n.InterfaceName
		if iface == "" {
			iface = n.InterfaceNameSnake
		}
		nexthops = append(nexthops, RouteNexthop{
			IP:                n.IP,
			InterfaceName:     iface,
			Active:            n.Active,
			DirectlyConnected: n.DirectlyConnected || n.DirectlyConnectedSnake,
		})
	}
	return Route{
		Prefix:   e.Prefix,
		Protocol: e.Protocol,
		Selected: e.Selected,
		Distance: e.Distance,
		Metric:   e.Metric,
		Uptime:   e.Uptime,
		Nexthops: nexthops,
	}
}

// ShowRoutes returns the routing table for the given address family,
// sourced from `show ip route json` (RouteFamilyIPv4) or
// `show ipv6 route json` (RouteFamilyIPv6).
//
// The exact JSON shape of this command's output could not be fully
// confirmed by reading vyos-1x's source alone: route.py's own --raw
// mode (vyos-1x/src/op_mode/route.py) produces a flat array of route
// entries with snake_case keys (via vyos.opmode's normalization), but
// "show ip route" may instead be wired through a generic vtysh
// passthrough (confirmed for "show ip route table <n>" specifically,
// via vtysh_wrapper.sh) that would return FRR's native camelCase JSON
// nested in a map keyed by prefix instead. This parses either shape:
// a top-level array is used as-is; a top-level object is flattened
// (its map keys become each entry's Prefix, for entries that don't
// already carry one). This should be validated against a real router
// and simplified once confirmed.
func (c *Client) ShowRoutes(ctx context.Context, family RouteFamily) ([]Route, error) {
	familyWord := "ip"
	if family == RouteFamilyIPv6 {
		familyWord = "ipv6"
	}
	text, err := c.Show(ctx, []string{familyWord, "route", "json"})
	if err != nil {
		return nil, err
	}

	var asArray []routeEntryJSON
	if err := json.Unmarshal([]byte(text), &asArray); err == nil {
		out := make([]Route, 0, len(asArray))
		for _, e := range asArray {
			out = append(out, e.toRoute())
		}
		return out, nil
	}

	var asMap map[string][]routeEntryJSON
	if err := json.Unmarshal([]byte(text), &asMap); err != nil {
		return nil, fmt.Errorf("vyos: decoding %s routes: %w", familyWord, err)
	}
	out := make([]Route, 0, len(asMap))
	for prefix, entries := range asMap {
		for _, e := range entries {
			r := e.toRoute()
			if r.Prefix == "" {
				r.Prefix = prefix
			}
			out = append(out, r)
		}
	}
	return out, nil
}
