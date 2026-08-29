package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// ErrAuthBackendUnavailable is returned by VyOSUserVerifier.Verify
// when looking up the target user's config from VyOS's REST API
// itself fails (network error, VyOS API down/restarting, etc.) —
// distinct from ErrInvalidCredentials so callers can tell "VyOS is
// unreachable" apart from "wrong password" and surface a more useful
// message, rather than telling someone their password is wrong when
// the real problem is VyOS's API being unreachable.
var ErrAuthBackendUnavailable = errors.New("auth: unable to reach VyOS's API to verify credentials")

// ConfigReader is the subset of *vyos.Client's read surface
// VyOSUserVerifier needs. Defined here, in package auth, rather than
// depending on the concrete *vyos.Client type, so this package stays
// unit-testable with a lightweight fake — *vyos.Client already
// satisfies this interface structurally, no glue code required.
type ConfigReader interface {
	ReturnValue(ctx context.Context, path []string) (string, error)
	Exists(ctx context.Context, path []string) (bool, error)
}

// VyOSUserVerifier checks submitted credentials against VyOS's own
// `system login user <name>` accounts (AUTH_MODE=vyos-users), reading
// the target user's `authentication encrypted-password` hash via
// VyOS's REST API (using the backend's existing VYOS_API_KEY — no
// separate credential needed) and verifying it with the same
// crypt(3)-style scheme VyOS itself uses. See docs/roadmap.md and
// docs/security.md for the full design rationale and known
// limitations (RADIUS/TACACS+-backed users aren't representable this
// way; login now depends on VyOS's API being reachable).
type VyOSUserVerifier struct {
	config  ConfigReader
	limiter *LoginLimiter
}

// NewVyOSUserVerifier constructs a VyOSUserVerifier. config is
// typically the backend's single shared *vyos.Client.
func NewVyOSUserVerifier(config ConfigReader, limiter *LoginLimiter) *VyOSUserVerifier {
	return &VyOSUserVerifier{config: config, limiter: limiter}
}

// Verify checks username/password against VyOS's system login user
// tree, honoring per-source rate limiting exactly like StaticVerifier.
func (v *VyOSUserVerifier) Verify(ctx context.Context, sourceKey, username, password string) error {
	if allowed, _ := v.limiter.Allow(sourceKey); !allowed {
		return ErrInvalidCredentials
	}

	ok, err := v.check(ctx, username, password)
	if err != nil {
		// Deliberately not recorded as a failed attempt: it isn't the
		// caller's fault their attempt didn't verify, and counting it
		// would let VyOS API flakiness alone burn through a
		// legitimate user's rate-limit budget.
		return err
	}
	if !ok {
		v.limiter.RecordFailure(sourceKey)
		return ErrInvalidCredentials
	}

	v.limiter.RecordSuccess(sourceKey)
	return nil
}

// dummyHashForTiming is a syntactically valid sha512-crypt hash with
// no correspondence to any real password (generated once via
// `mkpasswd -m sha-512 -S timingsalt99 <arbitrary-unused-value>`).
// check uses it to run the exact same crypt(3) verification cost for
// a nonexistent/disabled/passwordless username as for a real one -
// see check's own doc comment for why this matters.
const dummyHashForTiming = "$6$timingsalt99$nqj5.pkKH8YlwwhDB.Qkmz.hr73id4DBEvFY6Z4O0A5sskq8W0NpXHmUb30MTZ.v1UTVuEQJiUkDWm7sOxF9v1"

// check performs the actual lookup+verification, separately from rate
// limiting/error classification, to keep Verify's control flow
// readable.
//
// Always performs the same three VyOS lookups and exactly one crypt(3)
// verification, regardless of whether the username exists, is
// disabled, or has no password configured - only the final boolean
// result differs based on what those lookups actually found. This is
// deliberate: sha512-crypt verification is the dominant, most
// reliably-measurable cost in this whole check (VyOS API round-trips
// are comparatively fast and consistent), so short-circuiting before
// it - as an earlier version of this function did for a nonexistent
// user - creates a timing side-channel an unauthenticated caller can
// use to enumerate valid VyOS usernames by response time alone.
// verifier.go's StaticVerifier already avoids the equivalent issue for
// AUTH_MODE=static (see its own doc comment); this brings
// AUTH_MODE=vyos-users to the same standard. VyOS API errors (as
// opposed to negative-but-successful lookups) still return
// immediately - an actual connectivity failure isn't a
// per-username-data-dependent signal worth equalizing against.
func (v *VyOSUserVerifier) check(ctx context.Context, username, password string) (bool, error) {
	if username == "" {
		verifyUnixCrypt(dummyHashForTiming, password)
		return false, nil
	}

	exists, err := v.config.Exists(ctx, userPath(username))
	if err != nil {
		return false, fmt.Errorf("%w: checking user exists: %w", ErrAuthBackendUnavailable, err)
	}

	disabled, err := v.config.Exists(ctx, userPath(username, "disable"))
	if err != nil {
		return false, fmt.Errorf("%w: checking disable flag: %w", ErrAuthBackendUnavailable, err)
	}

	hash, err := v.config.ReturnValue(ctx, userPath(username, "authentication", "encrypted-password"))
	if err != nil && !vyos.IsEmptyPath(err) {
		return false, fmt.Errorf("%w: reading encrypted-password: %w", ErrAuthBackendUnavailable, err)
	}
	if hash == "" {
		// No encrypted-password configured at all (vyos.IsEmptyPath's
		// case) - shouldn't normally happen (VyOS's schema defaults
		// this leaf to "!", which verifyUnixCrypt already treats as
		// "no valid password" via its own prefix check), but handled
		// explicitly here too since ReturnValue's error path can also
		// produce an empty hash. Substituting the dummy hash keeps the
		// crypt call below at its normal cost either way.
		hash = dummyHashForTiming
	}

	passwordMatches := verifyUnixCrypt(hash, password)
	if !exists || disabled {
		return false, nil
	}
	return passwordMatches, nil
}

// userPath builds a `system login user <name> ...suffix` config path.
// Always allocates a fresh backing array, so callers making multiple
// calls with different suffixes (as check does) never risk aliasing
// bugs from appending to a shared slice.
func userPath(username string, suffix ...string) []string {
	path := make([]string, 0, 4+len(suffix))
	path = append(path, "system", "login", "user", username)
	return append(path, suffix...)
}
