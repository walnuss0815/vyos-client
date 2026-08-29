package vyos_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func buildQosShaperFixture(interfaceName, policyName string, rows [][]string) string {
	const format = "%-9s  %-9s  %-11s  %-9s  %-7s  %-6s  %-7s  %s\n"
	table := fmt.Sprintf(format, "Class", "Type", "Bandwidth", "Max. BW", "Bytes", "Pkts", "Drops", "Queued")
	table += fmt.Sprintf(format,
		strings.Repeat("-", 9), strings.Repeat("-", 9), strings.Repeat("-", 11),
		strings.Repeat("-", 9), strings.Repeat("-", 7), strings.Repeat("-", 6),
		strings.Repeat("-", 7), strings.Repeat("-", 8))
	for _, r := range rows {
		table += fmt.Sprintf(format, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7])
	}

	return strings.Repeat("-", 80) + "\n" +
		"Interface: " + interfaceName + "\n" +
		"Policy Name: " + policyName + "\n" +
		"\n" +
		table
}

func TestParseQosShaperStatus(t *testing.T) {
	raw := buildQosShaperFixture("eth0", "MY-SHAPER", [][]string{
		{"default", "fq-codel", "1.000 Mb", "1.000 Mb", "0  B", "0", "0", "0"},
		{"2", "fq-codel", "500.000 Kb", "1.000 Mb", "10  B", "5", "1", "0"},
	})

	got, err := vyos.ParseQosShaperStatus(raw)
	if err != nil {
		t.Fatalf("ParseQosShaperStatus: %v", err)
	}
	if got.Interface != "eth0" || got.PolicyName != "MY-SHAPER" {
		t.Errorf("got = %+v", got)
	}
	if len(got.Classes) != 2 {
		t.Fatalf("len(Classes) = %d, want 2: %+v", len(got.Classes), got.Classes)
	}
	if got.Classes[0].Class != "default" || got.Classes[0].Bandwidth != "1.000 Mb" {
		t.Errorf("Classes[0] = %+v", got.Classes[0])
	}
	if got.Classes[1].Class != "2" || got.Classes[1].Drops != "1" {
		t.Errorf("Classes[1] = %+v", got.Classes[1])
	}
}

func TestParseQosShaperStatus_UnrecognizedOutputReturnsError(t *testing.T) {
	_, err := vyos.ParseQosShaperStatus("QoS is not applied to eth0!\n")
	if err == nil {
		t.Fatal("expected an error for output matching none of the known lines")
	}
}

func TestShowQosShaperStatus(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["qos shaper interface eth0"] = buildQosShaperFixture("eth0", "MY-SHAPER", [][]string{
		{"default", "fq-codel", "1.000 Mb", "1.000 Mb", "0  B", "0", "0", "0"},
	})

	got, err := c.ShowQosShaperStatus(context.Background(), "eth0")
	if err != nil {
		t.Fatalf("ShowQosShaperStatus: %v", err)
	}
	if got.Interface != "eth0" || len(got.Classes) != 1 {
		t.Errorf("got = %+v", got)
	}
}

func TestShowQosShaperStatus_PropagatesVyOSError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowErrors["qos shaper interface eth0"] = "QoS is not applied to eth0!"

	_, err := c.ShowQosShaperStatus(context.Background(), "eth0")
	if err == nil {
		t.Fatal("expected an error")
	}
}
