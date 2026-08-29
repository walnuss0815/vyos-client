package vyos_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// dhcpLeasesFixture is verbatim (whitespace preserved) from VyOS's own
// documentation example for `show dhcp server leases`, including a row
// with blank Pool/Hostname cells (a remote-origin lease).
const dhcpLeasesFixture = `IP Address      MAC address        State    Lease start          Lease expiration     Remaining    Pool      Hostname    Origin
--------------  -----------------  -------  -------------------  -------------------  -----------  --------  ----------  --------
192.168.11.134  00:50:79:66:68:09  active   2023/11/29 09:51:05  2023/11/29 10:21:05  0:24:10      LAN       VPCS1       local
192.168.11.135  00:50:79:66:68:07  active   2023/11/29 09:55:16  2023/11/29 09:59:16  0:02:21                            remote`

func TestShowDHCPLeases(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	fake.ShowOutputs["dhcp server leases"] = dhcpLeasesFixture

	got, err := c.ShowDHCPLeases(context.Background())
	if err != nil {
		t.Fatalf("ShowDHCPLeases: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2", len(got))
	}

	first := got[0]
	if first.IPAddress != "192.168.11.134" || first.MACAddress != "00:50:79:66:68:09" ||
		first.State != "active" || first.Pool != "LAN" || first.Hostname != "VPCS1" || first.Origin != "local" {
		t.Errorf("got[0] = %+v", first)
	}

	// The blank-cell row must decode to genuinely empty strings for
	// Pool/Hostname, not have "remote" bleed into the wrong field.
	second := got[1]
	if second.Pool != "" || second.Hostname != "" {
		t.Errorf("got[1] Pool/Hostname = %q/%q, want both empty", second.Pool, second.Hostname)
	}
	if second.Origin != "remote" {
		t.Errorf("got[1].Origin = %q, want remote", second.Origin)
	}
}

// TestShowDHCPLeases_MockVyOSSeedFixture is the exact text
// cmd/mock-vyos's formatTabulateTable produces for its seeded leases
// (captured by curling a running mock-vyos instance directly), locking
// in that the seed data used for local dev/docker-compose actually
// round-trips through this parser correctly.
func TestShowDHCPLeases_MockVyOSSeedFixture(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	fake.ShowOutputs["dhcp server leases"] = "IP Address    MAC address        State   Lease start          Lease expiration     Remaining  Pool  Hostname     Origin\n" +
		"------------  -----------------  ------  -------------------  -------------------  ---------  ----  -----------  ------\n" +
		"192.168.1.50  52:54:00:11:22:33  active  2026/08/26 10:00:00  2026/08/26 11:00:00  0:45:00    LAN   mock-laptop  local\n" +
		"192.168.1.51  52:54:00:44:55:66  active  2026/08/26 10:05:00  2026/08/26 11:05:00  0:50:00    LAN   -            local"

	got, err := c.ShowDHCPLeases(context.Background())
	if err != nil {
		t.Fatalf("ShowDHCPLeases: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2", len(got))
	}
	if got[0].IPAddress != "192.168.1.50" || got[0].Hostname != "mock-laptop" {
		t.Errorf("got[0] = %+v", got[0])
	}
	if got[1].IPAddress != "192.168.1.51" || got[1].Hostname != "-" {
		t.Errorf("got[1] = %+v", got[1])
	}
}

// TestShowDHCPLeases_UnconfiguredServer covers what VyOS actually
// prints when the DHCP server isn't configured - a plain message, not
// a table - which must decode to an empty (not error) result.
func TestShowDHCPLeases_UnconfiguredServer(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	fake.ShowOutputs["dhcp server leases"] = "DHCP server is not configured\n"

	got, err := c.ShowDHCPLeases(context.Background())
	if err != nil {
		t.Fatalf("ShowDHCPLeases: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}
