package vyos

import (
	"crypto/x509"
	"encoding/base64"
	"time"
)

// ParsePKICertificateExpiry decodes a certificate as VyOS itself
// stores one (`pki certificate <name> certificate`/`pki ca <name>
// certificate`) and returns its validity window.
//
// VyOS stores the certificate as bare base64 DER - no `-----BEGIN
// CERTIFICATE-----` PEM armor at all (confirmed against the
// frontend's own pkiParse.ts test fixtures, which use the same
// unwrapped base64 shape) - so this decodes straight to DER and calls
// x509.ParseCertificate directly; no encoding/pem step is needed.
// crypto/x509 is already a dependency of this binary (see
// cmd/vyos-client/selfsigned.go's self-signed listener certificate),
// so this adds no new one.
//
// Returns an error for anything that isn't valid base64 or doesn't
// parse as a well-formed X.509 certificate - callers should treat
// that as "can't determine this one's expiry" rather than failing an
// entire request over one malformed/incomplete entry (this app's PKI
// area allows a certificate to be created with no certificate PEM at
// all yet - see pkiTypes.ts - which would hit this same path).
func ParsePKICertificateExpiry(rawBase64 string) (notBefore, notAfter time.Time, err error) {
	der, err := base64.StdEncoding.DecodeString(rawBase64)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return cert.NotBefore, cert.NotAfter, nil
}
