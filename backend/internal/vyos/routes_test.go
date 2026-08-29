package vyos_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// routesFlatArrayFixture models the shape route.py's own --raw mode
// produces (vyos-1x/src/op_mode/route.py): a flat JSON array of route
// entries, snake_case keys (vyos.opmode.run decamelizes/normalizes
// field names before printing).
const routesFlatArrayFixture = `[
  {
    "prefix": "0.0.0.0/0",
    "protocol": "static",
    "selected": true,
    "distance": 1,
    "metric": 0,
    "uptime": "1d02h34m",
    "nexthops": [
      {"ip": "203.0.113.1", "interface_name": "eth0", "active": true}
    ]
  },
  {
    "prefix": "192.168.1.0/24",
    "protocol": "connected",
    "selected": true,
    "distance": 0,
    "metric": 0,
    "nexthops": [
      {"interface_name": "eth1", "active": true, "directly_connected": true}
    ]
  }
]`

// routesMapFixture models FRR's native "show ip route json" shape
// (prefix -> [entries], camelCase), for the case route.py's flat-array
// shape doesn't apply and "show ip route json" is instead a more
// direct vtysh passthrough.
const routesMapFixture = `{
  "0.0.0.0/0": [
    {
      "prefix": "0.0.0.0/0",
      "protocol": "static",
      "selected": true,
      "distance": 1,
      "metric": 0,
      "nexthops": [
        {"ip": "203.0.113.1", "interfaceName": "eth0", "active": true}
      ]
    }
  ],
  "192.168.1.0/24": [
    {
      "protocol": "connected",
      "selected": true,
      "distance": 0,
      "metric": 0,
      "nexthops": [
        {"interfaceName": "eth1", "active": true, "directlyConnected": true}
      ]
    }
  ]
}`

func TestShowRoutes_FlatArrayShape(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	fake.ShowOutputs["ip route json"] = routesFlatArrayFixture

	got, err := c.ShowRoutes(context.Background(), vyos.RouteFamilyIPv4)
	if err != nil {
		t.Fatalf("ShowRoutes: %v", err)
	}
	assertParsedRoutes(t, got)
}

func TestShowRoutes_MapShape(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	fake.ShowOutputs["ip route json"] = routesMapFixture

	got, err := c.ShowRoutes(context.Background(), vyos.RouteFamilyIPv4)
	if err != nil {
		t.Fatalf("ShowRoutes: %v", err)
	}
	// The connected entry in this fixture deliberately omits its own
	// "prefix" field (FRR's native shape doesn't always repeat it
	// inside the entry when it's already the map key) - Prefix must be
	// filled in from the map key in that case.
	assertParsedRoutes(t, got)
}

func assertParsedRoutes(t *testing.T, got []vyos.Route) {
	t.Helper()
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2", len(got))
	}
	byPrefix := map[string]vyos.Route{}
	for _, r := range got {
		byPrefix[r.Prefix] = r
	}

	def, ok := byPrefix["0.0.0.0/0"]
	if !ok {
		t.Fatal("missing default route 0.0.0.0/0")
	}
	if def.Protocol != "static" || def.Distance != 1 {
		t.Errorf("default route = %+v, want protocol=static distance=1", def)
	}
	if len(def.Nexthops) != 1 || def.Nexthops[0].InterfaceName != "eth0" || def.Nexthops[0].IP != "203.0.113.1" {
		t.Errorf("default route nexthops = %+v", def.Nexthops)
	}

	conn, ok := byPrefix["192.168.1.0/24"]
	if !ok {
		t.Fatal("missing connected route 192.168.1.0/24")
	}
	if conn.Protocol != "connected" {
		t.Errorf("connected route protocol = %q, want connected", conn.Protocol)
	}
	if len(conn.Nexthops) != 1 || !conn.Nexthops[0].DirectlyConnected || conn.Nexthops[0].InterfaceName != "eth1" {
		t.Errorf("connected route nexthops = %+v", conn.Nexthops)
	}
}

func TestShowRoutes_IPv6UsesIPv6Path(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	fake.ShowOutputs["ipv6 route json"] = `[{"prefix": "::/0", "protocol": "static", "distance": 1, "metric": 0, "nexthops": [{"ip": "2001:db8::1", "interface_name": "eth0", "active": true}]}]`

	got, err := c.ShowRoutes(context.Background(), vyos.RouteFamilyIPv6)
	if err != nil {
		t.Fatalf("ShowRoutes: %v", err)
	}
	if len(got) != 1 || got[0].Prefix != "::/0" {
		t.Errorf("got = %+v, want a single ::/0 route", got)
	}
}
