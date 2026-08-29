package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"fmt"
	"math/big"
	"net"
	"time"
)

// generateSelfSignedCert produces an in-memory, ephemeral TLS
// certificate for the backend's own HTTPS listener, used when no
// TLS_CERT_FILE/TLS_KEY_FILE is configured. This mirrors VyOS's own
// documented behavior for its HTTPS API when no PKI certificate is
// bound to it, including the same production caveat: browsers will
// show a certificate warning, and operators who care about that should
// mount a real certificate instead.
func generateSelfSignedCert() (tls.Certificate, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generating key: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generating serial number: %w", err)
	}

	// This is a leaf server certificate that only ever terminates this
	// process's own TLS listener - it never signs other certificates -
	// so it deliberately does NOT request CA capabilities
	// (KeyUsageCertSign, IsCA). Some strict TLS clients/scanners flag a
	// leaf cert presenting CA capabilities as non-compliant with the
	// server-certificate profile; practical risk was low here (the
	// cert never leaves the process, and it's self-signed/self-trusted
	// anyway), but there's no reason to request more than a plain
	// server certificate needs.
	template := x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "vyos-client (self-signed, auto-generated)"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(5, 0, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{"localhost"},
		IPAddresses:  []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback},
	}

	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("creating certificate: %w", err)
	}

	return tls.Certificate{
		Certificate: [][]byte{der},
		PrivateKey:  key,
	}, nil
}
