// Command mock-vyos runs backend/internal/testutil's fake VyOS REST
// server as a standalone, real HTTP process rather than an in-test
// httptest.Server, so it can be used as a docker-compose dependency for
// local testing of vyos-client without a real router.
//
// It is NOT a faithful VyOS emulator - it exists purely to let
// vyos-client's own HTTP surface (login, config read/write, commit/save)
// be exercised end-to-end locally. It is not part of the production
// image (see deploy/mock-vyos.Dockerfile, separate from deploy/Dockerfile).
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
)

func main() {
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8443"
	}
	key := os.Getenv("VYOS_API_KEY")
	if key == "" {
		key = "dev-key"
	}

	fake, handler := testutil.NewHandler(key)
	seed(fake, key)

	log.Printf("mock-vyos listening on %s (accepting API key %q)", addr, key)
	if err := http.ListenAndServe(addr, handler); err != nil { //nolint:gosec // plain HTTP is fine: dev-only, loopback/compose-network scoped.
		log.Fatal(err)
	}
}

// seed pre-populates a small, plausible-looking configuration so the
// Config Tree page has something to show on first run, instead of an
// empty tree.
func seed(fake *testutil.FakeVyOS, apiKey string) {
	// Keep GET /info consistent with the seeded `system host-name`
	// below, rather than NewHandler's generic "vyos-test" default.
	fake.Info["hostname"] = "vyos-mock"
	fake.Info["version"] = "2026.02-rolling"

	fake.Config["system"] = map[string]any{
		"host-name": "vyos-mock",
		"login": map[string]any{
			"user": map[string]any{
				// A genuine sha512_crypt hash for the password
				// "admin" (generated independently via `mkpasswd -m
				// sha-512`, not by this project's own hashing code -
				// see backend/internal/auth's own test fixtures for
				// the same rationale). This is deliberately a REAL,
				// working hash, not a placeholder: with
				// AUTH_MODE=vyos-users being the default, this is
				// what makes `docker compose up` continue to work
				// out of the box with the documented admin/admin
				// login (see docs/development.md) - not just a
				// masking-demo value in the Config Tree page.
				"admin": map[string]any{
					"authentication": map[string]any{
						"encrypted-password": "$6$mockvyossalt1$7Pv0dKg5yqCXAQGl1UbioYLPKBjHs5lvGtkCgUtJBD47TkAbRACy.84.bI5qZBBbwmoJrBUR98Q8f6MC5az0N1",
					},
				},
			},
		},
	}
	fake.Config["interfaces"] = map[string]any{
		"ethernet": map[string]any{
			"eth0": map[string]any{
				"address":     []any{"dhcp"},
				"description": "WAN (mock)",
			},
			"eth1": map[string]any{
				"address":     []any{"192.168.1.1/24"},
				"description": "LAN (mock)",
			},
		},
	}
	fake.Config["service"] = map[string]any{
		"https": map[string]any{
			"api": map[string]any{
				"rest": map[string]any{},
				"keys": map[string]any{
					"id": map[string]any{
						"vyos-client": map[string]any{
							"key": apiKey,
						},
					},
				},
			},
		},
		"dhcp-server": map[string]any{
			"shared-network-name": map[string]any{
				"LAN": map[string]any{
					"subnet": map[string]any{
						"192.168.1.0/24": map[string]any{
							"subnet-id": "1",
							"range": map[string]any{
								"0": map[string]any{"start": "192.168.1.50", "stop": "192.168.1.250"},
							},
						},
					},
				},
			},
		},
	}
	fake.Config["firewall"] = map[string]any{
		"zone": map[string]any{
			"LAN": map[string]any{
				"description":    "Main LAN",
				"interface":      "eth1",
				"default-action": "drop",
				"from": map[string]any{
					"WAN": map[string]any{"firewall": map[string]any{"name": "WAN-LAN-v4"}},
				},
			},
			"WAN": map[string]any{
				"interface":      "eth0",
				"default-action": "drop",
			},
			"LOCAL": map[string]any{
				"local-zone":     map[string]any{},
				"default-action": "drop",
				"from": map[string]any{
					"LAN": map[string]any{"firewall": map[string]any{"name": "LAN-LOCAL-v4"}},
				},
			},
		},
		"group": map[string]any{
			"address-group": map[string]any{
				"MOCK-SERVERS": map[string]any{
					"address":     []any{"192.168.1.10", "192.168.1.11"},
					"description": "Example servers",
				},
			},
		},
		"ipv4": map[string]any{
			"input": map[string]any{
				"filter": map[string]any{
					"default-action": "drop",
					"rule": map[string]any{
						"10": map[string]any{
							"action":      "accept",
							"description": "Allow established/related",
						},
					},
				},
			},
			"name": map[string]any{
				"WAN-LAN-v4": map[string]any{
					"default-action": "drop",
					"description":    "WAN to LAN",
					"rule": map[string]any{
						"10": map[string]any{
							"action":      "accept",
							"protocol":    "tcp",
							"description": "Allow web to servers",
							"destination": map[string]any{
								"port":  "443",
								"group": map[string]any{"address-group": "MOCK-SERVERS"},
							},
						},
					},
				},
				"LAN-LOCAL-v4": map[string]any{
					"default-action": "accept",
				},
			},
		},
		"global-options": map[string]any{
			"all-ping":    "enable",
			"syn-cookies": "enable",
		},
	}

	seedShowOutputs(fake)
}

// seedShowOutputs populates the operational-mode ("show ...") data the
// Dashboard/Interfaces/Routes pages read - vyos.ShowInterfaces and
// vyos.ShowRoutes decode this from JSON *text* (matching real VyOS's
// output shape for these commands, see their own doc comments), not
// pre-built Go values, so it's marshaled here rather than assigned
// directly. Loosely mirrors the eth0 (WAN)/eth1 (LAN) interfaces
// already seeded in fake.Config above, so the Dashboard/Interfaces
// page shows something consistent with the Config Tree page.
func seedShowOutputs(fake *testutil.FakeVyOS) {
	setShowOutputJSON(fake, "interfaces kernel json", []map[string]any{
		{
			"ifname":    "lo",
			"mtu":       65536,
			"operstate": "UNKNOWN",
			"address":   "00:00:00:00:00:00",
			"flags":     []string{"LOOPBACK", "UP", "LOWER_UP"},
			"addr_info": []map[string]any{
				{"family": "inet", "local": "127.0.0.1", "prefixlen": 8, "scope": "host"},
			},
		},
		{
			"ifname":    "eth0",
			"mtu":       1500,
			"operstate": "UP",
			"address":   "52:54:00:aa:bb:cc",
			"ifalias":   "WAN (mock)",
			"flags":     []string{"BROADCAST", "MULTICAST", "UP", "LOWER_UP"},
			"addr_info": []map[string]any{
				{"family": "inet", "local": "203.0.113.50", "prefixlen": 24, "scope": "global"},
			},
		},
		{
			"ifname":    "eth1",
			"mtu":       1500,
			"operstate": "UP",
			"address":   "52:54:00:dd:ee:ff",
			"ifalias":   "LAN (mock)",
			"flags":     []string{"BROADCAST", "MULTICAST", "UP", "LOWER_UP"},
			"addr_info": []map[string]any{
				{"family": "inet", "local": "192.168.1.1", "prefixlen": 24, "scope": "global"},
			},
		},
	})

	setShowOutputJSON(fake, "ip route json", []map[string]any{
		{
			"prefix": "0.0.0.0/0", "protocol": "static", "selected": true, "distance": 1, "metric": 0,
			"nexthops": []map[string]any{{"ip": "203.0.113.1", "interface_name": "eth0", "active": true}},
		},
		{
			"prefix": "192.168.1.0/24", "protocol": "connected", "selected": true, "distance": 0, "metric": 0,
			"nexthops": []map[string]any{{"interface_name": "eth1", "active": true, "directly_connected": true}},
		},
	})

	setShowOutputJSON(fake, "ipv6 route json", []map[string]any{})

	// `show dhcp server leases` has no JSON output mode at all (see
	// vyos.ShowDHCPLeases's doc comment) - formatTabulateTable produces
	// the same tabulate "simple" text shape vyos.ShowDHCPLeases parses,
	// matching the LAN subnet seeded in fake.Config above.
	fake.ShowOutputs["dhcp server leases"] = formatTabulateTable(
		[]string{"IP Address", "MAC address", "State", "Lease start", "Lease expiration", "Remaining", "Pool", "Hostname", "Origin"},
		[][]string{
			{"192.168.1.50", "52:54:00:11:22:33", "active", "2026/08/26 10:00:00", "2026/08/26 11:00:00", "0:45:00", "LAN", "mock-laptop", "local"},
			{"192.168.1.51", "52:54:00:44:55:66", "active", "2026/08/26 10:05:00", "2026/08/26 11:05:00", "0:50:00", "LAN", "-", "local"},
		},
	)

	// `show system uptime|cpu|memory|storage` have no JSON output mode
	// reachable through the REST API either (see vyos.ShowUptime's doc
	// comment) - these are the plain-text shapes vyos.Client's
	// corresponding Show* parsers expect, not JSON.
	fake.ShowOutputs["system uptime"] = "Uptime: 3w 2d 5h 12m 45s\n\n" +
		"Load averages:\n" +
		"1  minute:   12.3%\n" +
		"5  minutes:  8.7%\n" +
		"15 minutes:  5.2%"
	fake.ShowOutputs["system cpu"] = "CPU socket: 0\n" +
		"CPU Vendor:       AuthenticAMD\n" +
		"Model:            AMD EPYC 7302P 16-Core Processor (mock)\n" +
		"Cores:            4\n" +
		"Current MHz:      2994.140"
	fake.ShowOutputs["system memory"] = "Total: 3.83 GB\nFree:  2.61 GB\nUsed:  1.22 GB"
	fake.ShowOutputs["system storage"] = "Filesystem: /dev/vda1\nSize:       8.9G\nUsed:       2.1G (25%)\nAvailable:  6.4G (75%)"
}

func setShowOutputJSON(fake *testutil.FakeVyOS, path string, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		// v above is a static literal known to be marshalable; a
		// failure here would mean a programming error in this file.
		panic(err)
	}
	fake.ShowOutputs[path] = string(b)
}

// formatTabulateTable produces the same tabulate "simple"-style text
// (header row, dash-separator row sized to each column's widest value,
// left-aligned data rows with a 2-space minimum gap) that
// vyos.parseTabulateTable expects to parse - the inverse operation,
// used only to build realistic seed data here.
func formatTabulateTable(headers []string, rows [][]string) string {
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, row := range rows {
		for i, v := range row {
			if i < len(widths) && len(v) > widths[i] {
				widths[i] = len(v)
			}
		}
	}

	var b strings.Builder
	writeRow := func(cells []string) {
		for i, c := range cells {
			b.WriteString(c)
			if i < len(cells)-1 {
				b.WriteString(strings.Repeat(" ", widths[i]-len(c)+2))
			}
		}
		b.WriteString("\n")
	}
	writeRow(headers)
	dashes := make([]string, len(headers))
	for i, w := range widths {
		dashes[i] = strings.Repeat("-", w)
	}
	writeRow(dashes)
	for _, row := range rows {
		writeRow(row)
	}
	return strings.TrimRight(b.String(), "\n")
}
