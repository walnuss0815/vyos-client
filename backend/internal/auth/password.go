package auth

import "golang.org/x/crypto/bcrypt"

// HashPassword bcrypt-hashes a plaintext password for storage in the
// UI_ADMIN_PASSWORD_HASH environment variable. Exposed via the
// `vyos-client hash-password` CLI subcommand so operators never need to
// put a plaintext password into VyOS's own container `environment`
// config (which is not masked or encrypted by VyOS).
func HashPassword(plaintext string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyPassword reports whether plaintext matches the given bcrypt
// hash. It is safe to call with attacker-controlled input; bcrypt
// comparison is constant-time with respect to the hash contents.
func VerifyPassword(hash, plaintext string) bool {
	if hash == "" {
		return false
	}
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext))
	return err == nil
}
