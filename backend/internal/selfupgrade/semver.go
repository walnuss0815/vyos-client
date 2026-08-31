package selfupgrade

import (
	"regexp"
	"strconv"
	"strings"
)

// semverPattern extracts a leading major.minor.patch from a version
// string, ignoring any "v" prefix and any pre-release/build metadata
// suffix (e.g. "v1.2.3-rc.1+build5" still parses as 1.2.3). This
// project's own tags are always emitted as clean vX.Y.Z by
// semantic-release (see .releaserc.json), so this simple pattern
// covers everything self-upgrade needs to compare, without pulling in
// a full semver-parsing dependency (this backend has none today - see
// go.mod).
var semverPattern = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)`)

type semver struct {
	major, minor, patch int
}

// parseSemver parses raw's leading major.minor.patch. ok is false if
// raw doesn't start with a recognizable version - notably including
// "dev", the default `main.version` for local/non-release builds (see
// cmd/vyos-client/main.go), for which no update comparison is
// possible at all.
func parseSemver(raw string) (v semver, ok bool) {
	m := semverPattern.FindStringSubmatch(strings.TrimSpace(raw))
	if m == nil {
		return semver{}, false
	}
	major, err1 := strconv.Atoi(m[1])
	minor, err2 := strconv.Atoi(m[2])
	patch, err3 := strconv.Atoi(m[3])
	if err1 != nil || err2 != nil || err3 != nil {
		return semver{}, false
	}
	return semver{major: major, minor: minor, patch: patch}, true
}

// compare returns -1, 0, or 1 as v is less than, equal to, or greater
// than other.
func (v semver) compare(other semver) int {
	if v.major != other.major {
		return cmpInt(v.major, other.major)
	}
	if v.minor != other.minor {
		return cmpInt(v.minor, other.minor)
	}
	return cmpInt(v.patch, other.patch)
}

func cmpInt(a, b int) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	default:
		return 0
	}
}

// normalizeVersion strips a leading "v" (and any pre-release/build
// suffix) from a raw git tag, returning "" if it isn't a recognizable
// version at all.
func normalizeVersion(tag string) string {
	m := semverPattern.FindStringSubmatch(strings.TrimSpace(tag))
	if m == nil {
		return ""
	}
	return m[1] + "." + m[2] + "." + m[3]
}

// NewerThan filters releases (expected pre-sorted newest-first, as
// ListReleases already returns them) to only those with a parseable
// Version strictly greater than current, preserving that order. ok is
// false if current itself isn't a parseable version (e.g. "dev"),
// meaning no comparison could be made at all - distinct from ok=true
// with a nil/empty newer, which means "already up to date."
func NewerThan(releases []Release, current string) (newer []Release, ok bool) {
	curSV, curOK := parseSemver(current)
	if !curOK {
		return nil, false
	}
	for _, r := range releases {
		rv, rok := parseSemver(r.Version)
		if !rok {
			continue
		}
		if rv.compare(curSV) > 0 {
			newer = append(newer, r)
		}
	}
	return newer, true
}
