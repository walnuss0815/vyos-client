package vyos

import (
	"context"
	"regexp"
	"strconv"
	"strings"
)

// This file covers `show system {uptime,cpu,memory,storage}` - like
// DHCP leases, none of these four commands have a JSON output mode
// reachable through VyOS's REST API. Their underlying Python scripts
// (uptime.py/cpu.py/memory.py/storage.py) all support a `--raw` flag
// that dumps JSON instead of formatted text, but that flag is
// generated generically from the Python function signature by VyOS's
// own op-mode framework and is only reachable via direct argv - not
// through the XML-defined op-mode command tree the REST API's /show
// endpoint dispatches through (confirmed against
// op-mode-definitions/show-system.xml.in: none of the four have a
// "json"/"raw" child node, unlike e.g. `show interfaces kernel
// json`). So each Show* function here parses the plain-text CLI
// output instead, the same approach ShowDHCPLeases established.

// SystemUptime is `show system uptime`'s parsed output.
type SystemUptime struct {
	// Uptime is VyOS's own human-formatted duration string (e.g. "3w
	// 2d 5h 12m 45s") - passed through as-is rather than re-parsed
	// into a duration, since only non-zero units are included (an
	// uptime of a few minutes renders as just "5m 12s", with no
	// leading "0d 0h") and there's no reason to lose that formatting.
	Uptime string `json:"uptime"`
	// Load1/Load5/Load15 are NOT classic Unix load averages - VyOS's
	// own uptime.py divides the raw /proc/loadavg figures by the
	// system's CPU core count and expresses them as percentages
	// (0-100, load-per-core), confirmed against its source.
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

var uptimeLoadLinePattern = regexp.MustCompile(`^\s*(\d+)\s+minutes?:\s*([0-9.]+)%\s*$`)

// ShowUptime returns the router's uptime and per-core load averages.
func (c *Client) ShowUptime(ctx context.Context) (*SystemUptime, error) {
	text, err := c.Show(ctx, []string{"system", "uptime"})
	if err != nil {
		return nil, err
	}
	return ParseSystemUptime(text), nil
}

// ParseSystemUptime parses text of the form:
//
//	Uptime: 3w 2d 5h 12m 45s
//
//	Load averages:
//	1  minute:   12.3%
//	5  minutes:  8.7%
//	15 minutes:  5.2%
//
// Never errors - an unrecognized line is simply skipped, leaving that
// field at its zero value, the same defensive approach
// parseTabulateTable takes for DHCP leases.
func ParseSystemUptime(text string) *SystemUptime {
	out := &SystemUptime{}
	for _, line := range strings.Split(text, "\n") {
		if rest, ok := strings.CutPrefix(line, "Uptime:"); ok {
			out.Uptime = strings.TrimSpace(rest)
			continue
		}
		m := uptimeLoadLinePattern.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		value, err := strconv.ParseFloat(m[2], 64)
		if err != nil {
			continue
		}
		switch m[1] {
		case "1":
			out.Load1 = value
		case "5":
			out.Load5 = value
		case "15":
			out.Load15 = value
		}
	}
	return out
}

// SystemMemory is `show system memory`'s parsed output, in bytes
// (reversed from VyOS's own "15.32 GB"-style formatting via
// parseHumanBytes).
type SystemMemory struct {
	TotalBytes int64 `json:"totalBytes"`
	FreeBytes  int64 `json:"freeBytes"`
	UsedBytes  int64 `json:"usedBytes"`
}

// ShowMemory returns system memory usage.
func (c *Client) ShowMemory(ctx context.Context) (*SystemMemory, error) {
	text, err := c.Show(ctx, []string{"system", "memory"})
	if err != nil {
		return nil, err
	}
	return ParseSystemMemory(text), nil
}

// ParseSystemMemory parses text of the form:
//
//	Total: 15.32 GB
//	Free:  9.11 GB
//	Used:  6.21 GB
func ParseSystemMemory(text string) *SystemMemory {
	out := &SystemMemory{}
	for _, line := range strings.Split(text, "\n") {
		label, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		bytes, ok := parseHumanBytes(value)
		if !ok {
			continue
		}
		switch strings.TrimSpace(label) {
		case "Total":
			out.TotalBytes = bytes
		case "Free":
			out.FreeBytes = bytes
		case "Used":
			out.UsedBytes = bytes
		}
	}
	return out
}

// SystemStorage is `show system storage`'s parsed output, in bytes.
type SystemStorage struct {
	Filesystem string `json:"filesystem"`
	SizeBytes  int64  `json:"sizeBytes"`
	UsedBytes  int64  `json:"usedBytes"`
	AvailBytes int64  `json:"availBytes"`
}

// ShowStorage returns disk usage for VyOS's persistent overlay
// filesystem. Returns (nil, nil) - not an error - when VyOS itself
// reports storage statistics as unavailable (its own storage.py
// raises this when the expected live-boot persistence mount isn't
// present, e.g. running from a bare live CD before install): from
// this app's perspective that's a legitimate "nothing to show", not a
// failure worth surfacing as an error to the frontend.
func (c *Client) ShowStorage(ctx context.Context) (*SystemStorage, error) {
	text, err := c.Show(ctx, []string{"system", "storage"})
	if err != nil {
		return nil, err
	}
	return ParseSystemStorage(text), nil
}

// ParseSystemStorage parses text of the form:
//
//	Filesystem: /dev/sda1
//	Size:       16G
//	Used:       7.6G (51%)
//	Available:  7.3G (49%)
//
// (or VyOS's own "Storage statistics are not available" message,
// which parses to nil since none of the expected labels are present).
// Used/Available carry a trailing "(NN%)" annotation - only the
// leading size token before the first space is a size.
func ParseSystemStorage(text string) *SystemStorage {
	out := &SystemStorage{}
	found := false
	for _, line := range strings.Split(text, "\n") {
		label, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		value = strings.TrimSpace(value)
		switch strings.TrimSpace(label) {
		case "Filesystem":
			out.Filesystem = value
			found = true
		case "Size":
			if b, ok := parseHumanBytes(value); ok {
				out.SizeBytes = b
				found = true
			}
		case "Used":
			size, _, _ := strings.Cut(value, " ")
			if b, ok := parseHumanBytes(size); ok {
				out.UsedBytes = b
				found = true
			}
		case "Available":
			size, _, _ := strings.Cut(value, " ")
			if b, ok := parseHumanBytes(size); ok {
				out.AvailBytes = b
				found = true
			}
		}
	}
	if !found {
		return nil
	}
	return out
}

// SystemCPU is `show system cpu`'s parsed output.
type SystemCPU struct {
	Cores int    `json:"cores"`
	Model string `json:"model,omitempty"`
}

// ShowCPU returns CPU core count and model.
func (c *Client) ShowCPU(ctx context.Context) (*SystemCPU, error) {
	text, err := c.Show(ctx, []string{"system", "cpu"})
	if err != nil {
		return nil, err
	}
	return ParseSystemCPU(text), nil
}

// ParseSystemCPU parses text of the form (one block per *physical*
// CPU socket, blank-line separated - a multi-socket router prints
// multiple blocks):
//
//	CPU socket: 0
//	CPU Vendor:       AuthenticAMD
//	Model:            AMD Ryzen 7 PRO 5850U with Radeon Graphics
//	Cores:            8
//	Current MHz:      3943.420
//
// Sums Cores across every block and reports the first block's Model
// as representative - a router with multiple physical CPU packages of
// different models would be highly unusual. Individual fields can be
// entirely absent for a given block (VyOS's Jinja2 template still
// emits the surrounding blank line even when a field like "physical
// id" doesn't exist on a given architecture) - matched by label
// prefix rather than fixed column position so that's harmless here.
func ParseSystemCPU(text string) *SystemCPU {
	out := &SystemCPU{}
	for _, line := range strings.Split(text, "\n") {
		if rest, ok := strings.CutPrefix(line, "Model:"); ok {
			if out.Model == "" {
				out.Model = strings.TrimSpace(rest)
			}
			continue
		}
		if rest, ok := strings.CutPrefix(line, "Cores:"); ok {
			if n, err := strconv.Atoi(strings.TrimSpace(rest)); err == nil {
				out.Cores += n
			}
		}
	}
	return out
}
