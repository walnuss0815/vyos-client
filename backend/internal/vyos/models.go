// Package vyos implements a client for the VyOS HTTPS REST API.
//
// The wire format is deliberately modeled after the exact pydantic
// request models used by vyos-1x (src/services/api/rest/models.py) and
// the request-parsing middleware (src/services/api/rest/routers.py),
// rather than the (slightly imprecise) prose in the public docs. In
// particular:
//
//   - Every request is sent as multipart/form-data with two fields:
//     "data" (a JSON-encoded object or array) and "key" (the plaintext
//     API key). A raw application/json body is not a supported request
//     path in the current server implementation.
//   - For /configure, confirm_time is a sibling of "commands" (or of
//     op/path/value for a single operation) — never a per-operation
//     field.
package vyos

import "encoding/json"

// Envelope is the response shape returned by every REST endpoint. Data
// is left as raw, undecoded JSON rather than any: decodeEnvelope only
// ever needs to hand it off to a caller-provided concrete type, and
// unmarshaling it into an any first (as a stepping stone toward
// re-marshaling and re-parsing it a second time) is pure wasted work -
// every response payload gets JSON-decoded twice for no benefit.
type Envelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Error   string          `json:"error"`
}

// path is []string that always marshals as a JSON array, including
// when nil. Every VyOS REST endpoint that accepts a "path" field
// requires it to be present and be a list; encoding/json marshals a
// nil []string as the JSON literal `null`, which VyOS's own request
// middleware explicitly rejects with "'path' field must be a list"
// (see src/services/api/rest/routers.py in vyos-1x). A nil path is a
// completely normal value on this client's side — it means "the whole
// configuration" for ShowConfig, for instance — so every request
// struct with a required path field uses this type instead of a bare
// []string to make that distinction impossible to get wrong at a call
// site, rather than relying on every caller to remember to normalize
// nil to []string{} by hand.
type path []string

func (p path) MarshalJSON() ([]byte, error) {
	if p == nil {
		return []byte("[]"), nil
	}
	return json.Marshal([]string(p))
}

// ConfigOp is a single set/delete/comment operation, as accepted by the
// /configure endpoint (either standalone or as an entry of "commands").
type ConfigOp struct {
	Op string `json:"op"` // "set" | "delete" | "comment"
	// Path uses the custom-marshaling path type (see its doc comment
	// above) rather than a bare []string, so a nil path here can never
	// accidentally marshal as JSON `null` and get rejected by VyOS's
	// "'path' field must be a list" check.
	Path  path   `json:"path"`
	Value string `json:"value,omitempty"`
}

const (
	OpSet     = "set"
	OpDelete  = "delete"
	OpComment = "comment"
)

// configureSingle mirrors ConfigureModel (models.py): a single operation
// plus an optional confirm_time.
type configureSingle struct {
	Op          string `json:"op"`
	Path        path   `json:"path"`
	Value       string `json:"value,omitempty"`
	ConfirmTime int    `json:"confirm_time,omitempty"`
}

// configureList mirrors ConfigureListModel: a batch of operations
// committed as a single transaction, plus an optional confirm_time.
type configureList struct {
	Commands    []ConfigOp `json:"commands"`
	ConfirmTime int        `json:"confirm_time,omitempty"`
}

// confirmOp is the request payload for confirming a pending
// commit-confirm via /config-file (see Client.ConfigFileConfirm).
// Deliberately not used against /configure - that endpoint requires a
// non-empty 'path' on every command, with no exception for the
// confirm pseudo-op.
type confirmOp struct {
	Op string `json:"op"` // always "confirm"
}

// RetrieveOp is the request payload for /retrieve.
type retrieveOp struct {
	Op           string `json:"op"` // "showConfig" | "exists" | "returnValue" | "returnValues"
	Path         path   `json:"path"`
	ConfigFormat string `json:"configFormat,omitempty"`
}

// configFileOp is the request payload for /config-file.
type configFileOp struct {
	Op          string `json:"op"` // "save" | "load" | "merge" | "confirm"
	File        string `json:"file,omitempty"`
	String      string `json:"string,omitempty"`
	ConfirmTime int    `json:"confirm_time,omitempty"`
	Destructive bool   `json:"destructive,omitempty"`
}

// pathOp is the request payload shared by /show, /reboot, /poweroff,
// /reset and /generate: a fixed "op" literal plus a path.
type pathOp struct {
	Op   string `json:"op"`
	Path path   `json:"path"`
}

// containerImageOp is the request payload for /container-image
// (ContainerImageModel in vyos-1x's models.py) - a genuinely different
// shape from pathOp: "name" instead of "path", and no generic op-mode
// path dispatch at all (this is its own dedicated endpoint, unlike
// /show/etc which all share pathOp). Notably, the real REST model has
// no "force" field, even though the underlying CLI command
// (`delete container image <name> force`) supports one - see
// Client.DeleteContainerImage's doc comment for why that means this
// app can't offer a force-delete option at all.
type containerImageOp struct {
	Op   string `json:"op"` // "add" | "delete" | "show"
	Name string `json:"name,omitempty"`
}

// systemImageOp is the request payload for /image (VyOS's own system
// image install/rollback endpoint - distinct entirely from
// /container-image, which manages podman images, not VyOS releases
// itself). "add" takes a url; "delete" takes a name. Confirmed against
// docs.vyos.io's VyOS API page: unlike the CLI's `add system image
// <url>` (which interactively prompts for an image name and a
// signature-check bypass), the REST model only accepts a URL - VyOS's
// own REST wrapper answers those prompts itself, non-interactively.
type systemImageOp struct {
	Op   string `json:"op"` // "add" | "delete"
	URL  string `json:"url,omitempty"`
	Name string `json:"name,omitempty"`
}

// InfoResponse is the payload of the unauthenticated GET /info endpoint.
type InfoResponse struct {
	Version  string `json:"version"`
	Hostname string `json:"hostname"`
	Banner   string `json:"banner"`
}
