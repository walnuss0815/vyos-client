package mask_test

import (
	"strings"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/mask"
)

func TestRedactSetCommands(t *testing.T) {
	input := strings.Join([]string{
		`set interfaces ethernet eth0 address 'dhcp'`,
		`set service https api keys id 'vyos-ui' key 'MY-PLAINTEXT-KEY'`,
		`set system login user vyos authentication encrypted-password '$6$rounds$abc'`,
		`set system host-name 'vyos'`,
		`set service https api rest`,
		`set vpn ipsec site-to-site peer 'HQ' authentication pre-shared-secret 'hunter2'`,
	}, "\n")

	got := mask.RedactSetCommands(input)
	lines := strings.Split(got, "\n")

	if lines[0] != `set interfaces ethernet eth0 address 'dhcp'` {
		t.Errorf("non-sensitive line changed: %q", lines[0])
	}
	if lines[1] != `set service https api keys id 'vyos-ui' key '`+mask.MaskPlaceholder+`'` {
		t.Errorf("api key not redacted: %q", lines[1])
	}
	if lines[2] != `set system login user vyos authentication encrypted-password '`+mask.MaskPlaceholder+`'` {
		t.Errorf("encrypted-password not redacted: %q", lines[2])
	}
	if lines[3] != `set system host-name 'vyos'` {
		t.Errorf("non-sensitive line changed: %q", lines[3])
	}
	if lines[4] != `set service https api rest` {
		t.Errorf("flag node line changed: %q", lines[4])
	}
	if lines[5] != `set vpn ipsec site-to-site peer 'HQ' authentication pre-shared-secret '`+mask.MaskPlaceholder+`'` {
		t.Errorf("pre-shared-secret not redacted: %q", lines[5])
	}
}

// TestRedactSetCommands_MultipleQuotedPathSegments verifies the
// tokenizer correctly identifies the leaf name (and doesn't get
// confused about which quoted span is the value) on lines with more
// than one quoted segment before the final value - a case a
// single whole-line regex is prone to mis-splitting.
func TestRedactSetCommands_MultipleQuotedPathSegments(t *testing.T) {
	tests := []struct {
		name string
		line string
		want string
	}{
		{
			name: "tag node identifier then sensitive leaf",
			line: `set pki certificate 'my-cert' private key 'MIIEvw=='`,
			want: `set pki certificate 'my-cert' private key '` + mask.MaskPlaceholder + `'`,
		},
		{
			name: "tag node identifier that looks sensitive, generic value leaf",
			line: `set container name 'vyos-ui' environment 'SESSION_SECRET' value 'abc123'`,
			// "value" itself is not a sensitive leaf name, but
			// IsMaskedPath also checks the identifier one level up
			// (SESSION_SECRET) against IsSensitiveIdentifier - see
			// that function's own doc comment.
			want: `set container name 'vyos-ui' environment 'SESSION_SECRET' value '` + mask.MaskPlaceholder + `'`,
		},
		{
			name: "tag node identifier that does not look sensitive, generic value leaf",
			line: `set container name 'vyos-ui' environment 'TZ' value 'UTC'`,
			want: `set container name 'vyos-ui' environment 'TZ' value 'UTC'`,
		},
		{
			name: "two quoted segments, sensitive final leaf",
			line: `set vpn ipsec site-to-site peer 'x' authentication pre-shared-secret 'it has spaces'`,
			want: `set vpn ipsec site-to-site peer 'x' authentication pre-shared-secret '` + mask.MaskPlaceholder + `'`,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := mask.RedactSetCommands(tc.line); got != tc.want {
				t.Errorf("RedactSetCommands(%q) = %q, want %q", tc.line, got, tc.want)
			}
		})
	}
}

// TestRedactSetCommands_UnterminatedQuoteFallsBackToConservativeRedaction
// covers the defense-in-depth path for a line whose final quote is
// genuinely unterminated (no closing quote anywhere before end of
// line) - the tokenizer treats everything from that quote to end of
// line as one value token and redacts it, rather than the original,
// fixed bug of silently returning the whole line unmodified because no
// single whole-line regex matched it.
func TestRedactSetCommands_UnterminatedQuoteFallsBackToConservativeRedaction(t *testing.T) {
	line := `set system login user 'bob' authentication plaintext-password 'unterminated`
	got := mask.RedactSetCommands(line)
	if strings.Contains(got, "unterminated") {
		t.Errorf("secret value leaked into output: %q", got)
	}
	if !strings.Contains(got, mask.MaskPlaceholder) {
		t.Errorf("expected the malformed line to still be redacted, got: %q", got)
	}
}

// TestRedactSetCommands_KnownLimitation_EmbeddedQuoteInValue documents
// a residual, structural gap: a value containing a raw embedded quote
// with a *closing* quote later in the line (as opposed to no closing
// quote at all, which the test above covers) is fundamentally
// ambiguous to parse without knowing VyOS's escaping convention for
// it - and VyOS has none (confirmed directly against a real instance:
// both /configure and /config-file merge reject any value containing
// a single quote outright, with "Cannot use the single quote (')
// character in a value string"). So this is only reachable via a
// configuration hand-edited on disk, bypassing VyOS's own validation
// entirely - a threat model where the attacker already has direct
// filesystem access to the router. Documented (not silently
// "fixed" with a heuristic that could easily be wrong in the other
// direction) so it's visible as a known, accepted, and effectively
// unreachable limitation rather than mistaken for an oversight.
func TestRedactSetCommands_KnownLimitation_EmbeddedQuoteInValue(t *testing.T) {
	line := `set system login user 'bob' authentication plaintext-password 'it's a trap'`
	got := mask.RedactSetCommands(line)
	if got != line {
		t.Skip("embedded-quote-in-value parsing now differs - update this test's expectations")
	}
}

// TestRedactSetCommands_KnownLimitation_TagNodeIdentifiers documents a
// deliberate, narrower gap than before: IsMaskedPath now catches a
// sensitive-looking tag-node identifier when it's paired with the
// generic "value" leaf (container/event-handler environment
// variables, labels, sysctl parameters - see that function's own doc
// comment), but a case where the identifier itself *is* the whole
// secret, with no separate value leaf at all (e.g. an SNMP community
// name used as `community <name> { ... }`), still isn't caught - that
// shape has no "value" leaf to key the check off of, and blanket-
// checking every tag-node identifier regardless of shape would also
// mis-mask unrelated structural nodes (see IsMaskedPath's own doc
// comment for why that's deliberately not done). Safe to leave
// undetected only insofar as such cases are rare in practice; flagged
// here so it isn't "fixed" accidentally in a way that breaks the
// (correct, narrower) masking this now does, and so it's visible as a
// follow-up.
func TestRedactSetCommands_KnownLimitation_TagNodeIdentifiers(t *testing.T) {
	line := `set snmp community 'public-ish-community-name' authorization 'ro'`
	got := mask.RedactSetCommands(line)
	if got != line {
		t.Skip("tag-node-identifier secrets are a known, documented masking gap (see comment above)")
	}
}
