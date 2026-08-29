package vyos_test

import (
	"fmt"
	"strings"
)

// buildTabulateFixtureWithHeaders constructs a `tabulate`-shaped
// ("simple" style) text table with the given headers/column widths,
// using fmt.Sprintf's own field-width padding so the header/separator/
// data rows are guaranteed self-consistent - this doesn't need to be
// byte-for-byte identical to Python's tabulate output, only internally
// aligned the same way (fixed-width columns, left-justified, a run of
// '-' under each column), which is all vyos.parseTabulateTable and its
// callers (ParseHAProxyStatus, ParseVRRPStatus) rely on. Shared across
// this package's op-mode status tests rather than hand-counting
// character offsets in each one individually.
func buildTabulateFixtureWithHeaders(headers []string, widths []int, rows [][]string) string {
	fields := make([]string, len(widths))
	for i, w := range widths {
		fields[i] = fmt.Sprintf("%%-%ds", w)
	}
	format := strings.Join(fields, "  ") + "\n"

	out := fmt.Sprintf(format, toArgs(headers)...)
	dashes := make([]string, len(widths))
	for i, w := range widths {
		dashes[i] = strings.Repeat("-", w)
	}
	out += fmt.Sprintf(format, toArgs(dashes)...)
	for _, row := range rows {
		out += fmt.Sprintf(format, toArgs(row)...)
	}
	return out
}

func toArgs(values []string) []any {
	args := make([]any, len(values))
	for i, v := range values {
		args[i] = v
	}
	return args
}
