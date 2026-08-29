package vyos

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// Interface describes one network interface's live operational state,
// as reported by VyOS's `show interfaces kernel json` (interfaces.py's
// show_kernel --raw, confirmed against vyos-1x's op-mode-definitions
// source), which runs `ip -j -d -s address show` under the hood. This
// is the interface's real running state (MAC, assigned addresses, link
// status) - not its configuration, which ShowConfig/the Config Tree
// cover separately. The two can disagree: an interface can be
// configured but administratively/link down, or have a DHCP-assigned
// address that never appears in the configuration at all.
type Interface struct {
	Name        string `json:"name"`
	MAC         string `json:"mac,omitempty"`
	Description string `json:"description,omitempty"`
	MTU         int    `json:"mtu"`
	// OperState / AdminState are lowercased ("up", "down", "unknown",
	// ...) for consistent display, derived from the kernel's operstate
	// and flags fields respectively.
	OperState  string             `json:"operState"`
	AdminState string             `json:"adminState"`
	Addresses  []InterfaceAddress `json:"addresses"`
	// RxBytes/TxBytes are cumulative byte counters since the interface
	// last came up (from the kernel's stats64 block) - not a rate.
	// Deriving bytes/sec requires diffing two samples over time, which
	// is the frontend's job (see useInterfaceThroughput.ts), not this
	// backend's: every call here is a single stateless snapshot, with
	// no history kept between requests. Omitted entirely (rather than
	// present-as-zero) when the kernel didn't report stats64 at all,
	// so callers can tell "no data" apart from "genuinely zero
	// traffic".
	RxBytes *int64 `json:"rxBytes,omitempty"`
	TxBytes *int64 `json:"txBytes,omitempty"`
}

// InterfaceAddress is one IPv4 or IPv6 address assigned to an
// interface. Link-local addresses (Scope "link") are included rather
// than filtered out - useful for troubleshooting even though they're
// not independently routable - with Scope exposed so a caller can
// choose to de-emphasize them.
type InterfaceAddress struct {
	Family    string `json:"family"` // "inet" | "inet6"
	Address   string `json:"address"`
	PrefixLen int    `json:"prefixLen"`
	Scope     string `json:"scope"`
}

// kernelInterfaceJSON mirrors the subset of `ip -j -d -s address show`
// fields (the shape `show interfaces kernel json` returns verbatim,
// unmodified, in VyOS's raw/JSON output mode) that we actually use.
// Deliberately does not reject unknown fields: this decodes
// third-party (Linux kernel / VyOS) output that isn't part of our own
// request contract, so tolerating fields we don't recognize - which
// may be added across kernel or VyOS versions - is the right default,
// unlike decoding requests our own frontend sends us.
type kernelInterfaceJSON struct {
	IfName    string   `json:"ifname"`
	MTU       int      `json:"mtu"`
	OperState string   `json:"operstate"`
	Address   string   `json:"address"`
	IfAlias   string   `json:"ifalias"`
	Flags     []string `json:"flags"`
	AddrInfo  []struct {
		Family    string `json:"family"`
		Local     string `json:"local"`
		PrefixLen int    `json:"prefixlen"`
		Scope     string `json:"scope"`
	} `json:"addr_info"`
	// Stats64 is only present because `show interfaces kernel json`
	// runs `ip` with `-s` (statistics) in addition to `-d -j` - a bare
	// `ip -j address show` wouldn't include it. Pointer so its absence
	// (rather than a zeroed-out struct) is distinguishable, though in
	// practice every real interface - including loopback - reports it.
	Stats64 *struct {
		RX struct {
			Bytes int64 `json:"bytes"`
		} `json:"rx"`
		TX struct {
			Bytes int64 `json:"bytes"`
		} `json:"tx"`
	} `json:"stats64,omitempty"`
}

// ShowInterfaces returns the live operational state of every network
// interface, sourced from `show interfaces kernel json`.
func (c *Client) ShowInterfaces(ctx context.Context) ([]Interface, error) {
	text, err := c.Show(ctx, []string{"interfaces", "kernel", "json"})
	if err != nil {
		return nil, err
	}

	var raw []kernelInterfaceJSON
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return nil, fmt.Errorf("vyos: decoding interfaces: %w", err)
	}

	out := make([]Interface, 0, len(raw))
	for _, k := range raw {
		addrs := make([]InterfaceAddress, 0, len(k.AddrInfo))
		for _, a := range k.AddrInfo {
			addrs = append(addrs, InterfaceAddress{
				Family:    a.Family,
				Address:   a.Local,
				PrefixLen: a.PrefixLen,
				Scope:     a.Scope,
			})
		}
		iface := Interface{
			Name:        k.IfName,
			MAC:         k.Address,
			Description: k.IfAlias,
			MTU:         k.MTU,
			OperState:   strings.ToLower(k.OperState),
			AdminState:  adminStateFromFlags(k.Flags),
			Addresses:   addrs,
		}
		if k.Stats64 != nil {
			rx, tx := k.Stats64.RX.Bytes, k.Stats64.TX.Bytes
			iface.RxBytes = &rx
			iface.TxBytes = &tx
		}
		out = append(out, iface)
	}
	return out, nil
}

// adminStateFromFlags mirrors interfaces.py's own admin/link-state
// derivation ("u" if 'UP' in interface['flags'] else 'A'): the kernel's
// IFF_UP flag reflects whether the interface is administratively
// enabled, independent of operstate (which reflects the link's actual
// carrier/negotiation state).
func adminStateFromFlags(flags []string) string {
	for _, f := range flags {
		if f == "UP" {
			return "up"
		}
	}
	return "down"
}
