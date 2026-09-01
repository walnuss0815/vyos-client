package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/notifications"
)

func TestListNotifications_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/notifications", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestListNotifications_ReturnsCurrentFeedNewestFirst(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	first, err := e.apiServer.Notifications.Add(notifications.Notification{Title: "first"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	second, err := e.apiServer.Notifications.Add(notifications.Notification{Title: "second"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}

	resp := e.doJSON(t, http.MethodGet, "/api/notifications", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Notifications []notifications.Notification `json:"notifications"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Notifications) != 2 {
		t.Fatalf("got %d notifications, want 2", len(out.Notifications))
	}
	if out.Notifications[0].ID != second.ID || out.Notifications[1].ID != first.ID {
		t.Errorf("expected newest-first order, got %+v", out.Notifications)
	}
}

func TestMarkNotificationRead_MarksTheMatchingEntry(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	n, err := e.apiServer.Notifications.Add(notifications.Notification{Title: "only"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}

	resp := e.doJSON(t, http.MethodPost, "/api/notifications/read?id="+n.ID, nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}

	got := e.apiServer.Notifications.List()
	if !got[0].Read {
		t.Error("expected the entry to be marked read")
	}
}

func TestMarkNotificationRead_RequiresID(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodPost, "/api/notifications/read", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestMarkNotificationRead_UnknownIDReturnsNotFound(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodPost, "/api/notifications/read?id=does-not-exist", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestMarkAllNotificationsRead_MarksEveryEntry(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	if _, err := e.apiServer.Notifications.Add(notifications.Notification{Title: "one"}); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, err := e.apiServer.Notifications.Add(notifications.Notification{Title: "two"}); err != nil {
		t.Fatalf("Add: %v", err)
	}

	resp := e.doJSON(t, http.MethodPost, "/api/notifications/read-all", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}

	for _, n := range e.apiServer.Notifications.List() {
		if !n.Read {
			t.Errorf("entry %q was not marked read", n.Title)
		}
	}
}

func TestDeleteNotification_RemovesTheMatchingEntry(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	n, err := e.apiServer.Notifications.Add(notifications.Notification{Title: "only"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}

	resp := e.doJSON(t, http.MethodDelete, "/api/notifications?id="+n.ID, nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}

	if got := e.apiServer.Notifications.List(); len(got) != 0 {
		t.Errorf("List() = %+v, want empty after delete", got)
	}
}

func TestDeleteNotification_RequiresID(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodDelete, "/api/notifications", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestDeleteNotification_UnknownIDReturnsNotFound(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodDelete, "/api/notifications?id=does-not-exist", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestDeleteNotification_RequiresCSRFToken(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	n, err := e.apiServer.Notifications.Add(notifications.Notification{Title: "only"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}

	req, err := http.NewRequest(http.MethodDelete, e.server.URL+"/api/notifications?id="+n.ID, nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403 (missing CSRF token)", resp.StatusCode)
	}
}
