package vyos

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

// Config configures a Client.
type Config struct {
	// BaseURL is the base URL of the VyOS HTTPS API, e.g.
	// "https://127.0.0.1". No trailing slash.
	BaseURL string
	// APIKey is the plaintext key configured via
	// `set service https api keys id <id> key <key>`.
	APIKey string
	// InsecureSkipVerify disables TLS certificate verification. Only
	// intended for lab/dev use against VyOS's auto-generated
	// self-signed certificate; defaults to false.
	InsecureSkipVerify bool
	// Timeout bounds every individual HTTP call. Defaults to 30s.
	Timeout time.Duration
	// HTTPClient, if set, overrides the client constructed from the
	// other fields (mainly for tests).
	HTTPClient *http.Client
}

// Client is a minimal REST client for the VyOS HTTPS API. It only
// implements the endpoints this application needs; see routers.go in
// vyos-1x for the full surface.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// New constructs a Client from cfg.
func New(cfg Config) (*Client, error) {
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("vyos: BaseURL is required")
	}
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("vyos: APIKey is required")
	}

	httpClient := cfg.HTTPClient
	if httpClient == nil {
		timeout := cfg.Timeout
		if timeout == 0 {
			timeout = 30 * time.Second
		}
		//nolint:gosec // InsecureSkipVerify is an explicit, documented opt-in.
		transport := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: cfg.InsecureSkipVerify},
		}
		httpClient = &http.Client{Timeout: timeout, Transport: transport}
	}

	return &Client{
		baseURL:    strings.TrimRight(cfg.BaseURL, "/"),
		apiKey:     cfg.APIKey,
		httpClient: httpClient,
	}, nil
}

// withTimeout returns an *http.Client sharing this Client's own
// Transport (TLS config, connection pooling, etc.) but with timeout in
// place of the Timeout it was configured with. Every long-running
// operation this Client supports (log fetches, container/system image
// pull/add/delete) needs its own, individually-tuned timeout distinct
// from the ~30s default that's right for this app's other, fast/
// well-bounded calls - this is the one place that pattern is built,
// instead of five separate call sites each constructing their own
// otherwise-identical *http.Client.
func (c *Client) withTimeout(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, Transport: c.httpClient.Transport}
}

// do POSTs payload (already a struct that will be JSON-encoded into the
// "data" multipart field) to endpoint and decodes the response envelope
// into out (which may be nil if the caller doesn't care about the data
// field), using this Client's default HTTP client/timeout.
func (c *Client) do(ctx context.Context, endpoint string, payload any, out any) error {
	return c.doWithClient(ctx, c.httpClient, endpoint, payload, out)
}

// doWithClient is do, but with the *http.Client to use made an
// explicit parameter instead of always using c.httpClient - see
// ShowWithTimeout's doc comment for why a caller would ever want a
// different one (a longer timeout for one specific kind of request,
// without changing every other call this Client makes).
func (c *Client) doWithClient(ctx context.Context, httpClient *http.Client, endpoint string, payload any, out any) error {
	dataJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("vyos: encoding request: %w", err)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if err := writer.WriteField("data", string(dataJSON)); err != nil {
		return fmt.Errorf("vyos: building request: %w", err)
	}
	if err := writer.WriteField("key", c.apiKey); err != nil {
		return fmt.Errorf("vyos: building request: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("vyos: building request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+endpoint, body)
	if err != nil {
		return fmt.Errorf("vyos: building request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	respBody, statusCode, err := send(httpClient, req, endpoint)
	if err != nil {
		return err
	}
	return decodeEnvelope(respBody, statusCode, out)
}

// maxResponseBodyBytes caps how much of any single VyOS API response
// this client will read into memory, as a defense-in-depth backstop
// independent of this package's own, deliberately generous per-command
// truncation limits (maxFileViewContentBytes, ShowLogTail's maxLines) -
// those bound what gets *returned* to the caller, but do nothing to
// bound what io.ReadAll itself pulls into memory in the first place,
// since VyOS's own op-mode commands like `show file`/`show log` have
// no size limit of their own at all. Comfortably above any legitimate
// response this app expects (config trees and op-mode text output are
// normally well under a few MB) while still bounding the worst case -
// a misbehaving/compromised upstream, or a pathologically large file/
// log dump - to a fixed, predictable ceiling rather than "as much as
// the router feels like sending."
const maxResponseBodyBytes = 64 * 1024 * 1024

// send performs req against httpClient and returns its raw response
// body alongside the HTTP status code, wrapping transport/read errors
// with which endpoint they came from (for do and Info, whose own error
// messages otherwise wouldn't say which call failed). A package-level
// function rather than a Client method since it doesn't need anything
// from Client beyond the http.Client already passed in explicitly -
// doWithClient/Info both call this with whichever client applies.
func send(httpClient *http.Client, req *http.Request, endpoint string) ([]byte, int, error) {
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("vyos: calling %s: %w", endpoint, err)
	}
	defer func() { _ = resp.Body.Close() }()

	// +1 so a response that's *exactly* at the limit isn't
	// indistinguishable from one that got silently truncated - if
	// ReadAll returns exactly maxResponseBodyBytes+1 bytes, the real
	// response was at least that large and got cut short.
	limited := io.LimitReader(resp.Body, maxResponseBodyBytes+1)
	respBody, err := io.ReadAll(limited)
	if err != nil {
		return nil, 0, fmt.Errorf("vyos: reading response from %s: %w", endpoint, err)
	}
	if len(respBody) > maxResponseBodyBytes {
		return nil, 0, fmt.Errorf("vyos: response from %s exceeded %d bytes, aborting read", endpoint, maxResponseBodyBytes)
	}
	return respBody, resp.StatusCode, nil
}

// decodeEnvelope parses VyOS's {"success": bool, "data": ..., "error":
// "..."} response envelope, translating a non-success response into an
// *APIError, and decoding the "data" field into out (which may be nil
// if the caller doesn't care about it). Shared by do and Info, which
// otherwise duplicated this parsing nearly identically.
func decodeEnvelope(respBody []byte, statusCode int, out any) error {
	var env Envelope
	if err := json.Unmarshal(respBody, &env); err != nil {
		return &APIError{StatusCode: statusCode, Message: fmt.Sprintf("malformed response: %s", string(respBody))}
	}

	if !env.Success {
		msg := env.Error
		if msg == "" {
			msg = "unknown error"
		}
		return &APIError{StatusCode: statusCode, Message: msg}
	}

	if out != nil && len(env.Data) > 0 {
		// env.Data is already raw JSON (see Envelope's doc comment) -
		// decode it directly into the caller's concrete type, no
		// intermediate any/re-marshal round trip needed. Unmarshaling
		// a literal `null` here (an explicit "data": null response) is
		// a harmless no-op, equivalent to skipping it as the old
		// env.Data != nil check did.
		if err := json.Unmarshal(env.Data, out); err != nil {
			return fmt.Errorf("vyos: decoding response data: %w", err)
		}
	}

	return nil
}
