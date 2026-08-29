package main

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"
)

// runHealthcheck implements `vyos-client healthcheck`, a tiny
// self-contained liveness probe intended for the container image's
// HEALTHCHECK instruction (or `set container name ... health-check
// command`). It exists because the final image is distroless (no
// shell, no curl) so `exec`-based health checks need a binary that's
// actually present in the image — this one is, since it's the app
// itself.
//
// It hits the backend's own /healthz on LISTEN_ADDR (or :8443 if
// unset) - HTTPS by default, or plain HTTP when TLS_ENABLED=false
// (see config.Config.TLSEnabled; read directly via os.Getenv here
// rather than through the config package, matching this file's
// existing deliberately-self-contained style - a healthcheck
// shouldn't need every other setting, like VYOS_API_KEY, to be valid
// just to parse TLS_ENABLED). TLS verification is skipped in the
// HTTPS case since it's always talking to itself over loopback with a
// certificate it may have generated itself.
func runHealthcheck() error {
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8443"
	}
	host := addr
	if host[0] == ':' {
		host = "127.0.0.1" + host
	}

	tlsEnabled := true
	if v := os.Getenv("TLS_ENABLED"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return fmt.Errorf("TLS_ENABLED: %w", err)
		}
		tlsEnabled = b
	}

	client := &http.Client{Timeout: 3 * time.Second}
	scheme := "http"
	if tlsEnabled {
		scheme = "https"
		//nolint:gosec // always loopback, see doc comment above.
		client.Transport = &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}
	}

	resp, err := client.Get(scheme + "://" + host + "/healthz")
	if err != nil {
		return fmt.Errorf("healthcheck request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthcheck returned status %d", resp.StatusCode)
	}
	return nil
}
