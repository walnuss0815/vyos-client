# Roadmap

## Definition of done

"Feature complete" for this project means full VyOS configuration
coverage *without needing the Config Tree fallback* - i.e. a
purpose-built form or page for every configuration surface someone
would realistically want to manage day-to-day (interfaces, DHCP,
firewall, routing, VPN, NAT, system services, ...), with the generic
Config Tree editor remaining as a permanent fallback for anything
long-tail or newly-added to VyOS rather than the primary way to
configure the router. Operational-data views (Dashboard, DHCP leases,
routing tables) are a separate, complementary track, not part of this
definition.

## Done

- **Foundation**: VyOS REST client (verified against vyos-1x's actual
  request models), auth (stateless sessions, CSRF, rate limiting),
  secret masking (shared source of truth, backend + frontend), env-var-only
  configuration, the commit/save engine (client-side pending-changes cart
  → batched `/configure` → optional commit-confirm → independent `/save`).
- **Config Tree editor**: the generic, schema-less fallback that covers
  the *entire* VyOS configuration surface — expand/collapse, edit/add/
  delete nodes, multi-value leaves, a flat set-commands view for
  paste-friendly bulk edits. This proves the whole pipeline end-to-end
  and is usable today for firewall/DHCP/anything else, just without
  purpose-built forms yet.
  - **Export**: both the tree (as JSON) and the flat set-commands view
    are downloadable as files, client-side only (reuses data the page
    already fetches - `GET /api/config/set-commands` already redacts
    secrets server-side, so no new backend surface was needed).
  - **Import**: a new tab uploads a configuration file and applies it
    directly through VyOS's `/config-file` endpoint (new
    `POST /api/config/import`, plus `vyos.Client.ConfigFileLoad`
    alongside the existing `ConfigFileMerge`) - **Merge** (additive,
    nothing removed) or **Full replace** (VyOS's own `load` semantics,
    which can lock the operator out of the HTTPS API entirely if the
    file doesn't include a working one - gated behind an explicit
    acknowledgment checkbox in the UI). Deliberately a standalone
    action rather than routed through the pending-changes cart (a file
    replaces-or-overlays the *entire* candidate config in one VyOS-side
    operation, not a list of discrete ops this app queued itself) -
    reuses the exact same commit-confirm mechanism and
    `POST /api/config/commit/confirm` endpoint as an ordinary commit,
    since VyOS treats commit-confirm as one global timer regardless of
    which endpoint started it.
- **Container image**: distroless, non-root, ~17MB, amd64-only build
  (VyOS itself only supports amd64 - see the "amd64-only builds" entry
  further down for why and how this is structured to re-add arm64
  easily if that ever changes), self-contained healthcheck subcommand.
- **CI**: backend + frontend lint/test/build on every push/PR, Docker
  build validation.
- **Automated releases**: on every push to `main`, semantic-release
  (`.releaserc.json`) computes the next version from Conventional
  Commits since the last release (features -> minor, fixes/security ->
  patch, breaking changes -> major), generates a changelog grouped by
  category (Features/Bug Fixes/Performance Improvements/Security/...),
  creates the git tag, and publishes the GitHub Release - no manual
  version bumping or hand-written release notes. When a release is
  cut, `.github/workflows/release.yml` also builds the amd64 image
  and pushes it to GHCR tagged with that version, and embeds it
  into the binary itself (`-X main.version=...`, surfaced via
  `/healthz` and `vyos-client version`) - see `deploy/Dockerfile`'s
  `VERSION` build-arg.
- **Docs**: get-started, architecture, configuration reference, security,
  development.
- **Local testing stack**: `docker-compose.yml` + `.env.example` runs
  VyOS Client alongside `mock-vyos` (a real, seeded instance of the same
  fake VyOS server the Go test suite uses), so `docker compose up`
  demonstrates the whole app - including Firewall - without a router.
- **Firewall UI**: Zones (create/delete, interface + local-zone
  assignment, default-action, from-zone → ruleset mapping), Rulesets
  (the three base chains plus custom `firewall ipv4 name` chains,
  default-action, full rule CRUD with a Basic/Match/Advanced form
  covering action/protocol/description/log/disable, source and
  destination address/port/group matching, inbound/outbound interface,
  ICMP type), Groups (all six group types via one generic component),
  Global Options (ICMP/hardening toggles, connection state policy).
  Edits only ever queue diff-based ops into the same pending-changes
  cart the Config Tree page uses - nothing is sent to VyOS until
  Commit. 102 frontend tests cover the parsing, the rule-diffing logic,
  and every page's interactive flows.
  - **Not yet built**: geoip/dynamic/remote-group matching, per-rule
    `log-options`, and the `raw` prerouting/output chains - still
    fully editable via the Config Tree page. (Drag-and-drop rule
    reordering, a visual from/to zone matrix, and IPv6 rulesets were
    deferred here as a polish pass - see "Firewall UI polish" below
    for how and why each turned out to be feasible after all.)
- **Dashboard operational data**: VyOS version + hostname (`GET
  /api/system/info`, wrapping VyOS's unauthenticated `GET /info`), live
  interface state (`GET /api/interfaces`: MAC, IPv4/IPv6 addresses,
  MTU, admin/oper state, description - sourced from `show interfaces
  kernel json`), and IPv4/IPv6 routing tables (`GET /api/routes`,
  sourced from `show ip/ipv6 route json` via FRR). Dashboard shows a
  10-row preview of interfaces and every route, each with a link to a
  dedicated full-list page (`/interfaces`, `/routes`); auto-refresh is
  a shared, persisted, user-configurable preference (15/30/60s or
  off). This is genuinely
  *operational* data (`vyos.Client.Show`), distinct from configuration
  (`vyos.Client.ShowConfig`) - see [architecture.md](architecture.md).
  - **Known gap needing live-router validation**: the exact JSON shape
    `show ip/ipv6 route json` returns couldn't be fully confirmed from
    vyos-1x's source alone (see `vyos.ShowRoutes`'s doc comment for the
    two candidate shapes it defensively handles). Interfaces was
    confirmed via an explicit, hand-authored XML command mapping;
    routes wasn't. Should be validated against a real router and
    simplified once confirmed.
  - Uptime/CPU/memory/disk usage - the remaining pieces of the
    original "hostname/version/uptime, interface status list, resource
    usage" Dashboard scope - are now built too, see the "Dashboard:
    uptime + resource usage" entry below.
- **DHCP leases + "Make static"**: the DHCP page (previously a
  placeholder) now shows live leases (`GET /api/dhcp/leases`: IP, MAC,
  hostname, state, pool, expiry, remaining time) sourced from `show
  dhcp server leases`. Unlike interfaces/routes, this command has **no
  JSON output mode at all** - confirmed against both vyos-1x's source
  and VyOS's own docs - and the underlying lease data lives behind
  Kea's local Unix control socket, unreachable via this app's
  REST-only, no-SSH access, so `vyos.ShowDHCPLeases` parses the
  command's tabulate-formatted text table instead (a new, reusable,
  position-based `parseTabulateTable`, not naive whitespace-splitting -
  see its doc comment). "Make static" queues a `static-mapping` config
  entry (mac + ip-address) into the normal pending-changes cart, no
  separate endpoint for the action itself; the backend resolves which
  configured subnet a lease's address falls under server-side
  (`net.Contains`-based matching against the DHCP config tree), so the
  frontend doesn't need to fetch/search that tree itself.
  - **Not yet built**: DHCPv6 leases (IPv4 only for now) - the fuller
    config UI is now built, see the "DHCP config UI" entry below.
- **UI/UX polish pass**: navigation renamed to match VyOS terminology
  ("Routes" → "Routing"); the sidebar shows the connected router's live
  hostname instead of a static "vyos-client" label and now stays fixed
  while the page content scrolls; full light/dark/auto theming (a
  compact 3-way toggle in the sidebar header, persisted, auto is the
  default and follows the OS live) retrofitted onto the
  previously dark-only palette via CSS custom-property overrides rather
  than touching every component - see `index.css`'s doc comment for the
  technique. DHCP leases are grouped into one table per pool instead of
  one flat table. The Dashboard's interfaces preview is filtered to
  physical + VLAN interfaces (`lib/interfaceType.ts`, following VyOS's
  own interface-type class registry), excluding virtual-only interfaces
  (bridges, bonds, tunnels, ...) that are more often noise than signal
  at a glance - the full `/interfaces` page stays unfiltered. Interfaces
  and Routes tables are both sortable by every scalar column (a shared
  `useSort`/`SortableHeader` mechanism, not persisted); the Dashboard's
  routing sections now show every route rather than a 10-row preview,
  while the dedicated Routing page remains as a separate full view.
- **Interface Configuration UI**: `/interfaces` is now a tabbed layout
  (Live State - the original operational page, unchanged - plus
  Ethernet, Bonding, Bridge, and VRFs) instead of a single read-only
  page. Like Firewall, this needed **zero backend changes** - it reads/
  writes purely through the existing generic `GET /api/config/tree` and
  `POST /api/config/commit` endpoints, following firewallTypes.ts/
  firewallParse.ts/firewallRuleForm.ts's exact pattern
  (`lib/interfaceTypes.ts`, `lib/interfaceParse.ts`,
  `lib/interfaceConfigForm.ts`, `hooks/useInterfaceConfig.ts`).
  Scope (confirmed with the user after a research pass against
  vyos-1x/docs.vyos.io, mirroring how Firewall and DHCP were scoped):
  address (static/dhcp/dhcpv6, multi-valued), description, MAC, MTU,
  VRF assignment, and VLAN (802.1q `vif`) sub-interfaces across
  Ethernet, Bonding, and Bridge interfaces, plus basic VRF create/
  delete (name + mandatory, immutable-once-set routing table ID).
  Ethernet interfaces are physical and are never "created" here, only
  configured - cross-referenced against the live/operational interface
  list (`useInterfaces`, filtered by the new `isEthernetInterface`,
  narrower than `isPhysicalInterface` since it excludes WiFi/WWAN,
  which have differently-shaped config trees). Bonding, Bridge, and VRF
  are virtual and genuinely created/deleted here, like firewall zones.
  VLAN sub-interfaces are managed via one shared `VlanSection`
  component (identical shape regardless of parent type - unlike
  Firewall's zone/group member chips, which were duplicated instead of
  shared since they weren't actually identical); multi-valued fields
  (addresses, bond/bridge members) queue immediately on
  add/remove, matching the existing chip-list convention, while a
  card's scalar/flag fields batch into one diffed "Queue changes" op
  via a shared `diffToOps` helper, RuleForm-style.
  - **Not yet built** (still fully editable via Config Tree): PPPoE
    (a structurally different top-level interface type with its own
    auth fields, not an address mode - explicitly deferred after
    scoping), WireGuard, wireless/WWAN, tunnel/VXLAN/GENEVE interfaces,
    802.1X (EAPOL), ethtool-level tuning (duplex/speed/offload/
    interrupt-coalescing/ring-buffer), DHCP(v6) client options, IPv6
    SLAAC/EUI-64 addressing, EVPN multihoming, per-member bonding
    fine-tuning beyond hash-policy/primary/lacp-rate/min-links, and
    VRF routing integration (route-maps, `ip nht`, VRF-scoped
    services).
- **DHCP config UI**: `/dhcp` is now a tabbed layout (Leases - the
  original operational page, unchanged - plus Networks) instead of a
  single leases-only page. Zero backend changes, same as Firewall and
  Interfaces - reads/writes through the existing generic config-tree
  endpoints (`lib/dhcpConfigTypes.ts`, `lib/dhcpConfigParse.ts`,
  `lib/dhcpConfigForm.ts`, `hooks/useDHCPConfig.ts`). Scope (confirmed
  with the user after a research pass against docs.vyos.io, same
  process as Firewall/Interfaces): shared networks and their subnets
  as nested cards, each with `authoritative`, the 5 most common DHCP
  options (default-router, name-server, domain-name, ntp-server,
  domain-search - shared at both the network and subnet level, the
  long tail stays Config-Tree-only), dynamic ranges, excluded
  addresses, and full static-mapping (reservation) CRUD - independent
  of any current lease, coexisting with (not replacing) the existing
  per-lease "Make static" quick action on the Leases tab. Pool-
  utilization bars combine each network's configured range sizes
  (`lib/ipv4.ts`'s `ipv4RangeSize`) with its live lease count from the
  same `GET /api/dhcp/leases` data the Leases tab already fetches
  (`lib/dhcpPoolUtilization.ts`) - no new backend endpoint needed, and
  deliberately doesn't subtract `exclude`d addresses from the size (a
  known simplification for what's meant to be an at-a-glance bar).
  Shared networks/subnets are virtual and genuinely created/deleted
  here (creating a network requires an initial subnet + subnet-id in
  the same step, since a network with zero subnets isn't useful) -
  same pattern as Bonding/Bridge/VRF. A new generic `ChipList`
  component (deliberately separate from Interfaces' `AddressChips`,
  which has IP-addressing-specific quick-add buttons this one doesn't
  need) handles every multi-valued option/exclude field.
  - **Not yet built** (still fully editable via Config Tree): the long
    tail of shared-network/subnet options (bootfile-*, captive-portal,
    ip-forwarding, pop/smtp/time/wins/tftp-server, static-route,
    vendor-option, wpad-url, ...), dynamic DNS (RFC 2136), High
    Availability, relay-agent-information/client-class matching, and
    DHCPv6 entirely (`service dhcpv6-server` is a separate config tree
    with its own quirks - prefix delegation, DUID-based mappings -
    deferred the same way PPPoE was for Interfaces).
- **Dashboard: uptime + resource usage**: the last piece of the
  original Dashboard scope. `GET /api/system/resources` combines four
  new `vyos.Client` calls (`ShowUptime`/`ShowCPU`/`ShowMemory`/
  `ShowStorage`, `show system uptime|cpu|memory|storage`) into one
  response. Unlike interfaces/routes, **none of these four have a JSON
  output mode reachable through VyOS's REST API** - confirmed against
  vyos-1x's own op-mode Python scripts: each supports a `--raw` flag,
  but it's generated generically from the Python function signature by
  VyOS's own op-mode framework and only reachable via direct argv, not
  through the XML-defined command tree the REST API's `/show` endpoint
  dispatches through. So, same as DHCP leases, these parse plain-text
  CLI output (`backend/internal/vyos/system.go`) - including reversing
  VyOS's two different human-readable size conventions
  ("15.32 GB"/"16G") back into plain bytes (`parseHumanBytes`) and
  correctly handling a VyOS quirk where a Jinja2 template leaves a
  field's line blank rather than removing it when that field doesn't
  exist on a given CPU architecture. Storage degrades to omitted (not
  a request failure) when VyOS itself reports it unavailable (e.g. no
  live-boot persistence mount, such as running from a bare live CD
  before install). Dashboard gained Uptime/CPU/Memory/Storage cards
  (auto-refreshing, like Interfaces/Routes/DHCP leases) alongside the
  existing Hostname/Version ones; the Firewall/DHCP cards that had said
  "Coming soon" since the Dashboard's very first pass were removed
  rather than left inaccurate now that both are long since built.
- **Dashboard: live usage charts (CPU load, memory, interface
  throughput)**: small hand-rolled SVG sparklines under the CPU and
  Memory cards, plus a new "Throughput" section with a dropdown to
  pick which interface to chart. No new charting library dependency -
  `UsageChart.tsx` is a minimal line/area-fill `<svg>` (auto-scaled,
  or a fixed 0-100 ceiling for the two percentage-based charts so a
  load hovering in a narrow band doesn't misleadingly look like it's
  swinging wildly), the same "hand-roll it, don't add a library"
  approach this app already takes for icons (ThemeToggle.tsx,
  InfoTooltip.tsx). CPU load and memory usage needed **no backend
  changes at all** - `GET /api/system/resources` already returns both.
  Throughput did: `show interfaces kernel json`'s underlying `ip -j -d
  -s address show` has always included a `stats64` rx/tx byte-counter
  block that `vyos.ShowInterfaces` simply wasn't decoding yet -
  `Interface.RxBytes`/`TxBytes` (`backend/internal/vyos/interfaces.go`)
  now do, as `*int64` so "not reported" and "genuinely zero" stay
  distinguishable. Those are still cumulative counters, not a rate -
  turning two successive snapshots into bytes/sec (with negative-delta
  clamping for the rare case of a counter reset, e.g. an interface
  flap) is entirely a frontend calculation
  (`useInterfaceThroughput.ts`), since the backend keeps no history
  between requests, same as everywhere else in this app. Both charts
  poll at their own fixed 5-second interval - deliberately not the
  shared 15/30/60s auto-refresh preference, since a trend line needs
  more than one point a minute - behind a dedicated "Live charts"
  toggle, since every poll is still a real op-mode round-trip to the
  router (see docs/architecture.md); turning it off stops firing that
  extra request entirely rather than just freezing the display. History
  is a bounded, in-memory rolling window (`useSampleHistory.ts`, 60
  samples) - not persisted anywhere, so it starts fresh on every page
  load, matching every other "live" (not historical) view in this app.
  - **Follow-up: fixed time-axis + hover tooltips.** `UsageChart.tsx`
    originally spaced points by array *index*, which silently
    rescaled/compressed every already-drawn point each time a new
    sample arrived (the "chart jumps around" symptom). It now takes a
    `windowMs` prop (fixed at 5 minutes, `DEFAULT_MAX_SAMPLES *
    LIVE_CHART_REFETCH_MS`) and places each point by its actual elapsed
    time from the newest sample - the newest point is always pinned to
    the right edge, existing points shift left at a constant,
    real-time-matched rate as new ones arrive, and points older than
    the window drop off the left edge, instead of the whole line
    rescaling. Also added a Grafana-style hover interaction (crosshair
    line, a dot per series, and a floating tooltip with the exact
    timestamp/value at the hovered point) via pointer-move tracking and
    nearest-point lookup - still hand-rolled SVG/HTML, no charting
    library. `ChartSeries` gained `label`/`formatValue` fields so the
    tooltip can show "CPU load: 23%" / "Download: 1.2 MB/s" etc.
    correctly per chart.
- **Serve plain HTTP instead of HTTPS (`TLS_ENABLED=false`)**: the
  backend's own listener (distinct from VyOS's remote HTTPS API) always
  unconditionally called `ListenAndServeTLS`, with no way to opt out -
  `docs/security.md`'s "reverse proxy in front" production option
  therefore always meant *double* TLS termination (the proxy's, then
  this process's own self-signed/mounted one behind it). New
  `TLS_ENABLED` env var (default `true`) lets an operator with a
  trusted reverse proxy (or a fully isolated/trusted network) opt this
  process down to plain HTTP instead. Two things had to move in
  lockstep with the toggle, not just the listener itself:
  `api.Server.CookiesSecure` (previously hardcoded `true` despite its
  own doc comment anticipating a toggle that didn't exist yet) now
  tracks `TLSEnabled` exactly, since browsers silently drop `Secure`
  cookies sent over plain HTTP - without this, login would appear to
  succeed while the session cookie never actually persisted; and the
  distroless-image `healthcheck` subcommand (which talks to `/healthz`
  over loopback) now reads the same `TLS_ENABLED` var to pick `http://`
  vs `https://`. Setting `TLS_CERT_FILE`/`TLS_KEY_FILE` while
  `TLS_ENABLED=false` logs a startup warning (`TLSCertFilesIgnored`) -
  a near-certainly-contradictory combination, since the mounted
  certificate would otherwise silently go unused. Defaults are
  unchanged for every existing deployment (`docker-compose.yml`, CI);
  this is purely additive.
- **Real-VyOS VM end-to-end testing**: see
  [`e2e/README.md`](../e2e/README.md) for the full mechanics. QEMU boots
  one of 5 pinned VyOS builds - the current rolling release plus the
  last 4 VyOS Stream releases (`e2e/vyos-versions.env`, ISO+signature
  downloaded and minisign-verified by `e2e/download-vyos-iso.sh
  <version-key>`, selected via `VYOS_E2E_VERSION_KEY`; the CI matrix
  runs all 5);
  `e2e/bootstrap.exp` drives the **serial console** with `expect` (no
  SSH, matching this app's own REST-only design constraint, and it's
  also the only way in before networking exists) to DHCP-configure
  QEMU's user-mode NIC, enable `service https api rest`, add a test API
  key, and commit; `e2e/run.sh` then builds the real production
  artifact (`make build-backend` — the same path `deploy/Dockerfile`
  uses) and runs a small standalone Playwright suite
  (`e2e/tests/`, pinned to nixpkgs' `playwright-driver` version so the
  dev shell needs no browser download) against it. Runs on a schedule
  plus `workflow_dispatch`/tag triggers (`.github/workflows/e2e.yml`),
  not every push/PR, since booting a VM is much slower than the
  unit/integration suite. Currently covers login (success + wrong
  password), real operational data on the Dashboard (hostname/version
  fetched from the actual VM), masking of a real API key in the Config
  Tree, and a full commit round-trip (edit `system host-name`, commit,
  reload, confirm it landed — then restore the original value so specs
  stay order-independent against the one shared VM). **Known gap**: the
  routes JSON-shape ambiguity and the uptime/CPU/memory/storage
  text-parsing formats (both noted above/below as reconstructed from
  vyos-1x's source rather than confirmed against a real router) aren't
  directly asserted on by this suite yet — worth adding once it's
  running reliably on schedule; see `e2e/README.md`'s "Known gaps".
- **Auth against real VyOS local users**: supersedes a previously
  planned "Multi-account support" idea (a structured env var holding
  several named bcrypt hashes) with something better — VyOS itself is
  now the source of truth for accounts, instead of a second,
  separately-managed credential store. Turns out reusing VyOS
  credentials for login *is* possible, just not the way originally
  assumed when [security.md](security.md#why-not-vyos-login-credentials)
  was first written (that page's REST-API-key/GraphQL/SSH reasoning is
  all still correct — this is a fourth path none of those ruled out).
  Confirmed against vyos-1x's actual source: `system login user <name>
  authentication encrypted-password` is returned **verbatim** by
  `/retrieve` — the `****************` masking you'd see interactively
  only lives in the legacy `vyatta-cfg` CLI binary behind an opt-in
  `--show-hide-secrets` flag the REST API never passes, not in the
  shared `libvyosconfig` serialization layer everything else goes
  through. And VyOS's own conf-mode script (`system_login.py`)
  hard-codes `passlib`'s `sha512_crypt` (`$6$...`) for auto-generated
  hashes — not the Debian-OS-default `yescrypt` — verified with a
  pure-Go, no-cgo crypt(3) library
  (`github.com/GehirnInc/crypt`; internally uses
  `subtle.ConstantTimeCompare`, consistent with this project's existing
  constant-time discipline for bcrypt).
  - New `AUTH_MODE` env var (`backend/internal/config/config.go`):
    `vyos-users` (**the default**) verifies submitted credentials
    against the target VyOS user's real `encrypted-password`, fetched
    with the backend's existing `VYOS_API_KEY` (no new credential
    needed) — `backend/internal/auth/vyos_verifier.go`'s
    `VyOSUserVerifier`, rejecting a nonexistent user, a disabled
    account (`system login user <name> disable`), a locked/no-password
    sentinel (`!`/`*`), or an unsupported hash prefix as ordinary
    invalid credentials (never a crash - `crypt.IsHashSupported` is
    checked before `crypt.NewFromHash`, which the library's own docs
    warn may otherwise panic). `static` keeps today's single shared
    `UI_ADMIN_USER`/`UI_ADMIN_PASSWORD_HASH` account, entirely
    independent of VyOS — useful as a break-glass login path that
    doesn't depend on VyOS's API being reachable. Both modes implement
    a shared `auth.CredentialVerifier` interface; `StaticVerifier`
    (renamed from the old `Verifier`) and `VyOSUserVerifier` are
    otherwise interchangeable to the rest of the app (session/CSRF
    layer is completely unaffected either way).
  - A VyOS-lookup failure (network error, VyOS API down/restarting) is
    surfaced as a distinct HTTP 503
    (`auth.ErrAuthBackendUnavailable`), not conflated with "wrong
    password" (HTTP 401) — the frontend shows a different message for
    each (`LoginPage.tsx`). A backend error is also deliberately *not*
    recorded as a failed attempt against the login rate limiter, so
    VyOS flakiness alone can't burn through a legitimate user's
    attempt budget.
  - **Breaking change, called out prominently in
    [get-started.md](get-started.md) and
    [configuration-reference.md](configuration-reference.md)**: any
    existing deployment that upgrades without explicitly setting
    `AUTH_MODE=static` silently stops honoring
    `UI_ADMIN_USER`/`UI_ADMIN_PASSWORD_HASH` (a startup log warning is
    the only signal - `Config.UIAdminVarsIgnored`) and instead requires
    a real VyOS local-user password. The upside for fresh installs:
    `UI_ADMIN_PASSWORD_HASH` (and the `hash-password` CLI step) is no
    longer required at all by default — just `VYOS_API_KEY`.
    `backend/cmd/mock-vyos` and `.env.example`'s local dev flow were
    updated to match: `mock-vyos` now seeds a genuine, independently
    generated (`mkpasswd -m sha-512`, not this project's own hashing
    code) working hash for `admin`/`admin`, so `docker compose up`
    keeps working out of the box under the new default.
  - Scope for this pass is deliberately just the login gate: any
    authenticated local VyOS user (admin or `operator`-restricted) gets
    full VyOS Client UI access, identical blast radius to the old
    shared-admin model. VyOS *does* have a real permission split worth
    knowing about for later (no `system login user <name> operator`
    node present = full admin/`sudo`; node present = restricted to that
    `operator-group`'s allowed op-mode commands) — mapping that into
    UI-level restrictions (e.g. hiding Commit for operator-level users)
    is intentionally deferred as a separate follow-up, not bundled in
    here.
  - Known limitations, documented rather than silently missing:
    RADIUS/TACACS+-backed VyOS users have no local `encrypted-password`
    at all, so they can't log into VyOS Client this way; a hand-pasted
    `$y$` (yescrypt) `encrypted-password` isn't supported by the
    pure-Go crypt library (VyOS's own auto-generation never produces
    one, so this only affects manually-set hashes); login now depends
    on VyOS's REST API being reachable in `vyos-users` mode, a real
    availability coupling that didn't exist before; VyOS's own logs
    still won't show *which* VyOS Client user triggered a given config
    change (still just the shared `VYOS_API_KEY`) — this change fixes
    credential *management*, not VyOS-side per-human audit trail (see
    the "Known consequence" in
    [security.md](security.md#why-not-vyos-login-credentials)).
  - **Real end-to-end coverage, not just unit/integration tests**:
    `e2e/bootstrap.exp` now also configures a real `system login user`
    via `plaintext-password` during VM bootstrap — VyOS itself hashes
    it into `encrypted-password` on commit, so this is a genuinely
    VyOS-produced hash, not a fixture this project generated. The
    existing `e2e/tests/` Playwright specs transparently started
    testing this (they already read credentials from env vars
    `run.sh` sets), and `login.spec.ts` gained an assertion that the
    signed-in sidebar shows the real VyOS username, proving the whole
    hash-verification pipeline determined *who* logged in, not just
    *that* someone did. Confirmed passing against a real, freshly-booted
    VyOS VM.
- **Firewall UI polish**: the three items the original Firewall UI's
  "Not yet built" note deferred, all shipped as pure-frontend changes
  (no backend or config-tree surface changes needed, same as every
  other Firewall UI pass):
  - **A visual from/to zone matrix** (`ZoneMatrix.tsx`) as an
    alternative to ZonesPage's per-zone card list — an N×N grid (rows
    = "from"/source zones, columns = "to"/destination zones, matching
    VyOS's own `zone <TO> from <FROM> firewall name <ruleset>` shape)
    for spotting gaps or unexpected zone-to-zone access at a glance,
    with a List/Matrix toggle (defaulting to List). Cells are
    clickable: empty ones get a ruleset dropdown, populated ones link
    to the ruleset's detail page and can be edited/cleared in place —
    reusing the exact same `zonePath()`-based ops the existing
    per-zone "from" list already queued.
  - **IPv6 ruleset support**: confirmed against VyOS's own docs
    (docs.vyos.io/.../firewall/ipv6.html) that `firewall ipv6 ...`
    mirrors `firewall ipv4 ...` almost exactly — same base chains,
    same custom `name <name>` chains, same match/action fields — with
    exactly one structural difference: ICMP matching is under an
    `icmpv6` node for ipv6 rules, not `icmp`. `FirewallRuleset`/
    `RulesetRef` gained a required `family: 'ipv4' | 'ipv6'` field (a
    base chain or custom name can exist under one family, the other,
    or both simultaneously as genuinely separate rulesets that just
    happen to share an id); `rulesetPath()` uses it instead of a
    hardcoded `'ipv4'`; the ruleset detail route became
    `/firewall/rulesets/:family/:kind/:id`. Deliberately still out of
    scope: IPv6's own `ipv6-address-group`/`ipv6-network-group` *group
    definitions* (the rule-level leaf names referencing them are
    unchanged) — "ruleset support" per the roadmap wording, not group
    management; still editable via Config Tree.
  - **Drag-and-drop rule reordering**: VyOS orders rule evaluation
    strictly by ascending rule number and has no "move" primitive, so
    reordering is always a delete-and-recreate of every rule whose
    number changes. `reorderRuleOps` minimizes that blast radius —
    first tries to find a free integer between the moved rule's new
    neighbors (renumbering only that one rule), and only falls back to
    renumbering the whole ruleset to a clean sequence when no such gap
    exists, emitting every delete before any set so a full-renumber's
    new number for one rule can never collide with another rule's
    not-yet-deleted old content. `RulesetDetailPage` gained a drag
    handle (native HTML5 drag-and-drop, no new dependency) plus Move
    up/down buttons on every rule — the buttons aren't just a
    fallback, they're the keyboard/screen-reader-accessible path, call
    the same handler as the drag handle, and are what this feature's
    integration tests actually exercise (native drag events aren't
    reliably simulatable in jsdom).
- **Reveal endpoint for masked values**: a single-value sensitive leaf
  can now be revealed on demand, one value at a time, instead of
  staying write-only forever. `POST /api/config/reveal`
  (`backend/internal/api/config_handlers.go`'s `handleReveal`) calls
  `vyos.Client.ReturnValue` directly — the one deliberate,
  explicitly-audited bypass of the masking every other config-reading
  endpoint applies. Design choices, all recorded in
  [security.md](security.md#masking):
  - **POST with a JSON body, not a GET query parameter** — keeps the
    target path (itself a hint about which secret is being requested)
    out of a URL, unlike `GET /api/config/tree?path=...`.
  - **Scoped to sensitive leaves only** (`mask.IsSensitivePath` rejects
    anything else with 400) — keeps the audit log meaningful and the
    endpoint's blast radius no wider than its stated purpose; a
    non-sensitive value is already visible via the ordinary masked
    endpoint.
  - **Every successful reveal is logged at `Warn`** (path + username),
    independent of the generic per-request logger.
  - **No step-up re-authentication in v1** — same session+CSRF gate as
    every other authenticated action, not a fresh password prompt.
    Accepted trade-off given this codebase has zero existing step-up
    precedent to build on; worth revisiting if it proves too
    permissive.
  - **Single-value leaves only** — VyOS's own `returnValue` op is
    documented as single-value only, and every sensitive leaf this app
    has encountered in practice (API keys, PSKs, passwords) is
    single-valued anyway. A sensitive multi-value array leaf stays
    exactly as masked/write-only as before.
  - Frontend: `TreeNode.tsx`'s `LeafRow` gained a Reveal/Hide toggle,
    shown only for a genuine scalar sensitive leaf (never for an item
    of a sensitive array, where the real per-item value isn't
    identifiable client-side to request anyway). Deliberately not
    cached via TanStack Query - kept in local component state so nothing
    lingers in a shared cache after the user hides it again, and
    naturally cleared on unmount (e.g. collapsing the tree node).
- **Static routes config UI**: the first (and lowest-complexity) piece
  of the "Routing protocols config UI" work, confirmed against VyOS's
  own docs (docs.vyos.io/.../protocols/static.html). `/routes` is now
  a tabbed layout (Live Routes - the original operational page,
  unchanged - plus Static Routes) alongside the existing Dashboard/
  Routing operational tables - `pages/routing/RoutingLayout.tsx`
  mirrors Firewall/Interfaces/DHCP's tab-shell pattern, and the
  original page moved to `pages/routing/LiveRoutesPage.tsx` unchanged.
  Zero backend changes, same as every prior config-UI area - reads/
  writes through the existing generic config-tree endpoints
  (`lib/routingTypes.ts`, `lib/routingParse.ts`, `hooks/useRoutingConfig.ts`).
  - `route`/`route6` (confirmed as genuinely separate top-level tag
    nodes, not one `route` node with a family field - the same pattern
    already established for Firewall's `ipv4`/`ipv6` rulesets) are
    parsed into one flat, family-tagged `StaticRoute[]` list. Each
    destination can independently have any combination of: next-hop
    entries (their own tag nodes keyed by address, each with its own
    distance/disable), interface entries (identical shape, keyed by
    interface name instead - one shared `ViaSection` component handles
    both, since they're genuinely the same structure), dhcp-interface
    values (a plain multi-valued leaf, handled by the existing generic
    `ChipList` component), and/or a single reject or blackhole
    (distance + tag, not keyed by a value - unlike next-hop/interface,
    there's only ever one of each per destination).
  - Creating a route requires picking its first "via" alongside the
    destination and family (a route with zero vias isn't useful
    either, same reasoning DHCP's shared-network creation already
    established for requiring an initial subnet).
  - **Not yet built** (still fully editable via Config Tree): BFD
    monitoring (`next-hop <addr> bfd [profile <name>] [multi-hop
    source-address <addr>]`) and IPv6-only SRv6 segment routing
    (`next-hop/interface <..> segments <..>`) - long-tail/specialized
    features, same scoping precedent as Firewall's geoip matching or
    Interfaces' ethtool tuning.
- **BGP routing config UI**: the second piece of the "Routing protocols
  config UI" work, confirmed against VyOS's own docs
  (docs.vyos.io/.../protocols/bgp.html). Adds a "BGP" tab to
  `pages/routing/RoutingLayout.tsx` alongside Live Routes/Static
  Routes. Zero backend changes, same pattern as every prior config-UI
  area - reads/writes through the existing generic config-tree
  endpoints (`lib/bgpTypes.ts`, `lib/bgpParse.ts`, `lib/bgpPeerForm.ts`,
  `lib/bgpGlobalForm.ts`, `hooks/useBGPConfig.ts`).
  - Deliberately a **"broader v1"** per explicit product decision made
    before implementation (not the tighter MVP originally proposed):
    covers system AS, router ID, neighbors *and* peer-groups (identity,
    remote-as, description, password, shutdown/passive, ebgp-multihop,
    update-source, peer-group assignment for neighbors) plus
    per-address-family settings for both ipv4-unicast/ipv6-unicast
    (nexthop-self, remove-private-as, soft-reconfiguration inbound,
    maximum-prefix), network advertisement, and redistribution of
    other protocols into BGP.
  - Neighbors and peer-groups take the exact same field set - VyOS
    applies a neighbor's own setting over whatever it inherits from its
    assigned peer-group - so one shared `BGPPeerForm`/`BGPPeerList`
    component pair (parametrized by `kind: 'neighbor' | 'peer-group'`)
    handles both, rather than duplicating the form.
  - Password follows the same write-only convention as every other
    masked leaf in this app (`password` matches
    `shared/sensitive-fields.json`, so the real value is never
    round-tripped): `BGPPeer` only tracks `hasPassword`; a non-blank
    password field always queues a fresh `set`; removing a configured
    password is a separate explicit "Remove password" action, not part
    of the diffed form.
  - **Not yet built** (still fully editable via Config Tree): BGP
    dampening, BFD, capability negotiation, path-attribute
    manipulation, TTL security beyond ebgp-multihop, ADD-PATH,
    conditional advertisement, VRF/EVPN/flowspec, dynamic listen-range
    neighbors, graceful restart, confederations, and most global
    `protocols bgp parameters` tuning knobs beyond router-id (there are
    15+ of these - allow-martian-nexthop, log-neighbor-changes,
    ebgp-requires-policy, labeled-unicast, reject-as-sets, and more).
- **OSPF/OSPFv3 routing config UI**: the third and final piece of the
  "Routing protocols config UI" work (static routes and BGP were
  already Done - see above), completing that initiative. Confirmed
  against both docs.vyos.io and, where the prose docs were stale or
  ambiguous, vyos-1x's own interface-definition XML source directly
  (`interface-definitions/include/ospf/` and `.../ospfv3/`) - notably,
  the XML revealed OSPFv3 area-type stub/NSSA genuinely exists (the
  prose page never mentions it) and OSPFv3's interface cost is a plain
  `cost` leaf, not `ipv6 cost` as the prose docs claim. Adds an "OSPF"
  tab to `pages/routing/RoutingLayout.tsx` with an OSPFv2/OSPFv3
  protocol sub-tab, since - unlike BGP's single-process ipv4-unicast/
  ipv6-unicast address families - OSPFv2 and OSPFv3 are genuinely
  separate FRR processes with separate top-level config trees
  (`protocols ospf` / `protocols ospfv3`). Zero backend changes, same
  pattern as every prior config-UI area (`lib/ospfTypes.ts`,
  `lib/ospfParse.ts`, `lib/ospfAreaForm.ts`, `lib/ospfInterfaceForm.ts`,
  `lib/ospfGlobalForm.ts`, `hooks/useOSPFConfig.ts`).
  - A **"solid v1"** per explicit product decision made before
    implementation: areas (network enablement, stub/NSSA area types
    with no-summary/default-cost/translate/
    default-information-originate, ranges, authentication type),
    interfaces (area assignment, cost/priority/dead+hello intervals,
    passive, network type, mtu-ignore, BFD toggle, authentication),
    global settings (router-id, auto-cost reference-bandwidth,
    administrative distance, default-information originate,
    default-metric), and redistribution - including OSPFv2's
    plaintext-password/MD5 interface authentication, real credentials
    like BGP's neighbor password.
  - One shared set of types/parser/forms/components, parametrized by
    `protocol: 'ospf' | 'ospfv3'`, rather than duplicating two
    near-identical hierarchies for the two processes - the same
    "shared shape, protocol/kind-conditional fields" approach BGP
    already established for its smaller neighbor/peer-group split.
  - `md5-key` (OSPFv2 interface authentication) was a real secret leaf
    that the existing `sensitive-fields.json` didn't actually cover -
    matching there is exact-segment, not substring, so the generic
    "key" entry didn't catch it. Fixed as its own small, separate
    commit ahead of this feature, per that file's own doc comment
    ("extend this list ... when VyOS adds a new kind of secret leaf").
  - Area-type and interface-authentication are each modeled as
    discriminated unions in VyOS's own tree (stub XOR nssa;
    plaintext-password XOR md5 XOR null) - switching between variants
    clears the whole subtree and rebuilds it; staying within the same
    variant only diffs its own fields for minimal ops.
  - **Not yet built** (still fully editable via Config Tree): virtual
    links, segment routing, MPLS-TE, static NBMA neighbors, LDP-sync,
    ABR shortcut/rfc1583-compatibility/abr-type tuning, graceful
    restart, max-metric router-lsa, export/import-list (references a
    `policy access-list` - Policy's own v1, shipped later, deliberately
    left access-lists Config-Tree-only too, see below), external route
    summarization (aggregation/summary-address), refresh/SPF-throttle
    timers, log-adjacency-changes, VRF table redistribution, and the
    `passive-interface default` global toggle (this app's interface
    `passive` is a plain per-interface flag instead).

With OSPF/OSPFv3 shipped, the "Routing protocols config UI" initiative
(static routes → BGP → OSPF/OSPFv3) is complete. Deliberately still
staying Config-Tree-only for other routing protocols, not currently
planned: RIP/RIPng, IS-IS, OpenFabric, BFD, PIM/PIMv6, IGMP proxy,
Multicast, MPLS, Segment Routing, RPKI, Babel, ARP, Failover — a
deliberate scope boundary (longer-tail/more specialized protocols),
not a silently-missing gap.
- **System configuration UI**: general identity/DNS settings, local
  user account management, and basic syslog - the "most notable gap"
  flagged in this roadmap's own prior analysis, picked as the next
  area per that flagging plus its real synergy with
  `AUTH_MODE=vyos-users`. A new top-level "System" nav item (not
  nested under Routing or any existing section) with three tabs:
  - **General** (`pages/system/GeneralPage.tsx`): `host-name`,
    `domain-name`, `domain-search`, `name-server`, `time-zone`, and
    `static-host-mapping` (VyOS's `/etc/hosts` equivalent - one
    host-name to many addresses/aliases).
  - **Users** (`pages/system/UsersPage.tsx`): `system login user`
    accounts - full-name, password (write-only; VyOS hashes a
    plaintext-password into `encrypted-password` on commit, same
    write-only convention as every other masked credential in this
    app), the disable flag, and SSH public keys. Flags the
    currently-authenticated user with a "you" badge and calls out
    that commit-confirm ("Safe apply") is the safety net against
    self-lockout - this app doesn't hard-block risky self-edits
    anywhere else either.
  - **Syslog** (`pages/system/SyslogPage.tsx`): local and remote
    logging, each a set of facility/level rules; remote hosts also
    get protocol/port.
  - Confirmed against docs.vyos.io and, for `system login user` and
    `system syslog`, vyos-1x's own interface-definition XML source
    directly - caught a real prose-docs staleness: the docs page
    still shows `system syslog local <filename> facility ... level
    ...` (a tagNode keyed by filename), but the current schema has
    `local` as a *singular* node (facility/level rules only, no
    per-filename tagging), matching `console`'s shape.
  - SSH public keys are masked server-side (`authentication
    public-keys <id> key <value>` matches the generic `"key"` entry
    in `shared/sensitive-fields.json`) even though a public key isn't
    actually secret - the accepted, documented trade-off in that
    file's own doc comment, not a bug (contrast with OSPF's
    `md5-key`, a real unmasked secret fixed in the OSPF work). So SSH
    keys are write-only in this app's UI too, same convention as
    every other masked leaf.
  - **Not yet built** (still fully editable via Config Tree): OTP-based
    MFA, RADIUS/TACACS+ remote authentication, login banners, session
    limits, SSH certificate principals, operator groups,
    TLS-encrypted remote syslog (ties into PKI, which doesn't exist
    in this app yet), console logging, syslog's global settings
    (marker messages/preserve-fqdn) - plus everything else under
    `system` not covered by these three tabs: sysctl, conntrack
    tuning, IP/IPv6 global options, task scheduler, console, watchdog,
    LCD, flow-accounting, sFlow, acceleration, system proxy. (NTP is
    *not* under `system` in real VyOS - it's `service ntp` - so it
    stays scoped to the future Service work instead, correcting this
    roadmap's own earlier "System" gap description, which had
    mis-listed it.)
- **System > Upgrades (self-upgrade)**: a fourth System tab that checks
  this app's own GitHub releases against the running version
  (`main.version`, the same one `/healthz` already reports) and, when
  a newer one is published, lets you pull the new container image and
  queue the `container name <NAME> image <ref>` config change in one
  click - the actual commit still goes through the normal
  pending-changes review/commit flow (Safe apply available, not
  forced), same as any other change. Disabled by default
  (`SELF_UPGRADE_ENABLED`) - it's the only place this backend ever
  calls a service other than VyOS's own API. See
  [architecture.md](architecture.md#self-upgrade) for the full design,
  including the two constraints that shaped it (a distroless,
  shell-less container with no docker/podman access of its own; no
  built-in way for the backend to know its own VyOS container name,
  hence the new required `SELF_UPGRADE_CONTAINER_NAME`).
- **NAT configuration UI**: NAT44 only - source (SNAT/masquerading),
  destination (DNAT/port-forwards, including redirect-to-localhost),
  and static (1-to-1) rules. Picked next per this roadmap's own
  flagging of NAT as "an extremely common day-to-day router
  configuration need" that "pairs naturally with the existing
  Firewall zone/ruleset model" - which turned out to be true in a very
  concrete way (see below). A new top-level "NAT" nav item (not nested
  under Firewall or Routing) with three tabs: Source
  (`pages/nat/SourceRulesPage.tsx`), Destination
  (`pages/nat/DestinationRulesPage.tsx`), and Static
  (`pages/nat/StaticRulesPage.tsx`).
  - Confirmed against docs.vyos.io and vyos-1x's own interface-
    definition XML source directly (`interface-definitions/nat.xml.in`
    and its `include/nat-*.xml.i`/`include/firewall/*.xml.i`
    includes). Notable finding: NAT44 rule matching reuses the *exact*
    same source/destination address+port+group shape as Firewall
    rules - VyOS's nftables-based NAT and Firewall implementations
    share this matching vocabulary - so `lib/natTypes.ts`'s `NATMatch`
    deliberately mirrors `lib/firewallTypes.ts`'s `FirewallMatch`,
    including referencing the *same* underlying `firewall group
    address-group|network-group|port-group` groups the Firewall UI
    already manages (Groups tab).
  - Source and destination rules share one type (`NATRule`, tagged by
    `kind`) and one form/list component pair, since - other than
    interface direction (`outbound-interface` vs `inbound-interface`)
    and a couple of kind-specific translation details (masquerade only
    makes sense for source; redirect-to-localhost only for
    destination) - their schemas are otherwise identical. Static rules
    (`nat static`) are a separate, materially simpler feature (a
    single destination address maps to a single translation address,
    no port/protocol/group matching at all) and get their own type
    and form.
  - A **"broader v1"** per explicit product decision made before
    implementation: description, interface (name only, not VyOS's
    separate interface-group feature), protocol, source/destination
    address + port + address-group/network-group/port-group matching
    (MAC-group and FQDN matching excluded - a narrower cut than
    Firewall's own match scope), translation address/port (or
    masquerade/redirect), and the disable/exclude/log flags.
  - **Not yet built** (still fully editable via Config Tree): NAT64,
    NAT66/NPTv6, CGNAT (IPv6-transition/carrier-scale features, not
    relevant to a typical VyOS deployment), translation options
    (address-mapping/port-mapping randomization), packet-type matching,
    and drag-and-drop rule reordering (unlike Firewall's
    RulesetDetailPage - renumber via delete-and-recreate or the Config
    Tree page for now). ("load-balancing backends" - HAProxy's own
    concept, unrelated to `nat` - was listed here as an adjacent gap
    before it had any UI at all; see "Load-balancing" further down in
    this "Done" list for where it's now covered.)
- **Policy configuration UI**: prefix lists, AS-path/community/
  extended-community/large-community lists, a curated core of
  route-map, and local-route policy-based routing. Picked next given
  its explicit synergy already noted in this roadmap: BGP's and OSPF's
  own v1 passes both deliberately deferred route-map/prefix-list-based
  redistribution and neighbor filtering, since Policy didn't exist yet
  - it does now. A new top-level "Policy" nav item with four tabs:
  Prefix Lists, Lists (as-path/community/extcommunity/large-community,
  switched by kind), Route Maps, and Local Route.
  - By far the largest single feature tackled in this app so far:
    VyOS's `route-map` alone has 60+ match/set commands (BGP attribute
    manipulation - communities, AS-path prepending, MED, local-
    preference, next-hop, aggregator, RPKI, and far more). Scoped to a
    **curated core** per explicit product decision made before
    implementation, not full coverage - see `lib/policyTypes.ts`'s
    extensive doc comment for the precise list of what's included
    (rule action/description/call/on-match; match as-path/community/
    ip(v6)-prefix-list/protocol/metric/local-preference/tag; set
    metric/local-preference/as-path prepend+exclude/community
    add+replace+none+delete/origin/tag/weight) and everything
    deliberately excluded (extcommunity/large-community *set* actions,
    aggregator, atomic-aggregate, originator-id, evpn/RPKI/nexthop/
    source-vrf matching, ip-next-hop/ipv6-next-hop/src/distance/table/
    metric-type setting, peer matching, jump-to-rule).
  - As-path-list, community-list, extcommunity-list, and
    large-community-list are all the exact same shape in VyOS itself
    (name/description, rules with action/description/regex) - one
    shared component pair (`PolicyListSection`, parametrized by
    `kind`) handles all four, the same "shared shape, kind-
    conditional" pattern BGP's neighbor/peer-group split and OSPF's
    protocol parametrization already established.
  - Confirmed against docs.vyos.io and, for route-map's deeply nested
    match/set structure, vyos-1x's own interface-definition XML source
    directly (`interface-definitions/policy.xml.in` and
    `.../policy_local-route.xml.in`) - caught a real correction:
    `policy local-route rule <n> source/destination address` is
    actually multi-valued in VyOS, not the single value the prose
    docs' command signature implies.
  - `set community add`/`replace` are technically multi-valued in VyOS
    (several community values per rule) but modeled as a single value
    for v1 simplicity - stacking multiple values on one add/replace
    stays Config-Tree-only.
  - **Not yet built** (still fully editable via Config Tree):
    access-lists (prefix-lists are the modern, preferred equivalent
    for most use cases - and route-map's own `access-list`-based match
    options are themselves excluded from this v1's curated core), plus
    everything itemized above as excluded from route-map's core.
    Importantly, this pass only builds Policy's *own* CRUD (creating
    prefix-lists, route-maps, etc. as standalone objects) - it does
    not wire up *references* to them from BGP's or OSPF's own UI (e.g.
    a BGP neighbor's `route-map`/`prefix-list`/`distribute-list`
    import/export attachment, or OSPF's redistribution `route-map`
    option). Attaching a route-map/prefix-list to a BGP neighbor or an
    OSPF redistribution rule still requires the Config Tree page for
    now - a natural follow-up now that Policy objects exist to
    reference.
- **PKI configuration UI**: Certificate Authorities, Certificates
  (with ACME auto-renewal settings), generic key-pairs, Diffie-Hellman
  parameters, and X.509 default subject fields. Picked next per this
  roadmap's own long-standing note that PKI "ties into this app's own
  TLS story" ([security.md](security.md#tls) already documents VyOS's
  own `pki` subsystem as one way to get a real certificate for
  `TLS_CERT_FILE`/`TLS_KEY_FILE`). A new top-level "PKI" nav item with
  four tabs: Certificate Authorities, Certificates, Key Material
  (key-pairs + DH), and Defaults.
  - **Architecturally different from every prior area**: real
    certificate/key *generation* in VyOS (creating a CA, signing a
    certificate, generating DH parameters) happens via interactive
    op-mode commands (`generate pki ca`, `generate pki certificate
    sign ...`), not the `/configure` REST endpoint this app uses
    everywhere else - the CLI prompts interactively for key type/bits/
    subject fields and only afterward does the resulting PEM material
    get pasted into the config tree. Per explicit product decision
    made before implementation, this app's v1 is deliberately
    **storage-only**: pasting in already-obtained PEM certificates/
    keys (from a CA, ACME, VyOS's own CLI, or elsewhere) and managing
    their metadata - not a certificate-generation workflow, which
    would need new backend work wrapping VyOS's op-mode API and
    complex multi-step UX. This keeps the zero-backend-changes pattern
    every prior area has followed.
  - Confirmed against docs.vyos.io and vyos-1x's own interface-
    definition XML source (`interface-definitions/pki.xml.in`).
    Notable finding: private keys - and, per the existing SSH-public-
    key precedent from the System work, *public* keys too - are
    masked server-side, since VyOS's leaf name is always exactly `key`
    regardless of whether it's under a `public` or `private` node, and
    the generic `"key"` entry in `shared/sensitive-fields.json`
    matches on leaf name alone. So key-pairs' public/private keys are
    both write-only in this app's UI - the same convention as every
    other masked leaf - even though a public key isn't actually
    secret. Certificates, CRLs, and DH parameters are NOT masked (not
    actually confidential, and their leaf names don't match any
    sensitive-fields.json entry).
  - **Not yet built** (still fully editable via Config Tree): the
    certificate-generation workflow itself (see above), `pki openssh`
    (SSH host keys), and `pki openvpn shared-secret` (OpenVPN-specific,
    and this app doesn't cover OpenVPN configuration itself yet).
- **Container configuration UI**: Podman-based container definitions,
  user-defined networks, and registry auth/mirror settings. Notable
  since it's literally how VyOS Client itself gets deployed. A new
  top-level "Container" nav item with three tabs: Containers, Networks,
  Registries.
  - Confirmed directly against vyos-1x's own interface-definition XML
    source (`interface-definitions/container.xml.in`) - unlike several
    earlier areas (OSPF, System), docs.vyos.io's prose page turned out
    accurate here, no staleness correction needed.
  - **Containers** tab covers every leaf/child node under
    `container name <name>`: image, entrypoint/command/arguments,
    host-name, description, disable, allow-host-pid/
    allow-host-networks/privileged, the 11-value `capability` enum
    (checkbox group - a new UI pattern, since every prior multi-valued
    leaf in this app was free-text via the generic ChipList component,
    not a fixed enum), sysctl parameters, device passthrough,
    environment variables, labels, cpu-quota/memory/shared-memory
    limits, name-servers, network attachments (address/mac), port
    mappings (listen-address/source/destination/protocol), restart
    policy, uid/gid, tmpfs mounts, volume mounts (mode/propagation),
    log-driver, and health-check. **Networks** tab covers
    `container network <name>` (description, MTU, gateway/prefix,
    no-name-server, bridge vs. macvlan type with mode/parent, VRF).
    **Registries** tab covers `container registry <name>`
    (username/password - password write-only like every other masked
    credential, disable, insecure, mirror address/host-name/port/path).
  - New generic `KeyValuePairList` component (alongside the existing
    `ChipList`) for the id+value tagNode-keyed lists that recur three
    times in this area (`environment`, `label`, `sysctl parameter` -
    all the exact same shape in VyOS).
  - **Explicitly excluded, a distinct follow-up**: actual container
    image pull/list/delete (`add container image`/`show container
    image`/`delete container image`). Unlike everything else in this
    area, these are VyOS *op-mode* commands, not part of `/configure`
    at all - supporting them would mean wrapping a separate VyOS REST
    endpoint that (per this roadmap's own prior note, still true)
    appears to behave synchronously/blocking for a pull, breaking the
    zero-backend-changes pattern every config-tree area has followed so
    far. This was an explicit product decision, confirmed before
    implementation: a container definition built in this app can
    reference an image name/tag that hasn't actually been pulled onto
    the router yet - pulling it still requires the VyOS CLI for now.
    Mirrors PKI's "storage, not generation" carve-out.
    - **Follow-up, since shipped**: see "Container image management"
      further down in this "Done" list - pulling/listing/deleting
      images is now supported via a dedicated "Images" tab.
- **Service configuration UI (first batch)**: a curated batch of nine
  `service` sub-areas, picked from VyOS's much larger `service` config
  tree (~30 sub-services total) per explicit product decision (see the
  questions asked before implementation) - NTP, SSH, the HTTPS API
  itself, DHCP/DHCPv6 relay, DNS forwarding (core), Dynamic DNS,
  Router Advertisements (IPv6 SLAAC), DHCPv6 server, and SNMP (v1/v2c
  only). A new top-level "Service" nav item with nine tabs. Each area
  covers a curated core, not full coverage - see each area's own lib
  module doc comment (`serviceNtpTypes.ts`, `serviceSshTypes.ts`,
  `serviceHttpsTypes.ts`, `serviceDhcpRelayTypes.ts`,
  `serviceDnsForwardingTypes.ts`, `serviceDnsDynamicTypes.ts`,
  `serviceRouterAdvertTypes.ts`, `serviceDhcpv6ServerTypes.ts`,
  `serviceSnmpTypes.ts`) for exactly what's excluded and why.
  - **NTP** (`service ntp`): server list (prefer/pool/noselect/nts/
    ptp/interleave flags), allow-client/listen-address/source-address
    ACLs, bind/source interface, VRF, leap-second, local-stratum.
    Excludes NIC hardware timestamping and PTP transport (niche).
  - **SSH** (`service ssh`): a "presence of the node enables the
    service" pattern (see below), access-control allow/deny group/
    user lists, algorithm allow-lists (cipher/hostkey/pubkey/
    key-exchange/mac - free-text ChipLists, not checkbox groups, since
    each has 10-19 possible values), disable-password-authentication/
    disable-host-validation, FIDO flags, dynamic-protection
    (brute-force throttling), listen-address/port (both genuinely
    multi-valued for SSH), rekey thresholds, client-keepalive-interval,
    trusted-user-ca, VRF (also multi-valued for SSH specifically,
    unlike every other area's single-valued VRF).
  - **HTTPS API** (`service https`): self-referential and explicitly
    flagged in the UI - this is literally how VyOS Client's own
    backend authenticates to VyOS (`api keys id <id> key <key>`,
    masked/write-only like every other credential). Changing the port,
    VRF, or certificates, or disabling the service entirely, can lock
    this app out; commit-confirm is called out as essential here.
    Covers API keys, REST strict-mode, GraphQL auth/CORS, allow-client,
    listen-address/port, TLS versions, certificate/CA/DH-params PKI
    name references, VRF. Excludes `api rest debug` (VyOS marks it
    `<hidden/>` - not user-facing).
  - **DHCP/DHCPv6 relay** (`service dhcp-relay` + `service
    dhcpv6-relay`): full coverage of both - confirmed via XML that the
    two have genuinely different shapes for the same concept (v4's
    `listen-interface`/`upstream-interface` are flat multi-valued
    leaves; v6's are tagNodes keyed by interface name with their own
    nested `address`, single-valued for listen and multi-valued for
    upstream).
  - **DNS forwarding** (`service dns forwarding`, curated core):
    cache-size, dnssec mode, per-domain forwarders (`domain <fqdn>` -
    a genuine tag-within-tag structure, each domain having its own
    `name-server <ip> [port]` tagNode), system-wide upstream
    forwarders (the top-level `name-server`, same shape reused),
    allow-from/listen-address/source-address ACLs, ignore-hosts-file,
    no-serve-rfc1918, negative-ttl, use-system-name-servers, own
    listen port. Excludes `authoritative-domain` (a full mini
    authoritative DNS zone/records feature - A/AAAA/CNAME/MX/NS/PTR/
    TXT/SPF/SRV/NAPTR records - a distinct product surface, not a
    smaller version of forwarding) and `zone-cache`/`dns64-prefix`/
    `options` (ECS/EDNS tuning).
  - **Dynamic DNS** (`service dns dynamic`): full coverage - name-keyed
    entries with protocol (free text, VyOS has no fixed enum here),
    an address-source discriminator (local interface vs. web lookup -
    not schema-enforced as exclusive in VyOS, but presented as a radio
    choice), ip-version, host-names, server/zone, username/password
    (masked), TSIG key file path, ttl/wait-time/expiry-time, plus
    global interval/VRF.
  - **Router Advertisements** (`service router-advert`, IPv6 SLAAC):
    per-interface enable is simply the tagNode's presence (no separate
    flag) - hop-limit, default-lifetime/preference, DNS search list/
    name-servers, link-mtu, managed/other-config flags, RA interval
    min/max, reachable-time/retrans-timer, no-send-advert/interval,
    plus nested `prefix`/`route` advertisement lists. Excludes
    `nat64prefix`, `auto-ignore`, `captive-portal` (niche).
  - **DHCPv6 server** (`service dhcpv6-server`, curated core):
    deliberately NOT modeled after the existing IPv4 DHCP module
    despite the conceptual overlap - confirmed via XML that
    `static-mapping` is hostname-keyed (with optional mac/duid match
    children, not MAC-keyed like v4), `range` has its own prefix/
    start/stop triple, and `prefix-delegation` (IA-PD-like) has no v4
    equivalent at all. Covers global settings (listen-interface,
    preference, log-level, global name-servers), shared-network →
    subnet → range/static-mapping/prefix-delegation, and a
    name-server/domain-search/sntp-server "option" block mounted at
    the subnet level (not the 3 other depths VyOS itself allows -
    range and static-mapping level options are narrower/rarer).
  - **SNMP** (`service snmp`, v1/v2c only): communities (authorization/
    client/network ACLs), listen-address, contact/location/
    description, trap-source, trap-target, transport protocol.
    Deliberately excludes the entire `v3` subtree - SNMPv3 adds a
    materially deeper shape (group/user/view tagNodes, auth/privacy
    password pairs, OID-tree views, its own richer trap-target) that's
    disproportionate alongside the simpler, far more commonly used
    v1/v2c setup this app covers; also excludes `mib`,
    `script-extensions`, `oid-enable`, `smux-peer`, `vrf`.
  - Introduces a "presence of an otherwise-empty node enables the
    service" UI pattern (an inline "Enable X" prompt when absent, a
    "Disable X entirely" danger action once present) for SSH, HTTPS,
    DHCPv6 server, DNS forwarding, and SNMP - all singleton services
    VyOS enables simply by the config node existing, with no natural
    "add a list item" action that would otherwise auto-create it (the
    way adding an NTP server or a DHCPv6 shared network does).
   - **Not yet built** as of this area's initial batch (see the
     Service batch 2 entry below for what was picked up next):
     LLDP, mDNS repeater, webproxy, TFTP server, broadcast-relay,
     conntrack-sync, config-sync, console-server, event-handler, IPoE
     server, PPPoE server, Suricata, monitoring exporters, NDP proxy,
     SLA/TWAMP, stunnel, AWS Gateway Load Balancer, all still fully
     editable via Config Tree.
- **Service configuration UI (second batch)**: nine more `service`
  sub-areas, picked from the ~20 left over after the first batch, per
  explicit product decision (see the questions asked before
  implementation) - LLDP, TFTP server, SNMPv3, NDP proxy, mDNS
  repeater, broadcast-relay, event handler, console server, and
  Monitoring (Prometheus Node/FRR Exporter, Zabbix Agent, Network
  Events). Brings the Service nav item to 17 tabs total.
  - **TFTP server** (`service tftp-server`): directory, port,
    allow-upload, `listen-address` (a genuine tagNode with a
    per-address VRF child here, unlike the plain multi-valued
    `listen-address` most other areas have - confirmed via XML, not
    assumed uniform).
  - **Broadcast relay** (`service broadcast-relay`): numbered relay
    instances (1-99) forwarding UDP broadcasts (e.g. Wake-on-LAN)
    across interfaces. Two independent `disable` switches exist at
    different depths (service-level and per-instance) - both exposed.
  - **mDNS repeater** (`service mdns repeater` - note the two
    intermediate nodes, not a flat `mdns-repeater`): interfaces,
    ip-version, browse-domain/allow-service filters, cache size,
    VRRP-aware disable.
  - **LLDP** (`service lldp`): per-interface mode
    (disable/rx-tx/tx/rx), coordinate-based location (altitude/datum/
    latitude/longitude) plus ELIN, legacy protocol flags (CDP/EDP/
    FDP/SONMP), management-address, SNMP-MIB advertisement.
  - **NDP proxy** (`service ndp-proxy`): per-listener-interface
    config with proxied `prefix` entries (static/auto/interface
    modes - `prefix`'s tag accepts either a bare IPv6 address or a
    CIDR), global route-refresh interval. Complements Router
    Advertisements.
  - **Event handler** (`service event-handler`, only 71 lines in
    VyOS's own schema): named events matching a syslog pattern/
    identifier, running a script (path validated server-side by
    VyOS's `script` validator - must already exist on the router,
    not creatable from this UI) with arguments and environment
    variables.
  - **Console server** (`service console-server`): serial device
    settings (speed/data-bits/stop-bits/parity) keyed by either a
    `ttyS<N>` name or a USB bus/port topology string (e.g.
    `usb1b2p1.1`, NOT a Linux `ttyUSB0`-style name - confirmed via
    XML, corrected an initial wrong assumption), with an optional SSH
    wrapper port. No terminal-server/raw-TCP mode exists in this
    schema version.
  - **SNMPv3** (`service snmp v3`): extends the SNMP tab shipped in
    the first batch (v1/v2c community-based SNMP) with `engineid`,
    `group`/`user`/`view` tagNodes (auth/privacy password pairs -
    write-only, same convention as everywhere else - and OID-tree
    views), and v3's own richer `trap-target` variant
    (auth/privacy/port/protocol/type/user, not just a plain community
    string).
    - **Also fixed a real masking bug found while extending this
      area**: `trap-target <addr> community <string>` (the v1/v2c
      variant, shipped in the first batch) matches
      shared/sensitive-fields.json's generic `"community"` entry and
      is masked server-side - an SNMP community string functions as a
      shared secret, same as a password - but the original
      implementation modeled and displayed it as a plain visible
      string. Changed to a write-only `hasCommunity: boolean`,
      matching the convention used everywhere else. No round-trip bug
      existed (trap-targets have no edit form, only add/remove), but
      the UI was showing the masked placeholder text as if it were a
      real value.
  - **Monitoring** (`service monitoring`, curated): Prometheus Node
    Exporter and FRR Exporter - each independently enabled by its own
    node's presence, a new "per-sub-node enable" variant of the
    existing "presence enables the service" pattern - Zabbix Agent
    (PSK auth - write-only, masked via the generic `"secret"` entry -
    buffers, debug/log settings, and both flat multi-valued `server`
    addresses and a genuine `server-active` tagNode with per-entry
    ports), and Network Events (route/link/addr/neigh/rule toggles,
    queue size, log level). Deliberately excludes Prometheus's
    `blackbox-exporter` (a nested 2-level keyed list of synthetic-
    monitoring "modules" - niche) and **Telegraf** entirely (5
    structurally distinct backend integrations - InfluxDB, Azure Data
    Explorer, Loki, Prometheus-client, Splunk - each with its own auth
    shape, disproportionate alongside the three simpler areas
    covered).
  - **Not yet built**: the remaining ~11 `service` sub-areas (webproxy,
    conntrack-sync, config-sync, IPoE server, PPPoE server, Suricata,
    Prometheus's blackbox-exporter, Telegraf, SLA/TWAMP, stunnel, AWS
    Gateway Load Balancer), all still fully editable via Config Tree.

- **VPN configuration UI**: the full `vpn` config tree per explicit
  product decision (see the questions asked before implementation,
  where all six offered pieces were picked) - IPsec (crypto groups,
  site-to-site, IKEv2 remote-access, global settings), plus three
  accel-ppp-based remote-access VPN servers (L2TP, PPTP, SSTP) sharing
  one kind-parametrized lib module and UI component, and OpenConnect
  (AnyConnect-compatible SSL VPN). A new top-level "VPN" nav item with
  8 tabs (4 for IPsec, one each for L2TP/PPTP/SSTP/OpenConnect).
  Corrects a stale roadmap note: `rsa-keys` no longer exists in
  current VyOS (removed in favor of x509 certificates).
  - **IPsec** (`vpn ipsec`, see `vpnIpsecTypes.ts`'s doc comment):
    global `authentication` stores for PSK and PPK (referenced by
    local/remote ID, not embedded per-peer - confirmed via XML, not
    assumed), `esp-group`/`ike-group` crypto proposal definitions
    (shared enums with the rest of VyOS's IPsec-based features),
    `site-to-site peer` (pre-shared-secret/RSA/x509 auth modes,
    tunnels, VTI), `remote-access` (IKEv2 connections with local-user/
    RADIUS/pool sub-lists - `radius` here is two same-named XML nodes
    merged into one, confirmed via XML), and global `options`.
    Deliberately excludes `vpn ipsec profile` (DMVPN/NHRP glue -
    depends on `protocols nhrp`, out of scope until DMVPN itself is
    built).
  - **L2TP / PPTP / SSTP** (`vpn l2tp`/`pptp`/`sstp`, see
    `vpnAccelPppTypes.ts`'s doc comment): one `kind`-parametrized
    module covers all three accel-ppp-based servers, which share an
    almost identical field set confirmed via XML - authentication
    (mode/protocols, local users with static-IP/rate-limit, RADIUS),
    client IPv4/IPv6 pools, PPP options (MPPE/LCP-echo/CCP), limits,
    extended-scripts, shaper/SNMP/log/WINS/name-server. L2TP and PPTP
    wrap every field under a `remote-access` node and have
    `outside-address`; SSTP has neither. L2TP additionally has
    `ipsec-settings` (transport auth for the LNS, curated to auth
    mode/PSK/lifetimes - not a full embedded esp-group/ike-group
    definition) and `lns` (shared-secret/host-name); SSTP additionally
    has `ssl` (CA/certificate PKI references) and `port`/`host-name`
    (TLS SNI matching). PPTP has no protocol-specific extras.
  - **OpenConnect** (`vpn openconnect`, see
    `vpnOpenconnectTypes.ts`'s doc comment): its own distinct shape,
    not accel-ppp based - accounting (RADIUS), authentication (local
    password/OTP/password-otp modes with per-user 2FA OTP secrets,
    RADIUS, certificate user-identifier field, selectable client
    groups), listen address/ports, TLS minimum version, SSL
    (CA-chain/certificate/passphrase), network-settings (pushed
    routes, client IPv4 subnet, a single non-tag-keyed IPv6 pool -
    unlike L2TP/PPTP/SSTP's tagNode-keyed multiple pools - name
    servers, split-DNS domains, tunnel-all-DNS), and connect/disconnect
    scripts. Deliberately excludes `authentication
    identity-based-config` (per-user/per-RADIUS-group config file
    inclusion from `/config/auth` - a niche, filesystem-dependent
    feature not modeled elsewhere in this app either).
  - **Not yet built**: `vpn ipsec profile` (DMVPN/NHRP), OpenConnect's
    `identity-based-config`, and the full embedded esp-group/ike-group
    definitions under L2TP's `ipsec-settings` - all still fully
    editable via Config Tree.

- **WebUI quality-of-life improvements**: config export/import, a
  reusable tooltip system, a GitHub link, and session-expiry handling.
  - **Export**: the Config Tree page's tree/set-commands views are now
    downloadable as files (JSON / flat commands respectively) -
    client-side only, reusing data the page already fetches.
  - **Import**: a new tab uploads a configuration file and applies it
    via VyOS's `/config-file` endpoint - **Merge** (additive) or
    **Full replace** (VyOS's `load` semantics, gated behind an
    explicit lockout-risk acknowledgment). Deliberately a standalone
    action outside the pending-changes cart, reusing the same
    commit-confirm mechanism as an ordinary commit.
  - **Tooltips**: a new `InfoTooltip`/`FieldLabel` component pair
    (hover/focus-revealed, pure CSS, no icon library) applied in
    jargon-density-prioritized batches - VPN first (IPsec crypto
    proposals/DPD/PFS/DH-group/PRF, site-to-site connection-type/auth
    mode, remote-access client/server auth mode, accel-ppp
    MPPE/IPCP/auth-mode, OpenConnect local-auth-mode/tunnel-all-DNS),
    then Firewall/NAT (rule actions incl. nftables verdicts like
    jump/return/synproxy, address/network/port/domain/MAC groups,
    ICMP type names, zone default-action drop-vs-reject, the local
    zone concept, the from/to zone matrix, connection-state policy
    established/related/invalid, hardening toggles like SYN cookies/
    martian packets/source-routing, NAT masquerade vs. static address,
    port redirect vs. translation, exclude rules, static/1-to-1 NAT).
    Two real bugs were found and fixed while building this out: (1) the
    tooltip trigger was originally a `<button>`, which - being one of
    HTML's "labelable" elements - silently stole a `<label>`'s implicit
    association away from the actual field whenever nested inside one
    (fixed by using a non-labelable `<span role="button">` instead,
    see InfoTooltip.tsx's doc comment); (2) hint text that happens to
    contain another nearby field's exact label as a substring (e.g.
    "...instead of Address group...") makes `getByLabelText` matches
    ambiguous - both are called out explicitly in the component's own
    doc comment so future batches don't repeat them. Remaining planned
    batches: PKI/Policy, BGP/OSPF, then the rest. Hint text is
    deliberately original wording, not copied from VyOS's own
    GPLv2-licensed docs/`<help>` strings, since this app is Apache-2.0
    licensed.
  - **GitHub link**: added to the sidebar footer, next to Sign out.
  - **Session expiry**: sessions now slide their 30-minute expiry
    forward on every authenticated request (capped at 12 hours from
    login regardless of activity, instead of a flat 30-minute cutoff),
    and any 401 from an established session now redirects to `/login`
    with a "session expired" message, instead of every open page
    silently showing "Failed to load X".
  - **Tooltips batch 3 - PKI/Policy**: route-map rule fields (action
    fall-through/implicit-deny, call/goto/next control flow, AS-path
    list/prepend/exclude, community list/add/replace/delete/none,
    origin igp/egp/incomplete, local-preference vs. weight, exact
    community match), prefix-list and policy-list (as-path/community/
    extcommunity/large-community) `ge`/`le`/regex syntax (dynamic
    per-kind hint text), local-route policy fields (firewall mark,
    routing table, VRF), PKI (Diffie-Hellman parameters, key-pairs,
    CA "install into system store"/revoked, certificate revoked, ACME
    listen-address/RSA-key-size/directory-URL, X.509 DN country-code
    format, CRL).
  - **Tooltips batch 4 - BGP/OSPF**: BGP neighbor/peer-group fields
    (remote-AS keyword values, peer-group inheritance, eBGP multihop,
    update-source, TCP MD5 password, passive, next-hop-self, remove-
    private-AS, soft-reconfiguration inbound, maximum-prefix), BGP
    global settings (system AS, router ID), BGP network advertisement/
    redistribution; OSPF area fields (area types normal/stub/NSSA,
    totally-stubby no-summary, NSSA translate role, Type-7 default),
    OSPF interface fields (network type broadcast/point-to-point/nbma/
    point-to-multipoint, dead/hello intervals, passive, MTU-mismatch
    ignore, BFD, per-interface authentication overriding the area
    default, MD5 key ID), OSPF global settings (auto-cost reference
    bandwidth, four administrative-distance classes, default-route
    metric/metric-type E1-vs-E2), OSPF redistribution, OSPF area
    range summarization (not-advertise, cost override, substitute
    prefix). Found and fixed several more instances of the
    self-referential hint-collision gotcha (a field's own hint
    accidentally repeating its own label, or another visible field's
    label, as a substring - e.g. a "Peer-group" hint that said
    "inherits from a named peer-group") while writing this batch.
  - **Tooltips batch 5 - System, Container, and Service (final
    batch)**: System (time zone IANA-name format, domain search order,
    SSH public key type/base64-data-only format, password one-way
    hashing, account-disable-vs-delete distinction, syslog facility/
    level/protocol semantics); Container (restart policy, log driver,
    shared host process-namespace/networking, network type bridge-vs-
    macvlan, DNS plugin disable, registry insecure-TLS toggle and
    pull-through mirror concept, volume mount-propagation modes
    private/shared/slave, tmpfs, sysctl container-namespace scoping);
    Service - all remaining tabs: SSH (client keepalive, trusted CA,
    rekey, dynamic-protection thresholds, FIDO options), LLDP (legacy
    protocol checkboxes CDP/EDP/FDP/SONMP, SNMP advertise, coordinate-
    only location, WGS84 datum), Router Advertisements (default-
    preference, M/O flags, reachable/retrans timers, prefix no-
    autonomous/no-on-link flags), DNS forwarding (cache size, DNSSEC
    mode, negative TTL, system-name-servers/hosts-file/RFC1918
    toggles, per-domain trust-anchor/recursion), SNMP v1/v2c+v3
    (transport protocol, community ro/rw semantics, trap inform-vs-
    trap distinction, engine ID, groups/users/views concepts), DHCPv6
    server (preference, route-autoinstall, shared-network interface
    scoping, address ranges, static mappings, prefix delegation),
    Dynamic DNS (ddclient protocol/zone/server, TSIG key, address-
    source interface-vs-web-lookup), NDP proxy (route-refresh, router
    bit, static/auto/interface prefix modes), Event handler (syslog-
    identifier/pattern filters, script path/arguments/environment),
    Console server (speed/data-bits/stop-bits/parity, SSH wrapper
    port), Monitoring (Prometheus Node/FRR exporter collector flags,
    Zabbix PSK ID/secret, network-event route/link/address/neighbor/
    rule types), broadcast-relay, mDNS repeater, DHCP/DHCPv6 relay
    (hop count, relay-agent-packets mode, interface-ID option),
    HTTPS API (DH parameters, GraphQL auth-type/introspection, REST
    strict-path-checking, API key security note), NTP (server flags
    prefer/pool/NTS/PTP/interleave, local reference stratum, leap-
    second smear), TFTP server (unauthenticated-upload security note).
    Found one more `InfoTooltip` gotcha in this batch, now documented
    in the component's own doc comment: placing a hint *inside* the
    same `<label>` as a checkbox makes the hint text become part of
    the checkbox's own accessible name (browsers/testing-library
    concatenate a label's full text content, including descendant
    `aria-label`s) - exact-anchored test queries like `getByRole(
    'checkbox', { name: /^foo$/i })` must be loosened to a prefix
    match (`/^foo/i`) once a hint is added; fixed in the LLDP, NTP,
    and network-event monitoring page tests. This closes out the
    tooltip system rollout - every major configuration area now has
    contextual hints (see docs/architecture.md's design notes for the
    component itself).

- **Log viewer**: a new top-level "Logs" nav page - a bounded, refreshable
  view of one of a curated set of this app's log sources, plus an
  opt-in auto-poll mode. `GET /api/logs`
  (`backend/internal/api/log_handlers.go`) wraps `show log ...`/`show container log <name>`
  behind an explicit `?source=` whitelist (`system`, `firewall`, `ssh`,
  `https`, `dhcp-server`, `vpn`, `frr`, plus parameterized `facility`/
  `priority`/`container`) rather than a generic op-mode-path
  pass-through - VyOS's `show log` command tree has several dozen
  subcommands (many per-rule/per-interface variants this app has no
  corresponding config UI for), and this feature is scoped to "view
  this app's own areas' logs," not "run any op-mode log command."
  `vyos.ShowLogTail` (`backend/internal/vyos/logs.go`) always fetches
  each source's plain chronological output and truncates to the
  requested line count itself, since only 2 of the several dozen
  underlying commands take a line-count parameter at all - every
  per-service one is otherwise completely unbounded. There's no
  incremental/`--since` fetch mode anywhere in VyOS's log command
  tree, so - like the Dashboard's live charts - true streaming was
  out; instead, `frontend/src/lib/mergeLogLines.ts` diffs successive
  polls (finds the overlap between what's displayed and a fresh
  snapshot, appends only what's new) so the page's own opt-in
  5-second auto-poll toggle reads like a live-appending tail. A
  client-side search box filters currently-displayed lines, and a
  "Download" button (reusing the existing `downloadFile.ts` helper
  from Config Tree's export buttons) saves the current view as text.
  See docs/architecture.md's "Logs" section for the full design
  rationale. File viewing/browsing was deliberately **not** included in
  this pass - see "Later" below, unchanged.
  - **Follow-up: "system" source timing out against a real router.**
    Bare `show log` (`journalctl --no-hostname --boot`, used for the
    default/"system" source) has no line limit at all - on a router
    with substantial log history since boot, generating and
    transferring the *entire* boot journal took long enough that this
    backend's own request to VyOS timed out before ever getting a
    response to truncate down to size. Fixed by switching the
    "system" source to `show log tail <n>` instead
    (`vyos.ShowLogTailBounded`) - VyOS can satisfy this by reading
    backwards from the end of the journal, staying fast regardless of
    total journal size, with its newest-first output re-reversed back
    into the same chronological order every other source returns.
    Also gave every log fetch (this one and the still-unbounded
    per-service ones) its own longer, dedicated timeout
    (`vyos.Client.ShowWithTimeout`, 45s vs. this app's normal ~30s
    default) - kept deliberately under this backend's own
    `http.Server.WriteTimeout` (60s), which would otherwise abort the
    response before the longer client-side timeout got a chance to
    produce a clear error instead of a broken connection.

- **Container image management**: pull/list/delete of the actual
  container images referenced by the Container configuration UI —
  a new "Images" tab under Container (alongside Containers/Networks/
  Registries). `GET/POST/DELETE /api/container/images`
  (`backend/internal/api/container_image_handlers.go`,
  `backend/internal/vyos/container_image.go`) wrap VyOS's dedicated
  `/container-image` REST endpoint (`show container image`/`add
  container image <name>`/`delete container image <name>`) — genuine
  op-mode commands, not part of `/configure` at all, so every action
  here is applied immediately with nothing staged in the
  pending-changes cart, unlike the rest of the Container area.
  Confirmed directly against vyos-1x's `configsession.py`/
  `op_mode/container.py` that both the REST endpoint and the
  underlying `podman image pull` are fully synchronous with no
  timeout on VyOS's own side, so — per the user's explicit choice
  against introducing a new background-job/polling architecture —
  the pull handler extends just that one request's write deadline
  (`http.NewResponseController(w).SetWriteDeadline(...)`, ~11 minutes)
  past this backend's normal 60s `WriteTimeout` rather than deferring
  to async status-polling. `show container image json`'s output is
  `podman image ls --format json`'s output completely unreshaped by
  VyOS (podman's own field casing, not this app's camelCase
  convention) — a local podman 5.6 pull+list confirmed a freshly-
  pulled image's tag can land under either `Names` or `RepoTags`
  depending on podman version, with the other left `null`, so
  `ContainerImage.Tags()` checks both rather than assuming either is
  reliably populated. There is no force-delete option anywhere in this
  app because VyOS's REST request schema (`ContainerImageModel`) has
  no `force` field at all — the CLI's `... force` variant is genuinely
  unreachable through this endpoint, not a choice this app declined to
  expose. This app also does its own image-name validation
  (`validateContainerImageName`) since VyOS's own `add_image`/
  `delete_image` scripts have none — the name is shell-interpolated
  directly on VyOS's side. Per the user's explicit choice, there is
  deliberately no "delete all images" bulk action, only per-image
  delete (a two-click confirm in the UI, given the destructive/
  irreversible nature and this app's general avoidance of native
  `window.confirm` dialogs). See docs/architecture.md's "Container
  images" section for the full design rationale.

- **Files**: a new top-level "Files" nav page — a read-only,
  clickable directory/file browser under a curated allowlist of
  directories (`/config`, `/var/log`). `GET /api/files`/`GET
  /api/files/roots` (`backend/internal/api/file_handlers.go`,
  `backend/internal/vyos/files.go`) wrap VyOS's `show file <path>` —
  confirmed directly against vyos-1x's `src/op_mode/file.py` that this
  single op-mode command decides server-side whether to return a
  directory listing or a file's content/hexdump, and that it has *no*
  path restriction of its own at all (it would happily show
  `/etc/shadow`) — so this app's own `fileBrowserRoots` allowlist is
  entirely this backend's own defense-in-depth choice, the same stance
  as container image name validation. There's no JSON form for this
  command either: `vyos.ParseShowFile` parses `ls -hlFGL
  --group-directories-first`'s plain-text output for directory
  listings (leniently — an unparseable line is just dropped, not
  fatal, since this text format isn't a stable contract the way VyOS's
  JSON outputs are) and a `"FILE INFO"`/`"FILE DATA"`-header text
  format for file views. Confirmed there is **no supported way to
  write arbitrary file content back to an arbitrary path** through
  VyOS's REST/GraphQL surface at all — only `/config-file`'s
  config.boot-specific, schema-validated save/load/merge — so this is
  read-only by design, not a scoped-down choice: no editor, and none
  possible against this endpoint. Also inherited the same "no size
  limit" hazard the "system" log source fix uncovered (see the Log
  viewer entry above): a file's full content/hexdump is generated by
  VyOS server-side regardless of size, so this backend caps how much
  it will hold onto/return (2MB, with a `truncated` flag) and uses the
  same longer, dedicated timeout style `ShowLogTail` introduced. See
  docs/architecture.md's "Files" section for the full design
  rationale.

- **Load-balancing**: a new "Load-balancing" nav item with WAN and
  HAProxy tabs — two entirely unrelated VyOS features that merely
  share a config-tree prefix, confirmed directly against vyos-1x's
  `interface-definitions/load-balancing_wan.xml.in`/
  `load-balancing_haproxy.xml.in`. Configuration needed **zero backend
  changes** — like every other config-tree area, it's read/written via
  the existing generic `GET /api/config/tree`/`POST /api/config/commit`
  endpoints, with all typed modeling living frontend-only
  (`frontend/src/lib/loadBalancingTypes.ts`/`loadBalancingParse.ts`/
  `loadBalancingWanForm.ts`/`loadBalancingHaproxyForm.ts`). The **WAN**
  tab covers global toggles (disable-source-nat, enable-local-traffic,
  flush-connections, only-default-route, sticky-connections inbound,
  hook script), `interface-health <ifname>` (nexthop, failure/success
  counts, and a nested `test <id>` list of ping/ttl/user-defined health
  probes), and `rule <N>` (source/destination match — including
  Firewall address/network/port/domain-group references, reusing the
  same `group { ... }` shape Firewall/NAT rules already use — exclude/
  failover/per-packet-balancing flags, inbound-interface, a rate-limit
  block, and a nested weighted `interface <name>` egress list). The
  **HAProxy** tab covers `service` (frontends: backend refs via a real
  dropdown fed by the same config fetch, listen-addresses, mode/port,
  logging, redirect-to-HTTPS, compression, SSL certificates, and a
  nested domain/URL-path routing `rule` list), `backend` (balance
  algorithm, HTTP or non-HTTP health checks, a nested `server` list,
  SSL CA/no-verify, per-backend timeout overrides, and its own routing
  `rule` list), plus `global-parameters`/`timeout`/`vrf`. Per an
  explicit user decision, both tabs also include a **basic live status
  panel** (`show wan-load-balance`/`show load-balancing haproxy`) —
  op-mode data with no JSON form at all, so this did need new backend
  parsing (`vyos.ParseWANLoadBalanceStatus`/`vyos.ParseHAProxyStatus`),
  including a fixed-width-column text-table parser for HAProxy's
  `tabulate`-formatted output (splits on the separator line's `-` run
  positions rather than whitespace, since cell values like `"23 ms"`
  contain spaces). Both status panels are manually refreshed, not
  auto-polled, per that same decision. See docs/architecture.md's
  "Load-balancing" section for the full design rationale, including a
  few very recent schema fields (`only-default-route`, HAProxy backend
  `timeout tunnel`/`http-server-close`) confirmed against vyos-1x's
  live source but not yet documented on docs.vyos.io.
  - **Not yet built**: HAProxy's `tcp-request`/URL-path/SSL-SNI rule
    matching beyond a basic domain-name + backend-routing rule (the
    full match vocabulary is modeled in `loadBalancingTypes.ts`/parsed
    by `loadBalancingParse.ts`, but the add-rule form only exposes
    domain names, one URL-path-begin value, and the routing target —
    editing an existing rule's full field set, or the SSL-SNI/
    wildcard-domain/other URL-path variants, still requires the Config
    Tree page); HAProxy's `http-compression`/`tcp-request` fields are
    editable but not exposed with dedicated pickers for every nuance.

- **High Availability**: a new "High Availability" nav item with VRRP
  and Conntrack-sync tabs, covering `high-availability vrrp` and the
  separate `service conntrack-sync` tree - genuinely distinct VyOS
  features linked only by one cross-reference field
  (conntrack-sync's `failover-mechanism vrrp sync-group`, required by
  VyOS's own conf-mode script to point at an existing sync-group),
  confirmed directly against vyos-1x's
  `interface-definitions/high-availability.xml.in`/`service_conntrack-sync.xml.in`.
  Configuration needed zero backend changes, same as Load-balancing -
  all typed modeling lives frontend-only (`haTypes.ts`/`haParse.ts`/
  `haVrrpForm.ts`/`haConntrackSyncForm.ts`). The **VRRP** tab covers
  global settings (disable, SNMP traps, startup-delay, default
  version, global GARP timing), `group <name>` (interface, VRID,
  priority, advertise-interval, description, disable/no-preempt/
  preempt-delay, RFC3768 virtual-MAC compatibility, hello-source-
  address, authentication (password+type, diffed as one unit since
  VyOS requires both together or neither), health-check (ping or
  script), interface tracking, transition scripts (master/backup/
  fault/stop), and nested `address`/`excluded-address`/`peer-address`
  lists) and `sync-group <name>` (member groups - picked via a real
  checkbox multi-select against the sibling groups list, the same
  "live dropdown for a sibling tagNode name" pattern Load-balancing's
  HAProxy backend picker introduced - plus its own health-check/
  transition scripts). The **Conntrack-sync** tab covers all of
  `service conntrack-sync`'s scalar/flag/multi-valued settings
  (accept-protocol, expect-sync, ignore-address, listen-address via
  ChipList.tsx, disable-external-cache/syslog, startup-resync, event-
  listen-queue-size, mcast-group, sync-queue-size, purge-timeout) plus
  a nested sync `interface <name>` list (peer/port) - its
  `failover-mechanism vrrp sync-group` field is a real dropdown fed by the VRRP
  tab's sync-groups, from the same `useHAConfig()` fetch. Per the
  user's explicit scope decisions: both VRRP and conntrack-sync
  shipped together (not sequenced), and both tabs include a **basic
  live status panel** (`show vrrp`'s per-group state table, reusing
  the exact same `tabulate`-parsing helper HAProxy's status
  introduced; `show conntrack-sync status`'s fixed 4-line text block) -
  manually refreshed, not auto-polled, matching Load-balancing's status
  panels. `high-availability virtual-server` (an unrelated IPVS/LVS
  load-balancer sharing the same XML parent node, with a naming
  collision against this app's own "Load-balancing" nav item) was
  explicitly excluded per the user's decision. See
  docs/architecture.md's "High Availability" section for the full
  design rationale.
  - **Not yet built**: per-group/per-sync-group GARP (gratuitous ARP)
    timing overrides - only the global default is exposed in the UI
    (still fully editable via Config Tree); `high-availability
    virtual-server` (see above - a distinct potential future roadmap
    item, not part of this one).

- **Traffic Policy / QoS**: a new "Traffic Policy / QoS" nav item with
  Policies/Interfaces/Match Groups tabs. VyOS's config-tree root was
  renamed from `traffic-policy` to `qos` back in 2022 (confirmed
  against vyos-1x's `interface-definitions/qos.xml.in`) - this app
  targets the current `qos` path. `qos policy` has 12 sibling policy
  types of wildly different complexity/popularity; per the user's
  explicit scope decision this covers 8 — `shaper`/`shaper-hfsc` (the
  two classful HTB/HFSC bandwidth-shaping workhorses), `limiter` (the
  only ingress-capable type - VyOS enforces this at commit time, and
  this app's own interface-binding picker pre-filters accordingly),
  `cake`/`fq-codel` (modern non-classful AQM), and `priority-queue`/
  `round-robin`/`rate-control`. Configuration needed zero backend
  changes - all typed modeling is frontend-only across ten new
  `lib/qos*.ts` files. One shared `QosMatchList.tsx` component covers the
  `match <name>` rule editor for all 5 classful types plus standalone
  `qos traffic-match-group` (reusable named filter sets, referenced
  from any class via `match-group`), since they all share the exact
  same underlying match schema; `priority-queue`/`round-robin` also
  share one list/form component entirely
  (`SimpleClassfulPolicyList.tsx`), parameterized by type, since their class shapes are
  structurally identical bar one field. Interface bindings (`qos
  interface <ifname> { ingress <policy>, egress <policy> }`) and
  match-group references are both real dropdowns fed by sibling data
  from the same `useQosConfig()` fetch - the same pattern
  Load-balancing's HAProxy backend picker introduced. Per the user's
  explicit scope decisions, a **basic live status panel** is included
  (an interface picker + `show qos shaper interface <ifname>`'s
  per-class stats table, reusing the same `tabulate`-parsing helper
  HAProxy/VRRP's status already use) - but this command turned out to
  be **hardcoded to only return data for `shaper`-type egress
  policies** (confirmed against vyos-1x's `src/op_mode/qos.py`), a
  narrower scope than initially assumed; every other policy type's
  interface shows no stats through this command at all. True ingress
  *shaping* (via an IFB pseudo-interface, as opposed to `limiter`'s
  policing) was explicitly excluded per the user's decision. See
  docs/architecture.md's "Traffic Policy / QoS" section for the full
  design rationale.
  - **Not yet built**: `drop-tail`/`fair-queue`/`random-detect`/
    `network-emulator` (the last a link-impairment testing tool, not
    real QoS - all four still fully editable via Config Tree); true
    ingress shaping via IFB (see above); CAKE's own separate `show qos
    cake interface <ifname>` stats command (differently shaped from
    the shaper one, not implemented); the "add a match" form's field
    set is a practical subset of the full match schema (no `ether`/
    TCP-flags/max-length matching when *creating* a new match - still
    parsed/displayed correctly for existing ones).

- **UX/operational batch**: a set of 12 smaller, user-requested
  improvements spanning several existing areas rather than one new
  configuration surface - each item was scoped/researched
  independently against VyOS's own docs/schema before building, the
  same discipline as every area above:
  - **Container image auto-pull prompt**: `ContainerForm.tsx`'s image
    field cross-references `useContainerImages()`'s pulled-image list
    (new `lib/containerImageMatch.ts`'s `imageIsPulled`) and shows a
    "Not pulled yet - Pull now" prompt when it isn't found - detect
    and prompt only, never auto-triggers a pull.
  - **Cleanup unused images**: `ImagesPage.tsx` gained a panel listing
    images unreferenced by any container definition's `image` field
    (`unreferencedImages`, config-tree reference only - deliberately
    independent of the live "in use" running-container count already
    shown), two-click confirm, then individual `deleteContainerImage`
    calls looped client-side (no bulk-delete endpoint exists).
  - **Reboot/poweroff**: new `POST /api/system/reboot`/`poweroff`
    handlers wired to `vyos.Client.Reboot`/`Poweroff` (which already
    existed but had no routes), plus a new "Power" tab under System.
    Reboot uses the same two-click confirm every other destructive
    action in this app uses; poweroff requires typing the router's
    own hostname into a modal before it's enabled - a stronger
    confirmation, since a remote poweroff may be unrecoverable without
    physical/IPMI/PDU access.
  - **`Modal.tsx`**: the app's first true overlay dialog component
    (everything else uses an inline expand-in-place panel) - a
    portal-rendered, Escape/backdrop-dismissible dialog, introduced for
    poweroff's confirmation above and DHCP's "Make static" below.
  - **DHCP "Make static" modal**: `DHCPLeasesTable.tsx`'s "Make static"
    action now opens `MakeStaticModal.tsx` (pre-filled name/MAC/IP from
    the lease, DUID blank, all editable) instead of immediately queuing
    two `set` ops with no review step - also fixed a latent gap where
    the old immediate-queue path never checked for a static-mapping
    name collision (`existingStaticMappingNames`).
  - **Config warnings banner**: a persistent, global banner
    (`ConfigWarningsBanner.tsx`, wired into `Layout.tsx` above every
    page) surfacing 5 pure, unit-tested checks
    (`lib/configWarnings.ts`) over already-loaded config: firewall input/forward chains
    defaulting to `accept`, SSH password authentication allowed, the
    HTTPS API with no client address restriction, SNMP `public`/
    `private` community strings, and enabled users with neither a
    password nor a real SSH key. Two items from the original
    wishlist were dropped after checking against VyOS's own docs
    rather than assumption: **SSH root login** (VyOS 1.2+ removed SSH
    root login entirely - no config toggle exists to warn about) and
    **telnet** (VyOS has no telnet service at all). "Weak" secrets
    (e.g. a password literally being "admin") also isn't checkable -
    every secret this app models is write-only, the real value never
    reaches the frontend - so only "empty" (no secret configured at
    all) is checked.
  - **Responsive design**: the app's first layout-level responsive
    handling - `Layout.tsx`'s sidebar becomes an off-canvas drawer
    with a hamburger toggle below the `lg:` breakpoint; every data
    table now scrolls horizontally (`overflow-x-auto`) instead of
    clipping (`overflow-hidden`) or having no overflow handling at
    all (10 tables fixed); the handful of 4-5 column form-field grids
    with no responsive stacking at all now collapse to 2 columns below
    `sm:`. Explicitly **not** a phone-optimized redesign of dense
    per-page content (Firewall rulesets, QoS policies, the ~120
    2-3-column form grids elsewhere) - "usable on a phone, not
    optimized for one" was the explicit scope, matching "Later" below
    if a deeper pass is ever wanted.
  - **Nav/branding cleanup**: the sidebar's nav items were reordered
    into a themed grouping (overview → core networking → traffic
    control → services → resilience → identity → admin/tooling,
    confirmed directly with the user - not derivable from VyOS's own
    alphabetical CLI tree) and "Load-balancing" was renamed to "Load
    Balancing" in user-facing text only (route/config-path/internal
    identifiers stay hyphenated, matching VyOS's own naming).
  - **Live chart refresh rate**: Dashboard's live interface-throughput
    charts now refresh every 2s instead of 5s, while deliberately
    keeping the visible window at 5 minutes (not shrinking to 2
    minutes) by tripling the retained sample count in lockstep
    (`useSampleHistory`'s and `useInterfaceThroughput`'s own separate
    `DEFAULT_MAX_SAMPLES` constants, both 60 → 150).
  - **Considered and declined**: in-browser editing of files under
    `/config` (no supported VyOS write path exists for arbitrary file
    content - see architecture.md's "Files" section) and
    auto-invalidating a session when the underlying VyOS user's
    credentials change mid-session (would need either a server-side
    session store or a VyOS round-trip on every request, undermining
    the stateless-session design - see security.md's "Session model"
    section for the full rationale on both).

- **UX review follow-up batch**: a self-directed UX review (walking
  through realistic use cases end-to-end in the UI, not a user-reported
  bug list) surfaced several gaps, addressed here:
  - **VyOS system image management**: a new System "Images" tab -
    `show/add/delete system image`, confirmed via docs.vyos.io's VyOS
    API reference to have a clean, non-interactive dedicated `/image`
    REST endpoint (an earlier assumption that this needed SSH was
    wrong - corrected after actually checking). Installing a new
    release (`AddSystemImage`, mirroring PullContainerImage's
    long-running/extended-write-deadline shape, just with a 30-minute
    timeout for a full ISO) is gated behind an acknowledgment
    checkbox, the same pattern ImportConfigPanel.tsx's "Full replace"
    uses. Rolling back to an already-installed image ("Set as default
    boot") is genuinely just an ordinary `system image default-boot`
    config write - it queues through the normal pending-changes cart
    like any other change, with no separate confirmation dialog needed
    (delete does get the standard two-click confirm, since that one
    bypasses the cart). A banner nudges toward rebooting whenever the
    default-boot and running images differ.
  - **Static-IP validation**: MakeStaticModal.tsx/
    StaticMappingSection.tsx now validate the IP address field's
    format (reusing the CIDR-format convention already used for
    subnet creation) and warn - without blocking submission - when the
    chosen address falls inside the subnet's own dynamic range
    (`isAddressInDynamicRange`), a real risk of colliding with a
    dynamically-leased client that neither this app nor VyOS itself
    previously flagged. Both forms also now note that a device won't
    actually start using a new static address until it renews its
    lease (VyOS doesn't force a renegotiation).
  - **Container volumes**: three stale "pulling isn't supported yet"
    strings (left over from before the image-pull feature shipped)
    corrected, and the volume-mount source field now hints that only
    paths under `/config` survive a VyOS image upgrade/reinstall -
    previously undocumented anywhere, in-app or in the docs.
  - **Certificate/CA expiry**: PKI's Certificates and CAs tabs now show
    an expiry badge (expired / expiring within 30 days / a plain
    date), backed by a new `GET /api/pki/expiry` endpoint that parses
    each stored certificate's X.509 `NotAfter` server-side
    (`crypto/x509`/`encoding/base64`, already-available stdlib, no new
    dependency) - certificate PEMs aren't masked, but expiry can't be
    read directly off the raw config tree, so this needed real parsing
    logic the generic config-tree endpoint doesn't do for anything
    else.
  - **Considered and declined**: network diagnostics (ping/traceroute/
    DNS lookup) - confirmed genuinely unreachable through VyOS's REST
    API, not just unbuilt (see
    [architecture.md](architecture.md#why-rest-only-no-ssh-no-graphql)).
    A first-run/onboarding flow was also considered and dropped: reaching
    this app's login page at all already requires an interface IP and
    the HTTPS API to be configured, so there's no truly "blank" state
    for it to guide someone through.

- **Config warnings: opt-in flag + data-driven rules**: two follow-ups
  to the config warnings banner above.
  - **`CONFIG_WARNINGS_ENABLED`**: the banner is now disabled by
    default - a new env var (default `false`, see
    [configuration-reference.md](configuration-reference.md)) must be
    explicitly set to show it. Surfaced via the existing, unauthenticated
    `GET /api/system/info` response rather than a new endpoint.
    `ConfigWarningsBanner.tsx` was split into an outer gate (only calls
    `useSystemInfo()`) and an inner content component (where
    `useConfigWarnings()`'s three config-tree fetches actually happen),
    so a disabled banner costs zero extra requests, not just hidden UI.
  - **Data-driven rules**: the banner's 5 checks moved from hand-written
    TS functions to data - `lib/configWarningRules.json`, each rule a
    `{id, query, message}` entry where `query` is a
    [JMESPath](https://jmespath.org) expression evaluated against a
    plain "facts" object built from already-typed config
    (`lib/configWarnings.ts`'s `buildConfigWarningFacts`), validated
    against `lib/configWarningRules.schema.json` via `ajv` at module
    load (a malformed rule fails loudly and immediately, not silently).
    JMESPath was chosen over JSONPath or a hand-rolled matcher because
    4 of the 5 existing checks need array-filtering logic (e.g. "base
    chains named input/forward, defaulting to accept") a simple
    path-plus-operator matcher can't express; the rules file is a
    static JSON file bundled in the frontend repo, not a server-side or
    env-configurable setting - editing a rule means editing the file
    and redeploying, the same as any other code change.

- **Real-VyOS e2e coverage expansion**: the `e2e/` Playwright suite
  (see `e2e/README.md`) grew from 3 specs (login/masking/one commit
  round-trip) to 19, adding one spec per major configuration area -
  Interfaces, Static Routes, Firewall, NAT, DHCP, QoS, Policy, VPN,
  Load Balancing (HAProxy), High Availability (VRRP), Containers, PKI,
  System Users, SNMP, and BGP - each driving that area's own real
  page/form (not raw Config Tree edits), committing against a real,
  freshly-booted VyOS VM, and reloading to confirm the change actually
  persisted. A new `e2e/dev-vm.sh` helper (`start`/`stop`/`status`)
  supports iterating on one spec at a time against a single long-lived
  VM, instead of rebooting per spec like `run.sh`'s one-shot CI flow.
  This is real, VyOS-conf_mode-`verify()`-level validation the fake
  test server in `backend/internal/testutil` doesn't (and structurally
  can't) provide, and it found genuine app bugs, not just test bugs:
  - **DHCP subnets and container networks both need something else
    already present to commit at all** (a range/static-mapping for
    DHCP; a prefix for containers) - and in both cases the normal UI
    for adding that "something else" only operates on an
    already-server-fetched resource, creating a deadlock where a
    brand-new subnet/network could never be committed through this
    app's own UI. Fixed by adding optional fields to each area's
    *create* form (DHCP's "first range", container's "Initial
    prefix") so the missing piece can be queued in the very first
    commit.
  - **HAProxy's `verify()` requires a service AND a backend (and every
    backend needs a server) on every single commit that touches
    `load-balancing haproxy`**, not just eventually - so a backend can
    never be committed alone before any service exists. Fixed the same
    way (`HaproxyBackendFormPanel` gained optional "Initial server"
    fields), with the intended flow being "create backend+server and
    service+port together, unlinked, in one commit; link them in a
    second."
  - See `e2e/README.md`'s own "Known gaps" for what's still not
    covered (image pull, WAN load-balancing, real BGP/OSPF peering,
    and a note on why re-running a spec against an already-populated
    dev VM can hit stale-name errors that a fresh CI run never would).

- **Dashboard: CPU/Memory moved to their own section, charts taller**:
  the CPU and Memory cards (each with a live-history sparkline) moved
  out of the flat 6-card info grid (Hostname/Version/Uptime/CPU/
  Memory/Storage) into a new dedicated `ResourceUsageSection`, the
  same treatment `ThroughputSection` already had - Hostname/Version/
  Uptime/Storage remain a 4-card grid. Separately, `UsageChart.tsx`'s
  shared height (used by CPU, Memory, and Throughput alike) doubled
  from `h-12` (48px) to `h-24` (96px) - a single shared value, not a
  per-instance prop, so all three charts got taller together.
  Considered and declined: merging CPU+Memory into one combined card
  (kept them as two separate cards in the new section instead, closer
  to their original presentation).

- **Docs: restricting access to LAN clients only (host networking)**:
  documentation-only - no backend/frontend code changes. Host
  networking (this app's recommended default) has no network-level
  isolation of its own, so
  `deploy/container-config-examples/host-networking.txt` now documents binding `LISTEN_ADDR` to a LAN
  interface address (e.g. `192.168.1.1:8443` instead of the wildcard
  `:8443` default - this already worked with zero code changes,
  `LISTEN_ADDR` was just unvalidated and undocumented for this use) plus
  a zone-based VyOS firewall rule blocking WAN → local traffic to that
  port as defense-in-depth. `docs/security.md` gained a new
  "Restricting access to LAN clients only" section explaining both
  layers and why neither alone is as strong as both together;
  `docs/configuration-reference.md`'s `LISTEN_ADDR` row now documents
  the LAN-IP-binding capability. Reusing `jmespath` (already a frontend
  dependency, added for config-warnings) for secret masking was also
  considered and declined - masking's actual matching logic is a flat
  set-membership check on a normalized leaf name, categorically simpler
  than what JMESPath is for (array-filtering/projection), and the
  security-critical enforcement point is the Go backend, which has no
  built-in JMESPath support - adopting it there would mean a new
  third-party dependency for zero capability gain, and wouldn't fix the
  one actually-known masking gap (tag-node identifiers like SNMP
  community names) either.

- **Renovate**: `renovate.json` (repo root) now keeps every external
  dependency ecosystem in this repo current - `frontend/`'s npm
  packages, `e2e/tests/`'s separate npm project, `backend/go.mod`'s Go
  modules, the GitHub Actions pinned across `.github/workflows/`, and
  the Docker base images in `deploy/Dockerfile`/
  `deploy/mock-vyos.Dockerfile` - each grouped into one PR per update
  type rather than one PR per package. Minor/patch/digest updates
  auto-merge once CI passes (this repo's branch protection already
  requires a green CI run per `CONTRIBUTING.md` - Renovate is only
  adding the "wait for checks, then merge" step on top of that
  existing gate); major updates always need a human look. A
  `minimumReleaseAge` of 3 days holds back adopting a version
  immediately after publication (waived entirely for
  `vulnerabilityAlerts`, so security patches aren't held back by that
  same window). **Operational prerequisite this config can't set
  itself**: the repository's "Allow auto-merge" setting must be
  enabled (Settings → General → Pull Requests) for GitHub to actually
  act on Renovate's automerge requests - branch protection alone
  isn't enough. `flake.nix`/`flake.lock` (the Nix dev-shell pin) is
  deliberately left unmanaged - Renovate has no stable, default-enabled
  manager for Nix flake inputs, and a `nixpkgs-unstable` pin isn't a
  semver-versioned dependency automerge logic can reason about the
  same way as the others.

- **Security review follow-ups**: fixes for four findings from a
  focused security review (secrets, auth/session, injection/RCE/XSS,
  dependencies, CORS/headers/rate-limiting/test-vs-production - the
  review found the codebase already solid across most of that surface,
  with no critical/high findings).
  - Security response headers (`X-Content-Type-Options`,
    `X-Frame-Options`, `Referrer-Policy`, a strict single-origin CSP,
    and conditional HSTS) - previously entirely absent, not fully
    excused by the LAN-only threat model since clickjacking/MIME-
    sniffing risks are network-topology-independent. Required
    extracting `index.html`'s one inline `<script>` (early theme
    detection) into a separate static file so CSP's `script-src` could
    be `'self'` with no `'unsafe-inline'` exception. See
    [security.md](security.md#security-headers).
  - `COOKIE_SECURE`, decoupling the session/CSRF cookies' `Secure` flag
    from `TLS_ENABLED` - the only way to correctly set `Secure` cookies
    when a trusted reverse proxy terminates real TLS in front of this
    process (`TLS_ENABLED=false` from this process's own point of
    view, but the browser's connection to the proxy genuinely is
    HTTPS). Previously that topology silently ended up with non-Secure
    cookies with no way to fix it short of defeating the point of the
    reverse-proxy setup.
  - A per-user rate limit on `POST /api/config/commit`,
    `.../commit/confirm`, and `.../import` - the only rate limiting
    previously was on login. These trigger a real VyOS commit, which
    VyOS itself has no rate limit of its own on.
  - CI now runs a Trivy vulnerability scan on every push/PR - both a
    filesystem scan (Go modules + npm packages, closing the gap that
    neither `govulncheck` nor `npm audit` were wired into CI at all)
    and an image scan of the actual built production image. Verified
    clean (0 findings either way) against this repo before merging, so
    the new CI job doesn't start failing immediately from pre-existing
    findings.
  - Explicitly deferred/out of scope for this pass (see the review's
    own findings): SSRF hardening on the system-image-install URL
    field (accepted risk - every authenticated user already has full
    VyOS config access regardless), role/privilege differentiation for
    `AUTH_MODE=vyos-users` logins (already tracked separately - see
    "Explicitly out of scope for now" below), and digest-pinning
    Docker base images (already being addressed on a separate branch).

- **Container image update checks**: a "Check for update" button on
  the Containers page for *any* configured container's image, not
  just this app's own (`CONTAINER_UPDATE_CHECKS_ENABLED`, disabled by
  default - see docs/architecture.md's "Container image update
  checks" section). Generalizes self-upgrade's own pull-and-queue
  mechanism, but unlike self-upgrade (a single fixed GitHub repo),
  there's no one API to check against - a container's image can live
  on Docker Hub, GHCR, Quay, or a self-hosted registry. New
  `backend/internal/imageupdate` package implements just enough of
  the standard Docker Distribution v2 HTTP API (image reference
  parsing, the `WWW-Authenticate` challenge/token-exchange flow,
  paginated tag listing) to support this - hand-rolled rather than a
  new dependency (`google/go-containerregistry` was considered and
  declined - this project's backend has stayed at 2 real Go
  dependencies throughout, and the registry protocol surface actually
  needed here, tag listing plus auth, is a small, bounded slice of
  what that library covers). A matching `container registry <name>`
  entry's credentials are read directly via `vyos.Client.ReturnValue`
  (the same backend-internal pattern `auth.VyOSUserVerifier` already
  uses for a login user's own password hash) to authenticate the
  request when one exists, rather than through the browser-facing
  `POST /api/config/reveal` endpoint. Tag comparison uses a new,
  deliberately more permissive version parser than self-upgrade's own
  strict `vX.Y.Z` comparator (`internal/selfupgrade/semver.go`) -
  optional leading "v", optional patch component, optional suffix
  (e.g. "-alpine") - since real-world container tags vary far more
  than this project's own clean release tags; a candidate is only
  ever suggested as an update if it shares the current tag's exact
  "flavor" (leading-"v" style, suffix, and patch-presence all
  identical), so a `-alpine` tag is never suggested as an update for
  a plain tag. Manual/on-demand only (a button per container, never
  triggered automatically) since, unlike self-upgrade's single
  server-cached check, this can contact an arbitrary number of
  different registries with no caching on this app's side. See
  [architecture.md](architecture.md#container-image-update-checks) for
  the full design rationale.

- **amd64-only builds**: `.github/workflows/release.yml`'s image build
  now targets `linux/amd64` only, dropping `linux/arm64` and the
  `docker/setup-qemu-action` step that existed solely to cross-build
  it (Buildx needs no emulation to build for the runner's own native
  arch). VyOS itself only supports amd64, so an arm64 image was never
  actually deployable on the one platform this app targets - shipping
  it doubled build time/registry storage for an image nobody could
  use. The whole "multi-arch capability" was already just a single
  `platforms:` string (no build matrix to dismantle), so re-adding
  arm64 later - if VyOS ever supports it - is the literal one-line
  inverse of this change (plus re-adding the QEMU step ahead of
  `setup-buildx-action`). `deploy/Dockerfile` needed no functional
  changes at all (its `ARG TARGETOS`/`TARGETARCH` are Buildx's
  automatic per-platform build args, not multi-arch-specific logic) -
  only its own descriptive usage-example comment was updated for
  accuracy, alongside the "multi-arch" prose in this file and
  `CONTRIBUTING.md`.

- **Files page: opt-in, disabled by default (breaking change)**: the
  Files page previously had no gate at all - it's now behind a new
  `FILE_BROWSER_ENABLED` flag, defaulting to `false`. Wired exactly
  like `SELF_UPGRADE_ENABLED`/`CONTAINER_UPDATE_CHECKS_ENABLED`
  (handler-level `{"enabled": false}` gating on both
  `handleFileBrowserRoots`/`handleFiles`, `FilesPage.tsx` shows an
  explanatory disabled state rather than being hidden outright, the
  flag is also surfaced via `GET /api/system/info` so `Layout.tsx` can
  hint the nav item is off - the same `(off)` suffix
  `SystemLayout.tsx` already uses for its own Upgrades tab), but the
  rationale for gating it is different from those two: Files makes no
  outbound-to-the-internet call at all. The risk this flag actually
  addresses is that, even restricted to a curated allowlist
  (`/config`, `/var/log`), this is still real filesystem read access
  on a router - VyOS's own `show file <path>` op-mode command imposes
  no path restriction of its own. **Deployments relying on the Files
  page being always-available need to set `FILE_BROWSER_ENABLED=true`
  after upgrading.**

- **Self-upgrade: verify the release's image actually exists**: the
  "Upgrade to X" button is now disabled (with an explanation) unless
  `ghcr.io/<repo>:X` was verified to actually exist, via a new
  `imageupdate.Client.TagExists` manifest-existence check (GET
  `/v2/<repo>/manifests/<tag>`, reusing the exact same auth-challenge
  machinery `ListTags` already implements - the scope needed comes
  from whatever the registry's own challenge specifies, nothing
  tags-list-specific was hardcoded there to begin with). This closes
  a real gap: `.github/workflows/release.yml` publishes the GitHub
  Release and the GHCR image as two separate jobs with only a
  one-directional dependency (the image build only runs if the
  release was published, never the converse) - the image build can
  take minutes, or fail outright, leaving a release visible via
  GitHub's API with no matching image yet, or ever. Previously the
  only signal a missing image gave was the pull itself failing after
  the click. A registry error while checking one release fails safe
  (`imageExists: false`, same as a confirmed "not found") rather than
  failing the whole status response or assuming the image is probably
  there.

- **DHCP Networks page: collapsed by default**: each shared network's
  card now shows only its name/badges, a plain-text summary of its own
  subnets' CIDRs, and the existing pool-utilization bar by default -
  everything else (DNS/NTP/domain-search options, the edit form's
  trigger aside, and every subnet's own full detail: ranges, excluded
  addresses, static mappings) moves behind a new "Details"/"Hide
  details" toggle on `NetworkCard.tsx`, the same collapse idiom
  `ContainerList.tsx` already uses for per-container detail. A shared
  network can have many subnets, each with several ranges/static
  mappings of its own - showing all of that unconditionally made this
  page overwhelming for even a moderate number of networks, while the
  three pieces that stay visible (name, subnet addresses, usage) are
  exactly what's needed for an at-a-glance check.

- **Sensitive environment-variable redaction**: closes a masking gap
  container and event-handler `environment` variables fell into -
  every variable's value sits under the exact same generic `value`
  leaf regardless of its own key, so the existing exact-leaf-name
  matching (`sensitiveLeafNames`) could never distinguish
  `DB_PASSWORD` from `TZ`. `shared/sensitive-fields.json` gained a new
  `sensitiveKeyPatterns` list - a case-insensitive **substring** match
  against a tag-node's own identifier, applied only to that one
  generic `value` leaf (never to arbitrary structural field names, to
  avoid e.g. `authentication` matching the `auth` pattern). Generalizes
  to any `KEY -> {value}` tag-node shape, not just containers - also
  covers `service event-handler ... script environment`. The frontend
  `KeyValuePairList.tsx` component (shared by container/event-handler
  environment variables, labels, and sysctl parameters) now masks
  matched entries and offers the same on-demand Reveal control as the
  Config Tree view, for already-committed entries only - a
  not-yet-created container's local draft entries are shown in the
  clear, since nothing was fetched from the router to mask in the
  first place. See [security.md](security.md#masking) for the full
  design (including the identifier-*is*-the-secret gap this still
  doesn't cover, e.g. SNMP community strings).

- **Committed-but-unsaved indicator, list, Save, and Rollback**: VyOS's
  well-known commit/save gotcha - a committed change is live but
  silently lost on the next reboot unless also saved - had no
  visibility in the UI at all beyond an ephemeral error message when
  Commit & Save's own save step failed. VyOS's REST API has no
  endpoint to answer "does the running config differ from the saved
  one" (only 10 endpoints exist, none a config comparison), so
  `frontend/src/store/unsavedCommit.ts` tracks this client-side
  instead - a `localStorage`-backed list of exactly which changes were
  committed *through this app* since the last save, appended to on
  every successful commit. Deliberately scoped to what this app itself
  committed, never a universal claim about the router (a commit via
  the CLI or another session is invisible to it).
  `PendingChangesBar.tsx` shows a persistent, collapsed-by-default "N changes committed
  but not saved" message whenever the list is non-empty, even with an
  empty pending-changes cart - expanding it lists the actual changes,
  same rendering as the ordinary pending-changes list. Two actions:
  **Save** (+ "Mark as saved", a manual dismiss for a stale list - e.g.
  already saved via the CLI), and **Rollback**
  (`POST /api/config/rollback`, backed by a new
  `vyos.Client.ConfigFileLoadFile` sending VyOS's `/config-file` `{"op":"load",
  "file":"/config/config.boot"}` so VyOS reads and parses its own saved
  file rather than this app needing a config-file parser), which
  discards the tracked changes by restoring the last saved
  configuration - always behind a commit-confirm window (confirmed via
  the same endpoint a normal commit-confirm uses), since the saved
  configuration isn't automatically risk-free either. System > Power
  also gained standalone "Save now" and "Rollback" buttons, independent
  of the tracked list entirely, for acting proactively regardless of
  what this app did or didn't track - Rollback there requires an
  explicit "Confirm rollback?" click first, since there's no list to
  review in that context. See
  [architecture.md](architecture.md#the-commitsave-engine).

- **Bugfix: Upgrades page "Refresh" couldn't actually see a genuinely
  newer release/image**: `internal/selfupgrade.Client.ListReleases`
  caches GitHub's response for 30 minutes with no way for any caller
  to bypass it - the "Refresh" button only ever invalidated the
  *frontend's* query cache, which still just re-requested whatever the
  *backend* had cached, so a real new release published less than 30
  minutes earlier could silently go undetected no matter how many
  times Refresh was clicked. `Client` gains a new `ForceRefresh`
  (bypasses both the positive and negative/failure cache, still falls
  back to a stale result on failure), reachable via a new
  `?force=true` query param on `GET /api/system/self-upgrade` - a
  plain page load still respects the cache (so passive viewing never
  itself contributes to hammering GitHub's rate-limited API), but an
  explicit, human-initiated Refresh click always sees a real, live
  check. Whatever's already cached continues to display immediately
  on page load with no click required - that part was already
  working correctly, now pinned by an explicit regression test. See
  [architecture.md](architecture.md#self-upgrade).

## Next

Not yet decided - see "Later" below for the candidate list (the
remaining `service` sub-areas) to be scoped and prioritized the same
way every area above was.

## Later

This project's own [Definition of done](#definition-of-done) is "a
purpose-built form for every configuration surface someone would
realistically want to manage day-to-day." Cross-checked against VyOS's
actual documented configuration structure (docs.vyos.io, not just
memory/assumption, matching how every area above was scoped), here is
everything that structure covers which this app doesn't yet have
dedicated UI for - this is the candidate list "Next" above will be
picked from - beyond the smaller in-area gaps already itemized in
each "Done" entry's own "Not yet built" note (Firewall's
geoip/log-options/raw chains/IPv6 group definitions; Interfaces'
WireGuard/Tunnel/VTI/VXLAN/other interface types; DHCP's long-tail
options/DHCPv6; Static routes' BFD monitoring/SRv6 segments; BGP's,
OSPF/OSPFv3's, NAT's, and PKI's own extensive "Not yet built" lists
above):

- **Service (remaining)** — the ~10 `service` sub-areas not covered by
  the two batches shipped so far (see "Done" above: NTP, SSH, HTTPS
  API, DHCP/DHCPv6 relay, DNS forwarding, Dynamic DNS, Router
  Advertisements, DHCPv6 server, SNMP v1/v2c+v3, TFTP server,
  broadcast-relay, mDNS repeater, LLDP, NDP proxy, event-handler,
  console-server, and Prometheus/Zabbix/network-event monitoring) —
  Webproxy, config-sync, IPoE server, PPPoE server, Suricata,
  Prometheus's blackbox-exporter, Telegraf, SLA/TWAMP, stunnel, AWS
  Gateway Load Balancer. (`service conntrack-sync` - previously listed
  here - is now covered; see "High Availability" above.)

## Explicitly out of scope for now

- Admin/operator role-based UI restrictions for `AUTH_MODE=vyos-users`
  logins — every authenticated VyOS user currently gets full VyOS Client
  access regardless of whether `system login user <name> operator` is
  set on the VyOS side; see the "Auth against real VyOS local users"
  entry above for the deferred design sketch.
- RADIUS/TACACS+-backed VyOS user login — no local `encrypted-password`
  to verify against; see [security.md](security.md#why-not-vyos-login-credentials).
- Per-VyOS-user audit trail — VyOS API keys aren't scoped/attributable to
  individual UI users; a known, documented limitation of the current auth
  model.
- Network diagnostics (ping/traceroute/DNS lookup) — not just unbuilt but
  confirmed unreachable through VyOS's REST API at all (only 10 endpoints
  exist, and `ping`/`traceroute` don't fit any of their dispatch models,
  `/show` included); see
  [architecture.md](architecture.md#why-rest-only-no-ssh-no-graphql) for
  the full investigation.
