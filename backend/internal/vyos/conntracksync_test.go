package vyos_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func TestParseConntrackSyncStatus(t *testing.T) {
	raw := "\n" +
		"sync-interface        : eth1, eth2\n" +
		"failover-mechanism    : vrrp [sync-group INTERNAL]\n" +
		"last state transition : primary -> backup transition\n" +
		"ExpectationSync       : ftp, sip\n"

	got, err := vyos.ParseConntrackSyncStatus(raw)
	if err != nil {
		t.Fatalf("ParseConntrackSyncStatus: %v", err)
	}
	if len(got.SyncInterfaces) != 2 || got.SyncInterfaces[0] != "eth1" || got.SyncInterfaces[1] != "eth2" {
		t.Errorf("SyncInterfaces = %v", got.SyncInterfaces)
	}
	if got.FailoverMechanism != "vrrp" || got.SyncGroup != "INTERNAL" {
		t.Errorf("FailoverMechanism/SyncGroup = %q/%q", got.FailoverMechanism, got.SyncGroup)
	}
	if got.LastTransition != "primary -> backup transition" {
		t.Errorf("LastTransition = %q", got.LastTransition)
	}
	if len(got.ExpectSyncProtocols) != 2 || got.ExpectSyncProtocols[0] != "ftp" {
		t.Errorf("ExpectSyncProtocols = %v", got.ExpectSyncProtocols)
	}
}

func TestParseConntrackSyncStatus_DisabledExpectSyncAndNoTransitionYet(t *testing.T) {
	raw := "\n" +
		"sync-interface        : eth1\n" +
		"failover-mechanism    : vrrp [sync-group INTERNAL]\n" +
		"last state transition : no transition yet!\n" +
		"ExpectationSync       : disabled\n"

	got, err := vyos.ParseConntrackSyncStatus(raw)
	if err != nil {
		t.Fatalf("ParseConntrackSyncStatus: %v", err)
	}
	if len(got.ExpectSyncProtocols) != 0 {
		t.Errorf("ExpectSyncProtocols = %v, want empty", got.ExpectSyncProtocols)
	}
	if got.LastTransition != "no transition yet!" {
		t.Errorf("LastTransition = %q", got.LastTransition)
	}
}

func TestParseConntrackSyncStatus_UnrecognizedOutputReturnsError(t *testing.T) {
	_, err := vyos.ParseConntrackSyncStatus("conntrack-sync is not configured!\n")
	if err == nil {
		t.Fatal("expected an error for output matching none of the known lines")
	}
}

func TestShowConntrackSyncStatus(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["conntrack-sync status"] = "\n" +
		"sync-interface        : eth1\n" +
		"failover-mechanism    : vrrp [sync-group INTERNAL]\n" +
		"last state transition : no transition yet!\n" +
		"ExpectationSync       : disabled\n"

	got, err := c.ShowConntrackSyncStatus(context.Background())
	if err != nil {
		t.Fatalf("ShowConntrackSyncStatus: %v", err)
	}
	if got.SyncGroup != "INTERNAL" {
		t.Errorf("SyncGroup = %q", got.SyncGroup)
	}
}

func TestShowConntrackSyncStatus_PropagatesVyOSError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowErrors["conntrack-sync status"] = "conntrack-sync is not configured!"

	_, err := c.ShowConntrackSyncStatus(context.Background())
	if err == nil {
		t.Fatal("expected an error")
	}
}
