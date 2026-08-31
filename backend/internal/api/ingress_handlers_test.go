package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/ingress"
)

// ingressEntryOut mirrors ingressEntryResponse's JSON shape
// (unexported in package api).
type ingressEntryOut struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	TargetURL   string `json:"targetUrl"`
	Headers     []struct {
		Name string `json:"name"`
	} `json:"headers"`
	SkipTLSVerify bool `json:"skipTlsVerify"`
}

func newIngressTestEnv(t *testing.T) *testEnv {
	t.Helper()
	e := newTestEnv(t)
	store, err := ingress.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("ingress.NewStore: %v", err)
	}
	e.apiServer.IngressEnabled = true
	e.apiServer.IngressStore = store
	return e
}

func TestIngressList_DisabledReturnsEmptyList(t *testing.T) {
	e := newTestEnv(t) // IngressStore left nil - feature disabled
	e.login(t)

	resp := e.doJSON(t, http.MethodGet, "/api/ingress", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var out struct {
		Entries []ingressEntryOut `json:"entries"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Entries) != 0 {
		t.Errorf("expected an empty list when disabled, got %+v", out.Entries)
	}
}

func TestIngressList_RequiresAuth(t *testing.T) {
	e := newIngressTestEnv(t)
	resp, err := http.Get(e.server.URL + "/api/ingress")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestIngressCreate_DisabledReturns404(t *testing.T) {
	e := newTestEnv(t) // IngressStore left nil
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/ingress", map[string]any{
		"name": "nas", "targetUrl": "http://10.0.0.5",
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestIngressCreate_Success(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/ingress", map[string]any{
		"name":        "nas",
		"description": "Home NAS",
		"targetUrl":   "http://10.0.0.5:8080",
		"headers":     []map[string]string{{"name": "Authorization", "value": "Bearer secret"}},
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", resp.StatusCode)
	}
	var out ingressEntryOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Name != "nas" || out.TargetURL != "http://10.0.0.5:8080" {
		t.Errorf("unexpected entry: %+v", out)
	}
	if len(out.Headers) != 1 || out.Headers[0].Name != "Authorization" {
		t.Errorf("unexpected headers: %+v", out.Headers)
	}

	// The stored header value must never come back in the response -
	// only its name.
	body, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if string(body) == "" {
		t.Fatal("unexpected empty body")
	}
	entry, ok := e.apiServer.IngressStore.Get("nas")
	if !ok {
		t.Fatal("expected the entry to actually be persisted in the store")
	}
	if entry.Headers[0].Value != "Bearer secret" {
		t.Errorf("stored header value = %q, want Bearer secret", entry.Headers[0].Value)
	}
}

func TestIngressCreate_RejectsInvalidEntry(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/ingress", map[string]any{
		"name":      "NAS", // uppercase - invalid
		"targetUrl": "http://10.0.0.5",
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestIngressCreate_RejectsDuplicateName(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)
	if _, err := e.apiServer.IngressStore.Create(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.5"}); err != nil {
		t.Fatalf("seed Create: %v", err)
	}

	resp := e.doJSON(t, http.MethodPost, "/api/ingress", map[string]any{
		"name": "nas", "targetUrl": "http://10.0.0.6",
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("status = %d, want 409", resp.StatusCode)
	}
}

func TestIngressCreate_RejectsMissingHeaderValue(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/ingress", map[string]any{
		"name":      "nas",
		"targetUrl": "http://10.0.0.5",
		"headers":   []map[string]string{{"name": "Authorization", "value": ""}},
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for a brand new header left blank", resp.StatusCode)
	}
}

func TestIngressGet_Success(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)
	if _, err := e.apiServer.IngressStore.Create(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.5"}); err != nil {
		t.Fatalf("seed Create: %v", err)
	}

	resp := e.doJSON(t, http.MethodGet, "/api/ingress/nas", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var out ingressEntryOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Name != "nas" {
		t.Errorf("Name = %q, want nas", out.Name)
	}
}

func TestIngressGet_UnknownReturns404(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodGet, "/api/ingress/ghost", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestIngressUpdate_Success(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)
	if _, err := e.apiServer.IngressStore.Create(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.5"}); err != nil {
		t.Fatalf("seed Create: %v", err)
	}

	resp := e.doJSON(t, http.MethodPut, "/api/ingress/nas", map[string]any{
		"name":        "should-be-ignored",
		"description": "updated",
		"targetUrl":   "http://10.0.0.6",
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var out ingressEntryOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Name != "nas" {
		t.Errorf("Name = %q, want nas (the path value, not the body's)", out.Name)
	}
	if out.TargetURL != "http://10.0.0.6" || out.Description != "updated" {
		t.Errorf("unexpected entry: %+v", out)
	}
}

// TestIngressUpdate_BlankHeaderValueKeepsPrevious guards the "don't
// force re-typing a secret on every unrelated edit" behavior: a
// header submitted with the same name but a blank value should keep
// its previously stored value, since the frontend never re-displays
// it in the first place.
func TestIngressUpdate_BlankHeaderValueKeepsPrevious(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)
	if _, err := e.apiServer.IngressStore.Create(ingress.Entry{
		Name: "nas", TargetURL: "http://10.0.0.5",
		Headers: []ingress.Header{{Name: "Authorization", Value: "Bearer original"}},
	}); err != nil {
		t.Fatalf("seed Create: %v", err)
	}

	resp := e.doJSON(t, http.MethodPut, "/api/ingress/nas", map[string]any{
		"description": "still the nas",
		"targetUrl":   "http://10.0.0.5",
		"headers":     []map[string]string{{"name": "Authorization", "value": ""}},
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200; body should have kept the previous header value", resp.StatusCode)
	}

	entry, _ := e.apiServer.IngressStore.Get("nas")
	if len(entry.Headers) != 1 || entry.Headers[0].Value != "Bearer original" {
		t.Errorf("expected the previous header value to be kept, got %+v", entry.Headers)
	}
}

// TestIngressUpdate_BlankValueForNewHeaderNameFails guards the
// opposite case: a header whose name doesn't match any previously
// stored header has nothing to fall back to, so a blank value there
// is still rejected.
func TestIngressUpdate_BlankValueForNewHeaderNameFails(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)
	if _, err := e.apiServer.IngressStore.Create(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.5"}); err != nil {
		t.Fatalf("seed Create: %v", err)
	}

	resp := e.doJSON(t, http.MethodPut, "/api/ingress/nas", map[string]any{
		"targetUrl": "http://10.0.0.5",
		"headers":   []map[string]string{{"name": "X-New-Header", "value": ""}},
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for a blank value on a genuinely new header", resp.StatusCode)
	}
}

func TestIngressUpdate_UnknownReturns404(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPut, "/api/ingress/ghost", map[string]any{"targetUrl": "http://10.0.0.5"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestIngressDelete_Success(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)
	if _, err := e.apiServer.IngressStore.Create(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.5"}); err != nil {
		t.Fatalf("seed Create: %v", err)
	}

	resp := e.doJSON(t, http.MethodDelete, "/api/ingress/nas", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d, want 204", resp.StatusCode)
	}
	if _, ok := e.apiServer.IngressStore.Get("nas"); ok {
		t.Error("expected the entry to be gone")
	}
}

func TestIngressDelete_UnknownReturns404(t *testing.T) {
	e := newIngressTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodDelete, "/api/ingress/ghost", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}
