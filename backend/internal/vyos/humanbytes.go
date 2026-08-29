package vyos

import (
	"regexp"
	"strconv"
	"strings"
)

var humanBytesPattern = regexp.MustCompile(`(?i)^([0-9.]+)\s*([KMGT]?)B?$`)

// parseHumanBytes parses a human-readable size string back into a
// plain byte count. VyOS uses two conventions for these across its
// op-mode scripts, both handled here: memory.py's bytes_to_human
// (two-letter suffixes, "15.32 GB") and storage.py's raw `df -h`
// passthrough (single-letter, no space, "16G"). Both are 1024-based
// (binary) despite the SI-style "GB"/"G" naming - a long-standing
// Linux `df -h`/VyOS convention, not a bug.
//
// This is a safe, lossless-per-field operation even though a struct's
// different fields (e.g. Total vs. Used) can independently land in
// different units - each string fully encodes its own value and unit,
// so parsing them independently and doing arithmetic on the resulting
// byte counts never risks a unit mismatch.
//
// Returns (0, false) for anything that doesn't match, rather than a
// zero value indistinguishable from a real zero - callers should skip
// setting the corresponding field on failure, not treat 0 as data.
func parseHumanBytes(s string) (int64, bool) {
	m := humanBytesPattern.FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return 0, false
	}
	value, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return 0, false
	}
	multiplier := 1.0
	switch strings.ToUpper(m[2]) {
	case "K":
		multiplier = 1024
	case "M":
		multiplier = 1024 * 1024
	case "G":
		multiplier = 1024 * 1024 * 1024
	case "T":
		multiplier = 1024 * 1024 * 1024 * 1024
	}
	return int64(value * multiplier), true
}
