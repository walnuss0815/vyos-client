package api

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/walnuss0815/vyos-client/backend/internal/auth"
	"github.com/walnuss0815/vyos-client/backend/internal/mask"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// minConfirmSeconds / maxConfirmSeconds bound the commit-confirm
// countdown offered by the "Safe apply" toggle. Keep in sync with the
// min/max on the confirmSeconds <input> in PendingChangesBar.tsx.
const (
	minConfirmSeconds = 10
	maxConfirmSeconds = 600
)

// splitPath parses a comma-separated ?path= query parameter into a
// VyOS path segment list. An empty/missing parameter means "the whole
// configuration".
func splitPath(r *http.Request) []string {
	raw := r.URL.Query().Get("path")
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

type configTreeResponse struct {
	// Data is the (masked) configuration tree under the requested
	// path, or nil if nothing is configured there.
	Data any `json:"data"`
}

func (s *Server) handleGetConfigTree(w http.ResponseWriter, r *http.Request) {
	path := splitPath(r)

	tree, err := s.VyOS.ShowConfig(r.Context(), path)
	if err != nil {
		if vyos.IsEmptyPath(err) {
			writeJSON(w, http.StatusOK, configTreeResponse{Data: nil})
			return
		}
		s.handleVyOSError(w, "fetching configuration", err)
		return
	}

	masked := mask.Tree(tree, path)
	writeJSON(w, http.StatusOK, configTreeResponse{Data: masked})
}

type setCommandsResponse struct {
	Text string `json:"text"`
}

func (s *Server) handleGetSetCommands(w http.ResponseWriter, r *http.Request) {
	text, err := s.VyOS.Show(r.Context(), []string{"configuration", "commands"})
	if err != nil {
		s.handleVyOSError(w, "fetching set-commands", err)
		return
	}
	writeJSON(w, http.StatusOK, setCommandsResponse{Text: mask.RedactSetCommands(text)})
}

type commitOpRequest struct {
	Op    string   `json:"op"`
	Path  []string `json:"path"`
	Value string   `json:"value,omitempty"`
}

type commitRequest struct {
	Ops            []commitOpRequest `json:"ops"`
	ConfirmSeconds int               `json:"confirmSeconds,omitempty"`
}

type commitResponse struct {
	PendingConfirm bool `json:"pendingConfirm"`
}

func (s *Server) handleCommit(w http.ResponseWriter, r *http.Request) {
	var req commitRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "malformed request")
		return
	}
	if len(req.Ops) == 0 {
		writeError(w, http.StatusBadRequest, "no operations to apply")
		return
	}
	// Matches the "Safe apply" input's min/max in PendingChangesBar.tsx.
	// Those HTML attributes are advisory only (trivially bypassed by
	// any direct API client), so the actual bound has to live here: a
	// 1-second window is close to useless (network latency alone could
	// exceed it), and an absurdly large value leaves the system in
	// "pending confirm" limbo if the operator forgets to confirm. 0
	// (disabling safe apply entirely) is always valid.
	if req.ConfirmSeconds != 0 && (req.ConfirmSeconds < minConfirmSeconds || req.ConfirmSeconds > maxConfirmSeconds) {
		writeError(w, http.StatusBadRequest, fmt.Sprintf(
			"confirmSeconds must be 0 (disabled) or between %d and %d", minConfirmSeconds, maxConfirmSeconds))
		return
	}

	ops := make([]vyos.ConfigOp, 0, len(req.Ops))
	for _, o := range req.Ops {
		if len(o.Path) == 0 {
			writeError(w, http.StatusBadRequest, "every operation must have a non-empty path")
			return
		}
		switch o.Op {
		case vyos.OpSet, vyos.OpDelete, vyos.OpComment:
		default:
			writeError(w, http.StatusBadRequest, "op must be one of set, delete, comment")
			return
		}
		ops = append(ops, vyos.ConfigOp{Op: o.Op, Path: o.Path, Value: o.Value})
	}

	// The VyOS API's confirm_time is expressed in minutes; the UI
	// works in seconds for a friendlier countdown granularity, so
	// round up to at least one minute if the caller asked for any
	// confirmation window at all.
	confirmMinutes := 0
	if req.ConfirmSeconds > 0 {
		confirmMinutes = (req.ConfirmSeconds + 59) / 60
	}

	if err := s.VyOS.Configure(r.Context(), ops, confirmMinutes); err != nil {
		s.handleVyOSError(w, "applying configuration", err)
		return
	}

	writeJSON(w, http.StatusOK, commitResponse{PendingConfirm: confirmMinutes > 0})
}

func (s *Server) handleCommitConfirm(w http.ResponseWriter, r *http.Request) {
	// Routed through /config-file (ConfigFileConfirm), not /configure:
	// real VyOS's /configure endpoint requires every command to carry a
	// non-empty 'path', with no exception for the confirm pseudo-op, so
	// a pathless {"op":"confirm"} is rejected there with "Malformed
	// command ...: missing 'path' field". /config-file has no such
	// requirement and confirms the exact same session-scoped pending
	// commit-confirm regardless of which endpoint started the timer.
	if err := s.VyOS.ConfigFileConfirm(r.Context()); err != nil {
		s.handleVyOSError(w, "confirming configuration", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type importRequest struct {
	Content        string `json:"content"`
	Mode           string `json:"mode"` // "merge" | "load"
	ConfirmSeconds int    `json:"confirmSeconds,omitempty"`
}

// handleImportConfig applies an uploaded configuration file. Two
// modes, both ultimately backed by VyOS's /config-file endpoint (see
// vyos.Client.ConfigFileMerge/ConfigFileLoad's doc comments for the
// semantic difference and the "load" lockout risk):
//   - merge: additive overlay onto the current running config.
//   - load: full replace of the candidate config - can lock the
//     caller out of the HTTPS API (and this app) if the uploaded file
//     doesn't include a working `service https` setup. The frontend
//     is expected to warn prominently and strongly encourage a
//     confirmSeconds window before calling this with mode=load; this
//     handler doesn't refuse an unconfirmed load outright (an
//     operator who knows what they're doing shouldn't be blocked),
//     but does enforce the same confirmSeconds bounds as handleCommit
//     when a window is requested at all.
func (s *Server) handleImportConfig(w http.ResponseWriter, r *http.Request) {
	var req importRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "malformed request")
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		writeError(w, http.StatusBadRequest, "content must not be empty")
		return
	}
	if req.Mode != "merge" && req.Mode != "load" {
		writeError(w, http.StatusBadRequest, "mode must be one of merge, load")
		return
	}
	if req.ConfirmSeconds != 0 && (req.ConfirmSeconds < minConfirmSeconds || req.ConfirmSeconds > maxConfirmSeconds) {
		writeError(w, http.StatusBadRequest, fmt.Sprintf(
			"confirmSeconds must be 0 (disabled) or between %d and %d", minConfirmSeconds, maxConfirmSeconds))
		return
	}

	// Same seconds-to-minutes rounding as handleCommit.
	confirmMinutes := 0
	if req.ConfirmSeconds > 0 {
		confirmMinutes = (req.ConfirmSeconds + 59) / 60
	}

	var err error
	if req.Mode == "load" {
		err = s.VyOS.ConfigFileLoad(r.Context(), req.Content, confirmMinutes)
	} else {
		err = s.VyOS.ConfigFileMerge(r.Context(), req.Content, confirmMinutes)
	}
	if err != nil {
		s.handleVyOSError(w, "importing configuration", err)
		return
	}

	writeJSON(w, http.StatusOK, commitResponse{PendingConfirm: confirmMinutes > 0})
}

type saveRequest struct {
	File string `json:"file,omitempty"`
}

func (s *Server) handleSave(w http.ResponseWriter, r *http.Request) {
	var req saveRequest
	// io.EOF means no body was sent at all (the default, empty save
	// request), which is valid - not a malformed one. Checking
	// r.ContentLength != 0 instead would be wrong: ContentLength is -1
	// (not 0) for a chunked/unknown-length body, e.g. HTTP/2 or any
	// client that doesn't pre-compute a Content-Length header, which
	// would wrongly be treated as "has a body" and fail decoding.
	if err := decodeJSON(w, r, &req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "malformed request")
		return
	}
	if err := s.VyOS.ConfigFileSave(r.Context(), req.File); err != nil {
		s.handleVyOSError(w, "saving configuration", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type revealRequest struct {
	Path []string `json:"path"`
}

type revealResponse struct {
	Value string `json:"value"`
}

// handleReveal returns the real, unmasked value of a single sensitive
// config leaf on demand - the one deliberate, explicitly-audited
// bypass of the masking every other config-reading endpoint applies
// (internal/mask). POST, not GET: the target path is itself a hint
// about which secret is being revealed, so it's kept out of a URL
// (unlike GET /api/config/tree?path=...), which browser history, the
// visible address bar, and some proxy/access logs would otherwise
// capture more readily than a request body.
//
// Deliberately scoped to sensitive leaves only - rejecting a
// non-sensitive path keeps this endpoint's audit log meaningful
// (every entry really is a secret being revealed) and its blast
// radius no wider than its stated purpose. A non-sensitive value is
// already visible via the ordinary GET /api/config/tree endpoint, so
// there's no reason to route it through here too.
//
// Deliberately does not support multi-value (array) leaves: VyOS's
// own returnValue op is documented as single-value only, and every
// sensitive leaf this app has encountered in practice (API keys,
// PSKs, passwords) is single-valued anyway - see docs/security.md for
// this and the other scope decisions (no step-up re-authentication in
// v1; relies on the same session+CSRF gate as every other
// authenticated endpoint).
func (s *Server) handleReveal(w http.ResponseWriter, r *http.Request) {
	var req revealRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "malformed request")
		return
	}
	if len(req.Path) == 0 {
		writeError(w, http.StatusBadRequest, "path must not be empty")
		return
	}
	if !mask.IsSensitivePath(req.Path) {
		writeError(w, http.StatusBadRequest, "this endpoint only reveals sensitive config leaves")
		return
	}

	value, err := s.VyOS.ReturnValue(r.Context(), req.Path)
	if err != nil {
		s.handleVyOSError(w, "revealing value", err)
		return
	}

	// Every successful reveal is logged at Warn (not Info) so it's
	// easy to grep/alert on separately from ordinary request traffic -
	// this is the audit trail the roadmap's "explicitly-audited
	// endpoint" framing calls for. A failed attempt (bad path, VyOS
	// unreachable, ...) is already covered by the generic request
	// logger and handleVyOSError's own error-level logging; it isn't
	// a security event worth a second log line.
	user, _ := auth.UserFromContext(r.Context())
	s.Logger.Warn("sensitive value revealed", "user", user, "path", strings.Join(req.Path, " "))

	writeJSON(w, http.StatusOK, revealResponse{Value: value})
}

// handleVyOSError maps a vyos.APIError to an appropriate HTTP status
// and a message safe to show the user. A 401 from VyOS means our own
// stored VYOS_API_KEY is wrong or was revoked — that's a deployment
// misconfiguration, not something the end user did, so it's reported
// generically (with full detail logged server-side) rather than
// leaking API-key-related internals to the browser.
func (s *Server) handleVyOSError(w http.ResponseWriter, action string, err error) {
	apiErr, ok := err.(*vyos.APIError)
	if !ok {
		s.Logger.Error("vyos api call failed", "action", action, "error", err)
		writeError(w, http.StatusBadGateway, "failed "+action)
		return
	}

	switch apiErr.StatusCode {
	case http.StatusUnauthorized:
		s.Logger.Error("vyos api key rejected", "action", action, "error", apiErr.Message)
		writeError(w, http.StatusInternalServerError, "server is misconfigured (VyOS API key rejected); contact your administrator")
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		// Typically a real validation error from VyOS's commit
		// process (e.g. "Protocol must be defined if specifying a
		// port"); safe and useful to show the user directly.
		writeError(w, http.StatusUnprocessableEntity, apiErr.Message)
	default:
		s.Logger.Error("vyos api call failed", "action", action, "error", apiErr.Message, "status", apiErr.StatusCode)
		writeError(w, http.StatusBadGateway, "failed "+action)
	}
}
