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
