package vyos

import (
	"context"
	"strconv"
	"strings"
	"time"
)

// logFetchTimeout is used (via ShowWithTimeout) for every log fetch,
// in place of Client's normal ~30s default - see ShowWithTimeout's own
// doc comment for why a log fetch's duration is far less predictable
// than this app's other calls. Deliberately kept comfortably under
// the backend's own http.Server.WriteTimeout (60s, see
// cmd/vyos-client/serve.go) - a value any closer to or past that would
// have this backend's own server abort the response before this
// client-side timeout ever had a chance to fire, turning a slow
// upstream call into a broken/reset connection instead of the clear
// "failed fetching logs" error a genuine timeout produces.
const logFetchTimeout = 45 * time.Second

// LogFacilities are the syslog facility names `show log facility
// <name>` accepts (VyOS's own op-mode completion list, confirmed
// against vyos-1x's show-log.xml.in), for validating/populating a
// facility picker.
var LogFacilities = []string{
	"kern", "user", "mail", "daemon", "auth", "syslog", "lpr", "news",
	"uucp", "cron", "authpriv", "ftp",
	"local0", "local1", "local2", "local3", "local4", "local5", "local6", "local7",
}

// LogPriorities are the severity levels `show log priority <level>`
// accepts (again VyOS's own completion list) - a *minimum* severity;
// "err" includes err/crit/alert/emerg but not warning/notice/info/debug.
var LogPriorities = []string{
	"emerg", "alert", "crit", "err", "warning", "notice", "info", "debug",
}

// LogLines is a bounded snapshot of a log's most recent lines, in
// chronological (oldest-first) order - matching journalctl's own
// default ordering, and how a human reads a log top-to-bottom.
type LogLines struct {
	Lines []string `json:"lines"`
	// Truncated is true when the underlying command returned more
	// lines than requested and the oldest ones were dropped - lets
	// the frontend show "showing the last N lines" rather than
	// implying this is the complete log.
	Truncated bool `json:"truncated"`
}

// ShowLogTail runs the given "show log ..." (or "show container log
// <name>") op-mode path - one with no line-count parameter of its own,
// e.g. a per-service command like `show log frr`/`show log ssh` - and
// truncates the result to at most maxLines lines afterward, the most
// recent ones.
//
// Why this truncates here rather than relying on VyOS's own command:
// only two of the several dozen `show log ...` subcommands accept a
// line-count parameter at all (a bare `show log <1-9999>` and `show
// log tail <n>` - see ShowLogTailBounded, which uses the latter).
// Every per-service command this function is actually used for
// returns its entire boot's output with no bound at all - truncating
// the already-fetched text ourselves is the only option for those,
// and gives a uniform "last N lines, chronological order" contract
// matching ShowLogTailBounded's.
func (c *Client) ShowLogTail(ctx context.Context, path []string, maxLines int) (*LogLines, error) {
	text, err := c.ShowWithTimeout(ctx, path, logFetchTimeout)
	if err != nil {
		return nil, err
	}

	lines := splitLogLines(text)
	// maxLines <= 0 isn't just "no truncation" - a negative value
	// would make len(lines)-maxLines exceed len(lines), and slicing
	// past a slice's own length panics. The current caller
	// (api/log_handlers.go) already clamps its own query-param value
	// to a positive range before this is ever reached, but this
	// method is exported and shouldn't rely on that being true of
	// every future caller too.
	if maxLines <= 0 {
		return &LogLines{Lines: []string{}, Truncated: len(lines) > 0}, nil
	}
	if len(lines) > maxLines {
		return &LogLines{Lines: cloneLines(lines[len(lines)-maxLines:]), Truncated: true}, nil
	}
	return &LogLines{Lines: lines, Truncated: false}, nil
}

// ShowLogTailBounded runs `show log tail <n>` - the one general-purpose
// (not per-service) log command VyOS itself already bounds by line
// count - and re-reverses its newest-first output back into the same
// chronological (oldest-first) order ShowLogTail returns, for one
// consistent contract regardless of source.
//
// Prefer this over ShowLogTail with path=["log"] (bare `show log`)
// whenever the general/"system" log is wanted: bare `show log` has no
// line limit at all and dumps a router's *entire* boot-scoped journal
// before this backend ever gets a chance to truncate it down to size -
// on a router with substantial log history this alone can take well
// over the client's timeout (a real production incident this
// backend's error logging surfaced: "context deadline exceeded"
// fetching the default log source). Asking VyOS for exactly the N
// lines needed via `tail` is bounded and fast regardless of how much
// total journal history exists, since journalctl can satisfy it by
// reading backwards from the end rather than scanning everything.
func (c *Client) ShowLogTailBounded(ctx context.Context, maxLines int) (*LogLines, error) {
	text, err := c.ShowWithTimeout(ctx, []string{"log", "tail", strconv.Itoa(maxLines)}, logFetchTimeout)
	if err != nil {
		return nil, err
	}

	lines := splitLogLines(text)
	reverseInPlace(lines)
	// journalctl's --lines already caps the *fetch* at maxLines
	// server-side, so getting back exactly that many means there's
	// very likely more history beyond what's shown (VyOS doesn't tell
	// us the true total); getting back fewer means this was
	// everything there is (e.g. a freshly booted router).
	truncated := maxLines > 0 && len(lines) >= maxLines
	return &LogLines{Lines: lines, Truncated: truncated}, nil
}

// reverseInPlace reverses s in place - used to turn `show log tail
// <n>`'s newest-first ("journalctl --reverse") output back into the
// chronological order every other log source already returns.
func reverseInPlace(s []string) {
	for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
		s[i], s[j] = s[j], s[i]
	}
}

// cloneLines returns an independent copy of lines - both the slice
// itself and each individual string's own backing data. This is more
// than slices.Clone alone provides: slices.Clone copies the *array of
// string headers* (pointer+length pairs), but each of those headers
// still points into whatever backing byte array the original strings
// came from - here, strings.Split's line-view-substrings all still
// point into the single, potentially large full log response they
// were split out of. Truncating down to a handful of lines only
// actually bounds memory if each kept line's own bytes are copied
// too, not just the slice referencing them.
func cloneLines(lines []string) []string {
	out := make([]string, len(lines))
	for i, line := range lines {
		out[i] = strings.Clone(line)
	}
	return out
}

// splitLogLines splits raw command output into lines, dropping only a
// single trailing newline (the norm for journalctl/command output) so
// a genuinely blank last log line isn't silently swallowed, and
// returns an empty (non-nil) slice for empty input.
func splitLogLines(text string) []string {
	text = strings.TrimSuffix(text, "\n")
	if text == "" {
		return []string{}
	}
	return strings.Split(text, "\n")
}
