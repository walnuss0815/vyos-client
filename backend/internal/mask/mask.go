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
	SensitiveLeafNames []string `json:"sensitiveLeafNames"`
}

var sensitiveLeafNames map[string]struct{}

func init() {
	var fl fieldList
	if err := json.Unmarshal(sensitiveFieldsJSON, &fl); err != nil {
		panic("mask: embedded sensitive-fields.json is malformed: " + err.Error())
	}
	sensitiveLeafNames = make(map[string]struct{}, len(fl.SensitiveLeafNames))
	for _, name := range fl.SensitiveLeafNames {
		sensitiveLeafNames[normalize(name)] = struct{}{}
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

// Value returns value unchanged if path is not sensitive, or
// MaskPlaceholder if it is.
func Value(path []string, value string) string {
	if IsSensitivePath(path) {
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
		if IsSensitivePath(path) {
			return maskSlice(len(v))
		}
		out := make([]any, len(v))
		for i, child := range v {
			out[i] = Tree(child, path)
		}
		return out
	case string:
		if IsSensitivePath(path) {
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
