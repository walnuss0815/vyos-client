package main

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/walnuss0815/vyos-client/backend/internal/config"
)

func captureLogger() (*slog.Logger, *bytes.Buffer) {
	var buf bytes.Buffer
	return slog.New(slog.NewTextHandler(&buf, nil)), &buf
}

func TestBuildTLSConfig_WarnsWhenOnlyOneOfCertAndKeyIsSet(t *testing.T) {
	tests := []struct {
		name     string
		cert     string
		key      string
		wantWarn bool
	}{
		{"cert only", "/nonexistent/cert.pem", "", true},
		{"key only", "", "/nonexistent/key.pem", true},
		{"neither", "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logger, buf := captureLogger()
			cfg := &config.Config{TLSCertFile: tt.cert, TLSKeyFile: tt.key}
			if _, err := buildTLSConfig(cfg, logger); err != nil {
				t.Fatalf("buildTLSConfig: %v", err)
			}
			got := strings.Contains(buf.String(), "only one of TLS_CERT_FILE/TLS_KEY_FILE")
			if got != tt.wantWarn {
				t.Errorf("warned = %v, want %v; log: %s", got, tt.wantWarn, buf.String())
			}
		})
	}
}

func TestWarnInvalidAdminHash(t *testing.T) {
	valid, err := bcrypt.GenerateFromPassword([]byte("pw"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("GenerateFromPassword: %v", err)
	}
	tests := []struct {
		name     string
		mode     string
		hash     string
		wantWarn bool
	}{
		{"static with a mangled hash", config.AuthModeStatic, "$2a$10$fakehash", true},
		{"static with an empty hash", config.AuthModeStatic, "", true},
		{"static with a valid hash", config.AuthModeStatic, string(valid), false},
		{"vyos-users ignores the hash", config.AuthModeVyOSUsers, "garbage", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logger, buf := captureLogger()
			warnInvalidAdminHash(&config.Config{AuthMode: tt.mode, UIAdminPasswordHash: tt.hash}, logger)
			out := buf.String()
			if got := strings.Contains(out, "UI_ADMIN_PASSWORD_HASH"); got != tt.wantWarn {
				t.Errorf("warned = %v, want %v; log: %s", got, tt.wantWarn, out)
			}
			if tt.hash != "" && strings.Contains(out, tt.hash) {
				t.Errorf("the hash was logged: %s", out)
			}
		})
	}
}
