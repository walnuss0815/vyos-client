package vyos

import "strings"

// parseTabulateTable parses text formatted by Python's `tabulate`
// library in its default "simple" style - a header row, a row of
// dashes marking each column's width, then left-aligned data rows -
// the format several VyOS op-mode commands (e.g. `show dhcp server
// leases`) use for output that has no JSON alternative at all. See
// ShowDHCPLeases's doc comment for why this is genuinely necessary
// here rather than a shortcut taken in place of a JSON one.
//
// Columns are located by character position (from the dash-separator
// line), not by splitting on whitespace: a value column can itself be
// empty (e.g. a lease with no known Hostname), which position-based
// slicing handles correctly and naive whitespace-splitting would not
// (an empty cell just disappears from a plain space-split, silently
// misaligning every column after it).
//
// Returns one map[header]value per data row, in the table's original
// order. A malformed or headerless table (no dash-separator line
// found - e.g. VyOS printing "DHCP server is not configured" instead
// of a table) returns a nil, non-error result: from this app's
// perspective that's indistinguishable from "no rows to show".
func parseTabulateTable(text string) []map[string]string {
	lines := strings.Split(text, "\n")

	sepIdx := -1
	for i, line := range lines {
		if isTabulateSeparatorLine(line) {
			sepIdx = i
			break
		}
	}
	if sepIdx < 1 { // need at least one header line before it
		return nil
	}

	cols := tabulateColumnRanges(lines[sepIdx])
	if len(cols) == 0 {
		return nil
	}
	headers := sliceTabulateColumns(lines[sepIdx-1], cols)

	var rows []map[string]string
	for _, line := range lines[sepIdx+1:] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		values := sliceTabulateColumns(line, cols)
		row := make(map[string]string, len(headers))
		for i, h := range headers {
			if i < len(values) {
				row[h] = values[i]
			}
		}
		rows = append(rows, row)
	}
	return rows
}

// tabulateColRange is a half-open [start, end) character range for one
// column, as located on the dash-separator line. end == -1 for the
// last column, meaning "read to the end of the line" - defensive
// against a data row whose last-column value is somehow wider than
// what the separator line (built from the same data) accounted for.
type tabulateColRange struct {
	start, end int
}

// isTabulateSeparatorLine reports whether line consists solely of
// dashes and spaces, with at least one dash - tabulate's header
// underline, e.g. "--------------  -----------------  -------".
func isTabulateSeparatorLine(line string) bool {
	if strings.TrimSpace(line) == "" {
		return false
	}
	hasDash := false
	for _, r := range line {
		switch r {
		case '-':
			hasDash = true
		case ' ':
			// fine
		default:
			return false
		}
	}
	return hasDash
}

func tabulateColumnRanges(sepLine string) []tabulateColRange {
	var cols []tabulateColRange
	inRun := false
	start := 0
	runes := []rune(sepLine)
	for i, r := range runes {
		if r == '-' {
			if !inRun {
				start = i
				inRun = true
			}
		} else if inRun {
			cols = append(cols, tabulateColRange{start: start, end: i})
			inRun = false
		}
	}
	if inRun {
		cols = append(cols, tabulateColRange{start: start, end: len(runes)})
	}
	if len(cols) > 0 {
		cols[len(cols)-1].end = -1
	}
	return cols
}

func sliceTabulateColumns(line string, cols []tabulateColRange) []string {
	runes := []rune(line)
	out := make([]string, 0, len(cols))
	for _, c := range cols {
		start := min(c.start, len(runes))
		end := len(runes)
		if c.end != -1 {
			end = min(c.end, len(runes))
		}
		if end < start {
			end = start
		}
		out = append(out, strings.TrimSpace(string(runes[start:end])))
	}
	return out
}
