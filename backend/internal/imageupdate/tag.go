package imageupdate

import (
	"regexp"
	"strconv"
)

// tagPattern extracts an optional leading "v", a major.minor(.patch)?
// numeric core, and an optional trailing suffix (e.g. "-alpine",
// "-alpine3.19") from a container image tag. This is deliberately
// more permissive than internal/selfupgrade's own semver comparator
// (which only ever has to handle this project's own clean vX.Y.Z
// release tags): real-world container tags routinely look like
// "1.25.3", "v1.25.3", "1.25" (no patch), or "1.25.3-alpine" - all of
// which need to compare sensibly against a registry's actual tag
// list. The two comparators aren't merged into one shared
// implementation: patch-optionality and suffix/flavor-awareness are
// requirements unique to this one, and selfupgrade's is intentionally
// kept minimal for its own narrower, already-working use case.
var tagPattern = regexp.MustCompile(`^(v?)(\d+)\.(\d+)(?:\.(\d+))?(-.+)?$`)

// ParsedTag is a container image tag recognized as a version, split
// into its comparable numeric core and its "flavor" (leading-"v"
// style, patch-presence, and any trailing suffix). Two tags are only
// ever compared against each other when their flavor matches exactly
// (see sameFlavor/NewestMatching) - a "-alpine" tag is never
// suggested as an update for a plain tag, and a patch-less "1.25" is
// never treated as equivalent to "1.25.0".
type ParsedTag struct {
	Raw         string
	Major       int
	Minor       int
	Patch       int
	HasPatch    bool
	HasLeadingV bool
	Suffix      string
}

// ParseTag parses raw as a version tag. ok is false if raw doesn't
// match the recognized shape at all (e.g. "latest", "stable", "main",
// or a bare hex digest) - no update comparison is possible for such a
// tag.
func ParseTag(raw string) (t ParsedTag, ok bool) {
	m := tagPattern.FindStringSubmatch(raw)
	if m == nil {
		return ParsedTag{}, false
	}
	major, err1 := strconv.Atoi(m[2])
	minor, err2 := strconv.Atoi(m[3])
	if err1 != nil || err2 != nil {
		return ParsedTag{}, false
	}
	t = ParsedTag{
		Raw:         raw,
		Major:       major,
		Minor:       minor,
		Patch:       -1,
		HasLeadingV: m[1] == "v",
		Suffix:      m[5],
	}
	if m[4] != "" {
		patch, err := strconv.Atoi(m[4])
		if err != nil {
			return ParsedTag{}, false
		}
		t.Patch = patch
		t.HasPatch = true
	}
	return t, true
}

// compare returns -1, 0, or 1 as a is older than, equal to, or newer
// than b. Only meaningful for tags of the same flavor (see
// sameFlavor) - NewestMatching never compares across flavors.
func (a ParsedTag) compare(b ParsedTag) int {
	if a.Major != b.Major {
		return cmpInt(a.Major, b.Major)
	}
	if a.Minor != b.Minor {
		return cmpInt(a.Minor, b.Minor)
	}
	if a.HasPatch && b.HasPatch {
		return cmpInt(a.Patch, b.Patch)
	}
	return 0
}

func cmpInt(x, y int) int {
	switch {
	case x < y:
		return -1
	case x > y:
		return 1
	default:
		return 0
	}
}

// sameFlavor reports whether a and b use the same tagging convention:
// identical leading-"v" style, identical suffix, and both either
// having or lacking a patch component. Only tags sharing a flavor are
// ever compared against each other - see NewestMatching.
func sameFlavor(a, b ParsedTag) bool {
	return a.HasLeadingV == b.HasLeadingV && a.Suffix == b.Suffix && a.HasPatch == b.HasPatch
}

// NewestMatching returns the newest tag among candidates that is
// strictly newer than current and shares current's exact flavor (see
// sameFlavor). ok is false when current itself isn't a recognized
// version tag (e.g. "latest") - no comparison was possible at all.
// ok=true with an empty newest means either current is already the
// newest matching tag found, or no candidate shares its flavor.
func NewestMatching(candidates []string, current string) (newest string, ok bool) {
	curTag, curOK := ParseTag(current)
	if !curOK {
		return "", false
	}
	var best ParsedTag
	haveBest := false
	for _, raw := range candidates {
		cand, candOK := ParseTag(raw)
		if !candOK || !sameFlavor(cand, curTag) {
			continue
		}
		if cand.compare(curTag) <= 0 {
			continue
		}
		if !haveBest || cand.compare(best) > 0 {
			best = cand
			haveBest = true
		}
	}
	if !haveBest {
		return "", true
	}
	return best.Raw, true
}
