// Package config loads the application's runtime configuration from
// environment variables. This is deliberately the ONLY source of
// backend configuration — there is no config file and no database, in
// keeping with the project's "no separate server-side state
// management" principle: everything durable lives in VyOS itself, and
// everything the backend needs to know to get there is supplied once,
// at container start, via the environment.
package config

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"strconv"
)

// AuthMode values, selecting how vyos-client's own login is verified.
// See docs/security.md and docs/roadmap.md for the full rationale.
const (
	// AuthModeStatic verifies against the single shared
	// UI_ADMIN_USER/UI_ADMIN_PASSWORD_HASH account, entirely
	// independent of VyOS's own user database. Useful as a
	// break-glass login path that doesn't depend on VyOS's API being
	// reachable.
	AuthModeStatic = "static"
	// AuthModeVyOSUsers verifies against a real VyOS local user's own
	// password, read from `system login user <name> authentication
	// encrypted-password` via the backend's existing VYOS_API_KEY.
	// The default: makes VyOS itself the source of truth for
	// accounts, with no separate credential store to manage.
	AuthModeVyOSUsers = "vyos-users"
)

// Config holds all backend runtime configuration.
type Config struct {
	// ListenAddr is the address the backend's own HTTPS listener binds
	// to, e.g. ":8443".
	ListenAddr string
	// TLSCertFile / TLSKeyFile, if both set, are used for the
	// backend's HTTPS listener. If unset, a self-signed certificate is
	// generated at startup (mirroring VyOS's own default behavior for
	// its API, with the same production caveat). Only consulted when
	// TLSEnabled is true.
	TLSCertFile string
	TLSKeyFile  string
	// TLSEnabled selects whether the backend's own listener (distinct
	// from VyOS's remote HTTPS API - see VyOSAPIURL below) serves
	// HTTPS (the default, true) or plain HTTP. Disabling this drops
	// the session cookie's Secure flag too (see api.Server.CookiesSecure)
	// - browsers refuse to send a Secure cookie back over plain HTTP,
	// so the two must move together or login breaks. Only turn this
	// off when a trusted reverse proxy terminates TLS in front of this
	// process, or on a fully isolated/trusted network - see
	// docs/security.md's TLS section.
	TLSEnabled bool
	// TLSCertFilesIgnored reports whether TLS_CERT_FILE/TLS_KEY_FILE
	// were set despite TLSEnabled == false, in which case they're
	// silently unused - same "you configured X but it's ignored"
	// pattern as UIAdminVarsIgnored below, so a startup warning can
	// flag the likely-contradictory configuration instead of an
	// operator wondering why their mounted certificate has no effect.
	TLSCertFilesIgnored bool

	// VyOSAPIURL is the base URL of the VyOS HTTPS API, e.g.
	// "https://127.0.0.1".
	VyOSAPIURL string
	// VyOSAPIURLUsesPlainHTTP reports whether VyOSAPIURL's scheme is
	// http rather than https. Not rejected outright - local dev
	// against the plain-HTTP mock-vyos fixture legitimately uses this
	// - but surfaced so the caller can log a startup warning instead
	// of the misconfiguration only manifesting as an opaque timeout on
	// the first live request against a real (TLS-only) VyOS API.
	VyOSAPIURLUsesPlainHTTP bool
	// VyOSAPIKey is the plaintext REST API key configured on VyOS via
	// `set service https api keys id ... key ...`.
	VyOSAPIKey string
	// VyOSAPIInsecureSkipVerify disables TLS verification when calling
	// the VyOS API. Only for lab/dev use against VyOS's auto-generated
	// self-signed certificate.
	VyOSAPIInsecureSkipVerify bool

	// AuthMode selects how login is verified: AuthModeStatic or
	// AuthModeVyOSUsers (the default). See the constants' docs above.
	AuthMode string

	// UIAdminUser / UIAdminPasswordHash are the single shared UI login
	// credential, required and used only when AuthMode ==
	// AuthModeStatic.
	UIAdminUser         string
	UIAdminPasswordHash string

	// UIAdminVarsIgnored reports whether UI_ADMIN_USER or
	// UI_ADMIN_PASSWORD_HASH were set in the environment despite
	// AuthMode == AuthModeVyOSUsers, in which case they're silently
	// unused. Computed once here (rather than re-reading the
	// environment on demand) so a *Config value is self-describing;
	// used to emit a startup warning so operators upgrading between
	// modes aren't left guessing which credential is actually active.
	UIAdminVarsIgnored bool

	// SessionSecret signs session and CSRF tokens. If not explicitly
	// set, a random one is generated at startup — sessions then don't
	// survive a container restart. Operators who want session
	// persistence across restarts (and want confidence that
	// restarting doesn't silently log everyone out) should set this
	// explicitly.
	SessionSecret []byte

	// SessionSecretIsEphemeral reports whether SESSION_SECRET was not
	// explicitly configured, meaning SessionSecret was randomly
	// generated for this run and all sessions will be invalidated on
	// the next restart. Computed once here (rather than re-reading the
	// environment on demand) so a *Config value is self-describing
	// without callers needing to re-supply the same getenv used to
	// build it. Used to emit a startup warning.
	SessionSecretIsEphemeral bool

	// SafeApplyDefaultSeconds is the default commit-confirm countdown
	// (in seconds) offered by the UI's "safe apply" toggle. 0 disables
	// commit-confirm by default (still available per-commit).
	SafeApplyDefaultSeconds int

	// ConfigWarningsEnabled turns on the frontend's persistent
	// "configuration warnings" banner (see frontend/src/lib
	// /configWarnings.ts and components/ConfigWarningsBanner.tsx) -
	// disabled by default. Unlike every other feature in this app, the
	// checks it runs are opinionated security-posture judgment calls
	// (e.g. "firewall default-action is accept") rather than factual
	// VyOS state, so this is opt-in rather than always-on, letting an
	// operator who disagrees with the specific checks (or simply
	// doesn't want the extra background config-tree fetches Layout.tsx
	// would otherwise keep warm for it) turn the whole thing off
	// rather than live with false-positive noise.
	ConfigWarningsEnabled bool
}

// Load reads configuration from the environment, applying defaults and
// validating required fields. missing lists any required environment
// variables that were not set, for a clear startup error.
func Load(getenv func(string) string) (*Config, error) {
	if getenv == nil {
		getenv = os.Getenv
	}

	var missing []string
	require := func(key string) string {
		v := getenv(key)
		if v == "" {
			missing = append(missing, key)
		}
		return v
	}

	authMode := orDefault(getenv("AUTH_MODE"), AuthModeVyOSUsers)
	if authMode != AuthModeStatic && authMode != AuthModeVyOSUsers {
		return nil, fmt.Errorf("config: AUTH_MODE must be %q or %q, got %q", AuthModeStatic, AuthModeVyOSUsers, authMode)
	}

	cfg := &Config{
		AuthMode:    authMode,
		ListenAddr:  orDefault(getenv("LISTEN_ADDR"), ":8443"),
		TLSCertFile: getenv("TLS_CERT_FILE"),
		TLSKeyFile:  getenv("TLS_KEY_FILE"),
		VyOSAPIURL:  orDefault(getenv("VYOS_API_URL"), "https://127.0.0.1"),
		VyOSAPIKey:  require("VYOS_API_KEY"),
	}

	// UI_ADMIN_USER/UI_ADMIN_PASSWORD_HASH are only required (and
	// used) in static mode; in vyos-users mode they're optional and,
	// if set anyway, silently ignored (with a startup log warning —
	// see UIAdminVarsIgnored) rather than rejected, so switching
	// AUTH_MODE back and forth doesn't force editing .env each time.
	rawUIAdminUser := getenv("UI_ADMIN_USER")
	rawUIAdminPasswordHash := getenv("UI_ADMIN_PASSWORD_HASH")
	if authMode == AuthModeStatic {
		cfg.UIAdminUser = require("UI_ADMIN_USER")
		cfg.UIAdminPasswordHash = require("UI_ADMIN_PASSWORD_HASH")
	} else {
		cfg.UIAdminVarsIgnored = rawUIAdminUser != "" || rawUIAdminPasswordHash != ""
	}

	if len(missing) > 0 {
		return nil, fmt.Errorf("config: missing required environment variables: %v", missing)
	}

	scheme, err := validateVyOSAPIURL(cfg.VyOSAPIURL)
	if err != nil {
		return nil, err
	}
	cfg.VyOSAPIURLUsesPlainHTTP = scheme == "http"

	cfg.TLSEnabled = true
	if v := getenv("TLS_ENABLED"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("config: TLS_ENABLED: %w", err)
		}
		cfg.TLSEnabled = b
	}
	cfg.TLSCertFilesIgnored = !cfg.TLSEnabled && (cfg.TLSCertFile != "" || cfg.TLSKeyFile != "")

	if v := getenv("VYOS_API_INSECURE_SKIP_VERIFY"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("config: VYOS_API_INSECURE_SKIP_VERIFY: %w", err)
		}
		cfg.VyOSAPIInsecureSkipVerify = b
	}

	if v := getenv("SESSION_SECRET"); v != "" {
		if len(v) < minSessionSecretLength {
			return nil, fmt.Errorf(
				"config: SESSION_SECRET must be at least %d bytes (got %d); "+
					"this signs every session and CSRF token, so a short value is "+
					"weaker than the randomly-generated default used when it's left unset",
				minSessionSecretLength, len(v),
			)
		}
		cfg.SessionSecret = []byte(v)
	} else {
		cfg.SessionSecretIsEphemeral = true
		secret, err := randomSecret(minSessionSecretLength)
		if err != nil {
			return nil, fmt.Errorf("config: generating random SESSION_SECRET: %w", err)
		}
		cfg.SessionSecret = secret
	}

	cfg.SafeApplyDefaultSeconds = 90
	if v := getenv("SAFE_APPLY_DEFAULT_SECONDS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("config: SAFE_APPLY_DEFAULT_SECONDS: %w", err)
		}
		cfg.SafeApplyDefaultSeconds = n
	}

	if v := getenv("CONFIG_WARNINGS_ENABLED"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("config: CONFIG_WARNINGS_ENABLED: %w", err)
		}
		cfg.ConfigWarningsEnabled = b
	}

	return cfg, nil
}

// minSessionSecretLength matches the entropy of the auto-generated
// default (32 random bytes), so an explicitly-configured SESSION_SECRET
// can never be weaker than doing nothing at all.
const minSessionSecretLength = 32

// validateVyOSAPIURL checks that raw is a structurally valid absolute
// URL with an http or https scheme and a non-empty host, returning the
// scheme on success. It can't catch a "valid but wrong" URL (pointing
// at the wrong host/port entirely) - that's inherently only detectable
// by trying to connect - but it does catch typos and malformed values
// immediately at startup, with a clear error naming the actual
// misconfigured setting, rather than only manifesting as an opaque
// timeout on the first live request.
func validateVyOSAPIURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("config: VYOS_API_URL is not a valid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("config: VYOS_API_URL must start with http:// or https://, got %q", raw)
	}
	if u.Host == "" {
		return "", fmt.Errorf("config: VYOS_API_URL is missing a host, got %q", raw)
	}
	return u.Scheme, nil
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func randomSecret(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	// Store as the raw bytes; base64 round-trip isn't necessary since
	// this never leaves the process, but keeping it text-safe makes it
	// easy to log a redacted preview/fingerprint if ever needed.
	encoded := base64.RawStdEncoding.EncodeToString(b)
	return []byte(encoded), nil
}
