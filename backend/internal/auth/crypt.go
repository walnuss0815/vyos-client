package auth

import (
	"strings"

	"github.com/GehirnInc/crypt"
	_ "github.com/GehirnInc/crypt/apr1_crypt"
	_ "github.com/GehirnInc/crypt/md5_crypt"
	_ "github.com/GehirnInc/crypt/sha256_crypt"
	_ "github.com/GehirnInc/crypt/sha512_crypt"
)

// verifyUnixCrypt reports whether plaintext matches hash, a crypt(3)
// -style hash as stored in VyOS's `system login user <name>
// authentication encrypted-password` (confirmed retrievable verbatim
// via VyOS's REST API - see docs/roadmap.md and docs/security.md for
// how). VyOS's own conf-mode script always produces $6$ (sha512_crypt,
// via passlib's linux_context) for auto-generated hashes, but the
// schema also accepts a hand-pasted $1$ (md5_crypt), $5$
// (sha256_crypt), or apr1 hash, all of which
// github.com/GehirnInc/crypt supports. $y$ (yescrypt) is not
// supported by this pure-Go library and is treated as non-matching
// rather than an error - VyOS never auto-generates one, so this only
// affects a manually hand-pasted encrypted-password.
//
// It is safe to call with attacker-controlled/malformed input: empty,
// locked ("*", or "!"-prefixed - VyOS's/glibc's "no password"
// sentinel), and unsupported-prefix hashes are all rejected before
// crypt.NewFromHash is invoked, which the library's own documentation
// warns may panic on an unrecognized prefix otherwise.
func verifyUnixCrypt(hash, plaintext string) bool {
	if hash == "" || hash == "*" || strings.HasPrefix(hash, "!") {
		return false
	}
	if !crypt.IsHashSupported(hash) {
		return false
	}
	c := crypt.NewFromHash(hash)
	return c.Verify(hash, []byte(plaintext)) == nil
}
