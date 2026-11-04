package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"io"
	"net/http"
	"time"
)

const (
	// SessionCookieName holds the signed session token. HttpOnly:
	// never readable from JS.
	SessionCookieName = "vyos_client_session"
	// CSRFCookieName holds the double-submit CSRF token. Deliberately
	// NOT HttpOnly: the frontend reads it and echoes it back in the
	// CSRFHeaderName header on every mutating request.
	CSRFCookieName = "vyos_client_csrf"
	// CSRFHeaderName is the header the frontend must set on every
	// state-changing request, with the value of the CSRF cookie.
	CSRFHeaderName = "X-CSRF-Token"
)

type contextKey string

const userContextKey contextKey = "vyos_client_user"

// UserFromContext returns the authenticated username stored by
// RequireSession, if any.
func UserFromContext(ctx context.Context) (string, bool) {
	u, ok := ctx.Value(userContextKey).(string)
	return u, ok
}

// SetSessionCookies issues both the session cookie and a fresh
// double-submit CSRF cookie on a successful login.
func SetSessionCookies(w http.ResponseWriter, token string, expires time.Time, secure bool) error {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
	})

	csrfToken, err := randomToken(32)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    csrfToken,
		Path:     "/",
		Expires:  expires,
		HttpOnly: false,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
	})
	return nil
}

// ClearSessionCookies logs the user out by expiring both cookies.
func ClearSessionCookies(w http.ResponseWriter, secure bool) {
	for _, name := range []string{SessionCookieName, CSRFCookieName} {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			Expires:  time.Unix(0, 0),
			MaxAge:   -1,
			HttpOnly: name == SessionCookieName,
			Secure:   secure,
			SameSite: http.SameSiteStrictMode,
		})
	}
}

// RequireSession is HTTP middleware that rejects requests without a
// valid session cookie, and otherwise injects the authenticated
// username into the request context. On success it also slides the
// session forward: a fresh token/cookie (same subject, same original
// IssuedAt, renewed ExpiresAt - see SessionManager.Renew) is issued
// for every authenticated request, so an actively-used session stays
// signed in indefinitely up to MaxAbsoluteSessionTTL, while an idle
// one still expires after SessionTTL. secure controls the Secure flag
// on the reissued cookie, matching CookiesSecure elsewhere.
func RequireSession(sessions *SessionManager, secure bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(SessionCookieName)
			if err != nil {
				writeJSONError(w, http.StatusUnauthorized, `{"error":"not authenticated"}`)
				return
			}
			newToken, newExp, user, err := sessions.Renew(cookie.Value)
			if err != nil {
				writeJSONError(w, http.StatusUnauthorized, `{"error":"not authenticated"}`)
				return
			}
			http.SetCookie(w, &http.Cookie{
				Name:     SessionCookieName,
				Value:    newToken,
				Path:     "/",
				Expires:  newExp,
				HttpOnly: true,
				Secure:   secure,
				SameSite: http.SameSiteStrictMode,
			})
			// The CSRF cookie was originally set with the same Expires
			// as the session cookie at login time (SetSessionCookies).
			// Without also sliding it forward here, it would lapse on
			// its own fixed 30-minute schedule even though the session
			// itself just got renewed - silently breaking every
			// mutating request ("missing csrf token") on an otherwise
			// still-valid, actively-used session. Its value doesn't
			// need to rotate (double-submit only requires it match what
			// the frontend echoes back), only its expiry.
			if csrfCookie, err := r.Cookie(CSRFCookieName); err == nil {
				http.SetCookie(w, &http.Cookie{
					Name:     CSRFCookieName,
					Value:    csrfCookie.Value,
					Path:     "/",
					Expires:  newExp,
					HttpOnly: false,
					Secure:   secure,
					SameSite: http.SameSiteStrictMode,
				})
			}
			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireCSRF is HTTP middleware enforcing the double-submit CSRF
// pattern on state-changing methods (everything but GET/HEAD/OPTIONS).
// It must run after RequireSession so unauthenticated requests are
// rejected for the right reason first.
func RequireCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}

		cookie, err := r.Cookie(CSRFCookieName)
		if err != nil || cookie.Value == "" {
			writeJSONError(w, http.StatusForbidden, `{"error":"missing csrf token"}`)
			return
		}
		header := r.Header.Get(CSRFHeaderName)
		if header == "" || subtle.ConstantTimeCompare([]byte(header), []byte(cookie.Value)) != 1 {
			writeJSONError(w, http.StatusForbidden, `{"error":"invalid csrf token"}`)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// writeJSONError replaces http.Error, which forces text/plain, so the
// frontend (which only reads JSON error bodies) can show the message.
func writeJSONError(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, body)
}
