package mask

import "strings"

// RedactSetCommands takes the flat-text output of
// `show configuration commands` and returns a copy with the value of
// every line whose leaf name is sensitive (per IsSensitiveLeaf)
// replaced by MaskPlaceholder. Used to power the Config Tree editor's
// "view as set commands" mode without leaking secrets in the raw text.
//
// This is a genuine left-to-right tokenizer, not a single regex
// matched against the whole line - deliberately, because a regex that
// must match an entire line has to choose *some* split between the
// path and the value when more than one split is technically possible
// (e.g. a value that itself contains a quote character), and it can
// silently choose the wrong one instead of failing to match at all. A
// tokenizer never faces that ambiguity: it commits to the first
// unmatched quote it finds as the value's start, in the same
// left-to-right order VyOS itself would have parsed the line as `set`
// commands to begin with.
//
// VyOS itself has no escape mechanism for an embedded single quote in
// a value - confirmed directly against a real VyOS instance, both
// `/configure` ("Cannot use the single quote (') character in a value
// string") and `/config-file merge` (fails the same underlying
// set-commands validation) reject a value containing one outright. So
// a well-formed line's tokenizer output is unambiguous in practice:
// every quoted span is a genuine, self-contained token. The only way a
// line could violate that is a configuration edited directly on disk,
// bypassing VyOS's own validation entirely - tokenizeSetLine's
// "unterminated quote" fallback (treat everything from that point to
// end of line as one final value token) exists purely as
// defense-in-depth for that case, so such a line still gets its
// (approximated) value fully redacted rather than passed through
// unexamined.
func RedactSetCommands(text string) string {
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = redactSetLine(line)
	}
	return strings.Join(lines, "\n")
}

func redactSetLine(line string) string {
	tokens := tokenizeSetLine(line)
	// A value-bearing line is `set <path words...> <leaf> '<value>'` -
	// at least 3 tokens (set, one path word, the value), with the
	// value itself a quoted token. Anything shorter, or ending in an
	// unquoted token (a flag node like `set service https api rest`),
	// carries no value to redact.
	if len(tokens) < 3 {
		return line
	}
	last := tokens[len(tokens)-1]
	if !last.quoted {
		return line
	}
	leaf := tokens[len(tokens)-2]
	if !IsSensitiveLeaf(leaf.text) {
		return line
	}
	return line[:last.start] + "'" + MaskPlaceholder + "'"
}

type setLineToken struct {
	text   string // unquoted content (quote characters stripped)
	quoted bool
	start  int // byte offset in the original line where this token begins (the opening quote, for a quoted token)
}

// tokenizeSetLine splits a `show configuration commands` line into
// whitespace-separated tokens, treating a single-quoted span (from one
// `'` to the next) as one atomic token regardless of its contents -
// including, in the well-formed case VyOS itself only ever produces, a
// value with internal spaces. An unterminated trailing quote (only
// reachable via a hand-edited, VyOS-validation-bypassing config - see
// RedactSetCommands's doc comment) is treated as one final token
// running to end of line, so redaction still has a value token to act
// on rather than silently dropping the rest of the line.
func tokenizeSetLine(line string) []setLineToken {
	var tokens []setLineToken
	i := 0
	for i < len(line) {
		for i < len(line) && (line[i] == ' ' || line[i] == '\t') {
			i++
		}
		if i >= len(line) {
			break
		}
		if line[i] == '\'' {
			start := i
			end := strings.IndexByte(line[i+1:], '\'')
			if end < 0 {
				// Unterminated quote - take the rest of the line as
				// this token's content (see doc comment).
				tokens = append(tokens, setLineToken{text: line[i+1:], quoted: true, start: start})
				break
			}
			end += i + 1
			tokens = append(tokens, setLineToken{text: line[i+1 : end], quoted: true, start: start})
			i = end + 1
			continue
		}
		start := i
		for i < len(line) && line[i] != ' ' && line[i] != '\t' {
			i++
		}
		tokens = append(tokens, setLineToken{text: line[start:i], quoted: false, start: start})
	}
	return tokens
}
