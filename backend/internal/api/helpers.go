package api

import (
	"encoding/json"
	"net/http"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type errorBody struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorBody{Error: msg})
}

// maxRequestBodyBytes bounds every JSON request body this BFF accepts.
// Generous enough for the largest legitimate request (a full commit
// batch for a large firewall ruleset), while preventing an
// authenticated client from making the server buffer an arbitrarily
// large body before any size-based rejection - VyOS's own
// request-body-size-limit is a separate, downstream concern the BFF
// shouldn't rely on as its only defense.
const maxRequestBodyBytes = 2 << 20 // 2 MiB

// decodeJSON reads and decodes a JSON request body, rejecting unknown
// fields to catch client/server contract drift early, and capping the
// body size at maxRequestBodyBytes.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}
