package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

type pkiExpiryEntry struct {
	Name string `json:"name"`
	// NotBefore/NotAfter are nil (and Error is set instead) when the
	// stored certificate couldn't be parsed - e.g. no certificate PEM
	// has been pasted in for this entry yet (this app's PKI area
	// allows creating a name with no certificate at all - see
	// pkiTypes.ts) or it's genuinely malformed.
	NotBefore *time.Time `json:"notBefore,omitempty"`
	NotAfter  *time.Time `json:"notAfter,omitempty"`
	Error     string     `json:"error,omitempty"`
}

type pkiExpiryResponse struct {
	Certificates []pkiExpiryEntry `json:"certificates"`
	CAs          []pkiExpiryEntry `json:"cas"`
}

// handlePKIExpiry serves GET /api/pki/expiry - validity windows for
// every configured `pki certificate <name>` and `pki ca <name>`,
// parsed server-side (vyos.ParsePKICertificateExpiry) from the same
// certificate PEM the generic GET /api/config/tree?path=pki endpoint
// already exposes unmasked (see pkiTypes.ts's doc comment on
// certificates deliberately not being masked). A dedicated endpoint
// rather than folding this into the config-tree response because it
// needs real parsing logic (X.509 decoding), unlike every other field
// in that generic, purely-passthrough endpoint.
func (s *Server) handlePKIExpiry(w http.ResponseWriter, r *http.Request) {
	tree, err := s.VyOS.ShowConfig(r.Context(), []string{"pki"})
	if err != nil {
		if vyos.IsEmptyPath(err) {
			writeJSON(w, http.StatusOK, pkiExpiryResponse{Certificates: []pkiExpiryEntry{}, CAs: []pkiExpiryEntry{}})
			return
		}
		s.handleVyOSError(w, "fetching PKI configuration", err)
		return
	}

	root, _ := tree.(map[string]any)
	writeJSON(w, http.StatusOK, pkiExpiryResponse{
		Certificates: parsePKIExpiryEntries(root["certificate"]),
		CAs:          parsePKIExpiryEntries(root["ca"]),
	})
}

// parsePKIExpiryEntries walks one of `pki`'s "certificate" or "ca"
// tagNode maps (name -> {certificate: "<base64>", ...}), sorted by
// name for a stable response order (Go map iteration order is
// randomized, and this is a plain JSON array with no other ordering
// signal).
func parsePKIExpiryEntries(node any) []pkiExpiryEntry {
	m, ok := node.(map[string]any)
	if !ok {
		return []pkiExpiryEntry{}
	}
	names := make([]string, 0, len(m))
	for name := range m {
		names = append(names, name)
	}
	sort.Strings(names)

	out := make([]pkiExpiryEntry, 0, len(names))
	for _, name := range names {
		entry := pkiExpiryEntry{Name: name}
		raw, _ := m[name].(map[string]any)
		certBase64, _ := raw["certificate"].(string)
		if certBase64 == "" {
			entry.Error = "no certificate stored"
			out = append(out, entry)
			continue
		}
		notBefore, notAfter, err := vyos.ParsePKICertificateExpiry(certBase64)
		if err != nil {
			entry.Error = "could not parse certificate"
		} else {
			entry.NotBefore = &notBefore
			entry.NotAfter = &notAfter
		}
		out = append(out, entry)
	}
	return out
}
