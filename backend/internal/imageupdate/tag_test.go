package imageupdate

import "testing"

func TestParseTag(t *testing.T) {
	tests := []struct {
		raw  string
		want ParsedTag
		ok   bool
	}{
		{"1.25.3", ParsedTag{Raw: "1.25.3", Major: 1, Minor: 25, Patch: 3, HasPatch: true}, true},
		{"v1.25.3", ParsedTag{Raw: "v1.25.3", Major: 1, Minor: 25, Patch: 3, HasPatch: true, HasLeadingV: true}, true},
		{"1.25", ParsedTag{Raw: "1.25", Major: 1, Minor: 25, Patch: -1}, true},
		{"1.25.3-alpine", ParsedTag{Raw: "1.25.3-alpine", Major: 1, Minor: 25, Patch: 3, HasPatch: true, Suffix: "-alpine"}, true},
		{"1.25-alpine3.19", ParsedTag{Raw: "1.25-alpine3.19", Major: 1, Minor: 25, Patch: -1, Suffix: "-alpine3.19"}, true},
		{"v2.0.1-rc.1", ParsedTag{Raw: "v2.0.1-rc.1", Major: 2, Minor: 0, Patch: 1, HasPatch: true, HasLeadingV: true, Suffix: "-rc.1"}, true},
		{"latest", ParsedTag{}, false},
		{"stable", ParsedTag{}, false},
		{"main", ParsedTag{}, false},
		{"22", ParsedTag{}, false},
		{"", ParsedTag{}, false},
	}
	for _, tt := range tests {
		got, ok := ParseTag(tt.raw)
		if ok != tt.ok {
			t.Errorf("ParseTag(%q) ok = %v, want %v", tt.raw, ok, tt.ok)
			continue
		}
		if ok && got != tt.want {
			t.Errorf("ParseTag(%q) = %+v, want %+v", tt.raw, got, tt.want)
		}
	}
}

func TestNewestMatching(t *testing.T) {
	tests := []struct {
		name       string
		candidates []string
		current    string
		wantNewest string
		wantOK     bool
	}{
		{
			name:       "finds newer patch",
			candidates: []string{"1.25.1", "1.25.2", "1.25.3", "1.24.9"},
			current:    "1.25.1",
			wantNewest: "1.25.3",
			wantOK:     true,
		},
		{
			name:       "already newest",
			candidates: []string{"1.25.1", "1.25.0"},
			current:    "1.25.1",
			wantNewest: "",
			wantOK:     true,
		},
		{
			name:       "current tag not recognized",
			candidates: []string{"1.25.1", "1.25.2"},
			current:    "latest",
			wantNewest: "",
			wantOK:     false,
		},
		{
			name:       "ignores different suffix flavor",
			candidates: []string{"1.26.0-alpine", "1.26.0"},
			current:    "1.25.3",
			wantNewest: "1.26.0",
			wantOK:     true,
		},
		{
			name:       "matches identical suffix flavor only",
			candidates: []string{"1.26.0", "1.26.0-alpine"},
			current:    "1.25.3-alpine",
			wantNewest: "1.26.0-alpine",
			wantOK:     true,
		},
		{
			name:       "leading v style must match",
			candidates: []string{"v1.26.0", "1.26.0"},
			current:    "1.25.3",
			wantNewest: "1.26.0",
			wantOK:     true,
		},
		{
			name:       "patch presence must match - bare minor tag not compared against patched ones",
			candidates: []string{"1.26.3", "1.26"},
			current:    "1.25",
			wantNewest: "1.26",
			wantOK:     true,
		},
		{
			name:       "skips unparseable candidates",
			candidates: []string{"latest", "stable", "1.26.0"},
			current:    "1.25.3",
			wantNewest: "1.26.0",
			wantOK:     true,
		},
		{
			name:       "no matching flavor at all",
			candidates: []string{"1.26.0-alpine"},
			current:    "1.25.3",
			wantNewest: "",
			wantOK:     true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotNewest, gotOK := NewestMatching(tt.candidates, tt.current)
			if gotOK != tt.wantOK {
				t.Fatalf("NewestMatching(...) ok = %v, want %v", gotOK, tt.wantOK)
			}
			if gotNewest != tt.wantNewest {
				t.Errorf("NewestMatching(...) = %q, want %q", gotNewest, tt.wantNewest)
			}
		})
	}
}
