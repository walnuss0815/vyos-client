package auth_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/auth"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// realSHA512CryptHash is a genuine glibc crypt(3) SHA-512 hash for the
// plaintext "s3cret-password", generated independently of this
// project's code via `mkpasswd -m sha-512 -S abcdefgh12345678
// s3cret-password` (Debian's `whois` package, the same tool VyOS
// operators would reach for) - this is exactly the hash format VyOS's
// own conf-mode script produces (passlib's linux_context, sha512_crypt
// as the default scheme; see docs/roadmap.md). Using an
// independently-generated fixture, rather than round-tripping through
// this package's own hashing code, is deliberate: it validates actual
// compatibility with VyOS's real hash format, not just internal
// self-consistency.
const (
	realSHA512CryptHash     = "$6$abcdefgh12345678$QP4os7MdHpNrBHQ/JDFr25yyxxc.4mwnFNG245l78B.t1RZNZQ3zKCRnE68hFDlYl1uJtvrFMDkYZ5x/whKXO1"
	realSHA512CryptPassword = "s3cret-password"
)

// fakeConfigReader is a minimal in-memory implementation of
// auth.ConfigReader for unit-testing VyOSUserVerifier without a real
// (or even fake-HTTP) VyOS server. Paths are joined with "/" as a map
// key, which is fine for these tests' simple, non-slash-containing
// path segments.
type fakeConfigReader struct {
	values map[string]string
	err    error // if set, every call fails with this error
}

func (f *fakeConfigReader) key(path []string) string {
	return strings.Join(path, "/")
}

func (f *fakeConfigReader) Exists(_ context.Context, path []string) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	_, ok := f.values[f.key(path)]
	return ok, nil
}

func (f *fakeConfigReader) ReturnValue(_ context.Context, path []string) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	v, ok := f.values[f.key(path)]
	if !ok {
		// Mirrors real VyOS's actual behavior for a syntactically
		// valid but unpopulated path (see vyos.IsEmptyPath) - this
		// case is reached for real by check() querying a nonexistent
		// user's encrypted-password leaf, now that it always performs
		// all three lookups regardless of whether the user exists
		// (see vyos_verifier.go's timing-equalization doc comment).
		return "", &vyos.APIError{StatusCode: 400, Message: "Configuration under specified path is empty"}
	}
	return v, nil
}

// newAliceConfig returns a fakeConfigReader seeded with a single VyOS
// user "alice" whose real password is realSHA512CryptPassword.
func newAliceConfig() *fakeConfigReader {
	return &fakeConfigReader{
		values: map[string]string{
			"system/login/user/alice":                                   "",
			"system/login/user/alice/authentication/encrypted-password": realSHA512CryptHash,
		},
	}
}

func TestVyOSUserVerifier_CorrectCredentials(t *testing.T) {
	v := auth.NewVyOSUserVerifier(newAliceConfig(), auth.NewLoginLimiter())

	if err := v.Verify(context.Background(), "1.2.3.4", "alice", realSHA512CryptPassword); err != nil {
		t.Errorf("expected correct credentials to succeed, got %v", err)
	}
}

func TestVyOSUserVerifier_WrongPassword(t *testing.T) {
	v := auth.NewVyOSUserVerifier(newAliceConfig(), auth.NewLoginLimiter())

	if err := v.Verify(context.Background(), "1.2.3.4", "alice", "wrong"); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestVyOSUserVerifier_UnknownUser(t *testing.T) {
	v := auth.NewVyOSUserVerifier(newAliceConfig(), auth.NewLoginLimiter())

	if err := v.Verify(context.Background(), "1.2.3.4", "bob", realSHA512CryptPassword); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for unknown user, got %v", err)
	}
}

func TestVyOSUserVerifier_EmptyUsername(t *testing.T) {
	v := auth.NewVyOSUserVerifier(newAliceConfig(), auth.NewLoginLimiter())

	if err := v.Verify(context.Background(), "1.2.3.4", "", realSHA512CryptPassword); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for empty username, got %v", err)
	}
}

func TestVyOSUserVerifier_DisabledAccount(t *testing.T) {
	cfg := newAliceConfig()
	cfg.values["system/login/user/alice/disable"] = ""
	v := auth.NewVyOSUserVerifier(cfg, auth.NewLoginLimiter())

	if err := v.Verify(context.Background(), "1.2.3.4", "alice", realSHA512CryptPassword); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for a disabled account, got %v", err)
	}
}

func TestVyOSUserVerifier_LockedAccount(t *testing.T) {
	cfg := &fakeConfigReader{
		values: map[string]string{
			"system/login/user/alice":                                   "",
			"system/login/user/alice/authentication/encrypted-password": "!",
		},
	}
	v := auth.NewVyOSUserVerifier(cfg, auth.NewLoginLimiter())

	if err := v.Verify(context.Background(), "1.2.3.4", "alice", realSHA512CryptPassword); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for a locked (\"!\") account, got %v", err)
	}
}

func TestVyOSUserVerifier_UnsupportedHashPrefix(t *testing.T) {
	cfg := &fakeConfigReader{
		values: map[string]string{
			"system/login/user/alice": "",
			// A yescrypt hash - not a panic-inducing garbage string,
			// a genuinely well-formed hash this library just doesn't
			// implement. Must fail closed, not panic.
			"system/login/user/alice/authentication/encrypted-password": "$y$j9T$somesaltvalue$somehashvaluethatislongenoughtolook realistic",
		},
	}
	v := auth.NewVyOSUserVerifier(cfg, auth.NewLoginLimiter())

	if err := v.Verify(context.Background(), "1.2.3.4", "alice", realSHA512CryptPassword); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for an unsupported hash prefix, got %v", err)
	}
}

func TestVyOSUserVerifier_BackendError(t *testing.T) {
	cfg := &fakeConfigReader{err: errors.New("connection refused")}
	v := auth.NewVyOSUserVerifier(cfg, auth.NewLoginLimiter())

	err := v.Verify(context.Background(), "1.2.3.4", "alice", realSHA512CryptPassword)
	if !errors.Is(err, auth.ErrAuthBackendUnavailable) {
		t.Errorf("expected ErrAuthBackendUnavailable, got %v", err)
	}
	if errors.Is(err, auth.ErrInvalidCredentials) {
		t.Error("a backend error should not also satisfy errors.Is(ErrInvalidCredentials) - callers need to tell these apart")
	}
}

// TestVyOSUserVerifier_UnknownUserTakesComparableTimeToWrongPassword is
// a regression test for a timing side-channel that used to let an
// unauthenticated caller enumerate valid VyOS usernames: an earlier
// version of check() returned immediately (after a single Exists
// lookup, no crypt(3) verification at all) for a nonexistent username,
// while a real username with a wrong password additionally paid for a
// full sha512-crypt computation - a reliably-measurable, large
// difference. Verify() now performs the same crypt(3) work either way
// (see vyos_verifier.go's dummyHashForTiming), so this asserts the two
// cases take comparable wall-clock time - specifically, that checking
// an unknown user isn't dramatically *faster* than checking a known
// one, which is what the crypt-skipping short-circuit would produce.
//
// This necessarily uses a generous tolerance (sha512-crypt itself
// takes single-digit milliseconds on typical hardware, so noise from
// scheduling/GC could easily swing an individual measurement by a
// similar margin) - it's checking for the *qualitative* absence of a
// "skip the expensive step entirely" shortcut, not asserting a tight
// timing bound.
func TestVyOSUserVerifier_UnknownUserTakesComparableTimeToWrongPassword(t *testing.T) {
	const samples = 20
	limiter := auth.NewLoginLimiter()
	limiter.MaxAttempts = samples * 3 // avoid backoff from interfering with the measurement

	knownUserVerifier := auth.NewVyOSUserVerifier(newAliceConfig(), limiter)
	unknownUserVerifier := auth.NewVyOSUserVerifier(newAliceConfig(), limiter)

	measure := func(v *auth.VyOSUserVerifier, username string) time.Duration {
		start := time.Now()
		for i := 0; i < samples; i++ {
			_ = v.Verify(context.Background(), "1.2.3.4", username, "definitely-wrong-password")
		}
		return time.Since(start)
	}

	wrongPasswordElapsed := measure(knownUserVerifier, "alice")
	unknownUserElapsed := measure(unknownUserVerifier, "someone-who-does-not-exist")

	// The old, vulnerable behavior made the unknown-user path many
	// times faster (no crypt call at all vs. one full sha512-crypt
	// computation per attempt) - well outside a 2x margin either way.
	// A fixed implementation should land close to 1x; allowing up to
	// 2x in *either* direction keeps this robust against ordinary
	// system noise while still catching a reintroduced short-circuit.
	ratio := float64(unknownUserElapsed) / float64(wrongPasswordElapsed)
	if ratio < 0.5 || ratio > 2.0 {
		t.Errorf(
			"unknown-user path took %v for %d attempts, known-user-wrong-password path took %v - ratio %.2f is outside the expected ~1x range, suggesting the crypt(3) verification is being skipped for one of the two paths (a timing side-channel)",
			unknownUserElapsed, samples, wrongPasswordElapsed, ratio,
		)
	}
}

// TestVyOSUserVerifier_BackendErrorDoesNotCountAsFailedAttempt asserts
// that a VyOS-API failure doesn't burn through a legitimate user's
// rate-limit budget on its own - only actual wrong-credential attempts
// should. Regression coverage for the "don't record on backend error"
// behavior described in vyos_verifier.go's Verify doc comment.
func TestVyOSUserVerifier_BackendErrorDoesNotCountAsFailedAttempt(t *testing.T) {
	limiter := auth.NewLoginLimiter()
	limiter.MaxAttempts = 2

	failingCfg := &fakeConfigReader{err: errors.New("connection refused")}
	v := auth.NewVyOSUserVerifier(failingCfg, limiter)

	for i := 0; i < 5; i++ {
		err := v.Verify(context.Background(), "1.2.3.4", "alice", realSHA512CryptPassword)
		if !errors.Is(err, auth.ErrAuthBackendUnavailable) {
			t.Fatalf("attempt %d: expected ErrAuthBackendUnavailable, got %v", i, err)
		}
	}

	// The limiter's own Allow bookkeeping is independent of Verify's
	// error classification, so a subsequent *correct* attempt against
	// a now-healthy backend should still succeed - proving none of
	// the five backend-error attempts above consumed the limiter's
	// small MaxAttempts budget.
	v2 := auth.NewVyOSUserVerifier(newAliceConfig(), limiter)
	if err := v2.Verify(context.Background(), "1.2.3.4", "alice", realSHA512CryptPassword); err != nil {
		t.Errorf("expected a correct attempt after backend recovery to succeed (rate limit budget should be untouched), got %v", err)
	}
}
