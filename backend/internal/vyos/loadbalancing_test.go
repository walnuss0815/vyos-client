package vyos_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func TestParseWANLoadBalanceStatus(t *testing.T) {
	raw := "Interface: eth0\n" +
		"Status: active\n" +
		"Last Status Change: 2024-01-01 12:00:00\n" +
		"Last Interface Success: 0:00:05.123456\n" +
		"Last Interface Failure: N/A\n" +
		"Interface Failures: 0\n" +
		"\n" +
		"Interface: eth1\n" +
		"Status: failed\n" +
		"Last Status Change: N/A\n" +
		"Last Interface Success: N/A\n" +
		"Last Interface Failure: 2:15:00.654321\n" +
		"Interface Failures: 3\n"

	got := vyos.ParseWANLoadBalanceStatus(raw)
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2: %+v", len(got), got)
	}
	if got[0].Interface != "eth0" || !got[0].Active || got[0].Failures != 0 {
		t.Errorf("got[0] = %+v", got[0])
	}
	if got[0].LastStatusChange != "2024-01-01 12:00:00" || got[0].LastSuccess != "0:00:05.123456" || got[0].LastFailure != "N/A" {
		t.Errorf("got[0] = %+v", got[0])
	}
	if got[1].Interface != "eth1" || got[1].Active || got[1].Failures != 3 {
		t.Errorf("got[1] = %+v", got[1])
	}
}

func TestParseWANLoadBalanceStatus_EmptyInput(t *testing.T) {
	got := vyos.ParseWANLoadBalanceStatus("")
	if got == nil {
		t.Error("got = nil, want non-nil empty slice")
	}
	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}

func TestShowWANLoadBalanceStatus(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["wan-load-balance"] = "Interface: eth0\nStatus: active\nLast Status Change: N/A\nLast Interface Success: N/A\nLast Interface Failure: N/A\nInterface Failures: 0\n"

	got, err := c.ShowWANLoadBalanceStatus(context.Background())
	if err != nil {
		t.Fatalf("ShowWANLoadBalanceStatus: %v", err)
	}
	if len(got) != 1 || got[0].Interface != "eth0" {
		t.Errorf("got = %+v", got)
	}
}

func TestShowWANLoadBalanceStatus_PropagatesVyOSError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowErrors["wan-load-balance"] = "WAN load-balancing is not configured"

	_, err := c.ShowWANLoadBalanceStatus(context.Background())
	if err == nil {
		t.Fatal("expected an error")
	}
}
