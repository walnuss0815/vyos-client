# Contributing

Thanks for considering contributing to VyOS Client.

## Getting set up

See [docs/development.md](docs/development.md) for the local development
environment (a Nix flake covers everything), running the app, and the
test/lint commands.

## Before opening a PR

```sh
make lint
make test
make build
```

CI runs the same checks (`.github/workflows/ci.yml`) plus a Docker build
validation and a Trivy vulnerability scan (both the source tree's
dependencies and the built production image); a green CI run is
required to merge.

## Commit messages

Commits on `main` **must** follow [Conventional
Commits](https://www.conventionalcommits.org/) (`feat: ...`, `fix: ...`,
`security: ...`, etc.) - this isn't just a style preference, it directly
drives the automated release process (see below): the commit type decides
the version bump, and its text becomes a line in the published changelog.
A malformed type doesn't break anything, but a commit that should have
been `feat`/`fix`/`security` and wasn't will silently be excluded from
both the version calculation and the changelog.

## Releases

Releases are fully automated - see `.releaserc.json` and
`.github/workflows/release.yml`. Nobody needs to manually bump a version,
write release notes, or push a tag: every push to `main` computes the
next version from Conventional Commits since the last release, and if
one or more commits warrant a release, semantic-release creates the git
tag and GitHub Release (with a changelog grouped by category), and the
amd64 container image is built and pushed to GHCR with that
version.

## Dependency updates

Renovate (`renovate.json`) keeps every dependency ecosystem in this repo
current — npm (`frontend/`, and `e2e/tests/`'s separate project), Go
modules, GitHub Actions, and Docker base images — grouped into one PR per
update type. Minor/patch/digest updates auto-merge once CI passes; major
updates always get opened as a regular PR for manual review.

## Guidelines

- **Ground VyOS-specific behavior in source, not just docs.** VyOS's
  public documentation is sometimes imprecise about exact request/response
  shapes (see `docs/architecture.md` for a concrete example: `confirm_time`
  placement). When in doubt, check `vyos-1x`'s actual pydantic models and
  router code.
- **Keep `shared/sensitive-fields.json` as the single source of truth**
  for secret masking. If you add a leaf name, update that file and copy
  it to `backend/internal/mask/sensitive-fields.json` (a test enforces
  they match).
- **No new server-side state.** The project's core design constraint is
  that all durable configuration lives only in VyOS; the backend should
  stay a stateless translation layer (ephemeral sessions and rate-limit
  bookkeeping are the only exceptions, and both are already accounted
  for). If a feature seems to need a database, that's a signal to
  reconsider the design, not to add one.
- **Every new endpoint/component gets a test.** The existing test suites
  (fake-VyOS-backed Go tests, MSW-backed frontend tests) are the pattern
  to follow — avoid mocking your own code; mock at the HTTP boundary.

## Reporting security issues

Please don't open a public issue for a security vulnerability. See
[docs/security.md](docs/security.md) for the current threat model and
known limitations before reporting — some trade-offs (e.g. no per-user
VyOS audit trail) are documented, deliberate design decisions rather than
bugs.
