// Package api: handlers for the in-app notification feed
// (internal/notifications.Store) - not VyOS state, see that package's
// own doc comment. Identified by an `id` query parameter on the
// mutating routes rather than a path segment, same convention as
// handleDeleteContainerImage/handleDeleteSystemImage use for their own
// name-based identifiers.
package api

import (
	"net/http"

	"github.com/walnuss0815/vyos-client/backend/internal/notifications"
)

type notificationsResponse struct {
	Notifications []notifications.Notification `json:"notifications"`
}

// handleListNotifications serves GET /api/notifications - the full
// current feed, newest first. No pagination: Store's own retention cap
// (internal/notifications.DefaultMaxItems) already bounds this to a
// size trivially returned in one response.
func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, notificationsResponse{Notifications: s.Notifications.List()})
}

// handleMarkNotificationRead serves POST /api/notifications/read?id=...
func (s *Server) handleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}
	found, err := s.Notifications.MarkRead(id)
	if err != nil {
		s.Logger.Error("marking notification read", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update notification")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "notification not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleMarkAllNotificationsRead serves POST /api/notifications/read-all.
func (s *Server) handleMarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	if err := s.Notifications.MarkAllRead(); err != nil {
		s.Logger.Error("marking all notifications read", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update notifications")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleDeleteNotification serves DELETE /api/notifications?id=...
func (s *Server) handleDeleteNotification(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}
	found, err := s.Notifications.Delete(id)
	if err != nil {
		s.Logger.Error("deleting notification", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete notification")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "notification not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
