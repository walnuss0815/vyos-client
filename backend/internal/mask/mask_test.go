package mask_test

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/mask"
)

func TestIsSensitiveLeaf(t *testing.T) {
	cases := map[string]bool{
		"password":           true,
		"Password":           true, // case-insensitive
		"plaintext-password": true,
		"plaintext_password": true, // underscore normalization
		"pre-shared-key":     true,
		"community":          true,
		"key":                true,
		"secret":             true,
		"host-name":          false,
		"address":            false,
		"description":        false,
		"interface":          false,
	}
	for name, want := range cases {
		if got := mask.IsSensitiveLeaf(name); got != want {
			t.Errorf("IsSensitiveLeaf(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestIsSensitivePath(t *testing.T) {
	if !mask.IsSensitivePath([]string{"service", "https", "api", "keys", "id", "ui", "key"}) {
		t.Error("expected api key path to be sensitive")
	}
	if mask.IsSensitivePath([]string{"system", "host-name"}) {
		t.Error("expected host-name path to not be sensitive")
	}
	if mask.IsSensitivePath(nil) {
		t.Error("expected empty path to not be sensitive")
	}
}

func TestIsSensitiveIdentifier(t *testing.T) {
	cases := map[string]bool{
		"DB_PASSWORD":     true,
		"db-password":     true, // underscore/hyphen both normalize
		"STRIPE_API_KEY":  true, // "key" substring
		"SESSION_SECRET":  true, // "secret" substring
		"AUTH_TOKEN":      true, // "auth" and "token" both match
		"MYSQL_PWD":       true, // "pwd" substring
		"TLS_PRIVATE_KEY": true, // "private" and "key" both match
		"TZ":              false,
		"NODE_ENV":        false,
		"LOG_LEVEL":       false,
		"PORT":            false,
	}
	for name, want := range cases {
		if got := mask.IsSensitiveIdentifier(name); got != want {
			t.Errorf("IsSensitiveIdentifier(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestIsMaskedPath(t *testing.T) {
	tests := []struct {
		name string
		path []string
		want bool
	}{
		{"exact leaf-name match still works", []string{"system", "login", "user", "x", "authentication", "plaintext-password"}, true},
		{"non-sensitive leaf", []string{"system", "host-name"}, false},
		{"empty path", nil, false},
		{"sensitive identifier + generic value leaf", []string{"container", "name", "web", "environment", "DB_PASSWORD", "value"}, true},
		{"non-sensitive identifier + generic value leaf", []string{"container", "name", "web", "environment", "TZ", "value"}, false},
		{"event-handler environment variable, same shape", []string{"service", "event-handler", "x", "script", "environment", "API_TOKEN", "value"}, true},
		{"a bare 'value' leaf with nothing before it", []string{"value"}, false},
		{
			// A leaf literally named "value" whose *parent* isn't a
			// sensitive-looking identifier must not be masked just
			// because some other unrelated ancestor further up the
			// path happens to look sensitive - only the immediate
			// second-to-last segment is checked.
			"value leaf with a non-matching immediate parent, even under an unrelated sensitive-looking ancestor",
			[]string{"container", "name", "my-secret-app", "environment", "TZ", "value"},
			false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := mask.IsMaskedPath(tt.path); got != tt.want {
				t.Errorf("IsMaskedPath(%v) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestValue(t *testing.T) {
	if got := mask.Value([]string{"system", "login", "user", "x", "authentication", "plaintext-password"}, "hunter2"); got != mask.MaskPlaceholder {
		t.Errorf("Value(sensitive) = %q, want mask placeholder", got)
	}
	if got := mask.Value([]string{"system", "host-name"}, "router1"); got != "router1" {
		t.Errorf("Value(non-sensitive) = %q, want unchanged", got)
	}
}

func TestTree_MasksNestedSecrets(t *testing.T) {
	config := map[string]any{
		"system": map[string]any{
			"host-name": "router1",
		},
		"service": map[string]any{
			"https": map[string]any{
				"api": map[string]any{
					"keys": map[string]any{
						"id": map[string]any{
							"ui": map[string]any{
								"key": "MY-PLAINTEXT-KEY",
							},
						},
					},
				},
			},
		},
	}

	masked := mask.Tree(config, nil).(map[string]any)

	sys := masked["system"].(map[string]any)
	if sys["host-name"] != "router1" {
		t.Errorf("expected host-name to remain visible, got %v", sys["host-name"])
	}

	key := masked["service"].(map[string]any)["https"].(map[string]any)["api"].(map[string]any)["keys"].(map[string]any)["id"].(map[string]any)["ui"].(map[string]any)["key"]
	if key != mask.MaskPlaceholder {
		t.Errorf("expected api key to be masked, got %v", key)
	}

	// Original must be untouched (deep copy, not mutation).
	origKey := config["service"].(map[string]any)["https"].(map[string]any)["api"].(map[string]any)["keys"].(map[string]any)["id"].(map[string]any)["ui"].(map[string]any)["key"]
	if origKey != "MY-PLAINTEXT-KEY" {
		t.Errorf("expected original tree to be unmodified, got %v", origKey)
	}
}

// TestTree_SiblingBranchesDoNotCrossContaminatePaths guards the
// append(path, k) growth strategy in Tree: siblings processed in the
// same map iteration can share a backing array when it has spare
// capacity, so this locks in that each branch's path is still
// evaluated independently rather than one sibling's appended segment
// leaking into another's.
func TestTree_SiblingBranchesDoNotCrossContaminatePaths(t *testing.T) {
	config := map[string]any{
		"parent": map[string]any{
			"password":  "should-be-masked",
			"host-name": "should-stay-visible",
		},
	}
	masked := mask.Tree(config, nil).(map[string]any)["parent"].(map[string]any)
	if masked["password"] != mask.MaskPlaceholder {
		t.Errorf("password = %v, want masked", masked["password"])
	}
	if masked["host-name"] != "should-stay-visible" {
		t.Errorf("host-name = %v, want unchanged", masked["host-name"])
	}
}

// TestTree_MasksSensitiveEnvironmentVariable guards the actual
// end-to-end scenario this whole identifier-aware mechanism exists
// for: `container name <name> environment <KEY> value <VALUE>` -
// where every environment variable's value sits under the exact same
// generic "value" leaf regardless of its own key, so the leaf name
// alone could never distinguish DB_PASSWORD from TZ.
func TestTree_MasksSensitiveEnvironmentVariable(t *testing.T) {
	config := map[string]any{
		"container": map[string]any{
			"name": map[string]any{
				"web": map[string]any{
					"environment": map[string]any{
						"DB_PASSWORD": map[string]any{"value": "hunter2"},
						"TZ":          map[string]any{"value": "UTC"},
					},
				},
			},
		},
	}
	masked := mask.Tree(config, nil).(map[string]any)
	env := masked["container"].(map[string]any)["name"].(map[string]any)["web"].(map[string]any)["environment"].(map[string]any)

	if got := env["DB_PASSWORD"].(map[string]any)["value"]; got != mask.MaskPlaceholder {
		t.Errorf("DB_PASSWORD value = %v, want masked", got)
	}
	if got := env["TZ"].(map[string]any)["value"]; got != "UTC" {
		t.Errorf("TZ value = %v, want unchanged", got)
	}

	// Original must be untouched (deep copy, not mutation).
	origEnv := config["container"].(map[string]any)["name"].(map[string]any)["web"].(map[string]any)["environment"].(map[string]any)
	if got := origEnv["DB_PASSWORD"].(map[string]any)["value"]; got != "hunter2" {
		t.Errorf("expected original tree to be unmodified, got %v", got)
	}
}

func TestTree_MasksMultiValueLeaf(t *testing.T) {
	config := map[string]any{
		"community": []any{"public-ish-1", "public-ish-2"},
	}
	masked := mask.Tree(config, nil).(map[string]any)
	vals := masked["community"].([]any)
	if len(vals) != 2 || vals[0] != mask.MaskPlaceholder || vals[1] != mask.MaskPlaceholder {
		t.Errorf("expected all community values masked, got %v", vals)
	}
}

// TestSensitiveFieldsListMatchesSharedSource ensures the embedded copy
// used by the Go backend never drifts from /shared/sensitive-fields.json,
// which is the single source of truth also consumed by the frontend.
func TestSensitiveFieldsListMatchesSharedSource(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("could not determine test file location")
	}
	embeddedCopy := filepath.Join(filepath.Dir(thisFile), "sensitive-fields.json")
	sharedSource := filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "shared", "sensitive-fields.json")

	embeddedBytes, err := os.ReadFile(embeddedCopy)
	if err != nil {
		t.Fatalf("reading embedded copy: %v", err)
	}
	sharedBytes, err := os.ReadFile(sharedSource)
	if err != nil {
		t.Skipf("shared source not found at %s (expected when running outside the monorepo checkout): %v", sharedSource, err)
	}

	if string(embeddedBytes) != string(sharedBytes) {
		t.Errorf(
			"backend/internal/mask/sensitive-fields.json has drifted from shared/sensitive-fields.json\n"+
				"run: cp %s %s",
			sharedSource, embeddedCopy,
		)
	}
}
