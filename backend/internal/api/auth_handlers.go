package api

import (
	"errors"
	"net"
	"net/http"
	"strconv"

	"github.com/walnuss0815/vyos-client/backend/internal/auth"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	User string `json:"user"`
}

// sourceKey extracts a rate-limiting key for the request, preferring
// the connecting peer's address. In host-networking deployments (this
// app's recommended default) the peer address is the real client, not
// a proxy hop, so we deliberately don't trust X-Forwarded-For here
// (which would let a client spoof its own rate-limit bucket).
func sourceKey(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "malformed request")
		return
	}
	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	key := sourceKey(r)
	if allowed, wait := s.Limiter.Allow(key); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(max(1, int(wait.Seconds()))))
		writeError(w, http.StatusTooManyRequests, "too many failed login attempts, try again later")
		return
	}

	if err := s.Verifier.Verify(r.Context(), key, req.Username, req.Password); err != nil {
		if errors.Is(err, auth.ErrAuthBackendUnavailable) {
			// Distinct from "invalid credentials" - the user likely
			// didn't mistype anything, VyOS's API itself couldn't be
			// reached to check. Logged with the underlying cause;
			// the client only gets a generic-but-honest message.
			s.Logger.Error("auth backend unavailable during login", "error", err)
			writeError(w, http.StatusServiceUnavailable, "unable to verify credentials right now, try again shortly")
			return
		}
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, exp, err := s.Sessions.Issue(req.Username)
	if err != nil {
		s.Logger.Error("failed to issue session token", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := auth.SetSessionCookies(w, token, exp, s.CookiesSecure); err != nil {
		s.Logger.Error("failed to set session cookies", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, loginResponse{User: req.Username})
}

func (s *Server) handleLogout(w http.ResponseWriter, _ *http.Request) {
	auth.ClearSessionCookies(w, s.CookiesSecure)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSessionInfo(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFromContext(r.Context())
	writeJSON(w, http.StatusOK, loginResponse{User: user})
}
