package vyos

import (
	"context"
	"time"
)

// systemImageAddTimeout bounds a single `add system image <url>` call
// (installing a new VyOS release) - deliberately much longer than
// containerImagePullTimeout: a VyOS ISO is typically hundreds of MB
// (fetched by the same kind of no-timeout-of-its-own VyOS script), and
// the install itself (image extraction, GRUB configuration) adds
// further time on top of the download.
const systemImageAddTimeout = 30 * time.Minute

// systemImageDeleteTimeout mirrors containerImageDeleteTimeout's
// reasoning: deleting an already-installed image is normally fast,
// but VyOS's own script has no timeout of its own either.
const systemImageDeleteTimeout = 2 * time.Minute

// SystemImage is one row of `show system image` (docs.vyos.io/.../
// installation/image.html) - the list of VyOS releases installed on
// this router, entirely distinct from ContainerImage (podman images).
// There is no "... json" op-mode variant for this command (unlike
// ShowContainerImages), so this is parsed from tabulate-style text.
type SystemImage struct {
	Name string
	// IsDefaultBoot is whether this image is the one that boots next
	// - see docs.vyos.io's "System rollback" section: switching this
	// (via `set system image default-boot <name>`, an ordinary config
	// write, not an op-mode action) plus a reboot is how VyOS rolls
	// back to a previously-installed version.
	IsDefaultBoot bool
	IsRunning     bool
}

// ShowSystemImages returns every VyOS system image installed on this
// router. Uses parseTabulateTable, the same helper ShowDHCPLeases and
// others use for VyOS op-mode output with no JSON equivalent -
// "Default boot"/"Running" cells are blank (not "No") for every image
// except the currently active ones, which parseTabulateTable's
// column-position slicing already handles correctly for a short/blank
// trailing cell (confirmed against the real command's own sample
// output, where non-default/non-running rows are genuinely shorter
// text lines, not padded with trailing spaces).
func (c *Client) ShowSystemImages(ctx context.Context) ([]SystemImage, error) {
	text, err := c.Show(ctx, []string{"system", "image"})
	if err != nil {
		return nil, err
	}
	rows := parseTabulateTable(text)
	images := make([]SystemImage, 0, len(rows))
	for _, row := range rows {
		name := row["Name"]
		if name == "" {
			continue
		}
		images = append(images, SystemImage{
			Name:          name,
			IsDefaultBoot: row["Default boot"] == "Yes",
			IsRunning:     row["Running"] == "Yes",
		})
	}
	return images, nil
}

// AddSystemImage runs `add system image <url>` via the dedicated
// /image REST endpoint (confirmed against docs.vyos.io's VyOS API
// page) - a genuinely different, non-interactive REST shape from the
// CLI's own interactive prompts (image name, signature-check bypass);
// the REST model only takes a URL. Returns whatever text VyOS's own
// installer script printed, for display - the same "no progress
// reporting mid-flight" situation PullContainerImage's doc comment
// describes, just for a full VyOS ISO (hundreds of MB) instead of a
// single container image layer.
//
// Installing a new image does not itself make it the default boot
// image or reboot into it - see ShowSystemImages/IsDefaultBoot and
// the frontend's "Set as default boot" action (an ordinary
// `set system image default-boot <name>` config write, queued through
// the normal pending-changes cart) plus a manual reboot.
func (c *Client) AddSystemImage(ctx context.Context, url string) (string, error) {
	client := c.withTimeout(systemImageAddTimeout)
	var out string
	if err := c.doWithClient(ctx, client, "/image", systemImageOp{Op: "add", URL: url}, &out); err != nil {
		return "", err
	}
	return out, nil
}

// DeleteSystemImage runs `delete system image <name>` via /image.
// VyOS itself is expected to refuse deleting the currently-running or
// default-boot image (the CLI's own interactive flow only ever offers
// non-running images to delete) - that refusal, if it happens,
// surfaces here as a normal *APIError, same as any other VyOS-side
// validation failure.
func (c *Client) DeleteSystemImage(ctx context.Context, name string) (string, error) {
	client := c.withTimeout(systemImageDeleteTimeout)
	var out string
	if err := c.doWithClient(ctx, client, "/image", systemImageOp{Op: "delete", Name: name}, &out); err != nil {
		return "", err
	}
	return out, nil
}
