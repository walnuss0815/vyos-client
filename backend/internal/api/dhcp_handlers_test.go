package api

import "testing"

func TestResolveDHCPSubnet_SingleSubnetSkipsContainmentCheck(t *testing.T) {
	// Even a nonsense/unparseable IP resolves correctly when there's
	// only one subnet - this is the common case (one subnet per
	// shared-network) and shouldn't depend on the IP being valid.
	got := resolveDHCPSubnet([]string{"192.168.1.0/24"}, "not-an-ip")
	if got != "192.168.1.0/24" {
		t.Errorf("got %q, want 192.168.1.0/24", got)
	}
}

func TestResolveDHCPSubnet_MultipleSubnetsPicksContainingOne(t *testing.T) {
	subnets := []string{"192.168.1.0/24", "10.0.0.0/24"}
	if got := resolveDHCPSubnet(subnets, "10.0.0.55"); got != "10.0.0.0/24" {
		t.Errorf("got %q, want 10.0.0.0/24", got)
	}
	if got := resolveDHCPSubnet(subnets, "192.168.1.55"); got != "192.168.1.0/24" {
		t.Errorf("got %q, want 192.168.1.0/24", got)
	}
}

func TestResolveDHCPSubnet_NoContainingSubnet(t *testing.T) {
	got := resolveDHCPSubnet([]string{"192.168.1.0/24", "10.0.0.0/24"}, "203.0.113.5")
	if got != "" {
		t.Errorf("got %q, want empty (no configured subnet contains this address)", got)
	}
}

func TestResolveDHCPSubnet_NoSubnets(t *testing.T) {
	if got := resolveDHCPSubnet(nil, "192.168.1.5"); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}
