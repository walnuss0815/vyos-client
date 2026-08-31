package selfupgrade

import "testing"

func TestParseSemver(t *testing.T) {
	cases := []struct {
		raw    string
		want   semver
		wantOK bool
	}{
		{"1.2.3", semver{1, 2, 3}, true},
		{"v1.2.3", semver{1, 2, 3}, true},
		{"v1.2.3-rc.1+build5", semver{1, 2, 3}, true},
		{"0.0.1", semver{0, 0, 1}, true},
		{"dev", semver{}, false},
		{"", semver{}, false},
		{"not-a-version", semver{}, false},
		{"v1.2", semver{}, false},
	}
	for _, c := range cases {
		got, ok := parseSemver(c.raw)
		if ok != c.wantOK {
			t.Errorf("parseSemver(%q) ok = %v, want %v", c.raw, ok, c.wantOK)
			continue
		}
		if ok && got != c.want {
			t.Errorf("parseSemver(%q) = %+v, want %+v", c.raw, got, c.want)
		}
	}
}

func TestSemverCompare(t *testing.T) {
	cases := []struct {
		a, b semver
		want int
	}{
		{semver{1, 0, 0}, semver{1, 0, 0}, 0},
		{semver{1, 0, 0}, semver{2, 0, 0}, -1},
		{semver{2, 0, 0}, semver{1, 0, 0}, 1},
		{semver{1, 2, 0}, semver{1, 3, 0}, -1},
		{semver{1, 3, 0}, semver{1, 2, 0}, 1},
		{semver{1, 2, 3}, semver{1, 2, 4}, -1},
		{semver{1, 2, 4}, semver{1, 2, 3}, 1},
		{semver{10, 0, 0}, semver{9, 9, 9}, 1}, // numeric, not lexicographic
	}
	for _, c := range cases {
		if got := c.a.compare(c.b); got != c.want {
			t.Errorf("%+v.compare(%+v) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestNormalizeVersion(t *testing.T) {
	cases := map[string]string{
		"v1.2.3":     "1.2.3",
		"1.2.3":      "1.2.3",
		"v1.2.3-rc1": "1.2.3",
		"not-a-tag":  "",
	}
	for raw, want := range cases {
		if got := normalizeVersion(raw); got != want {
			t.Errorf("normalizeVersion(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestNewerThan(t *testing.T) {
	releases := []Release{
		{Tag: "v2.0.0", Version: "2.0.0"},
		{Tag: "v1.5.0", Version: "1.5.0"},
		{Tag: "v1.2.3", Version: "1.2.3"},
		{Tag: "v1.0.0", Version: "1.0.0"},
	}

	t.Run("returns only releases newer than current, preserving order", func(t *testing.T) {
		newer, ok := NewerThan(releases, "1.2.3")
		if !ok {
			t.Fatalf("expected ok=true for a parseable current version")
		}
		if len(newer) != 2 {
			t.Fatalf("expected 2 newer releases, got %d: %+v", len(newer), newer)
		}
		if newer[0].Version != "2.0.0" || newer[1].Version != "1.5.0" {
			t.Errorf("unexpected order: %+v", newer)
		}
	})

	t.Run("returns ok=false for an unparseable current version", func(t *testing.T) {
		newer, ok := NewerThan(releases, "dev")
		if ok {
			t.Fatalf("expected ok=false for \"dev\"")
		}
		if newer != nil {
			t.Errorf("expected nil newer, got %+v", newer)
		}
	})

	t.Run("returns empty (but ok) when already on the latest version", func(t *testing.T) {
		newer, ok := NewerThan(releases, "2.0.0")
		if !ok {
			t.Fatalf("expected ok=true")
		}
		if len(newer) != 0 {
			t.Errorf("expected no newer releases, got %+v", newer)
		}
	})

	t.Run("skips releases with an unparseable version", func(t *testing.T) {
		withBad := append([]Release{{Tag: "not-a-version", Version: ""}}, releases...)
		newer, ok := NewerThan(withBad, "1.2.3")
		if !ok {
			t.Fatalf("expected ok=true")
		}
		if len(newer) != 2 {
			t.Errorf("expected the unparseable release to be skipped, got %+v", newer)
		}
	})
}
