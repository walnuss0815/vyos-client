# Architecture

## Overview

```
Browser (React SPA)                    Container on VyOS (host networking)
  - Login form                                    Go backend
  - Dashboard / Interfaces /       <--HTTPS-->     - serves the embedded SPA
    Routes / Config Tree /         (session          - /api/auth/*  (login/logout)
    Firewall / DHCP pages          cookie,           - /api/config/* (BFF, config)
  - client-side "pending changes"   CSRF)            - /api/system/*, /api/interfaces,
    cart (sessionStorage)                              /api/routes (BFF, operational)
                                                       - holds VYOS_API_KEY
                                                       - no durable state of its own
                                                              |
                                                              | HTTPS + API key
                                                              v
                                                    VyOS HTTPS REST API
                                                    (/retrieve /configure
                                                     /config-file /show /info)
                                                              |
                                                              v
                                          VyOS running-config / config.boot
                                          (the ONLY durable state, anywhere)
```

Everything durable lives in VyOS. The Go backend is a pure translation
layer between the browser and VyOS's own REST API; it keeps no database
and no config file of its own — only environment variables at startup
(see [configuration-reference.md](configuration-reference.md)) and,
transiently, signed session tokens that need no server-side storage at
all (see [Auth: stateless sessions](#auth-stateless-sessions) below).

## Why REST only (no SSH, no GraphQL)

This was a deliberate scoping decision, not an oversight — worth
recording since it shapes the auth model:

- VyOS's HTTP API actually has two independent halves under the same
  HTTPS service: **REST** (`/configure`, `/retrieve`, `/config-file`, ...)
  and **GraphQL**. Only REST can perform configuration writes; as of the
  vyos-1x version this was built against, GraphQL's config-session
  surface is read-only (`ShowConfig`, `Show`, `SaveConfigFile`,
  `LoadConfigFile` from an existing on-disk file) — there is no GraphQL
  `set`/`delete` mutation. So GraphQL alone can't power an editor.
- GraphQL does have a PAM-backed `AuthToken(username, password)` mutation
  that would have let the login step reuse real VyOS system credentials —
  but per the requirement to stay REST-only, this app doesn't use it.
- REST's authentication is exclusively a static API key
  (`service https api keys`) — no username/password concept exists there
  at all. Given REST-only and no-SSH, there is no way to validate a
  per-user VyOS login *through an authentication endpoint* — but reading
  `system login user`'s stored password hash via `/retrieve` and
  verifying it directly turns out to be possible, and is what
  `AUTH_MODE=vyos-users` (the default) actually does; see
  [security.md](security.md#why-not-vyos-login-credentials) for the full
  reasoning, both approaches, and their trade-offs.
- **Network diagnostics (ping/traceroute/DNS lookup) were investigated
  and found genuinely unreachable through this app's REST-only
  constraint, not just unbuilt.** VyOS's REST API exposes exactly ten
  *documented* endpoints, confirmed directly against docs.vyos.io's
  VyOS API reference rather than assumed: `/info`, `/retrieve`,
  `/reset`, `/reboot`, `/poweroff`, `/image`, `/show`, `/generate`,
  `/configure`, `/config-file`. (There's one further, officially-
  undocumented op-mode endpoint, `/container-image`, that this app
  does use - see "Container images" below - which doesn't appear on
  that reference page at all; it doesn't change the conclusion here,
  since it's just as fixed-dispatch as `/show`, not a generic
  "run anything" escape hatch.) `/show` only dispatches op-mode commands that begin
  with the CLI word "show" (its `path` maps directly onto the words
  *after* "show" — e.g. `path: ["system","image"]` is `show system
  image`) — `ping`/`traceroute` are top-level op-mode verbs on VyOS's
  CLI (`ping <host>`, not `show ping <host>`), not `show` sub-commands,
  so they don't fit that endpoint's dispatch model at all. There is no
  other generic "run an arbitrary op-mode command" endpoint in the
  list above either. Building this would need either a new VyOS-side
  REST endpoint (upstream work, not something this app can add) or
  SSH — both outside this app's stated scope.

## The commit/save engine

VyOS itself distinguishes **commit** (apply to the running configuration)
from **save** (persist the running configuration to disk). VyOS Client
mirrors this exactly rather than inventing its own semantics:

- Every editable page (Config Tree, Firewall, Interface Configuration,
  and DHCP's Networks tab today - see [roadmap.md](roadmap.md) for
  what's still planned) writes into one shared client-side store —
  `frontend/src/store/pendingChanges.ts` — as a list of
  `{op: set|delete|comment, path, value}` entries. This is genuinely the
  only place in-progress edits exist; nothing is sent to the backend
  until the user clicks Commit. It's persisted to `sessionStorage` so a
  reload doesn't lose your work, but that's scoped to one browser
  tab/session, not shared server-side state.
- **Commit** batches the queued ops into one call to VyOS's `/configure`
  (`POST /api/config/commit` on the backend), which VyOS applies and
  commits as a single transaction — if any operation fails, nothing in
  that batch is committed.
- **Safe apply** sets `confirm_time` on that call, starting a VyOS
  commit-confirm timer (in minutes; the UI works in friendlier seconds
  and rounds up). Confirming (`POST /api/config/commit/confirm`) calls
  VyOS's `{"op":"confirm"}`; not confirming in time lets VyOS
  automatically revert on its own — this is a VyOS feature, not something
  reimplemented client-side.
- **Save** (`POST /api/config/save`) calls VyOS's `/config-file` with
  `{"op":"save"}`, independent of Commit — useful for persisting changes
  made outside the UI too.

Committing without saving is a well-known VyOS gotcha: the change is
live, but silently lost on the next reboot. VyOS's REST API has no
endpoint to ask "does the running configuration differ from the saved
one" — it exposes exactly ten documented endpoints (see above), none of them a
config comparison, and building one ourselves would mean diffing `show
configuration commands`'s flat set-command output against `show file
/config/config.boot`'s completely different curly-brace format, which
needs a real parser this app doesn't have.
`frontend/src/store/unsavedCommit.ts` tracks this client-side instead — a
`localStorage`-backed list of exactly which changes were committed
*through this app* since the last save (`committedChanges`, not just a
boolean), appended to on every successful commit and cleared once a
save (or rollback, below) succeeds. `PendingChangesBar.tsx` shows a
persistent "N changes committed but not saved" message, collapsed by
default (same expand/collapse pattern as the ordinary pending-changes
list), even with an empty pending-changes cart. This is deliberately
scoped to what this app itself committed, never a universal claim
about the router's actual state — a commit made via the CLI, another
session, or another browser is invisible to it.

Two actions are offered on that persistent message:

- **Save** — the same `POST /api/config/save` as above, clearing the
  tracked list on success. A "Mark as saved" link next to it clears the
  list without calling the API at all, for when it's gone stale (e.g.
  already saved via the CLI instead).
- **Rollback** (`POST /api/config/rollback`) — discards the tracked
  changes entirely by replacing the running configuration with
  whatever's saved on disk. Backed by a new `vyos.Client
  .ConfigFileLoadFile`, which sends VyOS's `/config-file` `{"op":"load",
  "file":"/config/config.boot"}` — a file-based `load`, so VyOS reads
  and parses its own saved file rather than this app fetching or
  reformatting it (which would hit the exact same "no parser" wall
  described above). This always requests a commit-confirm window, even
  though a normal Commit's "Safe apply" is optional: the saved
  configuration being rolled back to isn't automatically risk-free just
  because it predates these commits (it may be exactly what they
  fixed), so the same VyOS-side auto-revert safety net always applies.
  Confirming reuses the exact same `POST /api/config/commit/confirm` as
  a normal commit-confirm — VyOS treats it as one session-scoped timer
  regardless of which endpoint started it.

`PowerPage.tsx`'s System > Power tab also has standalone "Save now" and
"Rollback" buttons, independent of `committedChanges` entirely — since
that list can only ever reflect what this app itself tracked, these
exist so an operator can still act proactively regardless of what this
app does or doesn't know about (e.g. a commit made via the CLI).
Rollback there additionally requires an explicit "Confirm rollback?"
click before the request is even sent, since (unlike the bar's own
version) there's no committed-changes list to review first.

See `backend/internal/vyos/configure.go` and `configfile.go` for the exact
request shapes, which were verified against vyos-1x's actual pydantic
request models (`src/services/api/rest/models.py`) rather than assumed
from documentation prose — notably, `confirm_time` is a sibling of a
batch's `commands` list, not a per-operation field, which the docs don't
make obvious.

## Configuration vs. operational data

Two genuinely distinct kinds of data flow through this app, sourced from
different VyOS REST endpoints and never conflated:

- **Configuration** (`GET /api/config/*`) — what's *set*, via VyOS's
  `/retrieve` (`showConfig`) endpoint (`vyos.Client.ShowConfig`). This is
  what the Config Tree, Firewall, Interface Configuration
  (Ethernet/Bonding/Bridge/VRFs), and DHCP's Networks tab
  (shared networks/subnets) read and write.
- **Operational data** (`GET /api/system/info`, `/api/system/resources`,
  `/api/interfaces`, `/api/routes`, `/api/dhcp/leases`) — what's
  actually *running*, via VyOS's `/show` op-mode endpoint
  (`vyos.Client.Show`) and its
  unauthenticated `/info` endpoint. The two can disagree: an interface
  can be configured but link-down, or carry a DHCP-assigned address that
  never appears in the configuration at all. This data is read-only
  from the app's perspective and is never part of the pending-changes/
  commit pipeline above - the one exception is DHCP's "make static"
  action, which reads a lease (operational) but *writes* a regular
  `static-mapping` config entry, going through the normal commit
  pipeline like anything else.

VyOS's `/show` endpoint returns whatever the requested op-mode command
would print at the CLI, and that output isn't uniformly structured:

- For `show interfaces kernel json` (backed by `ip -j -d -s address
  show`) and `show ip route json` / `show ipv6 route json` (backed by
  FRR via vtysh), it's JSON *text* (not human-formatted), confirmed
  against vyos-1x's own op-mode-definitions source. `vyos.ShowInterfaces`/
  `ShowRoutes` decode that text into typed Go structs before the BFF
  ever returns it to the frontend — see their doc comments for the
  exact shapes and, for routes specifically, a still-open shape
  ambiguity that needs validating against a real router (also tracked
  in [roadmap.md](roadmap.md)).
- For `show dhcp server leases`, there is **no JSON output mode at
  all** - confirmed against both vyos-1x's source and VyOS's own
  documentation - and the underlying lease data lives behind Kea's
  local Unix control socket, unreachable via this app's REST-only,
  no-SSH access. `vyos.ShowDHCPLeases` parses the command's
  tabulate-formatted text table instead, via a general-purpose
  `parseTabulateTable` (position-based column extraction from the
  dash-separator line tabulate prints under the header, not naive
  whitespace-splitting, which would misalign on any blank cell - see
  its doc comment). This is a genuine constraint of VyOS's own API
  surface, not a shortcut taken in place of a JSON one that exists
  elsewhere.
- `show system uptime|cpu|memory|storage` are in the same boat as DHCP
  leases - no JSON output reachable through the REST API (each
  underlying vyos-1x Python script supports a `--raw` flag, but it's
  only reachable via direct argv, not the XML-defined op-mode command
  tree `/show` dispatches through). `backend/internal/vyos/system.go`
  parses each command's plain-text output the same way, including
  reversing VyOS's own human-readable byte formatting
  ("15.32 GB"/"16G", two different conventions across these four
  scripts) back into plain bytes.

Operational data changes on its own (link state, routes, resource
usage) in a way configuration doesn't, so the Dashboard/Interfaces/
Routes/DHCP-leases pages auto-refresh on a shared, user-configurable
interval
(`frontend/src/store/refreshSettings.ts`, persisted to `localStorage` -
deliberately not `sessionStorage`, since this is a UI preference the
user would expect to survive across browser sessions, unlike the
pending-changes cart above) rather than only refetching on a page
reload.

### Dashboard live charts: bytes/sec is derived client-side

`show interfaces kernel json` (`ip -j -d -s address show`) has always
returned a `stats64` block of cumulative rx/tx byte counters, but
`vyos.ShowInterfaces` ignored it until the Dashboard's live CPU/memory/
throughput charts needed it - `Interface.RxBytes`/`TxBytes`
(`backend/internal/vyos/interfaces.go`) now decode it, as `*int64` so
"no stats reported" and "genuinely zero traffic" stay distinguishable.
These are still just a snapshot, though: VyOS/the kernel only ever
reports a running total, never a rate, and the backend itself is
stateless (no history kept between requests, same as everywhere else in
this section) - so turning two cumulative snapshots into a bytes/sec
figure is entirely a frontend calculation
(`frontend/src/hooks/useInterfaceThroughput.ts`), the same way
`useSampleHistory.ts` accumulates the CPU-load/memory-used history
those two charts show.

Both charts poll at their own fixed 5-second interval
(`useSystemResources`/`useInterfaces`'s `refetchIntervalOverride`
parameter) rather than the shared 15/30/60s preference above - the
Dashboard's own "Live charts" toggle turns this off entirely, since even
though it's the same synchronous op-mode round-trip described above,
firing it every 5 seconds is a meaningfully higher rate than anything
else in this app asks of the router. `UsageChart.tsx` (a hand-rolled
SVG line/area sparkline, not a charting library dependency - matching
this app's existing preference for small hand-rolled SVG over a
library, e.g. `ThemeToggle.tsx`) renders whatever bounded, in-memory
sample history these hooks have accumulated; none of it is persisted,
so a page reload starts a fresh window, the same as every other
"live", non-historical view in this app.

`UsageChart.tsx` places each point by its actual elapsed time from the
newest sample within a fixed `windowMs` span (5 minutes here), not by
array index - the newest point is always pinned to the chart's right
edge, and a point exactly `windowMs` old sits at the left edge. This
matters because index-based spacing (`x = i / (pointCount - 1)`) would
silently rescale/compress *every already-drawn point* each time a new
sample arrived, since the denominator changes with the count; the
time-based mapping instead shifts existing points left at a constant,
real-time-matched rate as new ones arrive at the right, with old ones
dropping off the left edge - the scale itself never changes. The same
component also tracks pointer position to show a Grafana-style hover
tooltip (crosshair line, a dot per series, a floating box with the
exact timestamp/value at the nearest point) - still hand-rolled SVG
plus a few HTML overlay elements (used for the dots/tooltip
specifically because the chart's `preserveAspectRatio="none"` stretches
x and y independently, which would turn an SVG `<circle>` into a
visible ellipse).

### Logs: no incremental fetch, no streaming - polling and merging instead

`GET /api/logs` (`backend/internal/api/log_handlers.go`) wraps `show
log ...` and `show container log <name>` behind a small, explicitly
whitelisted `?source=` value (`system`, `firewall`, `ssh`, `https`,
`dhcp-server`, `vpn`, `frr`, plus the parameterized `facility`/
`priority`/`container`) rather than accepting an arbitrary op-mode path
from the frontend - VyOS's own `show log` command tree has several
dozen subcommands (per-protocol, per-rule, per-interface variants for
things this app doesn't have dedicated log UI for), and exposing all of
them would be far more generic op-mode-command-running surface than a
"view this app's own areas' logs" feature needs.

Two real constraints shaped this feature, both confirmed against
vyos-1x's own `op-mode-definitions/show-log.xml.in` and
`container.xml.in`:

- **No time-range/incremental fetch mode exists at all** - no
  `--since`/`--until` equivalent anywhere in the log command tree.
  Every fetch is a fresh, bounded "last N lines" snapshot, the same
  constraint the Dashboard's live charts work around by diffing
  successive polls - here, `frontend/src/lib/mergeLogLines.ts` finds
  the overlap between what's already displayed and what a new poll
  returned (the longest suffix-of-previous that matches a prefix-of-
  next) and appends only what's actually new, so the Logs page's
  opt-in auto-poll mode (its own 5-second interval and toggle, same
  reasoning as the Dashboard's) reads like a live-appending tail
  instead of replacing/flickering the view on every poll.
- **Only two of those several dozen subcommands take a line-count
  parameter at all** (a bare `show log <1-9999>` and `show log tail
  <n>`, and the latter is newest-first, the opposite of every other log
  command's chronological order) - every per-service command (`show
  log frr`, `show container log <name>`, ...) returns its entire
  boot's/container's output completely unbounded.

The "system" source (VyOS's general, not-per-service log) is the one
place this actually bit: it originally used bare `show log`
(`journalctl --no-hostname --boot`, no bound at all), and a production
router with substantial log history since boot took long enough to
dump its *entire* journal that this backend's own request to VyOS's
`/show` endpoint timed out before VyOS ever finished responding -
truncating the response down to size after the fact
(`vyos.ShowLogTail`) doesn't help when the fetch itself never
completes. Fixed two ways:

- `vyos.ShowLogTailBounded` (`backend/internal/vyos/logs.go`) uses
  `show log tail <n>` for the "system" source specifically instead of
  bare `show log` - VyOS can satisfy this by reading backwards from
  the end of the journal (`journalctl --reverse --lines <n>`) rather
  than generating the whole thing, so it stays fast regardless of total
  journal size. Its output is re-reversed back into the same
  chronological order every other source returns, for one consistent
  contract.
- Every log fetch (this bounded one and every per-service
  `vyos.ShowLogTail` call, which still has no server-side bound of its
  own) now uses `vyos.Client.ShowWithTimeout` - a longer, dedicated
  timeout (45s) instead of this Client's normal ~30s default, since a
  log fetch's duration is inherently far less predictable than this
  app's other, well-bounded calls. Deliberately kept under this
  backend's own `http.Server.WriteTimeout` (60s, `cmd/vyos-client/
  serve.go`) - going past that would have this backend's own server
  abort the response before the longer client-side timeout ever got a
  chance to produce a clear error.

Like the Dashboard's charts, none of this is persisted or streamed
(no SSE/WebSocket - see `statusRecorder`'s doc comment in
`internal/api/server.go` for why that's deliberately still true): a
page reload or switching sources starts a fresh, empty accumulated
view.

## Container images: op-mode, synchronous, and immediate (no pending-changes cart)

`GET/POST/DELETE /api/container/images` (`backend/internal/api/
container_image_handlers.go`, `backend/internal/vyos/
container_image.go`) wrap `show container image`, `add container
image <name>`, and `delete container image <name>` - all three are
VyOS *op-mode* commands (a separate `/container-image` REST endpoint,
confirmed directly against vyos-1x's `configsession.py`/`op_mode/
container.py`), not part of `/configure` at all. That has two
consequences that make this feature look different from the rest of
the Container area (Containers/Networks/Registries, all staged through
the pending-changes cart and applied only on commit):

- **Every action here is immediate**, with nothing to stage or
  discard - the frontend (`frontend/src/pages/container/ImagesPage.tsx`)
  calls the pull/delete endpoints directly and refetches the list on
  success, the same way VyOS's own CLI behaves for these commands.
- **A pull can legitimately take several minutes** with zero progress
  reporting mid-flight, because VyOS's own `/container-image` endpoint
  and the underlying `podman image pull` are fully synchronous with no
  timeout on VyOS's side. Rather than introduce a background-job/
  polling architecture (new in-memory state this app has deliberately
  avoided everywhere else), the pull handler just extends *that one
  request's* write deadline via `http.NewResponseController(w).
  SetWriteDeadline(...)` past the server's normal 60s
  `WriteTimeout` - a plain, long-lived synchronous request, matching
  VyOS's own model instead of working around it.

Two more details worth knowing if this ever needs revisiting:

- `show container image json`'s output is `podman image ls --format
  json`'s output **completely unreshaped** - VyOS's op-mode script
  (`container.py`) does `json.loads()` and returns it verbatim, so the
  JSON uses podman's own field casing (`Id`, `Names`, `RepoTags`,
  `Size`, ...), not this app's usual camelCase convention (the backend
  handler reshapes it before it reaches the frontend). A locally
  confirmed pull+list against real podman 5.6 showed a freshly-pulled
  image's human-readable reference under `Names` with `RepoTags: null`
  - which field actually holds it is unreliable/version-dependent, so
  `ContainerImage.Tags()` checks both and falls back to `["<none>"]`
  rather than assuming either is populated.
- **There is no force-delete option, anywhere in this app, because
  VyOS's REST API has no way to reach it** - `ContainerImageModel`
  (VyOS's own request schema) has no `force` field at all, even though
  the CLI's `delete container image <name> force` op-mode path exists
  separately. This isn't a choice this app made to simplify the UI;
  force-delete is genuinely unreachable through the endpoint this app
  talks to. A plain delete still surfaces VyOS's own clear error if the
  image is currently in use by a running container.

This app's own name validation (`validateContainerImageName` in
`container_image_handlers.go`) exists because VyOS's `add_image`/
`delete_image` have none on their side at all - the name is
interpolated directly into a shell command by VyOS's own op-mode
script, so this backend rejects anything but a conservative
image-reference-shaped pattern before it ever reaches VyOS.

## Self-upgrade

System > Upgrades (`backend/internal/selfupgrade`,
`backend/internal/api/self_upgrade_handlers.go`,
`frontend/src/pages/system/UpgradesPage.tsx`) checks this app's own
GitHub releases for a newer version and, on request, upgrades this
very container - deliberately disabled by default
(`SELF_UPGRADE_ENABLED`, see
[configuration-reference.md](configuration-reference.md)), since it's
the **only** place this backend ever calls a service other than
VyOS's own API. Every other outbound request this app makes,
everywhere else in the codebase, stays entirely within the router.

Two constraints shaped how this works:

- **This app runs in a distroless, shell-less container** (see
  `deploy/Dockerfile`) - no `docker`/`podman` CLI, no `os/exec`
  anywhere in this codebase. It has no way to pull or restart itself
  directly.
- **The backend has no built-in way to know its own VyOS `container
  name`** - `SELF_UPGRADE_CONTAINER_NAME` exists purely to supply
  that (matching whatever `NAME` the operator used in `set container
  name <NAME> image ...`), the same "everything comes from the
  environment, nothing is auto-detected" principle as the rest of
  `internal/config`.

So self-upgrade is built entirely out of primitives this app already
had, rather than any new privileged access:

1. `internal/selfupgrade.Client` fetches `GET /repos/<repo>/releases`
   from the GitHub REST API (unauthenticated - GitHub's own rate
   limit is 60 req/hr per source IP, so results are cached in-process
   for ~30 minutes), filters out drafts/prereleases, and compares
   against `main.version` (the same ldflags-embedded version
   `/healthz` already reports) using a small hand-rolled
   major.minor.patch comparator - no semver-parsing dependency added
   for this. `Client.ForceRefresh` bypasses that cache (both the
   positive one and the shorter negative/failure one) entirely for an
   explicit, human-initiated check - the Upgrades page's "Refresh"
   button (`?force=true` on the endpoint below) uses this, so it
   never has to wait out up to 30 minutes of staleness to see a
   release/image published after the cache was last populated. A
   plain page load still respects the ordinary cache, so passively
   viewing the page never itself contributes to hammering GitHub's
   rate-limited API - only `ListReleases` (the cached path) is used
   there.
2. `GET /api/system/self-upgrade` surfaces that comparison plus the
   notes for every release newer than current. When disabled, it
   returns `{"enabled": false}` immediately without ever calling
   GitHub. It also verifies, per newer release, that
   `ghcr.io/<repo>:<version>` actually exists - via
   `imageupdate.Client.TagExists` (the same registry client the
   Containers page's own "Check for update" button uses, a manifest
   existence check rather than a full tag-list fetch), always
   anonymous since the repo is fixed by `SELF_UPGRADE_GITHUB_REPO`,
   not operator-supplied. This exists because `.github/workflows/
   release.yml` publishes the GitHub Release and the GHCR image as
   two separate jobs (`build-and-push` has `needs: release`, but
   nothing enforces the reverse) - the image build can take minutes,
   or fail outright, leaving a release visible via GitHub's API with
   no matching image yet, or ever. A registry error checking one
   release's image is treated as "doesn't exist" (fail-safe, not
   left ambiguous) and doesn't fail the whole response - it only
   affects that one release's own `imageExists` field.
3. Clicking "Upgrade to X" in the frontend does two things, reusing
   existing endpoints rather than adding new ones: pulls
   `ghcr.io/<repo>:<X>` via the existing `POST /api/container/images`
   (the same synchronous, multi-minute-capable pull described above),
   then queues `set container name <NAME> image ghcr.io/<repo>:<X>`
   into the normal pending-changes cart - exactly what editing a
   container's own `image` field already produces
   (`containerForm.ts`).
4. Applying that change still goes through the ordinary
   `PendingChangesBar` review/commit flow, same as any other change -
   self-upgrade does not auto-commit. Safe apply (commit-confirm) is
   available there but not forced; given that this specific commit
   recreates the very container serving the page, using it is
   strongly recommended (the UI says so), since VyOS will
   automatically revert to the previous image if the new one doesn't
   come back up healthy within the confirm window.

One assumption underlies step 4 that this project could not verify in
CI (there is no container-lifecycle simulation in
`internal/testutil`'s fake VyOS, only config-tree/op-mode response
faking): that committing a changed `container name <NAME> image`
value actually causes VyOS/Podman to recreate the container with the
new image. This matches VyOS's documented declarative container
management model, but should be confirmed against real hardware
before relying on it operationally.

## Container image update checks

The Containers page's "Check for update" button
(`backend/internal/imageupdate`,
`backend/internal/api/container_update_handlers.go`,
`frontend/src/components/container/ContainerImageUpdateCheck.tsx`)
generalizes self-upgrade's own pull-and-queue mechanism to **any**
container configured on the router, not just this app's own -
deliberately disabled by default
(`CONTAINER_UPDATE_CHECKS_ENABLED`), for the same reason as
self-upgrade: it makes this backend call an external service (in this
case, whatever registry the container's own image reference resolves
to - not a single fixed one).

The key difference from self-upgrade: there is no single well-known
API to check against. A container's image can live on Docker Hub,
GHCR, Quay, or a self-hosted registry, so `internal/imageupdate`
implements just enough of the standard **Docker Distribution v2 HTTP
API** - the same protocol every one of those registries speaks,
including its challenge/response authentication flow - to list a
repository's published tags:

1. `imageupdate.ParseReference` splits an image string (e.g.
   `nginx:1.25.3`, `ghcr.io/org/app:v2.0.1`) into a registry host, API
   host (only different from the registry host for Docker Hub itself,
   whose public-facing `docker.io` name doesn't serve its own v2 API -
   that's `registry-1.docker.io`), repository path, and tag - using
   the same host-vs-repository-path disambiguation rule Docker's own
   tooling uses (a leading path segment is a registry host only if it
   contains a "." or ":", or is exactly "localhost").
2. `imageupdate.Client.ListTags` requests `GET
   /v2/<repository>/tags/list`, transparently handling a `401`
   challenge: a `WWW-Authenticate: Bearer ...` challenge (used by
   Docker Hub, GHCR, Quay, and most registries, even for anonymous
   access to a public image) triggers a token exchange against
   whatever realm the registry itself specifies in the challenge - no
   registry-specific auth logic is hardcoded beyond the Docker Hub API
   host substitution above. A `WWW-Authenticate: Basic` challenge is
   also supported for simpler registries that authenticate every
   request directly rather than issuing a token.
3. If a `container registry <name>` entry matches the image's
   registry host (the same hostname-based matching convention
   VyOS/Podman use themselves - see the Containers > Registries page's
   own help text), its `authentication username`/`authentication
   password` are used to authenticate the tag-listing request, and its
   `insecure` flag controls whether a plain-HTTP/self-signed-certificate
   registry is tolerated. The password is read directly via
   `vyos.Client.ReturnValue` - the same backend-internal pattern
   `auth.VyOSUserVerifier` already uses for reading a login user's own
   password hash - rather than through the browser-facing `POST
   /api/config/reveal` endpoint, since the value is only ever used
   server-side to build an `Authorization` header, never sent to the
   browser.
4. `imageupdate.NewestMatching` compares the currently configured tag
   against every tag the registry returned, using a permissive
   version parser (optional leading "v", major.minor(.patch)?, optional
   suffix like "-alpine") - deliberately more permissive than
   self-upgrade's own strict `vX.Y.Z` comparator (`internal/selfupgrade
   /semver.go`), since real-world container tags vary far more than
   this project's own clean release tags. A candidate is only ever
   suggested as an update if it shares the current tag's exact
   "flavor" (leading-"v" style, suffix, and patch-presence all
   identical) - e.g. a `-alpine` tag is never suggested as an update
   for a plain tag, and a bare `node:22` is never compared against a
   patched `node:22.1.0` as if the missing patch meant zero.
5. Clicking "Upgrade to X" reuses the exact same two-step pattern as
   self-upgrade: pull the new image via the existing `POST
   /api/container/images`, then queue `set container name <NAME> image
   <newRef>` into the normal pending-changes cart - not auto-committed,
   same review/commit flow as any other change (and the same
   container-recreation-on-commit assumption noted above for
   self-upgrade applies here too, for the same underlying mechanism).

Unlike self-upgrade (which only ever calls GitHub's API for one fixed
repo, and caches results server-side for 30 minutes), this feature is
**manual and on-demand only** - a "Check for update" button per
container, never triggered automatically on page load - since it can
contact an arbitrary number of different registries (one per
configured container) with no server-side caching, and repeatedly
checking every configured container's image on every page visit could
plausibly exhaust a registry's own rate limits (Docker Hub's in
particular) for no operator-requested benefit.

The last result of an explicit check IS remembered client-side though
(`frontend/src/store/containerImageUpdateChecks.ts`, backed by
`localStorage` so it survives a full browser restart, not just a
reload) - purely so navigating away and back (or reloading) doesn't
throw away a result the operator already paid the registry round-trip
for. A cached result is only shown while it still matches the
container's *current* image (an edited image invalidates it), is
always shown with a "Checked at ..." timestamp so its age is never
ambiguous, and a "Re-check" button is always available alongside it.
Nothing here changes the "manual and on-demand only" rule above: no
code path ever performs a check on its own.

This also means an authenticated operator's own image-string input
determines which external host gets an outbound request, from
whatever network this backend itself can reach - the same trust
model already accepted for the system image install URL feature (see
docs/security.md): both assume an authenticated session is already a
trusted, privileged actor, not a boundary this app defends against.

## Files: a curated, read-only viewer over `show file <path>`

`GET /api/files`/`GET /api/files/roots` (`backend/internal/api/
file_handlers.go`, `backend/internal/vyos/files.go`) wrap VyOS's
`show file <path>` op-mode command - confirmed directly against
vyos-1x's `src/op_mode/file.py` that this is a single, dual-purpose
command: VyOS itself decides server-side (`os.path.isdir`/
`os.path.isfile`) whether to return a directory listing or a file's
contents, and there is no separate "list a directory" command at all.

Deliberately disabled by default (`FILE_BROWSER_ENABLED`) - both
handlers check it and return `{"enabled": false}` when off, the same
convention `handleSelfUpgradeStatus`/`handleCheckContainerImageUpdate`
already use, and `FilesPage.tsx` shows an explanatory disabled state
rather than being hidden outright (same as `UpgradesPage.tsx`). This
is opt-in for a different reason than self-upgrade/container-update-
checks, though: Files makes no outbound-to-the-internet call at all
(it only ever talks to VyOS's own API, same as almost everything else
in this app) - the risk this flag actually gates is the filesystem
read access described below, real even when restricted to the
curated allowlist.

Three things about `show file` shaped this feature:

- **No path restriction of any kind on VyOS's side.** `<path>` is a
  free-text `tagNode`, not a fixed enum, and `file.py` will happily
  `os.path.realpath`/read anything the process running it can access -
  e.g. `/etc/shadow`. This app's own `fileBrowserRoots` (currently
  `/config` and `/var/log`) is a closed allowlist this backend enforces
  itself before ever calling VyOS - the same defense-in-depth stance
  as container image name validation, where VyOS again provides
  nothing of its own. `validateFileBrowserPath` does a lexical
  `path.Clean`-based check only; it can't detect a symlink *within* an
  allowed root pointing somewhere else entirely, since this backend has
  no direct filesystem access of its own (it only ever talks to VyOS
  over its REST API, even when deployed as a container on the router
  itself) - narrowing what this app will *ask about* isn't the same
  guarantee as narrowing what VyOS's own answer can contain.
- **No JSON form - everything is plain text designed for a human
  reading a terminal.** A directory listing is a `"DIRECTORY LISTING"`
  header followed by `ls -hlFGL --group-directories-first`'s raw
  output; a file view is a `"FILE INFO"` header (path/type/owner/
  permissions/modified) followed by a `"FILE DATA"` header and either
  the file's literal content (if `file(1)` calls it text) or a
  `hexdump -C` dump otherwise. `vyos.ParseShowFile` (`files.go`)
  parses both shapes with a line-oriented regex over the `ls -l`-style
  columns - deliberately lenient: a line that doesn't match the
  expected shape is just dropped from the listing rather than failing
  the whole request, since this text format isn't a stable, versioned
  contract the way VyOS's JSON outputs are. Sizes/dates are kept
  exactly as `ls -h` printed them rather than re-derived into bytes/a
  parsed timestamp, since `-h` already rounds and `ls` omits the year
  for recent files (a naive guessed year would be actively wrong for
  older ones).
- **No size limit of its own, the same class of issue the "system" log
  source hit** (see "Logs" above) - a text file is streamed and a
  binary one is entirely hexdumped, regardless of size, before this
backend ever sees a byte of the response. This backend can't ask for
a partial read (no such flag exists), so it can't avoid the cost of
VyOS generating the full output server-side, but
`maxFileViewContentBytes` (2MB) caps how much of that this backend
will hold onto and return, with a `truncated` flag surfaced to the
user - the same accepted trade-off `ShowLogTail` already makes for
per-service log sources it can't bound any other way. Every `show
file` call also
  uses a longer, dedicated timeout (`fileShowTimeout`, 45s, via the
  same `ShowWithTimeout` the logs fix introduced) rather than this
  app's normal ~30s default.

This is **read-only by design, not just by choice**: VyOS's REST API
has no supported way to write arbitrary file content back to an
arbitrary path at all (confirmed - the only file.py operations reachable
through the REST/GraphQL surface are `show`; `copy`/`delete` exist on
the CLI but have no generic pass-through in `configsession.py`). The
only file-shaped write path in this app remains `POST /api/config/
import` (`/config-file`), which is always schema-validated as a VyOS
config tree, not arbitrary bytes to an arbitrary path - so there is
no editor here, and none is planned against this endpoint. This was
explicitly re-checked (not just assumed) during a later feature pass
that considered adding in-browser editing for files under `/config` -
the same "no supported write path" conclusion held, so that idea was
dropped rather than built.

## Load Balancing: two unrelated features, one config-tree prefix

(Nav label/heading is "Load Balancing" - only the user-facing text
changed from the original "Load-balancing"; the route, VyOS config-
tree path segments, and every internal identifier still use the
hyphenated form, matching VyOS's own naming.)

`load-balancing wan` (multi-uplink failover/distribution) and
`load-balancing haproxy` (a TCP/HTTP reverse-proxy) are entirely
separate VyOS features that merely share a common config-tree
prefix - confirmed directly against vyos-1x's `interface-definitions/
load-balancing_wan.xml.in`/`load-balancing_haproxy.xml.in`. Their
*configuration* needed no backend changes at all: like every other
config-tree area, it's read via the generic `GET /api/config/tree` and
written via `POST /api/config/commit`'s `ConfigOp[]` - all the typed
modeling lives frontend-only (`frontend/src/lib/loadBalancingTypes.ts`/
`loadBalancingParse.ts`/`loadBalancingWanForm.ts`/
`loadBalancingHaproxyForm.ts`), the same "zero-backend-changes" pattern
Firewall/NAT/Container's config tabs already follow.

What *did* need backend work is each area's live **status**, since
neither has a JSON form at all:

- `show wan-load-balance` (`vyos.ParseWANLoadBalanceStatus`,
  `backend/internal/vyos/loadbalancing.go`) prints one blank-line-
  separated `Label: value` block per interface (confirmed against
  vyos-1x's `src/op_mode/load-balancing_wan.py` - its own
  `status_format` template) - parsed the same lenient, line-prefix
  way Files' FILE INFO/FILE DATA sections are: an unrecognized line is
  skipped rather than failing the whole request. `LastStatusChange`/
  `LastSuccess`/`LastFailure` are kept exactly as VyOS's own script
  formatted them (an absolute timestamp, `"N/A"`, or a Python
  `timedelta`-formatted duration string like `"2:15:00.123456"`) since
  the duration values are relative to whatever instant VyOS generated
  the response - there's nothing meaningful to re-derive from them
  later.
- `show load-balancing haproxy` (`vyos.ParseHAProxyStatus`,
  `backend/internal/vyos/loadbalancing_haproxy_status.go`) prints a
  Python `tabulate`-formatted text table (confirmed against
  `src/op_mode/load-balancing_haproxy.py`, which groups HAProxy's own
  `show stat json` admin-socket response into frontend/backend/server
  rows and renders one flat table across all three). `tabulate`'s
  plain-text output isn't a documented, versioned contract the way
  VyOS's JSON outputs are, so this parses it the same way any
  fixed-width text table is parsed reliably: the separator line's `-`
  runs give each column's exact character range, and every row
  (header and data) is sliced by those ranges rather than split on
  whitespace - splitting on whitespace would break `RespTime`'s own
  values (e.g. `"23 ms"`, which contains a space). If the expected
  header/separator shape isn't found at all, this returns an empty
  slice rather than an error, matching this app's other lenient
  text-parsing layers.

Both status views are deliberately "basic" (a manual Refresh button,
no auto-poll) per an explicit product decision - unlike the
Dashboard's live charts or the Logs page's opt-in auto-poll, neither
op-mode command's output format is a contract stable enough to want
polling it on a timer by default, and this is meant as an at-a-glance
status check, not a live-updating dashboard.

Firewall-group references in WAN rules (`source`/`destination`
`address-group`/`network-group`/`port-group`/`domain-group`) reuse the
exact same `group { ... }` shape Firewall/NAT rules already use
(`interface-definitions/include/firewall/source-destination-group-
ipv4.xml.i`) - `WANMatch` is its own type rather than reusing
`FirewallMatch`, matching how NAT already has its own `NATMatch`
instead of sharing one either, but the underlying VyOS leaf names are
identical. HAProxy's `backend` field on a `service` (frontend) is a
real `<select>`-backed multi-select fed by the same
`useLoadBalancingConfig()` hook's `backends` list (sibling tagNode
names, not free text) - the first place in this app a "pick an
existing tagNode name from a list" field is backed by a live dropdown
rather than a plain text input, since both `service` and `backend` are
fetched together in one hook call, unlike PKI certificate/CA name
references elsewhere in the app (still plain text inputs - see
`HttpsSettings.tsx`/`AccelPppServer.tsx`), which would need a second,
separate fetch to populate a dropdown.

## High Availability: two config trees, one shared status-parsing pattern

`high-availability vrrp` (VRRP groups/sync-groups) and `service
conntrack-sync` (stateful conntrack replication between routers) are,
like Load-balancing's WAN/HAProxy pair, two config trees this app
presents under one nav item - but unlike WAN/HAProxy (both nested
under `load-balancing`), these are genuinely separate top-level VyOS
trees, linked only by one cross-reference field (conntrack-sync's
`failover-mechanism vrrp sync-group`, which VyOS's own conf-mode script
requires to point at a sync-group that actually exists) - confirmed
directly against vyos-1x's `interface-definitions/
high-availability.xml.in`/`service_conntrack-sync.xml.in`.
`useHAConfig()` (`frontend/src/hooks/useHAConfig.ts`) does two
independent `getConfigTree()` fetches for this reason, mirroring
`useInterfaceConfig()`'s existing `interfaces` + `vrf` two-fetch shape
rather than the single-fetch pattern every other area with one config
root uses.

Configuration needed no backend changes (same "zero-backend-changes"
pattern as Load-balancing) - all typed modeling is frontend-only
(`haTypes.ts`/`haParse.ts`/`haVrrpForm.ts`/`haConntrackSyncForm.ts`).
Status for both areas is, once again, op-mode text with no JSON form
reachable through this app's REST-only integration:

- `show vrrp` (`vyos.ParseVRRPStatus`, `backend/internal/vyos/
  highavailability.go`) is a `tabulate`-formatted table, confirmed
  against `python/vyos/ifconfig/vrrp.py`'s `VRRP.format()` - the exact
  same rendering library and layout HAProxy's status uses. Rather than
  duplicate the column-slicing logic a second time, both now share one
  `parseTabulateTable` helper (`tabulate.go` - originally written for
  DHCP leases, already reused by HAProxy's status before this feature
  existed).
- `show conntrack-sync status` (`vyos.ParseConntrackSyncStatus`,
  `backend/internal/vyos/conntracksync.go`) is a fixed 4-line
  `label : value` block (confirmed against `src/op_mode/
  conntrack_sync.py`'s own f-string template) - trivially parsed by
  splitting each line on its first `:`. Unlike this app's other
  lenient text parsers, a genuinely unrecognized shape here *is*
  treated as an error rather than silently returning a mostly-empty
  struct: every one of the 4 lines is always present whenever
  conntrack-sync is configured at all (VyOS raises
  `UnconfiguredSubsystem` before printing anything otherwise), so a
  missing expected line means the output format itself changed, not
  just "no data yet" - a meaningfully different situation from a
  tabulate table that can legitimately have zero data rows.

VRRP sync-group membership (`vrrp sync-group <name> member`) and
conntrack-sync's `failover-mechanism vrrp sync-group` reference both
reuse the same "live dropdown fed by a sibling/related config fetch"
pattern Load-balancing's HAProxy backend picker introduced - the
sync-group member picker is a checkbox multi-select against the
groups already loaded by the same `useHAConfig()` call, and
conntrack-sync's sync-group field is a `<select>` populated from that
same hook's `syncGroups`, despite conntrack-sync and VRRP being
otherwise-separate config trees.

Deliberately out of scope: `high-availability virtual-server` (an
unrelated IPVS/LVS load-balancer feature that happens to share the
same XML parent node as `vrrp` in VyOS's schema, with a different
backend than VRRP entirely, and a naming collision with this app's own
"Load-balancing" nav item) - see docs/roadmap.md's "Not yet built"
note.

## Traffic Policy / QoS: 8 of 12 policy types, one shared match-rule editor

VyOS's config-tree root for this area was renamed from `traffic-policy`
to `qos` in 2022 (confirmed against vyos-1x's interface-definitions/
qos.xml.in - this app uses the current `qos` path, but kept "Traffic
Policy / QoS" as the nav label since that's still the more commonly
recognized term). `qos policy` has **12 sibling policy types** of
wildly different complexity and popularity; per an explicit product
scoping decision this app covers 8 - `shaper`/`shaper-hfsc` (the two
classful HTB/HFSC bandwidth-shaping workhorses), `limiter` (the only
ingress-capable type - VyOS enforces this at commit time, and this
app's own interface-binding picker pre-filters accordingly rather than
waiting for that error), `cake`/`fq-codel` (modern non-classful "just
works" AQM qdiscs), and `priority-queue`/`round-robin`/`rate-control`.
Not modeled: `drop-tail`, `fair-queue`, `random-detect` (all rarely
used directly), and `network-emulator` (a link-impairment *testing*
tool - delay/loss/corruption injection - not a real QoS mechanism).
True ingress *shaping* (as opposed to `limiter`'s policing) requires
orchestrating an IFB pseudo-interface across three separate config
trees (`qos`, `interfaces ... redirect`, `interfaces input`) and is
also out of scope for now - see docs/roadmap.md's "Not yet built" note
for both.

Configuration needed zero backend changes, same as Load-balancing/High
Availability - all typed modeling is frontend-only
(`qosTypes.ts`/`qosParse.ts`/`qosMatchForm.ts`/`qosLimiterForm.ts`/
`qosShaperForm.ts`/`qosShaperHfscForm.ts`/`qosSimpleClassfulForm.ts`/
`qosSimplePolicyForm.ts`/`qosInterfaceForm.ts`/`qosMatchGroupForm.ts`).
One `useQosConfig()` hook fetches the whole `qos` tree once and derives
every policy type's list, the interface bindings, and the reusable
`traffic-match-group` filter sets - the same "one fetch, several
derived views" shape as `useFirewallConfig()`/`useLoadBalancingConfig()`
/`useHAConfig()`.

**One shared match-rule component covers 5 of the 8 types.** `shaper`,
`shaper-hfsc`, `limiter`, `priority-queue`, and `round-robin` classes
(plus standalone `qos traffic-match-group`) all use the exact same
underlying `match <name>` schema (confirmed against the XML's shared
`#include <include/qos/class-match.xml.i>`), so `QosMatchList.tsx` is
one component reused across all of them, rather than five near-
duplicates. Its "add a match" form deliberately exposes only a
practical subset of the full match schema (source/destination address/
port for IPv4 and IPv6, protocol, DSCP, fwmark, VLAN tag, ingress
interface) - `ether`/TCP-flags/max-length matching is still parsed and
displayed correctly for existing matches (so nothing is lost by
viewing a match created another way, e.g. via Config Tree), just not
offered when creating a *new* one. `priority-queue`/`round-robin`
additionally share one list/form component (`SimpleClassfulPolicyList
.tsx`) entirely, parameterized by policy type, since their class/
default-class shapes are structurally identical (only round-robin's
class gets an extra `quantum` field, and only round-robin's *default*
class defaults to `queue-type fair-queue` instead of `drop-tail` - a
VyOS-side asymmetry, not a bug, kept as-is).

Interface bindings (`qos interface <ifname> { ingress <policy>, egress
<policy> }`) and a class's `match-group` reference both reuse the same
"live dropdown fed by a sibling/related config fetch" pattern
Load-balancing's HAProxy backend picker and High Availability's
conntrack-sync sync-group picker introduced - all policy names, the
match-group list, and the interface bindings come from one
`useQosConfig()` fetch.

**Live status has a narrower scope than it first appears.** `show qos
shaper interface <ifname>` (`vyos.ParseQosShaperStatus`,
`backend/internal/vyos/qos.go`) parses a `tabulate`-formatted per-class
stats table via the same shared `parseTabulateTable` helper HAProxy's
and VRRP's status already use - but confirmed directly against
vyos-1x's `src/op_mode/qos.py` (`get_tc_info()`), this command is
**hardcoded to only look up a `shaper`-type egress policy** - it
silently returns empty data for every other policy type this app
manages (shaper-hfsc, limiter, cake, fq-codel, priority-queue,
round-robin, rate-control), and CAKE has its own separate, differently
-shaped `show qos cake interface <ifname>` command that isn't
implemented here at all. The status panel's interface picker is fed by
the same `qos interface` bindings list, so a user can at least see
which interfaces exist to try, even though only `shaper`-bound ones
will return anything.

## Auth: stateless sessions

`backend/internal/auth/session.go` issues HMAC-SHA256-signed session
tokens containing just `{subject, issued_at, expires_at}` — no session
store, no database row, nothing to look up on verification, just a
signature check and an expiry check. `SESSION_SECRET` is the only thing
that needs to persist across restarts for sessions to survive them; if
unset, a random one is generated at startup and everyone is logged out on
the next restart (a deliberate, documented trade-off in favor of true
statelessness over persistence-without-configuration).

`RequireSession` (`backend/internal/auth/middleware.go`) reissues a
fresh token on every successfully-authenticated request via
`SessionManager.Renew` - the original `issued_at` is preserved and a
new `expires_at` computed (capped at `issued_at + MaxAbsoluteSessionTTL`),
so this is still entirely stateless (no lookup, just a
verify-then-reissue of the same self-contained token shape) while
giving an actively-used session a sliding expiry instead of a hard
30-minute cutoff regardless of activity.

CSRF protection is the standard double-submit pattern: a second,
non-HttpOnly cookie whose value the frontend echoes back as
`X-CSRF-Token` on every mutating request; the backend just compares the
two, again with no server-side state involved.

## Secret masking

Config leaves whose name matches a curated list (`password`, `secret`,
`pre-shared-key`, `community`, `key`, ...) are masked wherever config is
rendered — both in the generic tree view and the flat set-commands view.
The list lives once, at `/shared/sensitive-fields.json`, and is consumed
identically by the Go backend (`backend/internal/mask`, via `go:embed` of
a committed copy) and the frontend (`frontend/src/lib/masking.ts`, via a
Vite/tsconfig path alias directly into `/shared`). A backend test
(`TestSensitiveFieldsListMatchesSharedSource`) fails the build if the
backend's embedded copy drifts from the shared source. See
[security.md](security.md#masking) for the matching rules and known
limitations (e.g. tag-node identifiers that happen to be secret-shaped,
like an SNMP community *name*, aren't caught by leaf-value matching).

Masking happens **server-side**, before the config tree ever reaches the
browser — not just client-side with a checkbox that happens to hide
something already present in the DOM. Sensitive fields are write-only
by default (you can set a new value without seeing the old one, similar
to how most web apps handle API key fields), but a single-value
sensitive leaf can be revealed on demand via a dedicated,
explicitly-audited endpoint (`POST /api/config/reveal`) rather than
being masked unconditionally forever — see
[security.md](security.md#masking) for the full design (why POST over
GET, why it's scoped to sensitive leaves only, why there's no step-up
re-authentication in v1, and why multi-value array leaves aren't
supported).

## Tested against

Pinned VyOS builds: the current rolling release plus the last 4 VyOS
Stream releases, recorded in
[`e2e/vyos-versions.env`](../e2e/vyos-versions.env) — see
[../e2e/README.md](../e2e/README.md) for how the real-VyOS end-to-end
suite boots and validates against each of them (a GitHub Actions
matrix, one job per pinned build). Rolling and the newest Stream
release are kept current automatically by Renovate; the other 3 Stream
slots are re-pinned manually, a few times a year at most, since Stream
itself only ships roughly quarterly. That suite runs on a schedule/tag
trigger, not every push/PR; the automated suite that *does* run on
every push/PR runs entirely against a fake VyOS REST server
(`backend/internal/testutil`) modeled directly on vyos-1x's real
request models, not against a live VyOS instance.
