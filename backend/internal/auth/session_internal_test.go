package auth

import (
	"errors"
	"testing"
	"time"
)

func TestSessionManager_RenewCapsExpiryAtAbsoluteTTL(t *testing.T) {
	sm := NewSessionManager([]byte("test-secret"))
	now := time.Now()
	issuedAt := now.Add(-MaxAbsoluteSessionTTL + 10*time.Minute)
	token, err := sm.encode(claims{
		Subject:   "admin",
		IssuedAt:  issuedAt.UnixMilli(),
		ExpiresAt: now.Add(SessionTTL).UnixMilli(),
	})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	renewed, newExp, _, err := sm.Renew(token)
	if err != nil {
		t.Fatalf("Renew: %v", err)
	}
	wantExp := time.UnixMilli(issuedAt.UnixMilli()).Add(MaxAbsoluteSessionTTL)
	if !newExp.Equal(wantExp) {
		t.Errorf("renewed expiry = %v, want capped at %v", newExp, wantExp)
	}
	c, err := sm.decodeAndVerify(renewed)
	if err != nil {
		t.Fatalf("decodeAndVerify: %v", err)
	}
	if c.IssuedAt != issuedAt.UnixMilli() || c.ExpiresAt != wantExp.UnixMilli() {
		t.Errorf("renewed claims = %+v, want iat %d and exp %d", c, issuedAt.UnixMilli(), wantExp.UnixMilli())
	}
}

func TestSessionManager_RenewRejectsPastAbsoluteTTL(t *testing.T) {
	sm := NewSessionManager([]byte("test-secret"))
	now := time.Now()
	token, err := sm.encode(claims{
		Subject:   "admin",
		IssuedAt:  now.Add(-MaxAbsoluteSessionTTL - time.Minute).UnixMilli(),
		ExpiresAt: now.Add(SessionTTL).UnixMilli(),
	})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	if _, _, _, err := sm.Renew(token); !errors.Is(err, ErrExpiredToken) {
		t.Errorf("Renew past the absolute cap: err = %v, want ErrExpiredToken", err)
	}
}

func TestSessionManager_RenewRejectsExpiredToken(t *testing.T) {
	sm := NewSessionManager([]byte("test-secret"))
	now := time.Now()
	token, err := sm.encode(claims{
		Subject:   "admin",
		IssuedAt:  now.Add(-time.Hour).UnixMilli(),
		ExpiresAt: now.Add(-time.Second).UnixMilli(),
	})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	if _, _, _, err := sm.Renew(token); !errors.Is(err, ErrExpiredToken) {
		t.Errorf("Renew of an expired token: err = %v, want ErrExpiredToken", err)
	}
}
