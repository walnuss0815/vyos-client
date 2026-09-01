// Package mask identifies and redacts sensitive values in VyOS
// configuration trees (API keys, PSKs, RADIUS/TACACS+ secrets,
// WireGuard private keys, SNMP communities, and similar) so they are
// never displayed unmasked by default in the UI, nor written unmasked
// to backend logs.
//
// Unlike system login user passwords (which VyOS itself hashes on
// commit and never returns in plaintext), many other secret-shaped
// leaves ARE returned verbatim by the VyOS API's /retrieve endpoint,
// so masking has to happen on our side.
package mask

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed sensitive-fields.json
var sensitiveFieldsJSON []byte

// This file must stay byte-for-byte identical to /shared/sensitive-fields.json
// at the repository root, which is the single source of truth shared with
// the frontend. mask_test.go asserts this.

type fieldList struct {
	SensitiveLeafNames   []string `json:"sensitiveLeafNames"`
	SensitiveKeyPatterns []string `json:"sensitiveKeyPatterns"`
}

var sensitiveLeafNames map[string]struct{}
var sensitiveKeyPatterns []string

func init() {
	var fl fieldList
	if err := json.Unmarshal(sensitiveFieldsJSON, &fl); err != nil {
		panic("mask: embedded sensitive-fields.json is malformed: " + err.Error())
	}
	sensitiveLeafNames = make(map[string]struct{}, len(fl.SensitiveLeafNames))
	for _, name := range fl.SensitiveLeafNames {
		sensitiveLeafNames[normalize(name)] = struct{}{}
	}
	sensitiveKeyPatterns = make([]string, len(fl.SensitiveKeyPatterns))
	for i, pattern := range fl.SensitiveKeyPatterns {
		sensitiveKeyPatterns[i] = normalize(pattern)
	}
}

func normalize(s string) string {
	return strings.ToLower(strings.ReplaceAll(s, "_", "-"))
}

// MaskPlaceholder is what a masked value is displayed as.
const MaskPlaceholder = "••••••••"

// IsSensitiveLeaf reports whether a config leaf's name (the last
// segment of its path, e.g. "password" in
// ["system","login","user","x","authentication","plaintext-password"])
// should be treated as a secret.
func IsSensitiveLeaf(leafName string) bool {
	_, ok := sensitiveLeafNames[normalize(leafName)]
	return ok
}

// IsSensitivePath is a convenience wrapper for IsSensitiveLeaf that
// takes a full path and checks its last segment. Returns false for an
// empty path.
func IsSensitivePath(path []string) bool {
	if len(path) == 0 {
		return false
	}
	return IsSensitiveLeaf(path[len(path)-1])
}

// IsSensitiveIdentifier reports whether name - a tag-node's own
// free-form identifier, e.g. a container environment variable's key
// ("DB_PASSWORD" in `environment DB_PASSWORD value ...`), not a fixed
// VyOS schema leaf name - looks like a secret, via a case-insensitive
// substring match against sensitiveKeyPatterns (see
// shared/sensitive-fields.json's own comment on that list). This is a
// deliberately different, broader kind of match than IsSensitiveLeaf's
// exact match: an identifier is something an operator chose
// (e.g. "STRIPE_API_KEY"), not one of a small fixed set of schema leaf
// names, so substring matching is needed to catch compound names -
// see IsMaskedPath for why this is only ever combined with the
// generic "value" leaf shape, never applied to arbitrary map keys
// throughout a config tree.
func IsSensitiveIdentifier(name string) bool {
	normalized := normalize(name)
	for _, pattern := range sensitiveKeyPatterns {
		if strings.Contains(normalized, pattern) {
			return true
		}
	}
	return false
}

// IsMaskedPath reports whether the leaf at path should be masked -
// either because its own leaf name is an exact sensitive match (see
// IsSensitivePath), or because it's the generic "value" leaf of a
// tag-node collection (container/event-handler environment variables,
// labels, sysctl parameters, and any future config shaped the same
// way: `<tag> <identifier> value <value>`) whose own identifier - the
// second-to-last path segment - looks sensitive, e.g.
// [...,"environment","DB_PASSWORD","value"]. The literal "value" leaf
// name is deliberately never added to sensitiveLeafNames itself (it's
// far too generic to blanket-mask everywhere it appears in VyOS's
// schema - most "value" leaves hold nothing secret at all), so this
// identifier-aware check is the only path that catches this specific
// shape. Checking only the last two segments (not the leaf's own
// ancestry beyond that) is deliberate: it keeps this correct
// regardless of how deep the tag-node collection itself is nested.
func IsMaskedPath(path []string) bool {
	if IsSensitivePath(path) {
		return true
	}
	if len(path) < 2 || path[len(path)-1] != "value" {
		return false
	}
	return IsSensitiveIdentifier(path[len(path)-2])
}

// Value returns value unchanged if path is not masked, or
// MaskPlaceholder if it is (see IsMaskedPath).
func Value(path []string, value string) string {
	if IsMaskedPath(path) {
		return MaskPlaceholder
	}
	return value
}

// Tree returns a deep copy of a VyOS showConfig-shaped JSON tree
// (nested map[string]any, with leaves as string, []any/[]string, or
// empty map[string]any for flag nodes) with every value under a
// sensitive leaf name replaced by MaskPlaceholder. Used before logging
// a config tree, and as the backend-side defense-in-depth complement to
// the frontend's own masking (which additionally offers a reveal
// toggle backed by the unmasked value).
//
// path is grown via append(path, k) rather than copied at each level.
// This is safe despite append's usual aliasing hazard (two sibling
// calls can share a backing array when it has spare capacity) because
// every call to Tree fully finishes - including any further appends it
// makes for its own children - before the next sibling's append runs:
// Go map iteration is sequential, and nothing here retains path beyond
// its own synchronous execution (the returned tree never references
// it). Do not store or return path itself, or call Tree concurrently
// over the same node, without revisiting this.
func Tree(node any, path []string) any {
	switch v := node.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for k, child := range v {
			out[k] = Tree(child, append(path, k))
		}
		return out
	case []any:
		if IsMaskedPath(path) {
			return maskSlice(len(v))
		}
		out := make([]any, len(v))
		for i, child := range v {
			out[i] = Tree(child, path)
		}
		return out
	case string:
		if IsMaskedPath(path) {
			return MaskPlaceholder
		}
		return v
	default:
		return v
	}
}

func maskSlice(n int) []any {
	out := make([]any, n)
	for i := range out {
		out[i] = MaskPlaceholder
	}
	return out
}
