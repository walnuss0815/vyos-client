# End-to-end testing

## Current state

Automated testing consists of three layers:

- **Backend** (`backend/internal/.../*_test.go`): unit and HTTP
  integration tests (via `httptest`) against `backend/internal/testutil`,
  a fake VyOS REST server modeled directly on vyos-1x's actual pydantic
  request models (`src/services/api/rest/models.py`,
  `src/services/api/rest/routers.py`) — not just the public docs, which
  are imprecise on a few points (see `docs/architecture.md`). This
  exercises the full request/response shape for `/configure`,
  `/config-file`, `/retrieve`, commit-confirm, and API-key rejection.
- **Frontend** (`frontend/src/**/*.test.{ts,tsx}`): Vitest + React
  Testing Library + MSW, covering the masking helper, the pending-changes
  store, the CSRF-aware API client, and every page's parsing/forms/
  interactive flows against a mocked backend.
- **Real-VyOS end-to-end** (this directory): Playwright, driving the
  actual production VyOS Client build against a real, freshly-booted
  VyOS instance — no mocking anywhere in this layer. Covered below.

The first two run on every push/PR via `.github/workflows/ci.yml` and
cover the commit/save engine, auth, CSRF, and masking at the
HTTP-contract level. This third layer is the only one that validates
against VyOS's *actual* behavior rather than a fake modeled on it —
important given the fake is hand-maintained and could in principle
drift from the real thing, and given several of this app's op-mode
parsers (DHCP leases, `show system uptime/cpu/memory/storage`) were
written against reconstructed VyOS output with no live-router
validation at the time.

## Real-VyOS end-to-end testing

Runs on a schedule (weekly), `workflow_dispatch`, and release tags -
see `.github/workflows/e2e.yml` - not on every push/PR, since booting a
VM is much slower than the unit/integration suite and this is meant to
catch drift over time, not gate every commit.

### Which VyOS builds are tested

VyOS has three release channels - see
<https://docs.vyos.io/en/latest/installation/install.html> - of which
only two are usable here:

- **Rolling**: nightly builds, no stability guarantees, free for
  everyone. Published as GitHub Releases on
  [`vyos/vyos-nightly-build`](https://github.com/vyos/vyos-nightly-build/releases).
- **Stream**: a quarterly technology-preview/quality-gate for the
  upcoming LTS release, also free for everyone. Published at
  <https://vyos.net/get/stream/> (a plain download page, not an API).
- **LTS**: requires a paid or contributor subscription
  (support.vyos.io) to even download - not usable for this repo's
  public CI, so it's out of scope entirely.

This suite tests against **5 targets**: the current rolling build, plus
the **last 4 VyOS Stream releases** - one GitHub Actions matrix job per
target (`.github/workflows/e2e.yml`), so a regression against, say, an
older Stream release doesn't get hidden by rolling passing fine.

### How it works

1. **`vyos-versions.env`** pins each of the 5 targets (as
   `VYOS_ROLLING_TAG`, `VYOS_STREAM_0_TAG` .. `VYOS_STREAM_3_TAG` -
   `stream-0` is the newest Stream release, `stream-3` the oldest of
   the 4 kept) plus the two channels' published minisign public keys.
   Kept up to date two different ways:
   - **`VYOS_ROLLING_TAG` and `VYOS_STREAM_0_TAG`** are Renovate-maintained
     (see `renovate.json`'s `customManagers`/`customDatasources`) -
     rolling against `vyos/vyos-nightly-build`'s real GitHub Releases
     feed, Stream's newest release against an HTML-scrape of
     <https://vyos.net/get/stream/> (Stream has no structured release
     feed/API at all - that page is the only source of truth). Neither
     auto-merges (see `renovate.json`'s own comment on why): run
     `e2e.yml` manually (or wait for the next scheduled Monday run)
     against a pending bump before merging it.
   - **`VYOS_STREAM_1_TAG` through `VYOS_STREAM_3_TAG`** are manually
     curated - not something Renovate can discover automatically, for
     the same "no API" reason. Whenever `VYOS_STREAM_0_TAG` moves to a
     new Stream release, shift the old values down one slot
     (`STREAM_0`→`STREAM_1`→`STREAM_2`→`STREAM_3`) and drop what falls
     off the end, checking <https://vyos.net/get/stream/> for the exact
     tags. Since Stream itself only ships ~quarterly, this needs a
     human touch a few times a year at most - re-run the suite (at
     least against the newly-shifted-in `stream-3`) to confirm it still
     passes before merging.
2. **`download-vyos-iso.sh <version-key>`** downloads the pinned ISO
   for the given key (`rolling`, `stream-0`, `stream-1`, `stream-2`, or
   `stream-3`) and its `.minisig`, then verifies the signature with
   `minisign -P <pubkey>` (the pubkey matching that key's channel)
   before anything else touches it. Idempotent - caches each
   version-key's verified ISO separately under `e2e/.cache/<version-key>/`
   (gitignored) and skips re-downloading on a subsequent run for the
   same pinned tag.
3. **`bootstrap.exp`** boots the verified ISO under QEMU in live mode
   (no install-to-disk needed for an ephemeral test VM) and drives the
   **serial console** with `expect` - not SSH, matching this app's own
   REST-only/no-SSH design constraint, and it's also simply how you
   have to interact with a VM that has no network access configured
   yet. It logs in with the live-ISO's default `vyos`/`vyos`
   credentials, DHCP-configures the QEMU virtio-net interface (so the
   REST API becomes reachable via a `hostfwd` port mapping - QEMU's
   user-mode networking provides the DHCP server), enables `service
   https api rest`, adds a test API key, adds a real `system login
   user` with a plaintext password (which VyOS itself hashes into
   `encrypted-password` on commit - not a pre-computed fixture, so
   this exercises VyOS Client's `AUTH_MODE=vyos-users` login against a
   genuinely VyOS-hashed password), and commits. Verified interactively
   against a real build before being scripted (see this file's git
   history for the transcript) — the ~20s boot time, the
   `vyos@vyos:~$ ` / `vyos@vyos# ` prompts, and the DHCP-provided
   `10.0.2.15` address are all real observed behavior, not assumptions.
4. **`run.sh`** orchestrates the whole run: calls the two scripts
   above (defaulting to `rolling`, or whichever `VYOS_E2E_VERSION_KEY`
   is set to - the CI matrix sets this explicitly per job), waits for
   the VyOS REST API to become reachable, builds VyOS Client's real
   production artifact (`make build-backend` - the same
   frontend-build-then-embed-into-Go-binary process `deploy/Dockerfile`
   uses, just not containerized, for a faster/simpler local and CI
   loop), starts it pointed at the VM
   (`VYOS_API_URL=https://localhost:<port>`), waits for *it* to become
   reachable, then runs the Playwright suite in `tests/` against it.
   Always tears down the VyOS Client process and the QEMU VM on exit
   (success or failure), and dumps both processes' logs on failure for
   debugging.
5. **`tests/`** is a small, separate Playwright project (its own
   `package.json`/lockfile - deliberately not folded into the
   frontend's own Vitest suite, since this drives a real browser
   against a real backend, a fundamentally different kind of test).
   `@playwright/test` is pinned to the exact version nixpkgs'
   `playwright-driver` currently bundles browsers for, so `flake.nix`'s
   dev shell (which exports `PLAYWRIGHT_BROWSERS_PATH` pointing at that
   nix-provided Chromium) can run the suite locally with no download
   and no `sudo apt-get install` needed; CI (no nix devShell there)
   falls back to `npx playwright install --with-deps chromium`. Bump
   both together if you update one.

### What's actually tested

`tests/specs/` has 18 specs total. Three cover the login/masking/commit
pipeline itself:

- **`AUTH_MODE=vyos-users` login against a real VyOS-hashed password**
  (`login.spec.ts`): the app under test runs with `AUTH_MODE` left at
  its default (`vyos-users`, not `static`) - login succeeds with the
  real `system login user` account bootstrap.exp created, whose
  password VyOS itself hashed into a real `$6$...` `encrypted-password`
  on commit (not a value this project's own code produced), verified
  end to end through the backend's `github.com/GehirnInc/crypt`-based
  check; a wrong password is correctly rejected; and the session's
  identity (shown in the sidebar) is asserted to be that real username,
  not a hardcoded value - proving the whole hash-verification pipeline
  determined *who* logged in, not just *that* someone did. Also
  confirms real operational data: the Dashboard shows the live VM's
  actual hostname and VyOS version, via a real `GET /api/system/info`.
- **Masking against real VyOS config** (`masking.spec.ts`): the test
  API key added during bootstrap is a genuine `service https api keys
  id <name> key <secret>` entry in the VM's actual running config - the
  Config Tree's "Set commands" view is asserted to show the masked
  `••••••••` placeholder and never the real key value.
- **A real commit round-trip** (`commit.spec.ts`): edits `system
  host-name` via the Config Tree, commits (safe-apply off, so it
  applies immediately), and confirms the change actually landed by
  reloading the Dashboard - a second, independent fetch from the real
  VM, not just trusting the UI's optimistic state. Restores the
  original hostname afterward.

The remaining 15 cover most other major configuration areas - one spec
per area, each driving that area's own real page/form (not raw Config
Tree edits), committing against the real VM, and reloading to confirm
the change genuinely persisted: `interfaces.spec.ts` (eth0 description),
`static-routes.spec.ts`, `firewall.spec.ts` (custom ruleset + rule),
`nat.spec.ts` (source/masquerade rule), `dhcp.spec.ts` (shared network/
subnet + static mapping), `qos.spec.ts` (rate-control policy + eth0
binding), `policy.spec.ts` (prefix-list + rule), `vpn.spec.ts` (IPsec
ESP group), `load-balancing.spec.ts` (HAProxy backend/server + service),
`high-availability.spec.ts` (VRRP group + virtual address),
`container.spec.ts` (network + gateway/prefix), `pki.spec.ts`
(certificate, cross-validating the expiry-parsing feature against a
real X.509 cert + masking its private key), `system-users.spec.ts` (a
password-protected user, confirming the password is never exposed
anywhere including the Config Tree), `service-snmp.spec.ts` (an
intentionally-weak "public" community, exercising the config-warnings
rule that flags it), and `routing-bgp.spec.ts` (system AS +
redistribute-connected).

Each of these areas needed real, this-suite-discovered VyOS behavior to
actually pass - not just "does the request get accepted syntactically."
Three turned out to be genuine app bugs, fixed as part of writing these
specs (not worked around in the tests):

- **DHCP subnets need a range or a static mapping to commit at all**,
  and neither can be added through this app's own UI until the subnet
  already exists server-side (`RangeList`/`StaticMappingSection` only
  ever operate on already-fetched config) - a real deadlock.
  `NetworksPage.tsx`'s `CreateNetworkForm` gained optional "first
  range" fields specifically to break it.
- **Container networks need a prefix to commit at all**, same deadlock
  shape (`ChipList` likewise only operates on an already-fetched
  network). `NetworkForm.tsx` gained an optional "Initial prefix"
  field.
- **HAProxy's `verify()` requires both a service and a backend (and
  every backend needs a server) on *every* commit that touches the
  subtree, not just eventually** - so a backend can never be committed
  alone before any service exists. `HaproxyBackendFormPanel` gained
  optional "Initial server" fields, and the intended usage is: create a
  backend+server and a service+port together (unlinked) in one commit,
  then link them in a second.

None of these gaps were visible against `backend/internal/testutil`'s
fake VyOS server (which doesn't enforce VyOS's own conf_mode `verify()`
logic) - exactly the class of drift this layer exists to catch.

### Running it locally

For a single one-shot run matching CI exactly (boots a VM, runs the
whole suite, always tears everything down):

```sh
nix develop
e2e/run.sh
```

For iterating on one spec at a time against a single long-lived VM
(much faster than rebooting per spec - `dev-vm.sh` builds and starts
VyOS Client once, leaves both running in the background):

```sh
nix develop
e2e/dev-vm.sh start
source e2e/.cache/dev-vm.env && cd e2e/tests && npx playwright test specs/firewall.spec.ts
npx playwright test specs/nat.spec.ts   # same VM, no reboot
cd ../.. && e2e/dev-vm.sh stop
```

Both default to the pinned `rolling` build; set `VYOS_E2E_VERSION_KEY`
to `stream-0` .. `stream-3` to run against one of the pinned Stream
releases instead (e.g. to reproduce a CI matrix failure locally):

```sh
VYOS_E2E_VERSION_KEY=stream-2 e2e/dev-vm.sh start
```

Both need `/dev/kvm` (present on GitHub-hosted Actions runners and most
Linux dev machines with virtualization enabled in firmware; not
available in a container without `--device /dev/kvm` or similar, and
not available at all on non-Linux hosts without a nested-virtualization
setup this repo doesn't attempt to support). On a memory-constrained
host running many other things at once, QEMU can be OOM-killed
mid-suite - if a run dies with `connection refused` errors partway
through with no VyOS-side error message, that's almost certainly what
happened, not a real test failure; just retry once load settles.

### Known gaps

- **`AUTH_MODE=static` is deliberately not exercised here** - that mode
  never talks to VyOS at all (see `docs/security.md`), so a real VM
  adds nothing over the existing unit/integration tests
  (`backend/internal/auth`, `backend/internal/api`) already covering
  it against a fake VyOS server.
- **CPU/memory/uptime/storage parser formats were reconstructed from
  vyos-1x's Python source, not confirmed against a real router** at
  the time they were written (see `docs/roadmap.md`) - this suite
  doesn't currently assert on the Dashboard's resource cards
  specifically, so it wouldn't yet catch a subtle text-format mismatch
  there. Worth adding once this suite is running reliably on schedule.
- **The routes JSON-shape ambiguity** (`vyos.ShowRoutes`'s doc comment)
  is similarly not yet directly exercised - the bootstrap VM has no
  routes beyond the QEMU NAT default, so there's nothing interesting
  to assert on yet without adding more config during bootstrap.
- Only the `generic-amd64` VyOS build/architecture is tested.
- **Named resources use fixed names (e.g. `E2ETEST`), not per-run-unique
  ones** - fine for a one-shot `run.sh` invocation against a fresh VM
  (the normal/CI usage), but re-running a spec against the *same*,
  already-populated VM (e.g. while iterating with `dev-vm.sh`) can hit
  "name already exists" validation errors from a previous run's
  leftover state. Reboot the dev VM (`dev-vm.sh stop && start`) between
  full-suite iterations if this happens, rather than relying on
  Playwright's own retry to recover.
- **Container image pull/delete isn't covered** (see `container.spec.ts`'s
  own doc comment) - deliberately out of scope for now, since it needs
  the VM to have outbound internet access to a real registry, which
  isn't guaranteed reliable in this QEMU/CI environment and can be
  slow. A good candidate for its own dedicated future spec once in-VM
  internet reliability is confirmed.
- **`interfaces wan-load-balance`** (this app's *other* Load Balancing
  sub-area, distinct from HAProxy) isn't covered - it needs multiple
  real WAN interfaces with actual health-check targets to be
  meaningful, which the single-`eth0` bootstrap VM can't provide safely.
- **BGP/OSPF neighbor/peering behavior isn't exercised** - only
  standalone config (system AS, redistribution) that doesn't need a
  peer. A real two-VM (or VM + FRR container) setup would be needed to
  test actual route exchange, a larger undertaking than this suite
  currently attempts.
