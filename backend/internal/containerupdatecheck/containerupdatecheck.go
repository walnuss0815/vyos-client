// Package containerupdatecheck combines a VyOS config read
// (enumerating configured containers and their image references) with
// internal/imageupdate's registry-checking logic - the orchestration
// layer both the manual "Check for update" button
// (internal/api/container_update_handlers.go) and the scheduled
// background sweep below share, so the VyOS-specific parts (container
// enumeration, registry-credential lookup) aren't duplicated between
// the two.
//
// Checker.Run is the background half: given
// config.Config.ContainerUpdateBackgroundCheckEnabled,
// cmd/vyos-client/serve.go schedules it on
// config.Config.ContainerUpdateCheckCron via robfig/cron, raising an
// internal/notifications.Notification for anything it finds - see
// docs/architecture.md's "Container image update checks" section.
package containerupdatecheck

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/walnuss0815/vyos-client/backend/internal/imageupdate"
	"github.com/walnuss0815/vyos-client/backend/internal/notifications"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// NotificationCategory tags every notification Checker.Run raises -
// exposed so callers/tests can filter on it without hardcoding the
// string themselves.
const NotificationCategory = "container-image-update"

// ContainersPageLink is the notifications.Notification.Link value
// every notification Checker.Run raises points at - the frontend
// route where a found update can actually be acted on (the same
// "Check for update" -> "Upgrade" flow this background sweep
// automates the first half of). Exported so tests don't need to
// hardcode the route string themselves either.
const ContainersPageLink = "/container/containers"

// LookupRegistryCredentials looks up a VyOS `container registry
// <registryName>` entry's credentials and `insecure` flag, for
// authenticating a tag-listing request against that registry - the
// same hostname-based matching convention VyOS/Podman themselves use
// (see the Containers > Registries page's own help text: "VyOS uses
// docker.io and quay.io by default even without an entry here").
// Returns (nil, false, nil) if no matching registry entry exists at
// all, which is the normal case for a public image with no configured
// credentials.
//
// Unlike the browser-facing POST /api/config/reveal endpoint, this
// reads the registry password directly via vyosClient.ReturnValue
// rather than going through that endpoint - the same pattern
// auth.VyOSUserVerifier already uses for reading a login user's own
// password hash: both are backend-internal uses of a secret that's
// never sent to the browser, as opposed to handleReveal's job of
// deliberately exposing one to an operator on request.
func LookupRegistryCredentials(ctx context.Context, vyosClient *vyos.Client, logger *slog.Logger, registryName string) (*imageupdate.Credentials, bool, error) {
	registryPath := []string{"container", "registry", registryName}
	exists, err := vyosClient.Exists(ctx, registryPath)
	if err != nil {
		return nil, false, err
	}
	if !exists {
		return nil, false, nil
	}

	insecure, err := vyosClient.Exists(ctx, []string{"container", "registry", registryName, "insecure"})
	if err != nil {
		return nil, false, err
	}

	username, err := vyosClient.ReturnValue(ctx, []string{"container", "registry", registryName, "authentication", "username"})
	if err != nil && !vyos.IsEmptyPath(err) {
		return nil, false, err
	}
	password, err := vyosClient.ReturnValue(ctx, []string{"container", "registry", registryName, "authentication", "password"})
	if err != nil && !vyos.IsEmptyPath(err) {
		return nil, false, err
	}

	if username == "" && password == "" {
		return nil, insecure, nil
	}
	logger.Warn("registry credentials read for a container image update check", "registry", registryName)
	return &imageupdate.Credentials{Username: username, Password: password}, insecure, nil
}

// ListContainerImages returns every configured container's name and
// image reference (`container name <name> image <ref>`). An absent
// `container name` tree at all (no containers configured) returns an
// empty map, not an error - only a genuine VyOS API failure does. A
// container entry with no (or a non-string) `image` leaf is silently
// skipped rather than failing the whole listing - defensive parsing of
// a config shape this package doesn't fully own the schema of.
func ListContainerImages(ctx context.Context, vyosClient *vyos.Client) (map[string]string, error) {
	tree, err := vyosClient.ShowConfig(ctx, []string{"container", "name"})
	if err != nil {
		if vyos.IsEmptyPath(err) {
			return map[string]string{}, nil
		}
		return nil, err
	}
	containers, ok := tree.(map[string]any)
	if !ok {
		return map[string]string{}, nil
	}
	out := make(map[string]string, len(containers))
	for name, raw := range containers {
		cfg, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		image, ok := cfg["image"].(string)
		if !ok || image == "" {
			continue
		}
		out[name] = image
	}
	return out, nil
}

// Checker runs a full container-image-update sweep on demand (Run) -
// see cmd/vyos-client/serve.go for how this is scheduled via
// robfig/cron. Every field is required; none are safe to leave nil.
type Checker struct {
	VyOS          *vyos.Client
	Registry      *imageupdate.Client
	Notifications *notifications.Store
	Logger        *slog.Logger
}

// Run checks every configured container's image for an available
// update, raising a Notification (via Store.AddIfNotPresent, so
// re-running this for a still-outstanding update doesn't pile up
// duplicate notifications) for each one found. Errors checking an
// individual container (a malformed image reference, a registry that
// couldn't be reached, ...) are logged and that container is skipped
// rather than aborting the whole sweep - one container's problem
// shouldn't hide findings for every other one.
func (c *Checker) Run(ctx context.Context) {
	containers, err := ListContainerImages(ctx, c.VyOS)
	if err != nil {
		c.Logger.Error("background container image update check: listing configured containers", "error", err)
		return
	}
	for name, image := range containers {
		c.checkOne(ctx, name, image)
	}
}

func (c *Checker) checkOne(ctx context.Context, containerName, image string) {
	ref, err := imageupdate.ParseReference(image)
	if err != nil {
		// Not every configured image is necessarily a well-formed,
		// checkable reference (and VyOS itself doesn't validate this
		// any more strictly) - log at Warn, not Error, and move on.
		c.Logger.Warn("background container image update check: could not parse image reference",
			"container", containerName, "image", image, "error", err)
		return
	}
	if ref.HasDigest {
		// A digest-pinned reference has no "newer tag" to suggest -
		// same as the manual check's own handling.
		return
	}

	creds, insecure, err := LookupRegistryCredentials(ctx, c.VyOS, c.Logger, ref.RegistryName)
	if err != nil {
		c.Logger.Error("background container image update check: looking up registry credentials",
			"container", containerName, "registry", ref.RegistryName, "error", err)
		return
	}

	tags, err := c.Registry.ListTags(ctx, ref, creds, insecure)
	if err != nil {
		c.Logger.Error("background container image update check: listing registry tags",
			"container", containerName, "image", image, "error", err)
		return
	}

	newest, ok := imageupdate.NewestMatching(tags, ref.Tag)
	if !ok || newest == "" {
		// Either ref.Tag isn't a recognized version tag (e.g.
		// "latest"), or it's already the newest matching tag found -
		// neither is worth a notification.
		return
	}

	newImageRef, err := imageupdate.ReplaceTag(image, newest)
	if err != nil {
		c.Logger.Error("background container image update check: building new image reference",
			"container", containerName, "error", err)
		return
	}

	// Keyed on the container + the specific old->new tag pair, not
	// just the container name - if this same update is found again
	// tomorrow (not yet acted on), AddIfNotPresent suppresses the
	// duplicate; but if a *further* newer tag shows up later, that's
	// a genuinely new thing to notify about, so it gets its own entry.
	dedupeKey := fmt.Sprintf("%s:%s:%s->%s", NotificationCategory, containerName, ref.Tag, newest)
	added, _, err := c.Notifications.AddIfNotPresent(dedupeKey, notifications.Notification{
		Severity: notifications.SeverityInfo,
		Category: NotificationCategory,
		Title:    fmt.Sprintf("Update available: %s", containerName),
		Message:  fmt.Sprintf("%s can be updated to %s.", image, newImageRef),
		// The Containers page is where this suggested upgrade can
		// actually be applied (the same "Check for update" ->
		// "Upgrade" flow this background sweep automates the first
		// half of) - not a deep link to this specific container's own
		// row, since that page has no such highlighting mechanism.
		Link: ContainersPageLink,
	})
	if err != nil {
		c.Logger.Error("background container image update check: recording notification",
			"container", containerName, "error", err)
		return
	}
	if added {
		c.Logger.Info("container image update found", "container", containerName, "current", image, "new", newImageRef)
	}
}
