package auth

import (
	"context"
	"crypto/subtle"
	"errors"
)

// ErrInvalidCredentials is returned by a CredentialVerifier's Verify
// for any incorrect username/password, and also (deliberately, to
// avoid leaking which check failed) when the source is currently
// rate-limited after too many failures — callers should present a
// generic "invalid credentials" message either way, and separately
// surface Retry-After style backoff information from the limiter if
// desired.
var ErrInvalidCredentials = errors.New("auth: invalid credentials")

// CredentialVerifier checks a submitted username/password and reports
// whether they're valid, honoring per-source rate limiting. sourceKey
// should uniquely identify the caller for rate-limiting purposes
// (typically client IP). Two implementations exist, selected at
// startup by AUTH_MODE (see docs/security.md and docs/roadmap.md):
// StaticVerifier (AUTH_MODE=static, the single shared UI admin
// account) and VyOSUserVerifier (AUTH_MODE=vyos-users, verifies
// against a real VyOS local user's own password).
type CredentialVerifier interface {
	Verify(ctx context.Context, sourceKey, username, password string) error
}

// StaticVerifier checks submitted credentials against the single
// shared UI admin account (AUTH_MODE=static), entirely independent of
// VyOS's own user database.
type StaticVerifier struct {
	adminUser string
	adminHash string
	limiter   *LoginLimiter
}

// NewStaticVerifier constructs a StaticVerifier for the given admin
// username and bcrypt password hash (UI_ADMIN_USER /
// UI_ADMIN_PASSWORD_HASH).
func NewStaticVerifier(adminUser, adminHash string, limiter *LoginLimiter) *StaticVerifier {
	return &StaticVerifier{adminUser: adminUser, adminHash: adminHash, limiter: limiter}
}

// Verify checks username/password against the configured admin
// account, honoring per-source rate limiting. ctx is unused (this
// verifier never makes a network call) but required to satisfy
// CredentialVerifier.
func (v *StaticVerifier) Verify(_ context.Context, sourceKey, username, password string) error {
	if allowed, _ := v.limiter.Allow(sourceKey); !allowed {
		return ErrInvalidCredentials
	}

	// Constant-time username comparison, then bcrypt for the password
	// (which is constant-time with respect to the stored hash on its
	// own). Both checks always run so a mismatched username doesn't
	// short-circuit faster than a mismatched password would, avoiding
	// a timing oracle for username enumeration.
	userOK := subtle.ConstantTimeCompare([]byte(username), []byte(v.adminUser)) == 1
	passOK := VerifyPassword(v.adminHash, password)

	if !userOK || !passOK {
		v.limiter.RecordFailure(sourceKey)
		return ErrInvalidCredentials
	}

	v.limiter.RecordSuccess(sourceKey)
	return nil
}
