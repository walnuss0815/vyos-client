package vyos_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func TestParseVRRPStatus(t *testing.T) {
	raw := buildTabulateFixtureWithHeaders(
		[]string{"Name", "Interface", "VRID", "State", "Priority", "Last Transition"},
		[]int{10, 9, 4, 6, 8, 15},
		[][]string{
			{"OUTSIDE", "eth0", "10", "MASTER", "100", "2s"},
			{"INSIDE", "eth1", "20", "BACKUP", "50", "1d3h"},
		},
	)

	got := vyos.ParseVRRPStatus(raw)
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2: %+v", len(got), got)
	}
	if got[0].Name != "OUTSIDE" || got[0].State != "MASTER" || got[0].VRID != "10" {
		t.Errorf("got[0] = %+v", got[0])
	}
	if got[1].Name != "INSIDE" || got[1].State != "BACKUP" || got[1].LastTransition != "1d3h" {
		t.Errorf("got[1] = %+v", got[1])
	}
}

func TestParseVRRPStatus_NoDataRows(t *testing.T) {
	raw := buildTabulateFixtureWithHeaders(
		[]string{"Name", "Interface", "VRID", "State", "Priority", "Last Transition"},
		[]int{10, 9, 4, 6, 8, 15},
		nil,
	)
	got := vyos.ParseVRRPStatus(raw)
	if got == nil || len(got) != 0 {
		t.Errorf("got = %+v, want empty non-nil slice", got)
	}
}

func TestShowVRRPStatus(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["vrrp"] = buildTabulateFixtureWithHeaders(
		[]string{"Name", "Interface", "VRID", "State", "Priority", "Last Transition"},
		[]int{10, 9, 4, 6, 8, 15},
		[][]string{{"OUTSIDE", "eth0", "10", "MASTER", "100", "2s"}},
	)

	got, err := c.ShowVRRPStatus(context.Background())
	if err != nil {
		t.Fatalf("ShowVRRPStatus: %v", err)
	}
	if len(got) != 1 || got[0].Name != "OUTSIDE" {
		t.Errorf("got = %+v", got)
	}
}

func TestShowVRRPStatus_PropagatesVyOSError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowErrors["vrrp"] = "VRRP is not configured"

	_, err := c.ShowVRRPStatus(context.Background())
	if err == nil {
		t.Fatal("expected an error")
	}
}
