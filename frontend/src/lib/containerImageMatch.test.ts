import { describe, expect, it } from 'vitest'
import { imageIsPulled, unreferencedImages } from './containerImageMatch'
import type { ContainerDefinition } from './containerTypes'
import { blankContainerDefinition } from './containerTypes'
import type { ContainerImage } from './vyosApi'

function image(...tags: string[]): ContainerImage {
  return { id: 'sha256:abc', tags, sizeBytes: 0, containers: 0, createdAt: 0 }
}

/** Same as `image`, but with a non-zero live running-container count -
 * for unreferencedImages' "currently in use" exclusion tests. */
function runningImage(...tags: string[]): ContainerImage {
  return { ...image(...tags), containers: 1 }
}

function container(name: string, imageRef?: string): ContainerDefinition {
  return { name, ...blankContainerDefinition(), image: imageRef }
}

describe('imageIsPulled', () => {
  it('is true for a blank/whitespace reference - nothing to flag yet', () => {
    expect(imageIsPulled('', [])).toBe(true)
    expect(imageIsPulled('   ', [])).toBe(true)
  })

  it('is true when an image with a matching tag has been pulled', () => {
    const images = [image('docker.io/library/nginx:latest')]
    expect(imageIsPulled('docker.io/library/nginx:latest', images)).toBe(true)
  })

  it('trims surrounding whitespace on the reference before comparing', () => {
    const images = [image('nginx:latest')]
    expect(imageIsPulled('  nginx:latest  ', images)).toBe(true)
  })

  it('is false when no pulled image has a matching tag', () => {
    const images = [image('docker.io/library/nginx:latest')]
    expect(imageIsPulled('redis:7', images)).toBe(false)
  })

  it('is false against an empty image list', () => {
    expect(imageIsPulled('nginx:latest', [])).toBe(false)
  })

  it('does not fuzzy-match a different tag on the same image name', () => {
    const images = [image('nginx:1.25')]
    expect(imageIsPulled('nginx:latest', images)).toBe(false)
  })
})

describe('unreferencedImages', () => {
  it('flags an image referenced by no container definition and not running', () => {
    const images = [image('docker.io/library/redis:7')]
    expect(unreferencedImages(images, [])).toEqual(images)
  })

  it('does not flag an image referenced by a container definition', () => {
    const images = [image('docker.io/library/nginx:latest')]
    const containers = [container('web', 'docker.io/library/nginx:latest')]
    expect(unreferencedImages(images, containers)).toEqual([])
  })

  // Regression test: an earlier version of unreferencedImages only
  // checked config-tree reference, so it could recommend deleting an
  // image a container was actually running - see this function's own
  // doc comment for the full rationale on why both signals must agree.
  it('does not flag an image that is currently in use by a running container, even if config-unreferenced', () => {
    const images = [runningImage('docker.io/library/redis:7')]
    expect(unreferencedImages(images, [])).toEqual([])
  })

  it('does not flag an image that is both config-referenced and running', () => {
    const images = [runningImage('docker.io/library/nginx:latest')]
    const containers = [container('web', 'docker.io/library/nginx:latest')]
    expect(unreferencedImages(images, containers)).toEqual([])
  })

  it('flags a dangling (no-tags) image that is not running', () => {
    const images = [image()]
    expect(unreferencedImages(images, [])).toEqual(images)
  })

  it('does not flag a dangling (no-tags) image that is running', () => {
    const images = [runningImage()]
    expect(unreferencedImages(images, [])).toEqual([])
  })

  it('only flags the subset of images that are both unreferenced and not running', () => {
    const referencedOnly = image('docker.io/library/nginx:latest')
    const runningOnly = runningImage('docker.io/library/redis:7')
    const trulyUnused = image('docker.io/library/busybox:latest')
    const containers = [container('web', 'docker.io/library/nginx:latest')]

    expect(unreferencedImages([referencedOnly, runningOnly, trulyUnused], containers)).toEqual([trulyUnused])
  })

  it('ignores container definitions with no image field set', () => {
    const images = [image('docker.io/library/redis:7')]
    const containers = [container('web', undefined)]
    expect(unreferencedImages(images, containers)).toEqual(images)
  })
})
