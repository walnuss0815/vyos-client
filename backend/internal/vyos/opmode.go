package vyos

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// Show runs the given operational-mode "show ..." command and returns
// its raw text output, exactly as it would appear on the CLI. Notably,
// path []string{"configuration", "commands"} returns the running
// configuration as flat `set` commands (equivalent to
// `show configuration commands`), which the Config Tree editor's
// "view as set commands" mode uses.
func (c *Client) Show(ctx context.Context, path []string) (string, error) {
	var out string
	if err := c.do(ctx, "/show", pathOp{Op: "show", Path: path}, &out); err != nil {
		return "", err
	}
	return out, nil
}

// ShowWithTimeout is Show, but with timeout used in place of this
// Client's own default (Config.Timeout, 30s if unset) for this one
// call - everything else (base URL, API key, TLS settings) is shared
// with the Client's normal *http.Client via the same underlying
// Transport, just a different Timeout value.
//
// This exists for log-fetching (vyos.ShowLogTail/ShowLogTailBounded):
// unlike every other op-mode command this app calls (all fast and
// effectively bounded in size), a log fetch's duration depends on how
// much matching journal history exists on the router, which varies
// enormously and isn't something this backend can predict or cap for
// most log sources. The default 30s timeout is tuned for this app's
// other, well-bounded calls and is too tight a ceiling for that one -
// a real production incident (a router with substantial log history
// timing out on the default/"system" log source) motivated this.
func (c *Client) ShowWithTimeout(ctx context.Context, path []string, timeout time.Duration) (string, error) {
	client := c.withTimeout(timeout)

	var out string
	if err := c.doWithClient(ctx, client, "/show", pathOp{Op: "show", Path: path}, &out); err != nil {
		return "", err
	}
	return out, nil
}

// Generate runs an operational-mode "generate ..." command.
func (c *Client) Generate(ctx context.Context, path []string) (string, error) {
	var out string
	if err := c.do(ctx, "/generate", pathOp{Op: "generate", Path: path}, &out); err != nil {
		return "", err
	}
	return out, nil
}

// Reset runs an operational-mode "reset ..." command.
func (c *Client) Reset(ctx context.Context, path []string) (string, error) {
	var out string
	if err := c.do(ctx, "/reset", pathOp{Op: "reset", Path: path}, &out); err != nil {
		return "", err
	}
	return out, nil
}

// Reboot reboots the system. path is typically []string{"now"}.
func (c *Client) Reboot(ctx context.Context, path []string) error {
	return c.do(ctx, "/reboot", pathOp{Op: "reboot", Path: path}, nil)
}

// Poweroff powers off the system. path is typically []string{"now"}.
func (c *Client) Poweroff(ctx context.Context, path []string) error {
	return c.do(ctx, "/poweroff", pathOp{Op: "poweroff", Path: path}, nil)
}

// Info calls the unauthenticated GET /info endpoint, which returns
// general system information (version, hostname, banner). Unlike every
// other method on Client, this does not send the API key and can be
// used to power the pre-login screen (e.g. showing the router's
// hostname/banner) or as a lightweight reachability check.
func (c *Client) Info(ctx context.Context) (*InfoResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/info", nil)
	if err != nil {
		return nil, fmt.Errorf("vyos: building request: %w", err)
	}

	respBody, statusCode, err := send(c.httpClient, req, "/info")
	if err != nil {
		return nil, err
	}

	var info InfoResponse
	if err := decodeEnvelope(respBody, statusCode, &info); err != nil {
		return nil, err
	}
	return &info, nil
}
