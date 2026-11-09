package api

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestHandleVyOSError_TimeoutOnConfigWrite(t *testing.T) {
	s := &Server{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	err := fmt.Errorf("vyos: calling /configure: %w", context.DeadlineExceeded)

	for _, action := range []string{
		"applying configuration",
		"confirming configuration",
		"importing configuration",
		"rolling back configuration",
		"saving configuration",
	} {
		rec := httptest.NewRecorder()
		s.handleVyOSError(rec, action, err)
		if rec.Code != http.StatusGatewayTimeout {
			t.Errorf("%s: status = %d, want 504", action, rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "may still have been applied") {
			t.Errorf("%s: body = %q, want it to say the change may still have been applied", action, rec.Body.String())
		}
	}
}

func TestHandleVyOSError_NetTimeoutOnConfigWrite(t *testing.T) {
	s := &Server{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	err := fmt.Errorf("vyos: calling /configure: %w", &net.OpError{Op: "read", Err: os.ErrDeadlineExceeded})
	rec := httptest.NewRecorder()
	s.handleVyOSError(rec, "applying configuration", err)
	if rec.Code != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, want 504", rec.Code)
	}
}

func TestHandleVyOSError_TimeoutOnReadKeepsBadGateway(t *testing.T) {
	s := &Server{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	rec := httptest.NewRecorder()
	s.handleVyOSError(rec, "reading configuration", fmt.Errorf("x: %w", context.DeadlineExceeded))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}
