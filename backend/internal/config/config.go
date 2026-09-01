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
	"regexp"
	"strconv"

	"github.com/robfig/cron/v3"
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
	// HTTPS (the default, true) or plain HTTP. Only turn this off when
	// a trusted reverse proxy terminates TLS in front of this process,
	// or on a fully isolated/trusted network - see docs/security.md's
	// TLS section.
	TLSEnabled bool
	// TLSCertFilesIgnored reports whether TLS_CERT_FILE/TLS_KEY_FILE
	// were set despite TLSEnabled == false, in which case they're
	// silently unused - same "you configured X but it's ignored"
	// pattern as UIAdminVarsIgnored below, so a startup warning can
	// flag the likely-contradictory configuration instead of an
	// operator wondering why their mounted certificate has no effect.
	TLSCertFilesIgnored bool
	// CookiesSecure controls the Secure flag on issued session/CSRF
	// cookies. Defaults to TLSEnabled - browsers refuse to send a
	// Secure cookie back over plain HTTP, so the two move together by
	// default, or login would appear to succeed while the session
	// cookie never actually persists. COOKIE_SECURE overrides this
	// independently of TLS_ENABLED, for the one case where they
	// legitimately diverge: a trusted reverse proxy terminates real
	// TLS in front of this process (TLS_ENABLED=false, since this
	// process itself only ever sees plain HTTP), but the browser's own
	// connection - to the proxy - genuinely is HTTPS, so the cookie
	// both can and should still be marked Secure. Without this
	// override, that topology silently ends up with non-Secure
	// cookies on what the browser considers an HTTPS origin - see
	// docs/security.md's TLS section.
	CookiesSecure bool
	// CookieSecureUnusualCombination reports whether COOKIE_SECURE was
	// explicitly set to false while TLS_ENABLED is true - a
	// combination that's almost certainly a mistake (sending
	// non-Secure cookies over a connection this process itself is
	// actually serving as real HTTPS), surfaced so a startup warning
	// can flag it rather than an operator silently weakening their own
	// deployment.
	CookieSecureUnusualCombination bool

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

	// SelfUpgradeEnabled turns on the System > Upgrades page (see
	// docs/architecture.md's "Self-upgrade" section) - disabled by
	// default. Unlike every other feature in this app, enabling this
	// makes the backend call an external service (the GitHub Releases
	// API, see internal/selfupgrade) rather than only ever talking to
	// VyOS's own API, so it's deliberately opt-in rather than
	// always-on.
	SelfUpgradeEnabled bool
	// SelfUpgradeContainerName is the name this app was configured
	// under via `set container name <NAME> image ...` on VyOS - the
	// backend has no other way to know this about itself. Required
	// (and only read) when SelfUpgradeEnabled is true.
	SelfUpgradeContainerName string
	// SelfUpgradeGitHubRepo is the "owner/repo" self-upgrade checks
	// releases for and pulls images from (ghcr.io/<repo>, since
	// .github/workflows/release.yml always publishes there). Defaults
	// to this project's own repo; only meaningfully different for a
	// fork publishing its own releases/images under a different repo.
	SelfUpgradeGitHubRepo string
	// SelfUpgradeVarsIgnored reports whether
	// SELF_UPGRADE_CONTAINER_NAME or SELF_UPGRADE_GITHUB_REPO were set
	// despite SelfUpgradeEnabled == false, in which case they're
	// silently unused - same "you configured X but it's ignored"
	// pattern as UIAdminVarsIgnored/TLSCertFilesIgnored above.
	SelfUpgradeVarsIgnored bool

	// DataDir, if set, is a directory this backend may persist local
	// state to across restarts - currently the session-secret file
	// (see cmd/vyos-client/sessionsecret.go) and the notification feed
	// (see internal/notifications.Store), both otherwise purely
	// in-memory/ephemeral. Unset by default, matching this project's
	// "no separate server-side state management" principle - both
	// features degrade gracefully without it (an ephemeral session
	// secret each restart, an empty notification feed each restart),
	// so this is opt-in for the operator who wants either to survive a
	// restart without having to manage SESSION_SECRET by hand. Must
	// already exist and be a directory; the backend never creates it
	// (a missing DATA_DIR is far more likely a misconfigured volume
	// mount than an intentional "please create this for me").
	DataDir string

	// ContainerUpdateChecksEnabled turns on the Containers page's
	// "Check for update" button (see docs/architecture.md's
	// "Container image update checks" section) - disabled by default.
	// Like SelfUpgradeEnabled above, this makes the backend call an
	// external service (whichever registry a container's own image
	// reference points at - not just GitHub, unlike self-upgrade) on
	// an authenticated operator's explicit request, so it's opt-in
	// rather than always-on. Unlike self-upgrade, there's no
	// associated container-name/repo configuration to validate: the
	// registry and repository are derived entirely from whatever
	// image string the operator is already looking at on that page.
	ContainerUpdateChecksEnabled bool

	// FileBrowserEnabled turns on the Files page (`GET
	// /api/files`/`GET /api/files/roots`) - disabled by default.
	// Unlike SelfUpgradeEnabled/ContainerUpdateChecksEnabled, this
	// feature makes no outbound-to-the-internet call at all (it only
	// ever talks to VyOS's own API, same as almost everything else in
	// this app) - it's opt-in for a different reason: VyOS's own
	// `show file <path>` op-mode command imposes no path restriction
	// of its own (see backend/internal/api/file_handlers.go's
	// fileBrowserRoots doc comment), so even this app's own curated
	// allowlist (/config, /var/log) is still real filesystem read
	// access an operator may want to opt out of entirely rather than
	// rely on that allowlist alone.
	FileBrowserEnabled bool

	// ContainerUpdateBackgroundCheckEnabled turns on a scheduled sweep
	// (see internal/containerupdatecheck) that runs
	// ContainerUpdateChecksEnabled's same check automatically, for
	// every configured container, on ContainerUpdateCheckCron's
	// schedule - raising an in-app Notification for anything it
	// finds, rather than requiring an operator to click "Check for
	// update" themselves. Disabled by default, and requires
	// ContainerUpdateChecksEnabled to also be true (validated below):
	// this is the same underlying capability (contacting arbitrary
	// registries) as that feature, just automated - an operator who
	// hasn't opted into the manual version almost certainly doesn't
	// want it happening unattended either.
	ContainerUpdateBackgroundCheckEnabled bool
	// ContainerUpdateCheckCron is the schedule
	// ContainerUpdateBackgroundCheckEnabled's sweep runs on, standard
	// 5-field cron syntax (minute hour day-of-month month
	// day-of-week). Defaults to once daily at 03:00 - late enough to
	// be very unlikely to collide with an operator's own interactive
	// use, without being tied to any specific timezone consideration
	// this app doesn't otherwise have an opinion on (interpreted in
	// the container's own local time, i.e. whatever TZ the deployment
	// itself runs with).
	ContainerUpdateCheckCron string
	// ContainerUpdateBackgroundCheckVarsIgnored reports whether
	// CONTAINER_UPDATE_CHECK_CRON was set despite
	// ContainerUpdateBackgroundCheckEnabled == false, in which case
	// it's silently unused - same "you configured X but it's ignored"
	// pattern as UIAdminVarsIgnored/TLSCertFilesIgnored/
	// SelfUpgradeVarsIgnored above.
	ContainerUpdateBackgroundCheckVarsIgnored bool
}

// defaultSelfUpgradeGitHubRepo is this project's own GitHub repo -
// see SelfUpgradeGitHubRepo's doc comment for when a different value
// matters.
const defaultSelfUpgradeGitHubRepo = "walnuss0815/vyos-client"

// defaultContainerUpdateCheckCron - see
// Config.ContainerUpdateCheckCron's own doc comment for why this
// particular schedule.
const defaultContainerUpdateCheckCron = "0 3 * * *"

// cronParser validates CONTAINER_UPDATE_CHECK_CRON at startup, using
// the exact same standard 5-field parser
// cmd/vyos-client/serve.go's real robfig/cron scheduler uses (see
// internal/containerupdatecheck) - catching a typo here, at startup,
// is far clearer than only discovering it the first time the
// scheduler tries (and silently fails) to register the job.
var cronParser = cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)

// selfUpgradeGitHubRepoPattern bounds SELF_UPGRADE_GITHUB_REPO to a
// structurally valid "owner/repo" shape. This value is interpolated
// directly into the GitHub API URL path and into the GHCR image
// reference the frontend tells VyOS to pull (see
// internal/selfupgrade.Client and UpgradesPage.tsx) - catching a typo
// (stray spaces, a missing/extra "/", "..") here at startup is far
// clearer than the opaque 404/malformed-request failure it would
// otherwise only surface as on the first self-upgrade check.
var selfUpgradeGitHubRepoPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`)

// selfUpgradeContainerNamePattern bounds SELF_UPGRADE_CONTAINER_NAME
// to VyOS's own tag-node identifier charset (alphanumeric, "_"/"-",
// must start with a letter or digit) - the same reasoning as above:
// catch a typo at startup rather than only discovering it when the
// `set container name <NAME> image ...` op the Upgrades page queues
// silently targets a node that doesn't exist.
var selfUpgradeContainerNamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]*$`)

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

	cfg.CookiesSecure = cfg.TLSEnabled
	if v := getenv("COOKIE_SECURE"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("config: COOKIE_SECURE: %w", err)
		}
		cfg.CookiesSecure = b
		cfg.CookieSecureUnusualCombination = !b && cfg.TLSEnabled
	}

	if v := getenv("VYOS_API_INSECURE_SKIP_VERIFY"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("config: VYOS_API_INSECURE_SKIP_VERIFY: %w", err)
		}
		cfg.VyOSAPIInsecureSkipVerify = b
	}

	if v := getenv("SESSION_SECRET"); v != "" {
		if len(v) < MinSessionSecretLength {
			return nil, fmt.Errorf(
				"config: SESSION_SECRET must be at least %d bytes (got %d); "+
					"this signs every session and CSRF token, so a short value is "+
					"weaker than the randomly-generated default used when it's left unset",
				MinSessionSecretLength, len(v),
			)
		}
		cfg.SessionSecret = []byte(v)
	} else {
		cfg.SessionSecretIsEphemeral = true
		secret, err := randomSecret(MinSessionSecretLength)
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

	if v := getenv("SELF_UPGRADE_ENABLED"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("config: SELF_UPGRADE_ENABLED: %w", err)
		}
		cfg.SelfUpgradeEnabled = b
	}
	rawSelfUpgradeContainerName := getenv("SELF_UPGRADE_CONTAINER_NAME")
	rawSelfUpgradeGitHubRepo := getenv("SELF_UPGRADE_GITHUB_REPO")
	// Applied unconditionally (not just when SelfUpgradeEnabled), so
	// SelfUpgradeGitHubRepo is never left as "" for a future reader to
	// trip over - nothing reads it while the feature is disabled, but
	// there's no reason for the zero value to be a lie about what the
	// effective default actually is.
	cfg.SelfUpgradeGitHubRepo = orDefault(rawSelfUpgradeGitHubRepo, defaultSelfUpgradeGitHubRepo)
	if cfg.SelfUpgradeEnabled {
		cfg.SelfUpgradeContainerName = rawSelfUpgradeContainerName
		if cfg.SelfUpgradeContainerName == "" {
			return nil, fmt.Errorf(
				"config: SELF_UPGRADE_CONTAINER_NAME is required when SELF_UPGRADE_ENABLED=true " +
					"(this must match the name in VyOS's own `set container name <NAME> image ...`)",
			)
		}
		if !selfUpgradeContainerNamePattern.MatchString(cfg.SelfUpgradeContainerName) {
			return nil, fmt.Errorf(
				"config: SELF_UPGRADE_CONTAINER_NAME %q is not a valid VyOS container name "+
					"(letters, digits, \"_\", \"-\" only, must start with a letter or digit)",
				cfg.SelfUpgradeContainerName,
			)
		}
		if !selfUpgradeGitHubRepoPattern.MatchString(cfg.SelfUpgradeGitHubRepo) {
			return nil, fmt.Errorf(
				"config: SELF_UPGRADE_GITHUB_REPO %q is not a valid \"owner/repo\" (got via env or the default)",
				cfg.SelfUpgradeGitHubRepo,
			)
		}
	} else {
		cfg.SelfUpgradeVarsIgnored = rawSelfUpgradeContainerName != "" || rawSelfUpgradeGitHubRepo != ""
	}

	if v := getenv("CONTAINER_UPDATE_CHECKS_ENABLED"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("config: CONTAINER_UPDATE_CHECKS_ENABLED: %w", err)
		}
		cfg.ContainerUpdateChecksEnabled = b
	}

	if v := getenv("FILE_BROWSER_ENABLED"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("config: FILE_BROWSER_ENABLED: %w", err)
		}
		cfg.FileBrowserEnabled = b
	}

	if v := getenv("CONTAINER_UPDATE_BACKGROUND_CHECK_ENABLED"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("config: CONTAINER_UPDATE_BACKGROUND_CHECK_ENABLED: %w", err)
		}
		cfg.ContainerUpdateBackgroundCheckEnabled = b
	}
	rawContainerUpdateCheckCron := getenv("CONTAINER_UPDATE_CHECK_CRON")
	// Applied unconditionally (not just when
	// ContainerUpdateBackgroundCheckEnabled), same "never leave the
	// zero value lying about the effective default" reasoning as
	// SelfUpgradeGitHubRepo above.
	cfg.ContainerUpdateCheckCron = orDefault(rawContainerUpdateCheckCron, defaultContainerUpdateCheckCron)
	if cfg.ContainerUpdateBackgroundCheckEnabled {
		if !cfg.ContainerUpdateChecksEnabled {
			return nil, fmt.Errorf(
				"config: CONTAINER_UPDATE_BACKGROUND_CHECK_ENABLED=true requires " +
					"CONTAINER_UPDATE_CHECKS_ENABLED=true too - this automates that same " +
					"registry-contacting check, so it shouldn't run unattended unless the " +
					"manual version has also been explicitly opted into",
			)
		}
		if _, err := cronParser.Parse(cfg.ContainerUpdateCheckCron); err != nil {
			return nil, fmt.Errorf("config: CONTAINER_UPDATE_CHECK_CRON %q is not a valid cron expression: %w",
				cfg.ContainerUpdateCheckCron, err)
		}
	} else {
		cfg.ContainerUpdateBackgroundCheckVarsIgnored = rawContainerUpdateCheckCron != ""
	}

	if v := getenv("DATA_DIR"); v != "" {
		info, err := os.Stat(v)
		if err != nil {
			return nil, fmt.Errorf("config: DATA_DIR %q: %w", v, err)
		}
		if !info.IsDir() {
			return nil, fmt.Errorf("config: DATA_DIR %q is not a directory", v)
		}
		cfg.DataDir = v
	}

	return cfg, nil
}

// MinSessionSecretLength matches the entropy of the auto-generated
// default (32 random bytes), so an explicitly-configured SESSION_SECRET
// can never be weaker than doing nothing at all. Exported so
// cmd/vyos-client's session-secret persistence (see sessionsecret.go)
// can hold a persisted secret to the same minimum bar.
const MinSessionSecretLength = 32

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
