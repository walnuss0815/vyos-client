package vyos

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// containerImagePullTimeout bounds a single `add container image`
// (podman pull) call. Deliberately generous - VyOS's own op-mode
// script (container.py's add_image) runs `podman image pull` with no
// timeout of its own at all, and a large image over a slow WAN
// uplink can legitimately take minutes. The API handler
// (handlePullContainerImage) extends this specific HTTP request's own
// write deadline to match, so this backend's normal
// http.Server.WriteTimeout doesn't cut the response off first - see
// that handler's doc comment.
const containerImagePullTimeout = 10 * time.Minute

// containerImageDeleteTimeout is more generous than this app's normal
// ~30s default (still using ShowWithTimeout's sibling mechanism, not
// Show itself) but far shorter than a pull: deleting an image is
// normally fast (an existence/in-use check plus removing local
// layers), but VyOS's own delete_image script still has no timeout of
// its own, so a very large image could plausibly take longer than the
// default.
const containerImageDeleteTimeout = 2 * time.Minute

// ContainerImage is one entry from `podman image ls --format json`,
// decoded verbatim - VyOS's own container.py show_image(raw=True)
// does zero reshaping of podman's own JSON, so this mirrors podman's
// native field names/casing exactly, not VyOS's usual camelCase
// convention. Only the fields this app actually displays are
// captured; podman's real output has more (ParentId, RepoDigests,
// SharedSize, VirtualSize, Labels, Digest, History, CreatedAt, ...)
// which are tolerated/ignored, not rejected.
//
// Names vs. RepoTags: confirmed empirically (podman 5.8.6) that a
// freshly-pulled, tagged image reports its tag(s) under "Names" while
// "RepoTags" is null for that same image - which of the two actually
// holds the human-readable reference has varied across podman
// versions/behavior, so both are captured and callers should treat
// them as equivalent, using whichever is non-empty (see
// ContainerImage.Tags).
type ContainerImage struct {
	ID         string   `json:"Id"`
	Names      []string `json:"Names,omitempty"`
	RepoTags   []string `json:"RepoTags,omitempty"`
	SizeBytes  int64    `json:"Size"`
	Containers int      `json:"Containers"`
	// Created is Unix seconds - podman has emitted this as either a
	// whole int or (in some versions) a value with a fractional
	// component, so float64 is used to tolerate either rather than
	// risk a decode error on a field this app only ever displays,
	// never does precise arithmetic on.
	Created float64 `json:"Created"`
}

// Tags returns whichever of Names/RepoTags is populated (see the
// type's doc comment for why both exist) - "<none>" (podman/docker's
// own convention for an untagged image) if neither is.
func (i ContainerImage) Tags() []string {
	if len(i.Names) > 0 {
		return i.Names
	}
	if len(i.RepoTags) > 0 {
		return i.RepoTags
	}
	return []string{"<none>"}
}

// ShowContainerImages returns every locally-present container image.
// Uses the generic Show (`show container image json`) rather than
// /container-image's own "show" op: the latter (session.
// show_container_image(), confirmed against vyos-1x's REST routers.py)
// runs `show container image` *without* the `json` op-mode child node,
// returning a human-formatted table this app would have to parse
// itself for no benefit - the exact same underlying data is already
// one op-mode path away from JSON.
func (c *Client) ShowContainerImages(ctx context.Context) ([]ContainerImage, error) {
	text, err := c.Show(ctx, []string{"container", "image", "json"})
	if err != nil {
		return nil, err
	}
	if text == "" {
		return []ContainerImage{}, nil
	}
	var images []ContainerImage
	if err := json.Unmarshal([]byte(text), &images); err != nil {
		return nil, fmt.Errorf("vyos: decoding container images: %w", err)
	}
	return images, nil
}

// PullContainerImage runs `add container image <name>` (`podman image
// pull <name>`, plus a registry login/logout around it if credentials
// are configured for the target registry under `container registry`)
// via the dedicated /container-image REST endpoint - not reachable
// through /generate or any other generic op-mode endpoint. Returns
// whatever text VyOS's own script printed (pull progress/result), for
// display.
//
// name is passed through to VyOS entirely unvalidated by this client -
// see api.validateContainerImageName for why that's the API handler's
// job (VyOS's own add_image has zero input sanitization itself,
// confirmed against its source - it interpolates name directly into a
// shell command).
func (c *Client) PullContainerImage(ctx context.Context, name string) (string, error) {
	client := c.withTimeout(containerImagePullTimeout)
	var out string
	if err := c.doWithClient(ctx, client, "/container-image", containerImageOp{Op: "add", Name: name}, &out); err != nil {
		return "", err
	}
	return out, nil
}

// DeleteContainerImage runs `delete container image <name>` (`podman
// image rm <name>`) via /container-image. VyOS's own delete_image
// checks first whether the image is in use by a running container and
// raises a clear error if so, rather than relying on podman's own
// error for that case - that error surfaces here as a normal
// *APIError, same as any other VyOS-side validation failure.
//
// Deliberately no "force" parameter: the CLI's `delete container image
// <name> force` variant maps to an *additional* op-mode path segment
// (confirmed against vyos-1x's op-mode-definitions/container.xml.in),
// but the REST API's ContainerImageModel has no "force" field at all
// (confirmed against vyos-1x's own models.py) and the session helper
// behind /container-image's delete op never appends one - so
// force-deleting an image is simply unreachable through this REST
// endpoint, not a choice this app is declining to expose.
func (c *Client) DeleteContainerImage(ctx context.Context, name string) (string, error) {
	client := c.withTimeout(containerImageDeleteTimeout)
	var out string
	if err := c.doWithClient(ctx, client, "/container-image", containerImageOp{Op: "delete", Name: name}, &out); err != nil {
		return "", err
	}
	return out, nil
}
