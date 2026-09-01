package config_test

import (
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/config"
)

func fakeEnv(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestLoad_RequiresMandatoryVars(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{}))
	if err == nil {
		t.Fatal("expected error for missing required env vars")
	}
}

func TestLoad_DefaultsApplied(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ListenAddr != ":8443" {
		t.Errorf("ListenAddr = %q, want :8443", cfg.ListenAddr)
	}
	if cfg.VyOSAPIURL != "https://127.0.0.1" {
		t.Errorf("VyOSAPIURL = %q, want https://127.0.0.1", cfg.VyOSAPIURL)
	}
	if cfg.SafeApplyDefaultSeconds != 90 {
		t.Errorf("SafeApplyDefaultSeconds = %d, want 90", cfg.SafeApplyDefaultSeconds)
	}
	if len(cfg.SessionSecret) == 0 {
		t.Error("expected a random SessionSecret to be generated")
	}
}

func TestLoad_OverridesRespected(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":                  "test-key",
		"UI_ADMIN_USER":                 "admin",
		"UI_ADMIN_PASSWORD_HASH":        "$2a$10$fakehash",
		"LISTEN_ADDR":                   ":9999",
		"VYOS_API_URL":                  "https://192.0.2.1",
		"VYOS_API_INSECURE_SKIP_VERIFY": "true",
		"SESSION_SECRET":                "my-fixed-secret-that-is-at-least-32-bytes-long",
		"SAFE_APPLY_DEFAULT_SECONDS":    "30",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ListenAddr != ":9999" {
		t.Errorf("ListenAddr = %q, want :9999", cfg.ListenAddr)
	}
	if cfg.VyOSAPIURL != "https://192.0.2.1" {
		t.Errorf("VyOSAPIURL = %q, want https://192.0.2.1", cfg.VyOSAPIURL)
	}
	if !cfg.VyOSAPIInsecureSkipVerify {
		t.Error("expected VyOSAPIInsecureSkipVerify to be true")
	}
	if string(cfg.SessionSecret) != "my-fixed-secret-that-is-at-least-32-bytes-long" {
		t.Errorf("SessionSecret = %q, want my-fixed-secret-that-is-at-least-32-bytes-long", cfg.SessionSecret)
	}
	if cfg.SafeApplyDefaultSeconds != 30 {
		t.Errorf("SafeApplyDefaultSeconds = %d, want 30", cfg.SafeApplyDefaultSeconds)
	}
}

// TestLoad_RejectsMalformedVyOSAPIURL is a regression test motivated by
// a real production incident: an operator's misconfigured VYOS_API_URL
// (wrong scheme/port) produced no startup error at all, only an opaque
// timeout-then-502 on the first live request, which was hard to
// diagnose. Load can't catch a "valid but wrong" URL (that's inherently
// only detectable by trying to connect), but it can and should catch
// structurally invalid values immediately at startup, with a clear
// error pointing at the actual misconfigured setting.
func TestLoad_RejectsMalformedVyOSAPIURL(t *testing.T) {
	cases := []string{
		"://not-a-url",
		"ftp://192.0.2.1",
		"192.0.2.1", // no scheme at all - a very easy typo to make
		"https://",  // scheme but no host
	}
	for _, raw := range cases {
		t.Run(raw, func(t *testing.T) {
			_, err := config.Load(fakeEnv(map[string]string{
				"VYOS_API_KEY":           "test-key",
				"UI_ADMIN_USER":          "admin",
				"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
				"VYOS_API_URL":           raw,
			}))
			if err == nil {
				t.Errorf("Load with VYOS_API_URL=%q: expected an error, got nil", raw)
			}
		})
	}
}

func TestLoad_VyOSAPIURLUsesPlainHTTPIsDetected(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"VYOS_API_URL":           "http://mock-vyos:8443",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.VyOSAPIURLUsesPlainHTTP {
		t.Error("expected VyOSAPIURLUsesPlainHTTP to be true for an http:// URL")
	}

	cfg, err = config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"VYOS_API_URL":           "https://192.0.2.1",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.VyOSAPIURLUsesPlainHTTP {
		t.Error("expected VyOSAPIURLUsesPlainHTTP to be false for an https:// URL")
	}
}

func TestLoad_InvalidBooleanRejected(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":                  "test-key",
		"UI_ADMIN_USER":                 "admin",
		"UI_ADMIN_PASSWORD_HASH":        "$2a$10$fakehash",
		"VYOS_API_INSECURE_SKIP_VERIFY": "not-a-bool",
	}))
	if err == nil {
		t.Fatal("expected error for invalid boolean")
	}
}

// TestLoad_RejectsShortSessionSecret guards against a weaker-than-default
// security posture: HMAC-SHA256's forgery-resistance (used to sign every
// session and CSRF token) is bounded by key entropy, and the
// auto-generated default when SESSION_SECRET is left unset is 32 random
// bytes. Without this check, an operator explicitly configuring a short
// or guessable SESSION_SECRET (for persistence across restarts) silently
// ends up in a WEAKER position than doing nothing at all - the opposite
// of what "fail safe by default, and require deliberate effort to weaken
// it" should look like for a security-relevant setting.
func TestLoad_RejectsShortSessionSecret(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"SESSION_SECRET":         "too-short",
	}))
	if err == nil {
		t.Fatal("expected error for a SESSION_SECRET shorter than 32 bytes")
	}
}

func TestLoad_AuthModeDefaultsToVyOSUsers(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY": "test-key",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.AuthMode != config.AuthModeVyOSUsers {
		t.Errorf("AuthMode = %q, want %q (the default)", cfg.AuthMode, config.AuthModeVyOSUsers)
	}
	// UI_ADMIN_USER/UI_ADMIN_PASSWORD_HASH must NOT be required when
	// AUTH_MODE defaults to vyos-users - this is the whole point of
	// the new default (fresh installs need only VYOS_API_KEY).
	if cfg.UIAdminUser != "" || cfg.UIAdminPasswordHash != "" {
		t.Errorf("expected empty UIAdminUser/UIAdminPasswordHash in vyos-users mode, got %q/%q", cfg.UIAdminUser, cfg.UIAdminPasswordHash)
	}
}

func TestLoad_AuthModeStaticRequiresAdminVars(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY": "test-key",
		"AUTH_MODE":    config.AuthModeStatic,
	}))
	if err == nil {
		t.Fatal("expected error: AUTH_MODE=static requires UI_ADMIN_USER/UI_ADMIN_PASSWORD_HASH")
	}

	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"AUTH_MODE":              config.AuthModeStatic,
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.UIAdminUser != "admin" || cfg.UIAdminPasswordHash != "$2a$10$fakehash" {
		t.Error("expected UIAdminUser/UIAdminPasswordHash to be populated in static mode")
	}
	if cfg.UIAdminVarsIgnored {
		t.Error("expected UIAdminVarsIgnored to be false when they're actually used (static mode)")
	}
}

func TestLoad_RejectsInvalidAuthMode(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY": "test-key",
		"AUTH_MODE":    "not-a-real-mode",
	}))
	if err == nil {
		t.Fatal("expected error for an invalid AUTH_MODE value")
	}
}

// TestLoad_UIAdminVarsIgnoredWhenAuthModeIsVyOSUsers guards the
// "log a warning, don't fail startup" behavior for an operator who
// upgrades in place with a stale UI_ADMIN_USER/UI_ADMIN_PASSWORD_HASH
// still set in their environment but AUTH_MODE left at its new
// vyos-users default: Load should succeed (not require the vars to be
// removed), but flag that they're present-but-unused so serve.go can
// warn about it.
func TestLoad_UIAdminVarsIgnoredWhenAuthModeIsVyOSUsers(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.UIAdminVarsIgnored {
		t.Error("expected UIAdminVarsIgnored to be true when UI_ADMIN_* is set but AUTH_MODE is vyos-users")
	}

	cfgClean, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY": "test-key",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfgClean.UIAdminVarsIgnored {
		t.Error("expected UIAdminVarsIgnored to be false when UI_ADMIN_* was never set")
	}
}

func TestLoad_TLSEnabledDefaultsToTrue(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.TLSEnabled {
		t.Error("expected TLSEnabled to default to true when TLS_ENABLED is unset")
	}
}

func TestLoad_TLSEnabledCanBeExplicitlyDisabled(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"TLS_ENABLED":            "false",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.TLSEnabled {
		t.Error("expected TLSEnabled to be false when TLS_ENABLED=false")
	}
}

func TestLoad_TLSEnabledRejectsInvalidBoolean(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"TLS_ENABLED":            "not-a-bool",
	}))
	if err == nil {
		t.Fatal("expected error for an invalid TLS_ENABLED value")
	}
}

// TestLoad_TLSCertFilesIgnoredWhenTLSDisabled guards a startup-warning
// signal for a likely-contradictory config: an operator mounted a real
// certificate but also disabled TLS, so the certificate silently never
// gets used. This should be flagged (see serve.go), not fail startup -
// the same "warn, don't reject" treatment as UIAdminVarsIgnored.
func TestLoad_TLSCertFilesIgnoredWhenTLSDisabled(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"TLS_ENABLED":            "false",
		"TLS_CERT_FILE":          "/config/cert.pem",
		"TLS_KEY_FILE":           "/config/key.pem",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.TLSCertFilesIgnored {
		t.Error("expected TLSCertFilesIgnored to be true when TLS_CERT_FILE/TLS_KEY_FILE are set but TLS_ENABLED=false")
	}

	cfgEnabled, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"TLS_CERT_FILE":          "/config/cert.pem",
		"TLS_KEY_FILE":           "/config/key.pem",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfgEnabled.TLSCertFilesIgnored {
		t.Error("expected TLSCertFilesIgnored to be false when TLS is enabled (the cert files are actually used)")
	}
}

func TestLoad_CookiesSecureDefaultsToTLSEnabled(t *testing.T) {
	cases := []struct {
		tlsEnabled string
		want       bool
	}{
		{"", true}, // TLS_ENABLED itself defaults to true
		{"true", true},
		{"false", false},
	}
	for _, tc := range cases {
		t.Run("TLS_ENABLED="+tc.tlsEnabled, func(t *testing.T) {
			env := map[string]string{
				"VYOS_API_KEY":           "test-key",
				"UI_ADMIN_USER":          "admin",
				"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
			}
			if tc.tlsEnabled != "" {
				env["TLS_ENABLED"] = tc.tlsEnabled
			}
			cfg, err := config.Load(fakeEnv(env))
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			if cfg.CookiesSecure != tc.want {
				t.Errorf("CookiesSecure = %v, want %v (matching TLSEnabled)", cfg.CookiesSecure, tc.want)
			}
			if cfg.CookieSecureUnusualCombination {
				t.Error("expected CookieSecureUnusualCombination to be false when COOKIE_SECURE was never set")
			}
		})
	}
}

// TestLoad_CookieSecureOverride guards the one case CookiesSecure's
// TLSEnabled default can't handle on its own: a trusted reverse proxy
// terminates real TLS in front of this process (TLS_ENABLED=false),
// but the browser's own connection to that proxy genuinely is HTTPS,
// so COOKIE_SECURE=true should still be honored despite TLS_ENABLED
// being false.
func TestLoad_CookieSecureOverride(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"TLS_ENABLED":            "false",
		"COOKIE_SECURE":          "true",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.CookiesSecure {
		t.Error("expected CookiesSecure to be true when COOKIE_SECURE=true, even though TLS_ENABLED=false")
	}
	if cfg.CookieSecureUnusualCombination {
		t.Error("expected CookieSecureUnusualCombination to be false for this (intended) combination")
	}
}

// TestLoad_CookieSecureUnusualCombination guards the startup-warning
// signal for the combination that's almost certainly a mistake:
// explicitly disabling the Secure cookie flag while this process
// itself is serving real HTTPS.
func TestLoad_CookieSecureUnusualCombination(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"COOKIE_SECURE":          "false",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.CookiesSecure {
		t.Error("expected CookiesSecure to be false when COOKIE_SECURE=false")
	}
	if !cfg.CookieSecureUnusualCombination {
		t.Error("expected CookieSecureUnusualCombination to be true when COOKIE_SECURE=false while TLS_ENABLED defaults to true")
	}
}

func TestLoad_CookieSecureRejectsInvalidBoolean(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"COOKIE_SECURE":          "not-a-bool",
	}))
	if err == nil {
		t.Fatal("expected error for an invalid COOKIE_SECURE value")
	}
}

func TestLoad_ConfigWarningsEnabledDefaultsToFalse(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ConfigWarningsEnabled {
		t.Error("expected ConfigWarningsEnabled to default to false when CONFIG_WARNINGS_ENABLED is unset")
	}
}

func TestLoad_ConfigWarningsEnabledCanBeExplicitlyEnabled(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":            "test-key",
		"UI_ADMIN_USER":           "admin",
		"UI_ADMIN_PASSWORD_HASH":  "$2a$10$fakehash",
		"CONFIG_WARNINGS_ENABLED": "true",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.ConfigWarningsEnabled {
		t.Error("expected ConfigWarningsEnabled to be true when CONFIG_WARNINGS_ENABLED=true")
	}
}

func TestLoad_ConfigWarningsEnabledRejectsInvalidBoolean(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":            "test-key",
		"UI_ADMIN_USER":           "admin",
		"UI_ADMIN_PASSWORD_HASH":  "$2a$10$fakehash",
		"CONFIG_WARNINGS_ENABLED": "not-a-bool",
	}))
	if err == nil {
		t.Fatal("expected error for an invalid CONFIG_WARNINGS_ENABLED value")
	}
}

func TestLoad_SelfUpgradeDisabledByDefault(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.SelfUpgradeEnabled {
		t.Error("expected SelfUpgradeEnabled to default to false when SELF_UPGRADE_ENABLED is unset")
	}
	if cfg.SelfUpgradeContainerName != "" {
		t.Errorf("expected empty SelfUpgradeContainerName when disabled, got %q", cfg.SelfUpgradeContainerName)
	}
	// SelfUpgradeGitHubRepo is still populated with its default even
	// when disabled - nothing reads it in that case, but the zero
	// value shouldn't misrepresent what the effective default is.
	if cfg.SelfUpgradeGitHubRepo != "walnuss0815/vyos-client" {
		t.Errorf("SelfUpgradeGitHubRepo = %q, want the default even when disabled", cfg.SelfUpgradeGitHubRepo)
	}
}

func TestLoad_SelfUpgradeEnabledRequiresContainerName(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"SELF_UPGRADE_ENABLED":   "true",
	}))
	if err == nil {
		t.Fatal("expected error: SELF_UPGRADE_ENABLED=true requires SELF_UPGRADE_CONTAINER_NAME")
	}
}

func TestLoad_SelfUpgradeEnabledWithContainerName(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":                "test-key",
		"UI_ADMIN_USER":               "admin",
		"UI_ADMIN_PASSWORD_HASH":      "$2a$10$fakehash",
		"SELF_UPGRADE_ENABLED":        "true",
		"SELF_UPGRADE_CONTAINER_NAME": "vyos-client",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.SelfUpgradeContainerName != "vyos-client" {
		t.Errorf("SelfUpgradeContainerName = %q, want vyos-client", cfg.SelfUpgradeContainerName)
	}
	if cfg.SelfUpgradeGitHubRepo != "walnuss0815/vyos-client" {
		t.Errorf("SelfUpgradeGitHubRepo = %q, want the default", cfg.SelfUpgradeGitHubRepo)
	}
	if cfg.SelfUpgradeVarsIgnored {
		t.Error("expected SelfUpgradeVarsIgnored to be false when the feature is actually enabled")
	}
}

func TestLoad_SelfUpgradeGitHubRepoOverride(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":                "test-key",
		"UI_ADMIN_USER":               "admin",
		"UI_ADMIN_PASSWORD_HASH":      "$2a$10$fakehash",
		"SELF_UPGRADE_ENABLED":        "true",
		"SELF_UPGRADE_CONTAINER_NAME": "vyos-client",
		"SELF_UPGRADE_GITHUB_REPO":    "example/fork",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.SelfUpgradeGitHubRepo != "example/fork" {
		t.Errorf("SelfUpgradeGitHubRepo = %q, want example/fork", cfg.SelfUpgradeGitHubRepo)
	}
}

func TestLoad_SelfUpgradeRejectsInvalidGitHubRepo(t *testing.T) {
	cases := []string{
		"not-a-repo",         // missing "/"
		"owner/repo/extra",   // too many segments
		"owner/",             // empty repo segment
		"/repo",              // empty owner segment
		"owner repo/extra",   // whitespace
		"owner/repo; rm -rf", // shell metacharacters
	}
	for _, raw := range cases {
		t.Run(raw, func(t *testing.T) {
			_, err := config.Load(fakeEnv(map[string]string{
				"VYOS_API_KEY":                "test-key",
				"UI_ADMIN_USER":               "admin",
				"UI_ADMIN_PASSWORD_HASH":      "$2a$10$fakehash",
				"SELF_UPGRADE_ENABLED":        "true",
				"SELF_UPGRADE_CONTAINER_NAME": "vyos-client",
				"SELF_UPGRADE_GITHUB_REPO":    raw,
			}))
			if err == nil {
				t.Errorf("Load with SELF_UPGRADE_GITHUB_REPO=%q: expected an error, got nil", raw)
			}
		})
	}
}

func TestLoad_SelfUpgradeRejectsInvalidContainerName(t *testing.T) {
	cases := []string{
		"-leading-hyphen",
		"has a space",
		"has/a/slash",
		"has;a;semicolon",
		"",
	}
	for _, raw := range cases {
		t.Run(raw, func(t *testing.T) {
			env := map[string]string{
				"VYOS_API_KEY":           "test-key",
				"UI_ADMIN_USER":          "admin",
				"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
				"SELF_UPGRADE_ENABLED":   "true",
			}
			if raw != "" {
				env["SELF_UPGRADE_CONTAINER_NAME"] = raw
			}
			_, err := config.Load(fakeEnv(env))
			if err == nil {
				t.Errorf("Load with SELF_UPGRADE_CONTAINER_NAME=%q: expected an error, got nil", raw)
			}
		})
	}
}

func TestLoad_SelfUpgradeAcceptsDefaultGitHubRepo(t *testing.T) {
	// Guards against the default value itself (defaultSelfUpgradeGitHubRepo)
	// ever regressing to something the new validation pattern rejects.
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":                "test-key",
		"UI_ADMIN_USER":               "admin",
		"UI_ADMIN_PASSWORD_HASH":      "$2a$10$fakehash",
		"SELF_UPGRADE_ENABLED":        "true",
		"SELF_UPGRADE_CONTAINER_NAME": "vyos-client",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.SelfUpgradeGitHubRepo == "" {
		t.Error("expected a non-empty default SelfUpgradeGitHubRepo")
	}
}

func TestLoad_SelfUpgradeEnabledRejectsInvalidBoolean(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"SELF_UPGRADE_ENABLED":   "not-a-bool",
	}))
	if err == nil {
		t.Fatal("expected error for an invalid SELF_UPGRADE_ENABLED value")
	}
}

// TestLoad_SelfUpgradeVarsIgnoredWhenDisabled guards the same
// "warn, don't fail startup" behavior as
// TestLoad_UIAdminVarsIgnoredWhenAuthModeIsVyOSUsers: an operator who
// sets SELF_UPGRADE_CONTAINER_NAME/SELF_UPGRADE_GITHUB_REPO but leaves
// (or sets) SELF_UPGRADE_ENABLED=false should not have startup fail -
// just flagged as silently unused, for serve.go to warn about.
func TestLoad_SelfUpgradeVarsIgnoredWhenDisabled(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":                "test-key",
		"UI_ADMIN_USER":               "admin",
		"UI_ADMIN_PASSWORD_HASH":      "$2a$10$fakehash",
		"SELF_UPGRADE_CONTAINER_NAME": "vyos-client",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.SelfUpgradeVarsIgnored {
		t.Error("expected SelfUpgradeVarsIgnored to be true when SELF_UPGRADE_CONTAINER_NAME is set but the feature is disabled")
	}

	cfgClean, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfgClean.SelfUpgradeVarsIgnored {
		t.Error("expected SelfUpgradeVarsIgnored to be false when neither var was ever set")
	}
}

func TestLoad_ContainerUpdateChecksDisabledByDefault(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ContainerUpdateChecksEnabled {
		t.Error("expected ContainerUpdateChecksEnabled to default to false when CONTAINER_UPDATE_CHECKS_ENABLED is unset")
	}
}

func TestLoad_ContainerUpdateChecksEnabled(t *testing.T) {
	cfg, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":                    "test-key",
		"UI_ADMIN_USER":                   "admin",
		"UI_ADMIN_PASSWORD_HASH":          "$2a$10$fakehash",
		"CONTAINER_UPDATE_CHECKS_ENABLED": "true",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.ContainerUpdateChecksEnabled {
		t.Error("expected ContainerUpdateChecksEnabled to be true when CONTAINER_UPDATE_CHECKS_ENABLED=true")
	}
}

func TestLoad_ContainerUpdateChecksEnabledRejectsInvalidBoolean(t *testing.T) {
	_, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":                    "test-key",
		"UI_ADMIN_USER":                   "admin",
		"UI_ADMIN_PASSWORD_HASH":          "$2a$10$fakehash",
		"CONTAINER_UPDATE_CHECKS_ENABLED": "not-a-bool",
	}))
	if err == nil {
		t.Fatal("expected error for an invalid CONTAINER_UPDATE_CHECKS_ENABLED value")
	}
}

func TestSessionSecretIsEphemeral(t *testing.T) {
	withoutSecret, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !withoutSecret.SessionSecretIsEphemeral {
		t.Error("expected ephemeral secret when SESSION_SECRET is unset")
	}

	withSecret, err := config.Load(fakeEnv(map[string]string{
		"VYOS_API_KEY":           "test-key",
		"UI_ADMIN_USER":          "admin",
		"UI_ADMIN_PASSWORD_HASH": "$2a$10$fakehash",
		"SESSION_SECRET":         "a-sufficiently-long-explicit-secret-value",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if withSecret.SessionSecretIsEphemeral {
		t.Error("expected non-ephemeral when SESSION_SECRET is set")
	}
}
