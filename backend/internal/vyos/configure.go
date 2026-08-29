package vyos

import "context"

// Configure applies a batch of set/delete/comment operations to the
// running configuration as a single atomic transaction (VyOS validates
// and commits all of them together; if any operation fails, nothing in
// that transaction is committed). This is the config-mutation half of
// the app's "Commit" action — it does NOT persist to disk (see
// ConfigFileSave for that).
//
// If confirmTime > 0, VyOS starts a commit-confirm timer (in minutes):
// unless ConfigureConfirm is called before it expires, VyOS
// automatically reverts. This is the "safe apply" mechanism.
//
// ops must be non-empty; every op's Path must be non-empty (VyOS
// rejects set/delete with an empty path at /configure specifically).
func (c *Client) Configure(ctx context.Context, ops []ConfigOp, confirmTime int) error {
	if len(ops) == 0 {
		return &APIError{StatusCode: 400, Message: "no operations to apply"}
	}

	if len(ops) == 1 {
		payload := configureSingle{
			Op:          ops[0].Op,
			Path:        ops[0].Path,
			Value:       ops[0].Value,
			ConfirmTime: confirmTime,
		}
		return c.do(ctx, "/configure", payload, nil)
	}

	payload := configureList{Commands: ops, ConfirmTime: confirmTime}
	return c.do(ctx, "/configure", payload, nil)
}

// Confirming a pending commit-confirm started via Configure(...,
// confirmTime > 0) is done through ConfigFileConfirm (POSTs to
// /config-file, not /configure) - see that method's doc comment for
// why. There is deliberately no /configure-based confirm method here:
// real VyOS's /configure endpoint requires a non-empty 'path' on every
// command with no exception for the confirm pseudo-op, so a pathless
// {"op":"confirm"} sent there is rejected outright.
