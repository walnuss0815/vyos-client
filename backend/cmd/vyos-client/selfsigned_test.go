package main

import (
	"crypto/x509"
	"testing"
)

// TestGenerateSelfSignedCert_IsNotACertificateAuthority guards against
// an X.509-hygiene issue: this certificate only ever terminates the
// backend's own TLS listener - it's never used to sign other
// certificates - so it shouldn't present CA capabilities. Practical
// risk from IsCA/KeyUsageCertSign being set was low (the cert never
// leaves the process, and it's self-signed/self-trusted anyway), but
// some strict TLS clients/scanners flag leaf certs presenting CA
// capabilities as non-compliant with the server-certificate profile.
func TestGenerateSelfSignedCert_IsNotACertificateAuthority(t *testing.T) {
	cert, err := generateSelfSignedCert()
	if err != nil {
		t.Fatalf("generateSelfSignedCert: %v", err)
	}
	parsed, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatalf("ParseCertificate: %v", err)
	}
	if parsed.IsCA {
		t.Error("expected a leaf server certificate, got IsCA=true")
	}
	if parsed.KeyUsage&x509.KeyUsageCertSign != 0 {
		t.Error("expected KeyUsageCertSign not to be set on a leaf server certificate")
	}
	if parsed.KeyUsage&x509.KeyUsageDigitalSignature == 0 {
		t.Error("expected KeyUsageDigitalSignature to remain set")
	}
	found := false
	for _, eku := range parsed.ExtKeyUsage {
		if eku == x509.ExtKeyUsageServerAuth {
			found = true
		}
	}
	if !found {
		t.Error("expected ExtKeyUsageServerAuth to remain set")
	}
}
