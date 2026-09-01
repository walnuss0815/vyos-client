package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/config"
)

func TestResolveSessionSecret_ExplicitSecretAlwaysWins(t *testing.T) {
	cfg := &config.Config{
		SessionSecret:            []byte("an-explicitly-configured-secret"),
		SessionSecretIsEphemeral: false,
		DataDir:                  t.TempDir(),
	}
	secret, ephemeral, err := resolveSessionSecret(cfg)
	if err != nil {
		t.Fatalf("resolveSessionSecret: %v", err)
	}
	if string(secret) != string(cfg.SessionSecret) {
		t.Errorf("secret = %q, want the explicitly-configured value unchanged", secret)
	}
	if ephemeral {
		t.Error("ephemeral = true, want false")
	}
}

func TestResolveSessionSecret_NoDataDirStaysEphemeral(t *testing.T) {
	cfg := &config.Config{
		SessionSecret:            []byte("randomly-generated-for-this-run"),
		SessionSecretIsEphemeral: true,
		DataDir:                  "",
	}
	secret, ephemeral, err := resolveSessionSecret(cfg)
	if err != nil {
		t.Fatalf("resolveSessionSecret: %v", err)
	}
	if string(secret) != string(cfg.SessionSecret) {
		t.Errorf("secret = %q, want cfg's own ephemeral value unchanged", secret)
	}
	if !ephemeral {
		t.Error("ephemeral = false, want true")
	}
}

func TestResolveSessionSecret_GeneratesAndPersistsWhenNoFileExistsYet(t *testing.T) {
	dir := t.TempDir()
	cfg := &config.Config{
		SessionSecret:            []byte("would-be-discarded"),
		SessionSecretIsEphemeral: true,
		DataDir:                  dir,
	}
	secret, ephemeral, err := resolveSessionSecret(cfg)
	if err != nil {
		t.Fatalf("resolveSessionSecret: %v", err)
	}
	if ephemeral {
		t.Error("ephemeral = true, want false (persisted to DataDir)")
	}
	if len(secret) < config.MinSessionSecretLength {
		t.Errorf("secret length = %d, want at least %d", len(secret), config.MinSessionSecretLength)
	}

	persisted, err := os.ReadFile(filepath.Join(dir, sessionSecretFileName))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(persisted) != string(secret) {
		t.Errorf("persisted file content = %q, want it to match the returned secret %q", persisted, secret)
	}
}

func TestResolveSessionSecret_ReusesAnAlreadyPersistedSecret(t *testing.T) {
	dir := t.TempDir()
	cfg := &config.Config{SessionSecretIsEphemeral: true, DataDir: dir}

	first, _, err := resolveSessionSecret(cfg)
	if err != nil {
		t.Fatalf("resolveSessionSecret (first): %v", err)
	}
	second, ephemeral, err := resolveSessionSecret(cfg)
	if err != nil {
		t.Fatalf("resolveSessionSecret (second): %v", err)
	}
	if ephemeral {
		t.Error("ephemeral = true, want false")
	}
	if string(first) != string(second) {
		t.Errorf("secret changed across calls: first=%q second=%q, want the persisted value reused", first, second)
	}
}

func TestResolveSessionSecret_RejectsATooShortPersistedSecret(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, sessionSecretFileName), []byte("too-short"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	cfg := &config.Config{SessionSecretIsEphemeral: true, DataDir: dir}

	if _, _, err := resolveSessionSecret(cfg); err == nil {
		t.Error("expected an error for a too-short persisted session secret, got nil")
	}
}

func TestResolveSessionSecret_FailsClearlyIfDataDirIsUnwritable(t *testing.T) {
	// A DataDir that doesn't exist at all is the simplest way to force
	// the persist step to fail without relying on filesystem
	// permission semantics that can behave differently when tests run
	// as root (e.g. in some CI containers).
	cfg := &config.Config{SessionSecretIsEphemeral: true, DataDir: filepath.Join(t.TempDir(), "does-not-exist")}

	if _, _, err := resolveSessionSecret(cfg); err == nil {
		t.Error("expected an error when DataDir doesn't exist, got nil")
	}
}
