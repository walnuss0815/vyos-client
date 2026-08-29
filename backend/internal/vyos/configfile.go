package vyos

import "context"

// ConfigFileSave persists the current running configuration to disk.
// If file is empty, VyOS saves to /config/config.boot. This is the
// app's "Save" action.
func (c *Client) ConfigFileSave(ctx context.Context, file string) error {
	return c.do(ctx, "/config-file", configFileOp{Op: "save", File: file}, nil)
}

// ConfigFileMerge merges the given configuration text into the running
// configuration and commits it. This is not used by the interactive
// pending-changes flow (which uses Configure for that), but is useful
// for bulk import / restore-from-backup style operations exposed
// elsewhere in the UI. Additive only: nodes not present in configText
// are left untouched (VyOS's own "destructive" merge flag - which
// would also remove those - is deliberately not exposed here; see
// ConfigFileLoad for a full-replace alternative).
//
// If confirmTime > 0, a commit-confirm timer is started (see Configure).
func (c *Client) ConfigFileMerge(ctx context.Context, configText string, confirmTime int) error {
	return c.do(ctx, "/config-file", configFileOp{Op: "merge", String: configText, ConfirmTime: confirmTime}, nil)
}

// ConfigFileLoad replaces the entire candidate configuration with
// configText (VyOS's own `load` semantics - equivalent to running
// `configure` then `load <file>` at the CLI) and commits it. Unlike
// ConfigFileMerge, nodes not present in configText are removed - most
// notably, if configText doesn't include a working `service https`
// setup, this can lock the caller out of the HTTPS API (and therefore
// this app) entirely. Callers should surface that risk prominently
// before invoking this.
//
// If confirmTime > 0, a commit-confirm timer is started (see Configure)
// - strongly recommended here given the lockout risk above, since it
// gives an operator a window to notice and let VyOS auto-revert.
func (c *Client) ConfigFileLoad(ctx context.Context, configText string, confirmTime int) error {
	return c.do(ctx, "/config-file", configFileOp{Op: "load", String: configText, ConfirmTime: confirmTime}, nil)
}

// ConfigFileConfirm confirms a pending commit-confirm started via
// ConfigFileMerge(..., confirmTime > 0).
func (c *Client) ConfigFileConfirm(ctx context.Context) error {
	return c.do(ctx, "/config-file", confirmOp{Op: "confirm"}, nil)
}
