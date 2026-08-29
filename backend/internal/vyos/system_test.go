package vyos_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func newTestClientForSystem(t *testing.T) (*testutil.FakeVyOS, *vyos.Client) {
	t.Helper()
	fake := testutil.New("test-key")
	t.Cleanup(fake.Close)
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	return fake, c
}

func TestShowUptime(t *testing.T) {
	fake, c := newTestClientForSystem(t)
	fake.ShowOutputs["system uptime"] = "Uptime: 3w 2d 5h 12m 45s\n\n" +
		"Load averages:\n" +
		"1  minute:   12.3%\n" +
		"5  minutes:  8.7%\n" +
		"15 minutes:  5.2%"

	got, err := c.ShowUptime(context.Background())
	if err != nil {
		t.Fatalf("ShowUptime: %v", err)
	}
	want := vyos.SystemUptime{Uptime: "3w 2d 5h 12m 45s", Load1: 12.3, Load5: 8.7, Load15: 5.2}
	if *got != want {
		t.Errorf("got %+v, want %+v", *got, want)
	}
}

func TestShowUptime_ShortUptimeNoLeadingZeroUnits(t *testing.T) {
	// seconds_to_human only emits non-zero units, so a freshly-booted
	// router's uptime string has no leading "0w 0d 0h".
	fake, c := newTestClientForSystem(t)
	fake.ShowOutputs["system uptime"] = "Uptime: 5m 12s\n\n" +
		"Load averages:\n" +
		"1  minute:   0.0%\n" +
		"5  minutes:  0.0%\n" +
		"15 minutes:  0.0%"

	got, err := c.ShowUptime(context.Background())
	if err != nil {
		t.Fatalf("ShowUptime: %v", err)
	}
	if got.Uptime != "5m 12s" {
		t.Errorf("Uptime = %q, want %q", got.Uptime, "5m 12s")
	}
}

func TestShowMemory(t *testing.T) {
	fake, c := newTestClientForSystem(t)
	fake.ShowOutputs["system memory"] = "Total: 15.32 GB\nFree:  9.11 GB\nUsed:  6.21 GB"

	got, err := c.ShowMemory(context.Background())
	if err != nil {
		t.Fatalf("ShowMemory: %v", err)
	}
	if got.TotalBytes != 16449724743 || got.FreeBytes != 9781788016 || got.UsedBytes != 6667936727 {
		t.Errorf("got %+v", *got)
	}
}

func TestShowStorage(t *testing.T) {
	fake, c := newTestClientForSystem(t)
	fake.ShowOutputs["system storage"] = "Filesystem: /dev/sda1\nSize:       16G\nUsed:       7.6G (51%)\nAvailable:  7.3G (49%)"

	got, err := c.ShowStorage(context.Background())
	if err != nil {
		t.Fatalf("ShowStorage: %v", err)
	}
	if got == nil {
		t.Fatal("got nil, want a result")
	}
	if got.Filesystem != "/dev/sda1" {
		t.Errorf("Filesystem = %q, want /dev/sda1", got.Filesystem)
	}
	if got.SizeBytes != 17179869184 {
		t.Errorf("SizeBytes = %d, want 17179869184", got.SizeBytes)
	}
	// Used/Available strip the trailing "(NN%)" annotation.
	if got.UsedBytes != 8160437862 {
		t.Errorf("UsedBytes = %d, want 8160437862", got.UsedBytes)
	}
	if got.AvailBytes == 0 {
		t.Error("AvailBytes = 0, want non-zero")
	}
}

// TestShowStorage_NotAvailable covers what VyOS prints when the
// live-boot persistence mount doesn't exist - a plain message, not a
// table - which must decode to nil (not an error, not a zero-value
// struct that would misleadingly show as "0 B used" on the Dashboard).
func TestShowStorage_NotAvailable(t *testing.T) {
	fake, c := newTestClientForSystem(t)
	fake.ShowOutputs["system storage"] = "Storage statistics are not available\n"

	got, err := c.ShowStorage(context.Background())
	if err != nil {
		t.Fatalf("ShowStorage: %v", err)
	}
	if got != nil {
		t.Errorf("got %+v, want nil", got)
	}
}

func TestShowCPU_SingleSocket(t *testing.T) {
	fake, c := newTestClientForSystem(t)
	fake.ShowOutputs["system cpu"] = "CPU socket: 0\n" +
		"CPU Vendor:       AuthenticAMD\n" +
		"Model:            AMD Ryzen 7 PRO 5850U with Radeon Graphics\n" +
		"Cores:            8\n" +
		"Current MHz:      3943.420"

	got, err := c.ShowCPU(context.Background())
	if err != nil {
		t.Fatalf("ShowCPU: %v", err)
	}
	if got.Cores != 8 {
		t.Errorf("Cores = %d, want 8", got.Cores)
	}
	if got.Model != "AMD Ryzen 7 PRO 5850U with Radeon Graphics" {
		t.Errorf("Model = %q", got.Model)
	}
}

// TestShowCPU_MultiSocket covers a dual-socket router: Cores are
// summed across every physical-CPU block (blank-line separated), and
// Model is taken from the first block only.
func TestShowCPU_MultiSocket(t *testing.T) {
	fake, c := newTestClientForSystem(t)
	fake.ShowOutputs["system cpu"] = "CPU socket: 0\n" +
		"CPU Vendor:       GenuineIntel\n" +
		"Model:            Intel(R) Xeon(R) CPU E5-2620 v4 @ 2.10GHz\n" +
		"Cores:            8\n" +
		"Current MHz:      2100.000\n" +
		"\n" +
		"CPU socket: 1\n" +
		"CPU Vendor:       GenuineIntel\n" +
		"Model:            Intel(R) Xeon(R) CPU E5-2620 v4 @ 2.10GHz\n" +
		"Cores:            8\n" +
		"Current MHz:      2100.000"

	got, err := c.ShowCPU(context.Background())
	if err != nil {
		t.Fatalf("ShowCPU: %v", err)
	}
	if got.Cores != 16 {
		t.Errorf("Cores = %d, want 16 (summed across both sockets)", got.Cores)
	}
	if got.Model != "Intel(R) Xeon(R) CPU E5-2620 v4 @ 2.10GHz" {
		t.Errorf("Model = %q", got.Model)
	}
}

// TestShowCPU_MissingFieldLeavesBlankLine covers an architecture where
// a field (e.g. "physical id" on ARM) is absent - VyOS's Jinja2
// template still emits the surrounding blank line, since only the
// {% if %} block itself is conditional, not the newline around it.
func TestShowCPU_MissingFieldLeavesBlankLine(t *testing.T) {
	fake, c := newTestClientForSystem(t)
	fake.ShowOutputs["system cpu"] = "CPU socket: 0\n\nModel:            ARM Cortex-A72\nCores:            4\n"

	got, err := c.ShowCPU(context.Background())
	if err != nil {
		t.Fatalf("ShowCPU: %v", err)
	}
	if got.Cores != 4 || got.Model != "ARM Cortex-A72" {
		t.Errorf("got %+v", *got)
	}
}
