package api

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/walnuss0815/vyos-client/backend/internal/ingress"
)

// ingressHeaderResponse deliberately never carries the header's
// actual Value - once configured, a header value (often a bearer
// token or API key - see Entry.Headers's doc comment) is never
// re-displayed by this API, only replaced. See
// ingressHeaderRequest/resolveHeaderValues for how an edit that
// leaves a header's value blank keeps the existing one instead of
// clearing it.
type ingressHeaderResponse struct {
	Name string `json:"name"`
}

type ingressEntryResponse struct {
	Name          string                  `json:"name"`
	Description   string                  `json:"description,omitempty"`
	TargetURL     string                  `json:"targetUrl"`
	Headers       []ingressHeaderResponse `json:"headers"`
	SkipTLSVerify bool                    `json:"skipTlsVerify"`
}

func toIngressEntryResponse(e ingress.Entry) ingressEntryResponse {
	headers := make([]ingressHeaderResponse, 0, len(e.Headers))
	for _, h := range e.Headers {
		headers = append(headers, ingressHeaderResponse{Name: h.Name})
	}
	return ingressEntryResponse{
		Name:          e.Name,
		Description:   e.Description,
		TargetURL:     e.TargetURL,
		Headers:       headers,
		SkipTLSVerify: e.SkipTLSVerify,
	}
}

type ingressListResponse struct {
	Entries []ingressEntryResponse `json:"entries"`
}

// ingressHeaderRequest mirrors ingress.Header for request bodies. An
// empty Value on Update means "keep the previously stored value for a
// header with this name" (see resolveHeaderValues) rather than
// "clear it" - Create has no previous value to fall back to, so an
// empty Value there is always rejected by ingress.Validate.
type ingressHeaderRequest struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type ingressEntryRequest struct {
	Name          string                 `json:"name"`
	Description   string                 `json:"description"`
	TargetURL     string                 `json:"targetUrl"`
	Headers       []ingressHeaderRequest `json:"headers"`
	SkipTLSVerify bool                   `json:"skipTlsVerify"`
}

// resolveHeaderValues converts a request body's headers into stored
// ingress.Header values, substituting a header's previously stored
// value whenever the request leaves that header's Value blank -
// otherwise editing an entry through the UI (which never re-displays
// existing header values - see ingressHeaderResponse) would force
// re-typing every header's secret on every unrelated edit, or worse,
// silently blank it out. previous is nil for a brand new entry (there
// being nothing to fall back to), in which case a blank Value always
// falls through to the "requires a value" error below - the same
// outcome ingress.Validate would separately reject anyway, just with
// a clearer, per-header message here first.
func resolveHeaderValues(previous []ingress.Header, requested []ingressHeaderRequest) ([]ingress.Header, error) {
	previousByName := make(map[string]string, len(previous))
	for _, h := range previous {
		previousByName[strings.ToLower(h.Name)] = h.Value
	}
	out := make([]ingress.Header, 0, len(requested))
	for _, h := range requested {
		value := h.Value
		if value == "" {
			existing, ok := previousByName[strings.ToLower(h.Name)]
			if !ok {
				return nil, fmt.Errorf("header %q requires a value", h.Name)
			}
			value = existing
		}
		out = append(out, ingress.Header{Name: h.Name, Value: value})
	}
	return out, nil
}

// writeIngressError maps an ingress package error to the appropriate
// HTTP status: validation/duplicate-name/not-found errors are the
// caller's fault (400/409/404); anything else (a failed disk write -
// see Store.persistLocked) is this server's fault (500), and is
// logged since it points at a real operational problem (e.g. the
// mounted data volume filling up or going read-only) rather than a
// simple bad request.
func (s *Server) writeIngressError(w http.ResponseWriter, action string, err error) {
	switch {
	case errors.Is(err, ingress.ErrAlreadyExists):
		writeError(w, http.StatusConflict, strings.TrimPrefix(err.Error(), "ingress: "))
	case errors.Is(err, ingress.ErrNotFound):
		writeError(w, http.StatusNotFound, strings.TrimPrefix(err.Error(), "ingress: "))
	default:
		s.Logger.Error(action, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save ingress configuration; contact your administrator")
	}
}

// handleIngressList serves GET /api/ingress - the Ingress management
// page's and sidebar nav group's data source. Returns an empty list
// (not an error) when the feature is disabled, same "enabled: false
// means don't touch anything, but don't error either" reasoning as
// handleSelfUpgradeStatus.
func (s *Server) handleIngressList(w http.ResponseWriter, r *http.Request) {
	if s.IngressStore == nil {
		writeJSON(w, http.StatusOK, ingressListResponse{Entries: []ingressEntryResponse{}})
		return
	}
	entries := s.IngressStore.List()
	out := make([]ingressEntryResponse, 0, len(entries))
	for _, e := range entries {
		out = append(out, toIngressEntryResponse(e))
	}
	writeJSON(w, http.StatusOK, ingressListResponse{Entries: out})
}

// handleIngressGet serves GET /api/ingress/{name}.
func (s *Server) handleIngressGet(w http.ResponseWriter, r *http.Request) {
	if s.IngressStore == nil {
		writeError(w, http.StatusNotFound, "ingress is not enabled")
		return
	}
	entry, ok := s.IngressStore.Get(r.PathValue("name"))
	if !ok {
		writeError(w, http.StatusNotFound, "no such ingress")
		return
	}
	writeJSON(w, http.StatusOK, toIngressEntryResponse(entry))
}

// handleIngressCreate serves POST /api/ingress.
func (s *Server) handleIngressCreate(w http.ResponseWriter, r *http.Request) {
	if s.IngressStore == nil {
		writeError(w, http.StatusNotFound, "ingress is not enabled")
		return
	}
	var body ingressEntryRequest
	if err := decodeJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	headers, err := resolveHeaderValues(nil, body.Headers)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	entry := ingress.Entry{
		Name:          body.Name,
		Description:   body.Description,
		TargetURL:     body.TargetURL,
		Headers:       headers,
		SkipTLSVerify: body.SkipTLSVerify,
	}
	if err := ingress.Validate(entry); err != nil {
		writeError(w, http.StatusBadRequest, strings.TrimPrefix(err.Error(), "ingress: "))
		return
	}
	created, err := s.IngressStore.Create(entry)
	if err != nil {
		s.writeIngressError(w, "creating ingress entry", err)
		return
	}
	writeJSON(w, http.StatusCreated, toIngressEntryResponse(created))
}

// handleIngressUpdate serves PUT /api/ingress/{name}. The entry's
// Name is always taken from the path, not the request body - it's
// immutable after creation (same tagNode-rename restriction VyOS
// itself effectively has - delete and re-create instead), so there's
// no ambiguity to resolve if a client sent a different value in the
// body.
func (s *Server) handleIngressUpdate(w http.ResponseWriter, r *http.Request) {
	if s.IngressStore == nil {
		writeError(w, http.StatusNotFound, "ingress is not enabled")
		return
	}
	name := r.PathValue("name")
	previous, ok := s.IngressStore.Get(name)
	if !ok {
		writeError(w, http.StatusNotFound, "no such ingress")
		return
	}

	var body ingressEntryRequest
	if err := decodeJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	headers, err := resolveHeaderValues(previous.Headers, body.Headers)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	entry := ingress.Entry{
		Name:          name,
		Description:   body.Description,
		TargetURL:     body.TargetURL,
		Headers:       headers,
		SkipTLSVerify: body.SkipTLSVerify,
	}
	if err := ingress.Validate(entry); err != nil {
		writeError(w, http.StatusBadRequest, strings.TrimPrefix(err.Error(), "ingress: "))
		return
	}
	updated, err := s.IngressStore.Update(entry)
	if err != nil {
		s.writeIngressError(w, "updating ingress entry", err)
		return
	}
	writeJSON(w, http.StatusOK, toIngressEntryResponse(updated))
}

// handleIngressDelete serves DELETE /api/ingress/{name}.
func (s *Server) handleIngressDelete(w http.ResponseWriter, r *http.Request) {
	if s.IngressStore == nil {
		writeError(w, http.StatusNotFound, "ingress is not enabled")
		return
	}
	if err := s.IngressStore.Delete(r.PathValue("name")); err != nil {
		s.writeIngressError(w, "deleting ingress entry", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
