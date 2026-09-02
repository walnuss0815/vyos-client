package vyos_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func newTestClient(t *testing.T, fake *testutil.FakeVyOS) *vyos.Client {
	t.Helper()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	return c
}

func TestConfigure_SingleOp(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	err := c.Configure(context.Background(), []vyos.ConfigOp{
		{Op: vyos.OpSet, Path: []string{"system", "host-name"}, Value: "router1"},
	}, 0)
	if err != nil {
		t.Fatalf("Configure: %v", err)
	}

	// The request actually sent should use the single-op shape, not
	// "commands", per ConfigureModel in the real server.
	configureReq := fake.Requests[len(fake.Requests)-1]

	got, err := c.ReturnValue(context.Background(), []string{"system", "host-name"})
	if err != nil {
		t.Fatalf("ReturnValue: %v", err)
	}
	if got != "router1" {
		t.Errorf("host-name = %q, want %q", got, "router1")
	}

	last := configureReq
	var decoded map[string]any
	if err := json.Unmarshal(last.Data, &decoded); err != nil {
		t.Fatalf("decoding recorded request: %v", err)
	}
	if _, hasCommands := decoded["commands"]; hasCommands {
		t.Errorf("expected single-op request shape, got commands field: %s", last.Data)
	}
	if decoded["op"] != "set" {
		t.Errorf("op = %v, want set", decoded["op"])
	}
}

func TestConfigure_BatchIsAtomicShape(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	err := c.Configure(context.Background(), []vyos.ConfigOp{
		{Op: vyos.OpSet, Path: []string{"interfaces", "ethernet", "eth0", "address"}, Value: "192.0.2.1/24"},
		{Op: vyos.OpSet, Path: []string{"interfaces", "ethernet", "eth0", "description"}, Value: "WAN"},
	}, 0)
	if err != nil {
		t.Fatalf("Configure: %v", err)
	}

	last := fake.Requests[len(fake.Requests)-1]
	var decoded map[string]any
	if err := json.Unmarshal(last.Data, &decoded); err != nil {
		t.Fatalf("decoding recorded request: %v", err)
	}
	cmds, ok := decoded["commands"].([]any)
	if !ok {
		t.Fatalf("expected batch request to use 'commands' shape, got: %s", last.Data)
	}
	if len(cmds) != 2 {
		t.Errorf("expected 2 commands, got %d", len(cmds))
	}
}

func TestConfigure_ConfirmTimeIsTopLevel(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	err := c.Configure(context.Background(), []vyos.ConfigOp{
		{Op: vyos.OpSet, Path: []string{"firewall", "ipv4", "name", "WAN-IN", "default-action"}, Value: "drop"},
	}, 90)
	if err != nil {
		t.Fatalf("Configure: %v", err)
	}

	if !fake.PendingConfirm {
		t.Fatal("expected a pending commit-confirm after confirm_time > 0")
	}

	last := fake.Requests[len(fake.Requests)-1]
	var decoded map[string]any
	if err := json.Unmarshal(last.Data, &decoded); err != nil {
		t.Fatalf("decoding recorded request: %v", err)
	}
	if decoded["confirm_time"] != float64(90) {
		t.Errorf("confirm_time = %v, want 90 (top-level, not per-op)", decoded["confirm_time"])
	}

	// Confirming goes through /config-file (ConfigFileConfirm), not
	// /configure - see configure.go's doc comment for why. The pending
	// commit-confirm state is session-scoped, not tied to which
	// endpoint started the timer, so this correctly clears it.
	if err := c.ConfigFileConfirm(context.Background()); err != nil {
		t.Fatalf("ConfigFileConfirm: %v", err)
	}
	if fake.PendingConfirm {
		t.Fatal("expected commit-confirm to be cleared after confirm")
	}
}

func TestConfigure_RejectsEmptyOps(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	if err := c.Configure(context.Background(), nil, 0); err == nil {
		t.Fatal("expected error for empty ops")
	}
}

func TestDelete(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)
	ctx := context.Background()

	must(t, c.Configure(ctx, []vyos.ConfigOp{{Op: vyos.OpSet, Path: []string{"system", "host-name"}, Value: "router1"}}, 0))

	exists, err := c.Exists(ctx, []string{"system", "host-name"})
	if err != nil || !exists {
		t.Fatalf("expected host-name to exist, exists=%v err=%v", exists, err)
	}

	must(t, c.Configure(ctx, []vyos.ConfigOp{{Op: vyos.OpDelete, Path: []string{"system", "host-name"}}}, 0))

	exists, err = c.Exists(ctx, []string{"system", "host-name"})
	if err != nil || exists {
		t.Fatalf("expected host-name to be gone, exists=%v err=%v", exists, err)
	}
}

// TestShowConfig_ScopedPathUnwrapsLeafValue is a regression test for a
// bug where ShowConfig's return value for a non-empty path was left
// wrapped exactly as VyOS's cli-shell-api showConfig <path> naturally
// returns it: as a single-key object keyed by the path's own last
// segment (e.g. {"host-name": "router1"} rather than just
// "router1"), because that's how the node appears nested inside its
// parent's config block before the JSON conversion. ShowConfig's
// documented contract is "the configuration rooted at path" - the
// node's own content, not one level up - so this wrapping must be
// undone once here, rather than requiring every caller (the BFF's
// masking pass, the Dashboard's hostname display, the Firewall UI's
// scoped `firewall` fetch, and any future caller) to know about and
// individually compensate for this VyOS API quirk. Confirmed against
// vyos-1x's actual REST server source (ConfigSession.show_config +
// ConfigTree.to_json in src/services/api/rest/routers.py), and against
// a real VyOS 2026.02 router's literal response body for this exact
// query: {"data":{"host-name":"router1"}}.
func TestShowConfig_ScopedPathUnwrapsLeafValue(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)
	ctx := context.Background()

	must(t, c.Configure(ctx, []vyos.ConfigOp{
		{Op: vyos.OpSet, Path: []string{"system", "host-name"}, Value: "router1"},
	}, 0))

	data, err := c.ShowConfig(ctx, []string{"system", "host-name"})
	if err != nil {
		t.Fatalf("ShowConfig: %v", err)
	}
	if data != "router1" {
		t.Errorf("ShowConfig([system host-name]) = %#v, want the plain string %q", data, "router1")
	}
}

// TestShowConfig_ScopedContainerPathUnwrapsSubtree is the container-node
// counterpart of TestShowConfig_ScopedPathUnwrapsLeafValue: requesting
// an intermediate node's path (e.g. ["system"]) must return that
// node's own children directly, not wrapped in another "system" key.
// This is the exact shape useFirewallConfig's getConfigTree(['firewall'])
// call relies on for the whole Firewall UI.
func TestShowConfig_ScopedContainerPathUnwrapsSubtree(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)
	ctx := context.Background()

	must(t, c.Configure(ctx, []vyos.ConfigOp{
		{Op: vyos.OpSet, Path: []string{"system", "host-name"}, Value: "router1"},
	}, 0))

	data, err := c.ShowConfig(ctx, []string{"system"})
	if err != nil {
		t.Fatalf("ShowConfig: %v", err)
	}
	system, ok := data.(map[string]any)
	if !ok {
		t.Fatalf("expected a map, got %T: %v", data, data)
	}
	if _, wrapped := system["system"]; wrapped {
		t.Errorf("ShowConfig([system]) result is double-wrapped under an extra %q key: %v", "system", system)
	}
	if system["host-name"] != "router1" {
		t.Errorf("ShowConfig([system])[\"host-name\"] = %v, want %q", system["host-name"], "router1")
	}
}

func TestShowConfig_EmptyPathIsDetectable(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	_, err := c.ShowConfig(context.Background(), []string{"firewall", "ipv4", "forward"})
	if err == nil {
		t.Fatal("expected error for unpopulated path")
	}
	if !vyos.IsEmptyPath(err) {
		t.Errorf("expected IsEmptyPath(err) to be true, got err=%v", err)
	}
}

// TestShowConfig_NilPathFetchesWholeConfig is a regression test for a
// bug where ShowConfig(ctx, nil) - the documented way to fetch the
// entire configuration - sent a JSON "path" field of `null` instead of
// `[]`, because encoding/json marshals a nil []string as `null`. VyOS's
// REST server explicitly rejects that with "'path' field must be a
// list" (confirmed against the real server's request-parsing
// middleware, src/services/api/rest/routers.py in vyos-1x), so every
// whole-config fetch failed. See vyos.path's MarshalJSON.
func TestShowConfig_NilPathFetchesWholeConfig(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)
	ctx := context.Background()

	must(t, c.Configure(ctx, []vyos.ConfigOp{
		{Op: vyos.OpSet, Path: []string{"system", "host-name"}, Value: "router1"},
	}, 0))

	data, err := c.ShowConfig(ctx, nil)
	if err != nil {
		t.Fatalf("ShowConfig(ctx, nil): %v", err)
	}
	tree, ok := data.(map[string]any)
	if !ok {
		t.Fatalf("expected the whole config tree back, got %T: %v", data, data)
	}
	system, ok := tree["system"].(map[string]any)
	if !ok || system["host-name"] != "router1" {
		t.Errorf("expected system.host-name = router1 in whole-config response, got %v", tree)
	}

	// Also verify the raw wire format directly, so this test fails on
	// the actual regression (a `"path":null` in the request) even if
	// some future change to the fake server's leniency masked it at
	// the response level.
	last := fake.Requests[len(fake.Requests)-1]
	var decoded map[string]any
	if err := json.Unmarshal(last.Data, &decoded); err != nil {
		t.Fatalf("decoding recorded request: %v", err)
	}
	pathField, ok := decoded["path"]
	if !ok {
		t.Fatal("expected a 'path' field in the request")
	}
	if pathField == nil {
		t.Fatal(`expected "path" to be [] on the wire, got JSON null`)
	}
	if _, isList := pathField.([]any); !isList {
		t.Errorf(`expected "path" to be a JSON array, got %T: %v`, pathField, pathField)
	}
}

// TestEmptyPathIsRejectedAsNullByFakeServer locks in the fake server's
// fidelity improvement itself: without vyos.path's custom marshaling,
// a bare Go nil []string sent as "path" must be rejected by the fake
// the same way the real VyOS server rejects it, so this exact bug
// class can never again pass silently through the test suite.
func TestEmptyPathIsRejectedAsNullByFakeServer(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("data", `{"op":"showConfig","path":null}`)
	_ = writer.WriteField("key", "test-key")
	_ = writer.Close()

	req, err := http.NewRequest(http.MethodPost, fake.URL()+"/retrieve", body)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for a null path field", resp.StatusCode)
	}
	respBody, _ := io.ReadAll(resp.Body)
	if !bytes.Contains(respBody, []byte("must be a list")) {
		t.Errorf("expected error message about path needing to be a list, got: %s", respBody)
	}
}

func TestConfigFile_SaveAndConfirm(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)
	ctx := context.Background()

	if err := c.ConfigFileSave(ctx, ""); err != nil {
		t.Fatalf("ConfigFileSave: %v", err)
	}

	if err := c.ConfigFileMerge(ctx, "interfaces {\n}\n", 60); err != nil {
		t.Fatalf("ConfigFileMerge: %v", err)
	}
	if !fake.PendingConfirm {
		t.Fatal("expected pending confirm after merge with confirm_time")
	}
	if err := c.ConfigFileConfirm(ctx); err != nil {
		t.Fatalf("ConfigFileConfirm: %v", err)
	}
	if fake.PendingConfirm {
		t.Fatal("expected confirm to clear pending state")
	}
}

// TestConfigFile_LoadFile guards the wire shape ConfigFileLoadFile
// sends (a `load` carrying `file`, not `string`) and, via
// testutil.FakeVyOS's SavedConfig snapshot, that this genuinely
// behaves as a full restore of whatever was last saved - the
// mechanism internal/api's handleRollback relies on.
func TestConfigFile_LoadFile(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)
	ctx := context.Background()

	fake.Config["system"] = map[string]any{"host-name": "saved-name"}
	if err := c.ConfigFileSave(ctx, ""); err != nil {
		t.Fatalf("ConfigFileSave: %v", err)
	}

	// Simulate further commits made after the save, not yet saved.
	fake.Config["system"] = map[string]any{"host-name": "uncommitted-name"}

	if err := c.ConfigFileLoadFile(ctx, "/config/config.boot", 0); err != nil {
		t.Fatalf("ConfigFileLoadFile: %v", err)
	}
	if fake.PendingConfirm {
		t.Fatal("expected no pending confirm without a confirm_time")
	}

	system, _ := fake.Config["system"].(map[string]any)
	if system["host-name"] != "saved-name" {
		t.Errorf("Config[system][host-name] = %q after load, want the saved value restored", system["host-name"])
	}

	last := fake.Requests[len(fake.Requests)-1]
	if last.Endpoint != "/config-file" {
		t.Errorf("endpoint = %q, want /config-file", last.Endpoint)
	}
	if !bytes.Contains(last.Data, []byte(`"op":"load"`)) {
		t.Errorf("expected the request to carry op=load, got: %s", last.Data)
	}
	if !bytes.Contains(last.Data, []byte(`"file":"/config/config.boot"`)) {
		t.Errorf("expected the request to carry the file path, got: %s", last.Data)
	}
	if bytes.Contains(last.Data, []byte(`"string"`)) {
		t.Errorf("expected no string field for a file-based load, got: %s", last.Data)
	}

	if err := c.ConfigFileLoadFile(ctx, "/config/config.boot", 60); err != nil {
		t.Fatalf("ConfigFileLoadFile with confirm_time: %v", err)
	}
	if !fake.PendingConfirm {
		t.Fatal("expected pending confirm after load with confirm_time")
	}
	if err := c.ConfigFileConfirm(ctx); err != nil {
		t.Fatalf("ConfigFileConfirm: %v", err)
	}
}

func TestConfigFile_Load(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)
	ctx := context.Background()

	if err := c.ConfigFileLoad(ctx, "interfaces {\n}\n", 0); err != nil {
		t.Fatalf("ConfigFileLoad: %v", err)
	}
	if fake.PendingConfirm {
		t.Fatal("expected no pending confirm without a confirm_time")
	}

	last := fake.Requests[len(fake.Requests)-1]
	if last.Endpoint != "/config-file" {
		t.Errorf("endpoint = %q, want /config-file", last.Endpoint)
	}
	if !bytes.Contains(last.Data, []byte(`"op":"load"`)) {
		t.Errorf("expected the request to carry op=load, got: %s", last.Data)
	}

	if err := c.ConfigFileLoad(ctx, "interfaces {\n}\n", 60); err != nil {
		t.Fatalf("ConfigFileLoad with confirm_time: %v", err)
	}
	if !fake.PendingConfirm {
		t.Fatal("expected pending confirm after load with confirm_time")
	}
	if err := c.ConfigFileConfirm(ctx); err != nil {
		t.Fatalf("ConfigFileConfirm: %v", err)
	}
}

func TestInfo_NoAuthRequired(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()

	// A client constructed with a bogus key should still be able to
	// call Info, since it's unauthenticated on the real server; our
	// fake doesn't even look at the key for /info.
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "irrelevant"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	info, err := c.Info(context.Background())
	if err != nil {
		t.Fatalf("Info: %v", err)
	}
	if info.Hostname != "vyos-test" {
		t.Errorf("hostname = %q, want vyos-test", info.Hostname)
	}
}

func TestInvalidAPIKey(t *testing.T) {
	fake := testutil.New("correct-key")
	defer fake.Close()

	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "wrong-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	_, err = c.Exists(context.Background(), []string{"system"})
	if err == nil {
		t.Fatal("expected error for invalid API key")
	}
	apiErr, ok := err.(*vyos.APIError)
	if !ok {
		t.Fatalf("expected *vyos.APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 401 {
		t.Errorf("status code = %d, want 401", apiErr.StatusCode)
	}
}

// TestShowWithTimeout_UsesItsOwnTimeoutNotTheClientDefault is a
// regression test for the incident that motivated ShowWithTimeout:
// vyos.ShowLogTail("system"/bare `show log`) timing out against a real
// router with substantial log history, using this Client's normal
// ~30s default - too tight a ceiling for a fetch whose duration
// depends on how much journal history exists. This confirms the
// override actually takes effect (a short override times out fast)
// and, separately, that it doesn't corrupt the Client's own default
// httpClient for other calls (Client.Timeout in Config is otherwise
// hard to observe from outside the package).
func TestShowWithTimeout_UsesItsOwnTimeoutNotTheClientDefault(t *testing.T) {
	// A deliberately slow handler, independent of testutil.FakeVyOS,
	// so the delay is fully under this test's control rather than
	// depending on the fake's own (fast) response time.
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":"line1\n","error":null}`))
	}))
	defer slow.Close()

	c, err := vyos.New(vyos.Config{BaseURL: slow.URL, APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	t.Run("a shorter-than-response-time override times out", func(t *testing.T) {
		_, err := c.ShowWithTimeout(context.Background(), []string{"log"}, 20*time.Millisecond)
		if err == nil {
			t.Fatal("expected a timeout error, got nil")
		}
	})

	t.Run("a longer-than-response-time override succeeds", func(t *testing.T) {
		got, err := c.ShowWithTimeout(context.Background(), []string{"log"}, 2*time.Second)
		if err != nil {
			t.Fatalf("ShowWithTimeout: %v", err)
		}
		if got != "line1\n" {
			t.Errorf("got %q, want %q", got, "line1\n")
		}
	})

	t.Run("the Client's own default-timeout Show is unaffected by ShowWithTimeout calls made on it", func(t *testing.T) {
		// This Client's default (Config.Timeout unset -> 30s) is far
		// longer than the 200ms handler delay, so this must succeed -
		// if ShowWithTimeout's per-call *http.Client leaked its
		// shorter override back onto c's own default client, this
		// would still pass (200ms < 30s) too, so this alone isn't a
		// complete proof of isolation, but combined with the two
		// subtests above using the *same* Client value, it confirms
		// at minimum that a prior override doesn't visibly break
		// subsequent normal calls.
		_, err := c.Show(context.Background(), []string{"log"})
		if err != nil {
			t.Fatalf("Show: %v", err)
		}
	})
}

// TestSend_RejectsOversizedResponseBody is a regression test for a
// missing response body size limit: io.ReadAll on an http.Response.Body
// has no ceiling of its own, so a misbehaving or compromised VyOS
// instance (or anything on the network path able to answer on its
// behalf) returning an arbitrarily large body would previously be read
// into memory in full before this package's own, much smaller
// truncation logic (ShowLogTail/ParseShowFile) ever got a chance to run
// - defeating the point of those limits and giving an attacker a cheap
// memory-exhaustion lever against this app's backend process.
func TestSend_RejectsOversizedResponseBody(t *testing.T) {
	const oneOverLimit = 64*1024*1024 + 1024 // safely past the 64MiB cap

	huge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		chunk := bytes.Repeat([]byte("x"), 1024*1024)
		written := 0
		for written < oneOverLimit {
			n, err := w.Write(chunk)
			if err != nil {
				return
			}
			written += n
		}
	}))
	defer huge.Close()

	c, err := vyos.New(vyos.Config{BaseURL: huge.URL, APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	_, err = c.Show(context.Background(), []string{"log"})
	if err == nil {
		t.Fatal("expected an error for an oversized response body, got nil")
	}
	if apiErr, ok := err.(*vyos.APIError); ok {
		t.Fatalf("expected a plain read-abort error, got a decoded *vyos.APIError: %v", apiErr)
	}
}

// TestDecodeEnvelope_ExplicitNullDataIsANoOpNotAnError is a regression
// test for switching Envelope.Data from any to json.RawMessage:
// unmarshaling an explicit `"data": null` into an any left it nil
// (the same as skipping decoding entirely, which is what the old
// `env.Data != nil` check did for both an absent and an explicit-null
// data field); the same has to remain true for a *T target now that
// decodeEnvelope always attempts json.Unmarshal on any non-empty
// env.Data, including the literal 4-byte "null".
func TestDecodeEnvelope_ExplicitNullDataIsANoOpNotAnError(t *testing.T) {
	nullData := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":null,"error":null}`))
	}))
	defer nullData.Close()

	c, err := vyos.New(vyos.Config{BaseURL: nullData.URL, APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	got, err := c.ShowConfig(context.Background(), []string{"system"})
	if err != nil {
		t.Fatalf("ShowConfig: %v", err)
	}
	if got != nil {
		t.Errorf("got %#v, want nil for an explicit null data field", got)
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
