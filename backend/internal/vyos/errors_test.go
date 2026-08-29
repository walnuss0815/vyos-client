package vyos_test

import (
	"fmt"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func TestIsEmptyPath(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "matching status and message",
			err:  &vyos.APIError{StatusCode: 400, Message: "Configuration under specified path is empty"},
			want: true,
		},
		{
			name: "wrong status code",
			err:  &vyos.APIError{StatusCode: 500, Message: "Configuration under specified path is empty"},
			want: false,
		},
		{
			name: "right status, unrelated message",
			err:  &vyos.APIError{StatusCode: 400, Message: "malformed request"},
			want: false,
		},
		{
			name: "not an *APIError at all",
			err:  fmt.Errorf("connection refused"),
			want: false,
		},
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
		// Regression test: IsEmptyPath used to do a bare
		// `err.(*APIError)` type assertion, which only succeeds if
		// err is *exactly* an *APIError - not if some caller wraps it
		// with fmt.Errorf("...: %w", err), a completely ordinary
		// thing to do. errors.As correctly unwraps to find it.
		{
			name: "wrapped APIError is still recognized",
			err:  fmt.Errorf("fetching config: %w", &vyos.APIError{StatusCode: 400, Message: "path is empty"}),
			want: true,
		},
		{
			name: "doubly-wrapped APIError is still recognized",
			err:  fmt.Errorf("outer: %w", fmt.Errorf("inner: %w", &vyos.APIError{StatusCode: 400, Message: "is empty"})),
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := vyos.IsEmptyPath(tt.err); got != tt.want {
				t.Errorf("IsEmptyPath(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}
