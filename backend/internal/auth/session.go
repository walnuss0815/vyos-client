package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// SessionTTL is how long an issued session token remains valid from
// its most recent renewal. Sessions use a sliding-refresh pattern:
// RequireSession (middleware.go) reissues a fresh token on every
// successfully-authenticated request, so an actively-used session
// never hits this window - only an idle one does.
const SessionTTL = 30 * time.Minute

// MaxAbsoluteSessionTTL bounds how long a session can be kept alive by
// sliding renewal alone, regardless of activity - an always-active
// browser tab can't stay signed in indefinitely. Renewal preserves the
// original IssuedAt and refuses to push ExpiresAt past
// originalIssuedAt + MaxAbsoluteSessionTTL; once that's reached, the
// session expires on its next check like any other and the user must
// log in again.
const MaxAbsoluteSessionTTL = 12 * time.Hour

// maxTokenLength bounds Verify's input before any decoding is
// attempted. A real issued token is well under this; it exists to stop
// an attacker-controlled Cookie header (Verify's input on every
// authenticated request) from forcing repeated base64-decode/JSON-parse
// work on an arbitrarily large value. Browser cookie-size limits
// (~4KB) bound this in normal use, but a direct API client isn't
// subject to that limit.
const maxTokenLength = 2048

var (
	// ErrInvalidToken is returned for any structurally invalid or
	// tampered token.
	ErrInvalidToken = errors.New("auth: invalid session token")
	// ErrExpiredToken is returned for a well-formed but expired token.
	ErrExpiredToken = errors.New("auth: session token expired")
)

// claims is the payload of a session token. Timestamps are
// millisecond-precision Unix time (not second-precision) so that two
// renewals issued within the same second - routine with sliding
// renewal, since a page load can fire several authenticated requests
// in quick succession - still produce distinct ExpiresAt values, and
// therefore a genuinely different signed token each time rather than
// a byte-identical one. That matters for token-rotation hygiene (a
// captured/logged old cookie value goes stale sooner) even though the
// functional expiry-window behavior would be correct either way.
type claims struct {
	Subject   string `json:"sub"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
}

// SessionManager issues and verifies stateless, HMAC-signed session
// tokens. Deliberately stateless: the backend keeps no session store of
// any kind (in memory or otherwise) beyond the rate limiter, consistent
// with "no separate server-side state management" — every session is
// fully described by, and only trusted because of, its own signature.
// The trade-off is that tokens cannot be individually revoked before
// they expire; SessionTTL is kept short to bound that exposure, and
// rotating SESSION_SECRET invalidates all outstanding sessions at once
// if immediate revocation is ever needed.
type SessionManager struct {
	secret []byte
}

// NewSessionManager constructs a SessionManager. secret must be
// non-empty; callers should treat it as a high-value secret (anyone who
// has it can mint valid sessions).
func NewSessionManager(secret []byte) *SessionManager {
	return &SessionManager{secret: secret}
}

// Issue mints a new session token for the given subject (the UI admin
// username).
func (m *SessionManager) Issue(subject string) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(SessionTTL)
	c := claims{Subject: subject, IssuedAt: now.UnixMilli(), ExpiresAt: exp.UnixMilli()}
	token, err := m.encode(c)
	if err != nil {
		return "", time.Time{}, err
	}
	return token, exp, nil
}

func (m *SessionManager) encode(c claims) (string, error) {
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payload)
	sig := m.sign(payloadB64)
	return payloadB64 + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

// Verify checks a token's signature and expiry, returning the subject
// it was issued for.
func (m *SessionManager) Verify(token string) (string, error) {
	c, err := m.decodeAndVerify(token)
	if err != nil {
		return "", err
	}
	if time.Now().UnixMilli() > c.ExpiresAt {
		return "", ErrExpiredToken
	}
	return c.Subject, nil
}

// Renew verifies token exactly like Verify, then mints a replacement
// token for the same subject with a fresh SessionTTL window - except
// it preserves the original IssuedAt and caps the new expiry at
// originalIssuedAt + MaxAbsoluteSessionTTL, so sliding renewal can't
// extend a session forever. Returns ErrExpiredToken both for an
// already-expired token and for one that has hit its absolute cap
// (indistinguishable to the caller, same as Verify).
func (m *SessionManager) Renew(token string) (string, time.Time, error) {
	c, err := m.decodeAndVerify(token)
	if err != nil {
		return "", time.Time{}, err
	}
	now := time.Now()
	if now.UnixMilli() > c.ExpiresAt {
		return "", time.Time{}, ErrExpiredToken
	}

	absoluteCap := time.UnixMilli(c.IssuedAt).Add(MaxAbsoluteSessionTTL)
	newExp := now.Add(SessionTTL)
	if newExp.After(absoluteCap) {
		newExp = absoluteCap
	}
	if !newExp.After(now) {
		return "", time.Time{}, ErrExpiredToken
	}

	newClaims := claims{Subject: c.Subject, IssuedAt: c.IssuedAt, ExpiresAt: newExp.UnixMilli()}
	token, err = m.encode(newClaims)
	if err != nil {
		return "", time.Time{}, err
	}
	return token, newExp, nil
}

// decodeAndVerify checks a token's signature and structure (but not
// its expiry) and returns its claims. Shared by Verify and Renew,
// which each apply their own expiry semantics on top.
func (m *SessionManager) decodeAndVerify(token string) (claims, error) {
	if len(token) > maxTokenLength {
		return claims{}, ErrInvalidToken
	}
	dot := strings.IndexByte(token, '.')
	if dot < 0 {
		return claims{}, ErrInvalidToken
	}
	payloadB64, sigB64 := token[:dot], token[dot+1:]

	sig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return claims{}, ErrInvalidToken
	}
	expected := m.sign(payloadB64)
	if subtle.ConstantTimeCompare(sig, expected) != 1 {
		return claims{}, ErrInvalidToken
	}

	payload, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return claims{}, ErrInvalidToken
	}
	var c claims
	if err := json.Unmarshal(payload, &c); err != nil {
		return claims{}, ErrInvalidToken
	}
	return c, nil
}

func (m *SessionManager) sign(payloadB64 string) []byte {
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte(payloadB64))
	return mac.Sum(nil)
}
