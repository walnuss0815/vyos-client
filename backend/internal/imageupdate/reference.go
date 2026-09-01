// Package imageupdate checks whether a container's configured image
// tag has a newer equivalent published on its registry - the engine
// behind the Containers page's "Check for update" button (see
// backend/internal/api/container_update_handlers.go and
// docs/architecture.md's "Container image update checks" section).
//
// Unlike internal/selfupgrade (which only ever talks to GitHub's
// Releases API for this project's own repo), a container's image can
// live on any registry implementing the standard Docker Distribution
// v2 HTTP API - Docker Hub, GHCR, Quay, and most self-hosted
// registries all speak this same protocol, including its
// challenge/response authentication flow - so this package
// implements just enough of that protocol (auth-challenge handling
// and paginated tag listing) rather than hardcoding a single provider
// the way selfupgrade does. No manifest or blob fetching is needed:
// only tag *names* matter for comparing against the currently
// configured tag.
package imageupdate

import (
	"fmt"
	"strings"
)

// dockerHubRegistryName is the hostname VyOS/Podman treat as "Docker
// Hub" for the purpose of matching a `container registry <name>`
// entry's credentials, and the conventional name an image reference
// with no explicit registry host implies (see the Containers >
// Registries page's own help text: "VyOS uses docker.io and quay.io
// by default even without an entry here").
const dockerHubRegistryName = "docker.io"

// dockerHubAPIHost is the actual host that serves Docker Hub's v2
// registry API - notably NOT "docker.io" itself, which doesn't answer
// registry API requests at all. This is the one hardcoded
// registry-specific special case in this package; every other
// registry (GHCR, Quay, self-hosted, ...) serves its v2 API directly
// at its own conventional hostname.
const dockerHubAPIHost = "registry-1.docker.io"

// dockerHubImplicitNamespace is prefixed onto an unqualified
// single-segment Docker Hub repository name (e.g. "nginx" ->
// "library/nginx") - Docker's own convention for its
// Hub-maintained "official images" namespace. Only applies to Docker
// Hub; every other registry requires the full path as given.
const dockerHubImplicitNamespace = "library/"

// Reference is a parsed OCI/Docker image reference, split into the
// parts needed to query a registry's tag list and to determine
// whether the currently configured tag has a newer equivalent.
type Reference struct {
	// RegistryName is the hostname used to match a VyOS `container
	// registry <name>` entry's credentials - see
	// dockerHubRegistryName's doc comment for the one case (Docker
	// Hub) where this differs from APIHost.
	RegistryName string
	// APIHost is the actual host to send Docker Distribution v2 API
	// requests to.
	APIHost string
	// Repository is the image path within the registry, e.g.
	// "library/nginx" or "org/app" - already including Docker Hub's
	// implicit "library/" prefix for an unqualified single-segment
	// name.
	Repository string
	// Tag is the reference's tag, defaulting to "latest" per Docker
	// convention when the original reference had no explicit tag.
	// Meaningless (left as "latest", the parse-time default) when
	// HasDigest is true - callers should check HasDigest first.
	Tag string
	// HasDigest reports whether the original reference was pinned to
	// an "@sha256:..." digest - an update check makes no sense in
	// that case (there's no "newer" digest to suggest), regardless of
	// whether a tag was also present alongside it.
	HasDigest bool
}

// ParseReference parses image (e.g. "nginx:1.25.3",
// "ghcr.io/org/app:v2.0.1", "myregistry.example.com:5000/team/app",
// "nginx@sha256:...") using the same host-vs-repository-path
// disambiguation rule Docker's own tooling uses: the first "/"
// -delimited segment is a registry host only if it contains a "."
// or ":", or is exactly "localhost" - otherwise the whole reference
// is treated as an (optionally-namespaced) Docker Hub repository.
func ParseReference(image string) (Reference, error) {
	image = strings.TrimSpace(image)
	if image == "" {
		return Reference{}, fmt.Errorf("imageupdate: empty image reference")
	}

	hasDigest := false
	if idx := strings.Index(image, "@"); idx != -1 {
		hasDigest = true
		image = image[:idx]
	}
	if image == "" {
		return Reference{}, fmt.Errorf("imageupdate: reference has a digest but no repository path")
	}

	pathPart, tag := splitTag(image)
	if tag == "" {
		tag = "latest"
	}

	host, repoPath := splitHost(pathPart)
	if repoPath == "" {
		return Reference{}, fmt.Errorf("imageupdate: %q has no repository path", image)
	}

	ref := Reference{Tag: tag, HasDigest: hasDigest}
	// An explicit "docker.io/..." host is equivalent to no host at
	// all (Docker's own CLI normalizes them the same way) - both get
	// the real API host substituted and the same "library/" namespace
	// treatment for an unqualified single-segment repository path.
	if host == "" || host == dockerHubRegistryName {
		ref.RegistryName = dockerHubRegistryName
		ref.APIHost = dockerHubAPIHost
		if !strings.Contains(repoPath, "/") {
			repoPath = dockerHubImplicitNamespace + repoPath
		}
	} else {
		ref.RegistryName = host
		ref.APIHost = host
	}
	ref.Repository = repoPath
	return ref, nil
}

// splitTag separates a trailing ":tag" from image, using the same
// rule as Docker's own reference parser: only a colon appearing after
// the last "/" can be a tag separator, so a ":port" earlier in the
// string (e.g. "myregistry.example.com:5000/app") is never mistaken
// for one. Returns tag == "" if image has no explicit tag.
func splitTag(image string) (pathPart, tag string) {
	lastSlash := strings.LastIndex(image, "/")
	tail := image
	prefix := ""
	if lastSlash != -1 {
		prefix = image[:lastSlash+1]
		tail = image[lastSlash+1:]
	}
	if idx := strings.LastIndex(tail, ":"); idx != -1 {
		return prefix + tail[:idx], tail[idx+1:]
	}
	return image, ""
}

// splitHost separates a leading registry host from pathPart, using
// Docker's own disambiguation rule (see ParseReference's doc
// comment). Returns host == "" when pathPart has no registry host at
// all (an implicit Docker Hub reference).
func splitHost(pathPart string) (host, repoPath string) {
	firstSlash := strings.Index(pathPart, "/")
	if firstSlash == -1 {
		return "", pathPart
	}
	candidate := pathPart[:firstSlash]
	if looksLikeHost(candidate) {
		return candidate, pathPart[firstSlash+1:]
	}
	return "", pathPart
}

// looksLikeHost reports whether s (a reference's first "/"-delimited
// segment) is a registry host rather than the first segment of a
// Docker Hub repository path.
func looksLikeHost(s string) bool {
	return s == "localhost" || strings.ContainsAny(s, ".:")
}

// ReplaceTag returns image with its trailing tag replaced by newTag,
// preserving everything else in the original string exactly as
// written (registry host, casing, presence/absence of an explicit
// "docker.io/library/" prefix, and so on) - the config change this
// produces should look like a minimal edit of what the operator
// actually typed, not a fully-qualified/normalized reference this
// package reconstructed internally for its own registry API calls.
// image must not contain a digest ("@...") - callers should have
// already excluded that case via Reference.HasDigest.
func ReplaceTag(image, newTag string) (string, error) {
	if strings.Contains(image, "@") {
		return "", fmt.Errorf("imageupdate: cannot replace the tag on a digest-pinned reference %q", image)
	}
	pathPart, _ := splitTag(image)
	return pathPart + ":" + newTag, nil
}
