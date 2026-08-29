package vyos_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"math/big"
	"testing"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// makeTestCertBase64 generates a real, self-signed X.509 certificate
// with the given validity window and returns it exactly as VyOS itself
// stores one: bare base64 DER, no PEM armor - see
// ParsePKICertificateExpiry's own doc comment for why that matters.
func makeTestCertBase64(t *testing.T, notBefore, notAfter time.Time) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "test-cert"},
		NotBefore:    notBefore,
		NotAfter:     notAfter,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("CreateCertificate: %v", err)
	}
	return base64.StdEncoding.EncodeToString(der)
}

func TestParsePKICertificateExpiry(t *testing.T) {
	notBefore := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	notAfter := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	certBase64 := makeTestCertBase64(t, notBefore, notAfter)

	gotNotBefore, gotNotAfter, err := vyos.ParsePKICertificateExpiry(certBase64)
	if err != nil {
		t.Fatalf("ParsePKICertificateExpiry: %v", err)
	}
	if !gotNotBefore.Equal(notBefore) {
		t.Errorf("NotBefore = %v, want %v", gotNotBefore, notBefore)
	}
	if !gotNotAfter.Equal(notAfter) {
		t.Errorf("NotAfter = %v, want %v", gotNotAfter, notAfter)
	}
}

func TestParsePKICertificateExpiry_RejectsInvalidBase64(t *testing.T) {
	_, _, err := vyos.ParsePKICertificateExpiry("not valid base64!!!")
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestParsePKICertificateExpiry_RejectsMalformedDER(t *testing.T) {
	_, _, err := vyos.ParsePKICertificateExpiry(base64.StdEncoding.EncodeToString([]byte("not a certificate")))
	if err == nil {
		t.Fatal("expected an error")
	}
}
