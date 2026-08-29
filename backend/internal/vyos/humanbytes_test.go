package vyos

import "testing"

func TestParseHumanBytes(t *testing.T) {
	tests := []struct {
		input  string
		want   int64
		wantOk bool
	}{
		{"15.32 GB", 16449724743, true}, // memory.py's bytes_to_human style
		{"9.11 GB", 9781788016, true},
		{"16G", 17179869184, true}, // storage.py's raw `df -h` style
		{"7.6G", 8160437862, true},
		{"0 B", 0, true},
		{"512 MB", 536870912, true},
		{"1K", 1024, true},
		{"1T", 1099511627776, true},
		{"", 0, false},
		{"not-a-size", 0, false},
		{"GB", 0, false},
	}

	for _, tt := range tests {
		got, ok := parseHumanBytes(tt.input)
		if ok != tt.wantOk {
			t.Errorf("parseHumanBytes(%q) ok = %v, want %v", tt.input, ok, tt.wantOk)
			continue
		}
		if !ok {
			continue
		}
		if got != tt.want {
			t.Errorf("parseHumanBytes(%q) = %d, want %d", tt.input, got, tt.want)
		}
	}
}

func TestParseHumanBytes_TrimsWhitespace(t *testing.T) {
	got, ok := parseHumanBytes("  16G  ")
	if !ok {
		t.Fatal("expected ok = true")
	}
	if want, _ := parseHumanBytes("16G"); got != want {
		t.Errorf("got %d, want %d", got, want)
	}
}

func TestParseHumanBytes_CaseInsensitiveUnit(t *testing.T) {
	got, ok := parseHumanBytes("16g")
	if !ok {
		t.Fatal("expected ok = true")
	}
	want, _ := parseHumanBytes("16G")
	if got != want {
		t.Errorf("got %d, want %d", got, want)
	}
}
