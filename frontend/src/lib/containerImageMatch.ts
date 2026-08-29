import type { ContainerDefinition } from './containerTypes'
import type { ContainerImage } from './vyosApi'

/**
 * Whether `imageRef` (as typed into a container definition's own
 * `image` field, e.g. `"nginx:latest"` or
 * `"docker.io/library/nginx:latest"`) matches any already-pulled
 * image's tags.
 *
 * Exact string match only - podman's own `Names`/`RepoTags` output
 * isn't reliably normalized against every equivalent way the same
 * reference could be written (bare name vs. fully-qualified
 * `docker.io/library/...`, with/without an explicit `:latest`, etc. -
 * see `ContainerImage`'s own doc comment on the Names/RepoTags
 * quirk), so this deliberately doesn't attempt fuzzy/partial matching
 * that could produce a false "already pulled" positive and hide a
 * genuinely-needed pull prompt.
 *
 * An empty/blank `imageRef` returns `true` (nothing to flag yet) -
 * this is a "should we warn the user" check, not a validator.
 */
export function imageIsPulled(imageRef: string, images: ContainerImage[]): boolean {
  const trimmed = imageRef.trim()
  if (trimmed === '') return true
  return images.some((img) => img.tags.includes(trimmed))
}

/**
 * Images pulled onto the router (`images`) that are safe candidates
 * for ImagesPage.tsx's "Cleanup unused images" action: not referenced
 * by any configured container definition's `image` field, AND not
 * currently in use by any running container (`ContainerImage
 * .containers === 0`, podman's own live count, already shown as
 * ImagesPage's "In use" column).
 *
 * Both signals must agree before suggesting deletion - config-tree
 * reference and "is this running right now" answer different
 * questions and can disagree (a container started outside this app's
 * config, a config `image` value written in a different but
 * equivalent form than the pulled tag string, a definition edited to
 * reference something else without the old container being
 * restarted, ...), and deleting an image a container is actually
 * running would be actively harmful to suggest, regardless of what
 * the configuration says. A previous version of this function checked
 * config-tree reference only, which could recommend deleting an
 * in-use image - this is a fix for that, not just a stricter default.
 *
 * Exact tag match against the config-tree `image` field, same rule as
 * `imageIsPulled` above (see its doc comment for why fuzzy matching is
 * deliberately avoided).
 *
 * An image with no tags at all (a dangling/`<none>` image) is always
 * a config-tree-unreferenced candidate - nothing could reference it by
 * name - but is still excluded if it's currently running.
 */
export function unreferencedImages(
  images: ContainerImage[],
  containers: ContainerDefinition[],
): ContainerImage[] {
  const referenced = new Set(
    containers.map((c) => c.image?.trim()).filter((ref): ref is string => !!ref),
  )
  return images.filter((img) => img.containers === 0 && !img.tags.some((tag) => referenced.has(tag)))
}
