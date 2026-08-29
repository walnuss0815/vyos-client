package vyos

import (
	"errors"
	"fmt"
	"strings"
)

// APIError is returned when the VyOS API responds with success=false, or
// with a non-2xx HTTP status carrying an error envelope.
type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("vyos api error (http %d): %s", e.StatusCode, e.Message)
}

// IsEmptyPath reports whether err represents VyOS's "configuration under
// specified path is empty" condition, which showConfig returns as an
// HTTP 400 error for a syntactically valid but unpopulated path. Callers
// that need to distinguish "no config here" from a real error (e.g. when
// probing optional subtrees) should check this, or better, use Exists
// first as VyOS's own docs recommend.
//
// Uses errors.As rather than a direct type assertion so this keeps
// working if a caller ever wraps the error (e.g. fmt.Errorf("...: %w",
// err), a completely ordinary thing to do) before passing it here - a
// bare type assertion would silently start returning false for a
// genuine empty-path condition the moment any caller did that,
// with no compiler warning.
func IsEmptyPath(err error) bool {
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	return apiErr.StatusCode == 400 && strings.Contains(apiErr.Message, "is empty")
}
