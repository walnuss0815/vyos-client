package vyos

import "context"

// ShowConfig returns the (subset of the) running configuration rooted
// at path, decoded from VyOS's JSON representation. Pass an empty path
// to retrieve the entire configuration.
//
// The return type is `any` rather than a fixed shape because VyOS's
// JSON representation of a config subtree varies with what's actually
// there: an object for an intermediate node, a plain string for a
// scalar leaf (e.g. ["system","host-name"]), or an array of strings
// for a multi-valued leaf.
//
// VyOS returns an error for a syntactically valid path that has no
// configuration under it (see IsEmptyPath); callers that need to
// distinguish "absent" from "error" should call Exists first, as VyOS's
// own docs recommend.
func (c *Client) ShowConfig(ctx context.Context, path []string) (any, error) {
	var out any
	payload := retrieveOp{Op: "showConfig", Path: path, ConfigFormat: "json"}
	if err := c.do(ctx, "/retrieve", payload, &out); err != nil {
		return nil, err
	}
	return unwrapShowConfig(out, path), nil
}

// unwrapShowConfig undoes a VyOS API quirk: for a non-empty path,
// showConfig's underlying implementation (cli-shell-api showConfig
// <path>, converted from curly-brace CLI syntax to JSON) returns the
// requested node exactly as it appears nested inside its parent's
// config block - i.e. wrapped in a single-key object keyed by path's
// own last segment - rather than just the node's own content. E.g.
// requesting ["system","host-name"] returns {"host-name": "router1"},
// not "router1"; requesting ["system"] returns {"system": {...}}, not
// {...}. ShowConfig's documented contract is "the configuration rooted
// at path", so that extra level is stripped here, once, rather than
// requiring every caller to know about and compensate for it. An empty
// path (whole-config fetch) is never wrapped this way, since there's
// no parent to nest under.
func unwrapShowConfig(node any, path []string) any {
	if len(path) == 0 {
		return node
	}
	m, ok := node.(map[string]any)
	if !ok || len(m) != 1 {
		return node
	}
	if v, ok := m[path[len(path)-1]]; ok {
		return v
	}
	return node
}

// Exists reports whether a configuration path exists.
func (c *Client) Exists(ctx context.Context, path []string) (bool, error) {
	var out bool
	payload := retrieveOp{Op: "exists", Path: path}
	if err := c.do(ctx, "/retrieve", payload, &out); err != nil {
		return false, err
	}
	return out, nil
}

// ReturnValues returns all values of a multi-valued leaf node.
func (c *Client) ReturnValues(ctx context.Context, path []string) ([]string, error) {
	var out []string
	payload := retrieveOp{Op: "returnValues", Path: path}
	if err := c.do(ctx, "/retrieve", payload, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ReturnValue returns the value of a single-valued leaf node.
func (c *Client) ReturnValue(ctx context.Context, path []string) (string, error) {
	var out string
	payload := retrieveOp{Op: "returnValue", Path: path}
	if err := c.do(ctx, "/retrieve", payload, &out); err != nil {
		return "", err
	}
	return out, nil
}
