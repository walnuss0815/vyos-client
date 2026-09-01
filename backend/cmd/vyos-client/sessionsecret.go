package main

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/walnuss0815/vyos-client/backend/internal/atomicfile"
	"github.com/walnuss0815/vyos-client/backend/internal/config"
)

// sessionSecretFileName is the persisted session secret's file name
// within DATA_DIR - see resolveSessionSecret.
const sessionSecretFileName = "session-secret"

// resolveSessionSecret implements the three-tier SESSION_SECRET
// resolution this app offers:
//
//  1. An explicitly-configured SESSION_SECRET always wins - cfg's own
//     value is returned unchanged, and cfg.SessionSecretIsEphemeral is
//     already false in that case (config.Load already established
//     this tier).
//  2. Otherwise, if DATA_DIR is configured, a secret is read from - or
//     generated once and persisted to - <DATA_DIR>/session-secret, so
//     sessions survive a restart without requiring an operator to
//     manage SESSION_SECRET by hand.
//  3. Otherwise (no SESSION_SECRET, no DATA_DIR either), cfg's own
//     freshly-generated-for-this-run secret is used as-is - the
//     original, always-ephemeral behavior, unchanged.
//
// Returns the secret to actually use and whether it's still ephemeral
// (won't survive a restart) - the caller logs a startup warning in the
// latter case, same as before this function existed.
func resolveSessionSecret(cfg *config.Config) (secret []byte, ephemeral bool, err error) {
	if !cfg.SessionSecretIsEphemeral {
		return cfg.SessionSecret, false, nil
	}
	if cfg.DataDir == "" {
		return cfg.SessionSecret, true, nil
	}

	path := filepath.Join(cfg.DataDir, sessionSecretFileName)
	existing, err := os.ReadFile(path)
	if err == nil {
		if len(existing) < config.MinSessionSecretLength {
			return nil, false, fmt.Errorf(
				"session secret file %q holds a value shorter than %d bytes (got %d) - "+
					"delete it to have a new one generated, or replace it with a longer value",
				path, config.MinSessionSecretLength, len(existing),
			)
		}
		return existing, false, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, false, fmt.Errorf("reading session secret file %q: %w", path, err)
	}

	generated, err := randomSessionSecret()
	if err != nil {
		return nil, false, fmt.Errorf("generating session secret: %w", err)
	}
	// 0o600: this file holds the same high-value secret SESSION_SECRET
	// itself is - readable/writable only by the user this process runs
	// as.
	if err := atomicfile.Write(path, generated, 0o600); err != nil {
		return nil, false, fmt.Errorf("persisting session secret file %q: %w", path, err)
	}
	return generated, false, nil
}

// randomSessionSecret mirrors config.go's own randomSecret helper
// exactly (same byte count, same base64 encoding) - duplicated rather
// than exported from internal/config, since generating a secret isn't
// otherwise part of that package's public surface.
func randomSessionSecret() ([]byte, error) {
	b := make([]byte, config.MinSessionSecretLength)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	return []byte(base64.RawStdEncoding.EncodeToString(b)), nil
}
