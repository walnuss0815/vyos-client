package vyos_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// buildTabulateFixture constructs a `tabulate`-shaped ("simple" style)
// text table for the exact 6 columns/widths
// src/op_mode/load-balancing_haproxy.py's _get_formatted_output emits
// (Proxy name/Role/Status/Req rate/Resp time/Last change), using
// fmt.Sprintf's own field-width padding so the header/separator/data
// rows are guaranteed self-consistent - this doesn't need to be
// byte-for-byte identical to Python's tabulate output, only internally
// aligned the same way (fixed-width columns, left-justified, a run of
// '-' under each column), which is all vyos.ParseHAProxyStatus relies
// on.
func buildTabulateFixture(rows [][6]string) string {
	const widths = "%-12s  %-8s  %-8s  %-8s  %-11s  %s\n"
	header := fmt.Sprintf(widths, "Proxy name", "Role", "Status", "Req rate", "Resp time", "Last change")
	sep := fmt.Sprintf(widths,
		strings.Repeat("-", 12), strings.Repeat("-", 8), strings.Repeat("-", 8),
		strings.Repeat("-", 8), strings.Repeat("-", 11), strings.Repeat("-", 11))
	out := header + sep
	for _, r := range rows {
		out += fmt.Sprintf(widths, r[0], r[1], r[2], r[3], r[4], r[5])
	}
	return out
}

func TestParseHAProxyStatus(t *testing.T) {
	raw := buildTabulateFixture([][6]string{
		{"web", "FRONTEND", "OPEN", "0", "", "1d2h"},
		{"web", "app1", "UP", "0", "2 ms", "23m54s"},
	})

	got := vyos.ParseHAProxyStatus(raw)
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2: %+v", len(got), got)
	}
	if got[0].ProxyName != "web" || got[0].Role != "FRONTEND" || got[0].Status != "OPEN" || got[0].LastChange != "1d2h" {
		t.Errorf("got[0] = %+v", got[0])
	}
	// RespTime with an embedded space ("2 ms") must survive intact -
	// the whole reason this parser slices by column position rather
	// than splitting on whitespace.
	if got[1].Role != "app1" || got[1].RespTime != "2 ms" || got[1].LastChange != "23m54s" {
		t.Errorf("got[1] = %+v", got[1])
	}
}

func TestParseHAProxyStatus_NoDataRows(t *testing.T) {
	raw := buildTabulateFixture(nil)
	got := vyos.ParseHAProxyStatus(raw)
	if got == nil {
		t.Error("got = nil, want non-nil empty slice")
	}
	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}

func TestParseHAProxyStatus_UnrecognizedInputReturnsEmptyNotError(t *testing.T) {
	got := vyos.ParseHAProxyStatus("Error: could not connect to HAProxy socket\n")
	if got == nil || len(got) != 0 {
		t.Errorf("got = %+v, want an empty non-nil slice", got)
	}
}

func TestShowHAProxyStatus(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["load-balancing haproxy"] = buildTabulateFixture([][6]string{
		{"web", "FRONTEND", "OPEN", "0", "", "1d2h"},
	})

	got, err := c.ShowHAProxyStatus(context.Background())
	if err != nil {
		t.Fatalf("ShowHAProxyStatus: %v", err)
	}
	if len(got) != 1 || got[0].ProxyName != "web" {
		t.Errorf("got = %+v", got)
	}
}

func TestShowHAProxyStatus_PropagatesVyOSError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowErrors["load-balancing haproxy"] = "Haproxy is not configured"

	_, err := c.ShowHAProxyStatus(context.Background())
	if err == nil {
		t.Fatal("expected an error")
	}
}
