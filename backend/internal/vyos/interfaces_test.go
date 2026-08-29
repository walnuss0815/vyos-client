package vyos_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// interfacesKernelJSONFixture is a trimmed but structurally faithful
// example of `ip -j -d -s address show` output (what `show interfaces
// kernel json` returns verbatim), based on vyos-1x's interfaces.py
// (show_kernel --raw) and iproute2's own JSON schema. Only the fields
// vyos.ShowInterfaces actually reads are populated; real output has
// many more (linkinfo, altnames, min/max_mtu, ...) which
// ShowInterfaces is expected to tolerate and ignore. eth0 includes a
// stats64 block (the normal case - present on every real interface,
// including loopback, since `-s` is always passed); eth1 deliberately
// omits it to exercise the "kernel didn't report stats64 at all" path.
const interfacesKernelJSONFixture = `[
  {
    "ifindex": 2,
    "ifname": "eth0",
    "flags": ["BROADCAST", "MULTICAST", "UP", "LOWER_UP"],
    "mtu": 1500,
    "operstate": "UP",
    "link_type": "ether",
    "address": "52:54:00:12:34:56",
    "ifalias": "WAN",
    "addr_info": [
      {"family": "inet", "local": "203.0.113.5", "prefixlen": 24, "scope": "global"},
      {"family": "inet6", "local": "2001:db8::5", "prefixlen": 64, "scope": "global"},
      {"family": "inet6", "local": "fe80::5054:ff:fe12:3456", "prefixlen": 64, "scope": "link"}
    ],
    "stats64": {
      "rx": {"bytes": 123456789, "packets": 98765, "errors": 0, "dropped": 0},
      "tx": {"bytes": 987654321, "packets": 65432, "errors": 0, "dropped": 0}
    }
  },
  {
    "ifindex": 3,
    "ifname": "lo",
    "flags": ["LOOPBACK", "UP", "LOWER_UP"],
    "mtu": 65536,
    "operstate": "UNKNOWN",
    "link_type": "loopback",
    "address": "00:00:00:00:00:00",
    "ifalias": "",
    "addr_info": [
      {"family": "inet", "local": "127.0.0.1", "prefixlen": 8, "scope": "host"}
    ],
    "stats64": {
      "rx": {"bytes": 1024, "packets": 12, "errors": 0, "dropped": 0},
      "tx": {"bytes": 1024, "packets": 12, "errors": 0, "dropped": 0}
    }
  },
  {
    "ifindex": 4,
    "ifname": "eth1",
    "flags": ["BROADCAST", "MULTICAST"],
    "mtu": 1500,
    "operstate": "DOWN",
    "link_type": "ether",
    "address": "52:54:00:65:43:21",
    "ifalias": "",
    "addr_info": []
  }
]`

func TestShowInterfaces(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	fake.ShowOutputs["interfaces kernel json"] = interfacesKernelJSONFixture

	got, err := c.ShowInterfaces(context.Background())
	if err != nil {
		t.Fatalf("ShowInterfaces: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("len(got) = %d, want 3", len(got))
	}

	eth0 := got[0]
	if eth0.Name != "eth0" {
		t.Errorf("Name = %q, want eth0", eth0.Name)
	}
	if eth0.MAC != "52:54:00:12:34:56" {
		t.Errorf("MAC = %q, want 52:54:00:12:34:56", eth0.MAC)
	}
	if eth0.Description != "WAN" {
		t.Errorf("Description = %q, want WAN", eth0.Description)
	}
	if eth0.MTU != 1500 {
		t.Errorf("MTU = %d, want 1500", eth0.MTU)
	}
	if eth0.OperState != "up" {
		t.Errorf("OperState = %q, want up", eth0.OperState)
	}
	if eth0.AdminState != "up" {
		t.Errorf("AdminState = %q, want up", eth0.AdminState)
	}
	if len(eth0.Addresses) != 3 {
		t.Fatalf("len(Addresses) = %d, want 3", len(eth0.Addresses))
	}
	if eth0.Addresses[0] != (vyos.InterfaceAddress{Family: "inet", Address: "203.0.113.5", PrefixLen: 24, Scope: "global"}) {
		t.Errorf("Addresses[0] = %+v, want the IPv4 global address", eth0.Addresses[0])
	}
	if eth0.Addresses[1] != (vyos.InterfaceAddress{Family: "inet6", Address: "2001:db8::5", PrefixLen: 64, Scope: "global"}) {
		t.Errorf("Addresses[1] = %+v, want the IPv6 global address", eth0.Addresses[1])
	}
	if eth0.Addresses[2].Scope != "link" {
		t.Errorf("Addresses[2].Scope = %q, want link (link-local addresses are kept, not filtered)", eth0.Addresses[2].Scope)
	}
	if eth0.RxBytes == nil || *eth0.RxBytes != 123456789 {
		t.Errorf("eth0.RxBytes = %v, want pointer to 123456789", eth0.RxBytes)
	}
	if eth0.TxBytes == nil || *eth0.TxBytes != 987654321 {
		t.Errorf("eth0.TxBytes = %v, want pointer to 987654321", eth0.TxBytes)
	}

	// eth1 has no admin-up flag and no addresses - a down, unconfigured
	// interface must not error or panic, just report empty/down.
	eth1 := got[2]
	if eth1.AdminState != "down" {
		t.Errorf("eth1 AdminState = %q, want down", eth1.AdminState)
	}
	if eth1.OperState != "down" {
		t.Errorf("eth1 OperState = %q, want down", eth1.OperState)
	}
	if len(eth1.Addresses) != 0 {
		t.Errorf("eth1 Addresses = %v, want empty", eth1.Addresses)
	}
	// eth1's fixture entry has no stats64 block at all (unlike real
	// interfaces) - confirms the pointer fields stay nil rather than
	// decoding as zero-valued counters, so callers can tell "no data"
	// apart from "genuinely zero traffic".
	if eth1.RxBytes != nil || eth1.TxBytes != nil {
		t.Errorf("eth1 RxBytes/TxBytes = %v/%v, want both nil (no stats64 in fixture)", eth1.RxBytes, eth1.TxBytes)
	}
}

// TestShowInterfaces_EmptyList confirms an explicit empty JSON array
// decodes cleanly to a zero-length (not nil-panicking) result.
func TestShowInterfaces_EmptyList(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	fake.ShowOutputs["interfaces kernel json"] = "[]"

	got, err := c.ShowInterfaces(context.Background())
	if err != nil {
		t.Fatalf("ShowInterfaces: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}
