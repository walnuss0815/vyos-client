// Package testutil provides a minimal fake VyOS HTTPS API server for use
// in unit and integration tests, so packages that talk to VyOS don't
// need a real router (or even network access) to be tested.
//
// It deliberately mimics the wire-level request parsing of the real
// vyos-1x REST server closely enough to exercise our client and BFF
// handlers realistically (multipart/form-data with "data"+"key" fields,
// the single-op-vs-"commands" shape on /configure, commit-confirm
// bookkeeping), while keeping the in-memory "configuration" itself a
// simple nested map rather than a real VyOS config tree.
package testutil

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
)

// RecordedRequest captures one call made to the fake server, for test
// assertions.
type RecordedRequest struct {
	Endpoint string
	Key      string
	Data     json.RawMessage
}

// FakeVyOS is an in-memory stand-in for a VyOS HTTPS API server.
type FakeVyOS struct {
	mu sync.Mutex

	// Keys is the set of API keys the fake server accepts.
	Keys map[string]bool

	// Config is the in-memory configuration tree, in the same nested
	// map[string]any shape VyOS's own showConfig JSON uses. Leaf
	// values are strings; flag ("valueless") nodes are empty maps.
	Config map[string]any

	// SavedConfig is a snapshot of Config as of the most recent
	// "save" /config-file call - this fake's stand-in for "what's on
	// disk" (/config/config.boot), kept genuinely separate from the
	// live, mutable Config the running-config reads/writes
	// (/retrieve, /configure) use. A file-based "load" /config-file
	// call (the shape vyos.Client.ConfigFileLoadFile sends for
	// rollback) restores Config from this snapshot, simulating VyOS
	// reading its own saved file back. Starts nil (never saved) -
	// same "no prior state" meaning real VyOS's /config/config.boot
	// has before the very first save on a fresh install.
	//
	// A "load"/"merge" call carrying inline text (the String field,
	// rather than File) is NOT simulated against Config at all -
	// deliberately: this fake has no parser for VyOS's own
	// curly-brace config-file syntax (nothing in this codebase does;
	// see docs/architecture.md's "commit/save engine" section), so
	// there's no way to turn arbitrary config text into this fake's
	// map[string]any shape. Tests that need to assert on a
	// string-based load/merge's *effect* on Config aren't supported
	// by this fake - only its wire shape (op, confirm_time) is.
	SavedConfig map[string]any

	// Requests records the most recent maxRecordedRequests requests
	// handled, in order (oldest first), for assertion in tests. Bounded
	// rather than unbounded: this struct is also reused as a
	// long-running process by cmd/mock-vyos for docker-compose local
	// dev sessions, where an ever-growing history would otherwise leak
	// memory for the lifetime of the container.
	Requests []RecordedRequest

	// PendingConfirm, when true, means the last /configure or
	// /config-file call started a commit-confirm timer that has not
	// yet been confirmed.
	PendingConfirm bool

	// Info is returned verbatim by GET /info.
	Info map[string]any

	// ShowOutputs, keyed by the requested show path joined with single
	// spaces (e.g. "interfaces kernel json", "ip route json"), is
	// returned verbatim as the text output of POST /show for that
	// path - mirroring how real VyOS's op-mode scripts print JSON
	// *text* (not pre-decoded JSON) for "... json" trailing keywords;
	// see vyos.ShowInterfaces/ShowRoutes, which parse that text. A
	// path with no matching entry returns "" (the previous, blanket
	// stub behavior), consistent with a command that produced no
	// output.
	ShowOutputs map[string]string
	// ShowErrors, keyed the same way as ShowOutputs, makes POST /show
	// fail for that specific path instead of returning an output - an
	// entry here takes priority over ShowOutputs for the same key, so
	// a test only has to seed whichever one it needs (see
	// vyos.ShowFile's "not found" test, which needs a genuine VyOS
	// error rather than a canned output string).
	ShowErrors map[string]string

	// ContainerImageAddOutputs / ContainerImageAddErrors, keyed by
	// image name, script POST /container-image {"op":"add"} -
	// vyos.PullContainerImage's endpoint. Not reachable through
	// ShowOutputs (keyed by op-mode *path*), since this request has no
	// "path" field at all, just op+name - a genuinely different wire
	// shape (see containerImageOp in internal/vyos/models.go). An
	// error entry for a name takes priority over an output entry, so
	// a test only has to seed whichever one it needs.
	ContainerImageAddOutputs map[string]string
	ContainerImageAddErrors  map[string]string
	// ContainerImageDeleteOutputs / ContainerImageDeleteErrors are the
	// same pattern for {"op":"delete"}.
	ContainerImageDeleteOutputs map[string]string
	ContainerImageDeleteErrors  map[string]string

	// SystemImageAddOutputs / SystemImageAddErrors, keyed by the
	// requested URL, script POST /image {"op":"add"} -
	// vyos.AddSystemImage's endpoint (VyOS's own system-image
	// install, distinct from /container-image - see systemImageOp in
	// internal/vyos/models.go). Same "error entry takes priority"
	// convention as the container-image maps above.
	SystemImageAddOutputs map[string]string
	SystemImageAddErrors  map[string]string
	// SystemImageDeleteOutputs / SystemImageDeleteErrors are the same
	// pattern for {"op":"delete"}, keyed by image name.
	SystemImageDeleteOutputs map[string]string
	SystemImageDeleteErrors  map[string]string

	Server *httptest.Server
}

// NewHandler builds a fake VyOS server accepting the given API keys and
// returns both the FakeVyOS instance (for test/dev assertions and
// seeding) and its http.Handler, without starting any listener. This is
// the building block New uses for in-process tests; it's also exported
// directly for callers that need to run the fake server as a real,
// standalone process (see cmd/mock-vyos), where httptest's
// loopback-only, random-port listener isn't usable.
func NewHandler(keys ...string) (*FakeVyOS, http.Handler) {
	f := &FakeVyOS{
		Keys:   map[string]bool{},
		Config: map[string]any{},
		Info: map[string]any{
			"version":  "1.5-rolling",
			"hostname": "vyos-test",
			"banner":   "Welcome to VyOS (fake)",
		},
		ShowOutputs:                 map[string]string{},
		ShowErrors:                  map[string]string{},
		ContainerImageAddOutputs:    map[string]string{},
		ContainerImageAddErrors:     map[string]string{},
		ContainerImageDeleteOutputs: map[string]string{},
		ContainerImageDeleteErrors:  map[string]string{},
		SystemImageAddOutputs:       map[string]string{},
		SystemImageAddErrors:        map[string]string{},
		SystemImageDeleteOutputs:    map[string]string{},
		SystemImageDeleteErrors:     map[string]string{},
	}
	for _, k := range keys {
		f.Keys[k] = true
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/info", f.handleInfo)
	mux.HandleFunc("/retrieve", f.handleRetrieve)
	mux.HandleFunc("/configure", f.handleConfigure)
	mux.HandleFunc("/config-file", f.handleConfigFile)
	mux.HandleFunc("/show", f.handleShow)
	mux.HandleFunc("/reboot", f.handleSimpleOK)
	mux.HandleFunc("/poweroff", f.handleSimpleOK)
	mux.HandleFunc("/reset", f.handleSimpleOK)
	mux.HandleFunc("/generate", f.handleSimpleOK)
	mux.HandleFunc("/container-image", f.handleContainerImage)
	mux.HandleFunc("/image", f.handleSystemImage)

	return f, mux
}

// New starts a fake VyOS server (as a real, in-process httptest server
// listening on loopback) accepting the given API keys.
func New(keys ...string) *FakeVyOS {
	f, handler := NewHandler(keys...)
	f.Server = httptest.NewServer(handler)
	return f
}

// Close shuts down the underlying httptest server.
func (f *FakeVyOS) Close() { f.Server.Close() }

// URL returns the fake server's base URL.
func (f *FakeVyOS) URL() string { return f.Server.URL }

func writeSuccess(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"data":    data,
		"error":   nil,
	})
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": false,
		"data":    nil,
		"error":   msg,
	})
}

// maxRecordedRequests bounds FakeVyOS.Requests. Ample for any test's
// assertions (which only ever look at the most recent request), while
// keeping cmd/mock-vyos's memory use bounded across a long-running
// docker-compose dev session.
const maxRecordedRequests = 1000

// recordRequest appends to Requests, periodically copying into a fresh,
// right-sized backing array once the cap is exceeded so the discarded
// older entries' memory can actually be reclaimed - re-slicing alone
// (Requests = Requests[n:]) would keep the same backing array alive
// and growing indefinitely, since slicing doesn't release memory.
// Callers must hold f.mu.
func (f *FakeVyOS) recordRequest(req RecordedRequest) {
	f.Requests = append(f.Requests, req)
	if len(f.Requests) > maxRecordedRequests {
		trimmed := make([]RecordedRequest, maxRecordedRequests)
		copy(trimmed, f.Requests[len(f.Requests)-maxRecordedRequests:])
		f.Requests = trimmed
	}
}

// parseForm parses the multipart "data"+"key" request shape, records
// the request, and validates the key. Returns the raw "data" JSON and
// whether the caller should continue (false if an error was already
// written).
func (f *FakeVyOS) parseForm(w http.ResponseWriter, r *http.Request) (json.RawMessage, bool) {
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, 422, "Non-empty data field is required")
		return nil, false
	}
	key := r.FormValue("key")
	data := r.FormValue("data")

	f.mu.Lock()
	f.recordRequest(RecordedRequest{Endpoint: r.URL.Path, Key: key, Data: json.RawMessage(data)})
	f.mu.Unlock()

	if !f.Keys[key] {
		writeError(w, 401, "Valid API key is required")
		return nil, false
	}
	return json.RawMessage(data), true
}

func (f *FakeVyOS) handleInfo(w http.ResponseWriter, _ *http.Request) {
	writeSuccess(w, f.Info)
}

// pathFieldPresence inspects raw's top-level "path" field the same way
// VyOS's real request-parsing middleware does (routers.py's
// MultipartRequest.body): a JSON `null` is a present-but-wrong-type
// value, not an absent one. This distinction matters because
// unmarshaling straight into a typed `[]string` field (as this fake
// server's payload structs do elsewhere) silently accepts `null` as a
// nil slice, indistinguishable from a legitimately empty `[]` - which
// is exactly the class of client bug (a nil Go slice marshals to JSON
// `null`, not `[]`) this check exists to catch. Checked at the raw
// JSON byte level rather than via a second Unmarshal, since
// unmarshaling `null` into any slice-typed Go value also succeeds
// silently and would reintroduce the same blind spot.
func pathFieldPresence(raw json.RawMessage) (present, isList bool) {
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(raw, &generic); err != nil {
		return false, false
	}
	v, ok := generic["path"]
	if !ok {
		return false, false
	}
	trimmed := bytes.TrimSpace(v)
	return true, len(trimmed) > 0 && trimmed[0] == '['
}

// requirePathField validates raw's "path" field and, on failure,
// writes the same error shape (and equivalent message) the real VyOS
// server would. Returns false if it already wrote a response.
func requirePathField(w http.ResponseWriter, raw json.RawMessage) bool {
	present, isList := pathFieldPresence(raw)
	if !present {
		writeError(w, 400, "Malformed command: missing 'path' field")
		return false
	}
	if !isList {
		writeError(w, 400, "Malformed command: 'path' field must be a list")
		return false
	}
	return true
}

func (f *FakeVyOS) handleSimpleOK(w http.ResponseWriter, r *http.Request) {
	raw, ok := f.parseForm(w, r)
	if !ok {
		return
	}
	if !requirePathField(w, raw) {
		return
	}
	writeSuccess(w, "")
}

type showPayload struct {
	Op   string   `json:"op"`
	Path []string `json:"path"`
}

func (f *FakeVyOS) handleShow(w http.ResponseWriter, r *http.Request) {
	raw, ok := f.parseForm(w, r)
	if !ok {
		return
	}
	if !requirePathField(w, raw) {
		return
	}
	var p showPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		writeError(w, 400, "malformed request")
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	key := strings.Join(p.Path, " ")
	if errMsg, hasErr := f.ShowErrors[key]; hasErr {
		writeError(w, 422, errMsg)
		return
	}
	writeSuccess(w, f.ShowOutputs[key])
}

type containerImagePayload struct {
	Op   string `json:"op"`
	Name string `json:"name"`
}

// handleContainerImage fakes /container-image (op: add | delete |
// show - see vyos.PullContainerImage/DeleteContainerImage/
// ShowContainerImages). "show" is implemented only for fidelity with
// the real endpoint's full op set; this app's own client deliberately
// doesn't use it (see ShowContainerImages's doc comment for why it
// goes through /show + a json op-mode path instead).
func (f *FakeVyOS) handleContainerImage(w http.ResponseWriter, r *http.Request) {
	raw, ok := f.parseForm(w, r)
	if !ok {
		return
	}
	var p containerImagePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		writeError(w, 400, "malformed request")
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	switch p.Op {
	case "add":
		if errMsg, hasErr := f.ContainerImageAddErrors[p.Name]; hasErr {
			writeError(w, 400, errMsg)
			return
		}
		writeSuccess(w, f.ContainerImageAddOutputs[p.Name])
	case "delete":
		if errMsg, hasErr := f.ContainerImageDeleteErrors[p.Name]; hasErr {
			writeError(w, 400, errMsg)
			return
		}
		writeSuccess(w, f.ContainerImageDeleteOutputs[p.Name])
	case "show":
		writeSuccess(w, f.ShowOutputs["container image"])
	default:
		writeError(w, 400, fmt.Sprintf("'%s' is not a valid operation", p.Op))
	}
}

type systemImagePayload struct {
	Op   string `json:"op"`
	URL  string `json:"url"`
	Name string `json:"name"`
}

// handleSystemImage fakes /image (op: add | delete - see
// vyos.AddSystemImage/DeleteSystemImage). "add" is keyed by URL (the
// only identifying field the real REST request has for that op);
// "delete" is keyed by image name, same as /container-image's delete.
func (f *FakeVyOS) handleSystemImage(w http.ResponseWriter, r *http.Request) {
	raw, ok := f.parseForm(w, r)
	if !ok {
		return
	}
	var p systemImagePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		writeError(w, 400, "malformed request")
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	switch p.Op {
	case "add":
		if errMsg, hasErr := f.SystemImageAddErrors[p.URL]; hasErr {
			writeError(w, 400, errMsg)
			return
		}
		writeSuccess(w, f.SystemImageAddOutputs[p.URL])
	case "delete":
		if errMsg, hasErr := f.SystemImageDeleteErrors[p.Name]; hasErr {
			writeError(w, 400, errMsg)
			return
		}
		writeSuccess(w, f.SystemImageDeleteOutputs[p.Name])
	default:
		writeError(w, 400, fmt.Sprintf("'%s' is not a valid operation", p.Op))
	}
}

type retrievePayload struct {
	Op   string   `json:"op"`
	Path []string `json:"path"`
}

func (f *FakeVyOS) handleRetrieve(w http.ResponseWriter, r *http.Request) {
	raw, ok := f.parseForm(w, r)
	if !ok {
		return
	}
	if !requirePathField(w, raw) {
		return
	}
	var p retrievePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		writeError(w, 400, "malformed request")
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	switch p.Op {
	case "exists":
		_, exists := getNested(f.Config, p.Path)
		writeSuccess(w, exists)
	case "showConfig":
		node, exists := getNested(f.Config, p.Path)
		if !exists {
			writeError(w, 400, "Configuration under specified path is empty")
			return
		}
		// Real VyOS's showConfig (cli-shell-api showConfig <path>,
		// converted from its curly-brace CLI syntax to JSON) returns
		// the requested node wrapped exactly as it appears as a child
		// of its parent - i.e. a single-key object keyed by the last
		// path segment - not just the node's own content. For an
		// empty path (whole-config fetch) there is no such wrapping,
		// since there's no parent to nest under.
		if len(p.Path) > 0 {
			node = map[string]any{p.Path[len(p.Path)-1]: node}
		}
		writeSuccess(w, node)
	case "returnValues":
		node, exists := getNested(f.Config, p.Path)
		if !exists {
			writeError(w, 400, "Configuration under specified path is empty")
			return
		}
		if vals, ok := node.([]string); ok {
			writeSuccess(w, vals)
			return
		}
		writeSuccess(w, []string{})
	case "returnValue":
		node, exists := getNested(f.Config, p.Path)
		if !exists {
			writeError(w, 400, "Configuration under specified path is empty")
			return
		}
		writeSuccess(w, node)
	default:
		writeError(w, 400, fmt.Sprintf("'%s' is not a valid operation", p.Op))
	}
}

type configOpPayload struct {
	Op    string   `json:"op"`
	Path  []string `json:"path"`
	Value string   `json:"value"`
}

type configurePayload struct {
	// single-op shape
	Op          string   `json:"op"`
	Path        []string `json:"path"`
	Value       string   `json:"value"`
	ConfirmTime int      `json:"confirm_time"`
	// list shape
	Commands []configOpPayload `json:"commands"`
}

func (f *FakeVyOS) handleConfigure(w http.ResponseWriter, r *http.Request) {
	raw, ok := f.parseForm(w, r)
	if !ok {
		return
	}
	var p configurePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		writeError(w, 400, "malformed request")
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	// Deliberately no special-case for op == "confirm" here, matching
	// real VyOS: /configure requires every command (confirm included)
	// to carry a non-empty 'path', so a pathless {"op":"confirm"} sent
	// here correctly falls through to the "path is required" error
	// below, same as it would against the real API. Confirming a
	// pending commit-confirm goes through /config-file instead - see
	// handleConfigFile below and vyos.Client.ConfigFileConfirm.
	ops := p.Commands
	if ops == nil {
		if p.Path == nil {
			writeError(w, 422, "path is required")
			return
		}
		ops = []configOpPayload{{Op: p.Op, Path: p.Path, Value: p.Value}}
	}

	for _, op := range ops {
		if len(op.Path) == 0 {
			writeError(w, 400, fmt.Sprintf("Malformed command '%v': 'path' list must be non-empty", op))
			return
		}
		switch op.Op {
		case "set":
			setNested(f.Config, op.Path, op.Value)
		case "delete":
			deleteNested(f.Config, op.Path)
		case "comment":
			// no-op for the fake
		default:
			writeError(w, 400, fmt.Sprintf("'%s' is not a valid operation", op.Op))
			return
		}
	}

	if p.ConfirmTime > 0 {
		f.PendingConfirm = true
	}
	writeSuccess(w, nil)
}

type configFilePayload struct {
	Op          string `json:"op"`
	File        string `json:"file"`
	String      string `json:"string"`
	ConfirmTime int    `json:"confirm_time"`
}

func (f *FakeVyOS) handleConfigFile(w http.ResponseWriter, r *http.Request) {
	raw, ok := f.parseForm(w, r)
	if !ok {
		return
	}
	var p configFilePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		writeError(w, 400, "malformed request")
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	switch p.Op {
	case "save":
		f.SavedConfig = deepCopyMap(f.Config)
		writeSuccess(w, "Saving configuration to '/config/config.boot'...\nDone\n")
	case "confirm":
		f.PendingConfirm = false
		writeSuccess(w, "Reload timer stopped\n")
	case "load", "merge":
		// A file-based load (vyos.Client.ConfigFileLoadFile - the
		// shape rollback sends) restores Config from whatever was
		// last saved, simulating VyOS reading its own file back - see
		// SavedConfig's own doc comment for why a String-based
		// load/merge (arbitrary config text) can't be simulated the
		// same way.
		if p.Op == "load" && p.File != "" {
			f.Config = deepCopyMap(f.SavedConfig)
		}
		if p.ConfirmTime > 0 {
			f.PendingConfirm = true
		}
		writeSuccess(w, nil)
	default:
		writeError(w, 400, fmt.Sprintf("'%s' is not a valid operation", p.Op))
	}
}

// deepCopyMap returns a deep copy of m - every nested map[string]any is
// copied too, not just the top-level one, so mutating the original
// Config afterward (via setNested/deleteNested) never retroactively
// changes an earlier SavedConfig snapshot, or vice versa. Leaf values
// are plain strings (immutable, safe to share). A nil m copies to nil,
// matching SavedConfig's "never saved yet" zero value.
func deepCopyMap(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		if nested, ok := v.(map[string]any); ok {
			out[k] = deepCopyMap(nested)
		} else {
			out[k] = v
		}
	}
	return out
}

// --- nested map helpers -----------------------------------------------

func getNested(m map[string]any, path []string) (any, bool) {
	var cur any = m
	for _, seg := range path {
		asMap, ok := cur.(map[string]any)
		if !ok {
			return nil, false
		}
		cur, ok = asMap[seg]
		if !ok {
			return nil, false
		}
	}
	return cur, true
}

func setNested(m map[string]any, path []string, value string) {
	cur := m
	for i, seg := range path {
		last := i == len(path)-1
		if last {
			if value == "" {
				if _, exists := cur[seg]; !exists {
					cur[seg] = map[string]any{}
				}
			} else {
				cur[seg] = value
			}
			return
		}
		next, ok := cur[seg].(map[string]any)
		if !ok {
			next = map[string]any{}
			cur[seg] = next
		}
		cur = next
	}
}

func deleteNested(m map[string]any, path []string) {
	cur := m
	for i, seg := range path {
		last := i == len(path)-1
		if last {
			delete(cur, seg)
			return
		}
		next, ok := cur[seg].(map[string]any)
		if !ok {
			return
		}
		cur = next
	}
}
