package vyos

import (
	"reflect"
	"testing"
)

// dhcpLeasesTableFixture is verbatim (whitespace preserved) from
// VyOS's own documentation example for `show dhcp server leases`
// (docs.vyos.io, configuration/service/dhcp-server.md), including a
// row with a blank "Pool"/"Hostname" cell - the case that would break
// naive whitespace-splitting.
const dhcpLeasesTableFixture = `IP Address      MAC address        State    Lease start          Lease expiration     Remaining    Pool      Hostname    Origin
--------------  -----------------  -------  -------------------  -------------------  -----------  --------  ----------  --------
192.168.11.134  00:50:79:66:68:09  active   2023/11/29 09:51:05  2023/11/29 10:21:05  0:24:10      LAN       VPCS1       local
192.168.11.133  50:00:00:06:00:00  active   2023/11/29 09:51:38  2023/11/29 10:21:38  0:24:43      LAN       VYOS-6      local
10.11.11.108    50:00:00:05:00:00  active   2023/11/29 09:51:43  2023/11/29 10:21:43  0:24:48      VIF-1001  VYOS5       local
192.168.11.135  00:50:79:66:68:07  active   2023/11/29 09:55:16  2023/11/29 09:59:16  0:02:21                            remote`

func TestParseTabulateTable_RealDHCPLeasesFixture(t *testing.T) {
	rows := parseTabulateTable(dhcpLeasesTableFixture)
	if len(rows) != 4 {
		t.Fatalf("len(rows) = %d, want 4", len(rows))
	}

	first := rows[0]
	want := map[string]string{
		"IP Address":       "192.168.11.134",
		"MAC address":      "00:50:79:66:68:09",
		"State":            "active",
		"Lease start":      "2023/11/29 09:51:05",
		"Lease expiration": "2023/11/29 10:21:05",
		"Remaining":        "0:24:10",
		"Pool":             "LAN",
		"Hostname":         "VPCS1",
		"Origin":           "local",
	}
	if !reflect.DeepEqual(first, want) {
		t.Errorf("rows[0] = %#v, want %#v", first, want)
	}

	// The last row deliberately has blank Pool and Hostname cells
	// (a remote-origin lease) - this is exactly the case naive
	// whitespace-splitting would misalign; position-based slicing
	// must still produce empty strings for those two columns, not
	// shift "remote" into the wrong field.
	last := rows[3]
	if last["Pool"] != "" {
		t.Errorf(`rows[3]["Pool"] = %q, want ""`, last["Pool"])
	}
	if last["Hostname"] != "" {
		t.Errorf(`rows[3]["Hostname"] = %q, want ""`, last["Hostname"])
	}
	if last["Origin"] != "remote" {
		t.Errorf(`rows[3]["Origin"] = %q, want "remote"`, last["Origin"])
	}
	if last["IP Address"] != "192.168.11.135" {
		t.Errorf(`rows[3]["IP Address"] = %q, want "192.168.11.135"`, last["IP Address"])
	}
}

func TestParseTabulateTable_HeaderOnlyNoRows(t *testing.T) {
	text := `IP Address  MAC address
----------  -----------`
	rows := parseTabulateTable(text)
	if rows != nil {
		t.Errorf("rows = %#v, want nil for a table with no data rows", rows)
	}
}

// TestParseTabulateTable_UnconfiguredSubsystemMessage covers what VyOS
// actually prints when the DHCP server isn't configured at all - a
// plain error message, no table - which must be treated the same as
// "no leases" rather than erroring or panicking.
func TestParseTabulateTable_UnconfiguredSubsystemMessage(t *testing.T) {
	rows := parseTabulateTable("DHCP server is not configured\n")
	if rows != nil {
		t.Errorf("rows = %#v, want nil for a non-table message", rows)
	}
}

func TestParseTabulateTable_EmptyInput(t *testing.T) {
	rows := parseTabulateTable("")
	if rows != nil {
		t.Errorf("rows = %#v, want nil for empty input", rows)
	}
}

func TestParseTabulateTable_SingleColumn(t *testing.T) {
	text := `Pool
----
LAN
VIF-1001`
	rows := parseTabulateTable(text)
	if len(rows) != 2 {
		t.Fatalf("len(rows) = %d, want 2", len(rows))
	}
	if rows[0]["Pool"] != "LAN" || rows[1]["Pool"] != "VIF-1001" {
		t.Errorf("rows = %#v", rows)
	}
}

// TestParseTabulateTable_LastColumnWiderThanSeparator is defensive
// coverage for tabulateColumnRanges' end=-1 handling on the final
// column: even if a data row's last value somehow ran past what the
// separator line's own dash-run width implied, it must not be
// truncated (the whole rest of the line is captured).
func TestParseTabulateTable_LastColumnWiderThanSeparator(t *testing.T) {
	text := `IP    Hostname
----  --------
1.1   a-genuinely-much-longer-hostname-than-the-header-implied`
	rows := parseTabulateTable(text)
	if len(rows) != 1 {
		t.Fatalf("len(rows) = %d, want 1", len(rows))
	}
	if rows[0]["Hostname"] != "a-genuinely-much-longer-hostname-than-the-header-implied" {
		t.Errorf("Hostname = %q", rows[0]["Hostname"])
	}
}
