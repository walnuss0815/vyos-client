# Get started

This guide walks through running VyOS Client as a container on VyOS itself,
end to end: enabling the API, deploying the container, and logging in.

> Tested against a VyOS rolling release close to `2026.08.xx-rolling`, plus
> the last 4 VyOS Stream releases (see
> [architecture.md](architecture.md#tested-against) for the exact pinned
> builds). VyOS Client only uses the REST half of VyOS's HTTP API — no SSH,
> no GraphQL — so any VyOS version with `service https api rest` should
> work, but rolling and Stream are what's actually been exercised.

## 1. Enable the VyOS HTTPS API

VyOS Client talks to VyOS exclusively over its own HTTPS REST API — the
same one you'd use for any other automation. On the VyOS console/SSH:

```
configure
set service https api rest
set service https api keys id vyos-client key 'CHANGE-ME-TO-A-LONG-RANDOM-VALUE'
commit
save
```

Generate a real random value for the key — anything that can call this API
with it has full configuration access (VyOS API keys aren't scoped to
specific operations or paths). A password manager's "generate password"
feature, or `openssl rand -hex 32`, both work fine.

If you don't already have a TLS certificate bound to `service https`,
VyOS will auto-generate a self-signed one; that's fine for this guide, but
see [security.md](security.md#tls) for production guidance.

## 2. (Optional) Choose how you'll log in

By default (`AUTH_MODE=vyos-users`, no configuration needed), VyOS Client
logs you in with a real local VyOS user's own password — the same
`system login user <name>` account you already use for the CLI/SSH,
read via the API key from step 1. If you already have such a user (every
VyOS install has at least one), **skip this step and go straight to step
3** — there's nothing to generate.

If you'd rather use a single shared UI account independent of VyOS's own
user database instead — useful as a break-glass login that doesn't
depend on VyOS's API being reachable, or if you don't want VyOS Client
login tied to real router accounts at all — set `AUTH_MODE=static` and
generate a bcrypt hash for a chosen password. Never put the plaintext
password into VyOS's own config, since `show configuration` does not
mask arbitrary container environment values:

```
docker run --rm ghcr.io/<org>/vyos-client:latest hash-password
Password: ********
$2a$10$N/PWSTvPq41SstHSaMTAQuiy/RhmgGlIKwQcWgmpGMbr975/E2DoG
```

(Any OCI runtime works here, not just `docker` — this just runs the
binary's `hash-password` subcommand once and exits.)

See [security.md](security.md#why-not-vyos-login-credentials) for the
full design rationale behind both modes, including their trade-offs.

## 3. Deploy the container

Two networking options are documented, depending on how isolated you want
the container to be:

- **[Host networking](../deploy/container-config-examples/host-networking.txt)**
  (recommended default): simplest, guaranteed to reach the API regardless
  of `listen-address` restrictions.
- **[Dedicated bridge network](../deploy/container-config-examples/bridge-networking.txt)**:
  more isolated, with one extra prerequisite (the bridge gateway address
  must be reachable by `service https`).

Copy the relevant file's commands into VyOS configure mode, filling in the
placeholder (`<GENERATE-A-LONG-RANDOM-KEY>` must match what you set in
step 1). If you opted into `AUTH_MODE=static` in step 2, also uncomment
and fill in the `UI_ADMIN_USER`/`UI_ADMIN_PASSWORD_HASH` lines (the
latter is the output of step 2). Then:

```
commit
save
```

Check it came up:

```
show container
show container log vyos-client
```

## 4. Log in

Browse to `https://<router-ip>:<listen-port>/` (port `8443` in the example
configs above). Your browser will warn about the self-signed certificate
unless you've bound a real one — that's expected for a first run; see
[security.md](security.md#tls) to fix it properly.

Log in with any existing `system login user` account's own username and
password (the default `vyos-users` auth mode from step 2) — or with
`UI_ADMIN_USER` and the password you hashed, if you opted into
`AUTH_MODE=static` instead.

## 5. Tour

- **Dashboard** — hostname, VyOS version, uptime/load, CPU/memory/disk
  usage, a live interface preview, and full IPv4/IPv6 routing tables,
  all sortable and auto-refreshing.
- **Firewall** — zones (list or visual from/to matrix view), IPv4 and
  IPv6 rulesets (base chains and custom, with drag-and-drop rule
  reordering), groups, and global options, with typed forms instead of
  raw config paths.
- **DHCP** — live leases grouped by pool with a one-click "make static"
  action per lease, plus a Networks tab for shared-network/subnet
  configuration: pool-utilization bars, dynamic ranges, excluded
  addresses, and full static-mapping (reservation) management.
- **Interfaces** — live operational state, plus dedicated config forms
  for Ethernet, Bonding, and Bridge interfaces (addressing, description,
  MTU, VRF assignment, VLAN sub-interfaces) and VRF create/delete.
- **Routing** — a Live Routes tab (the same live IPv4/IPv6 routing
  table data the Dashboard previews, as a dedicated full view), a
  Static Routes tab for configuring destinations via a next-hop
  address, an outbound interface, a DHCP-derived gateway, or an
  explicit reject/blackhole, a BGP tab for system AS/router ID,
  neighbors and peer-groups, network advertisement, and redistribution,
  and an OSPF tab (with an OSPFv2/OSPFv3 switch) for areas, interfaces,
  global settings, and redistribution.
- **NAT** — Source (masquerading/SNAT), Destination (port forwards/DNAT,
  including redirect-to-localhost), and Static (one-to-one) tabs, with
  the same source/destination address/port/group matching as Firewall
  rules.
- **Policy** — Prefix Lists (IPv4/IPv6), Lists (AS-path/community/
  extended-community/large-community), Route Maps (a curated core of
  match/set options for BGP attribute manipulation and redistribution
  filtering), and Local Route (policy-based routing).
- **PKI** — Certificate Authorities, Certificates (with ACME auto-renewal
  settings), Key Material (key-pairs and Diffie-Hellman parameters), and
  X.509 default subject fields. Storage for already-obtained PEM
  certificates/keys, not a certificate-generation workflow - see
  [roadmap.md](roadmap.md) for why.
- **System** — a General tab for host name, domain name, DNS servers,
  domain search order, time zone, and static host mappings; a Users
  tab for local `system login user` accounts (password, SSH keys,
  disable) - real synergy with `AUTH_MODE=vyos-users`, since those are
  the accounts that can log into this app; a Syslog tab for local
  and remote logging; and an Upgrades tab that can check this app's
  own GitHub releases for updates and pull/queue a new version for
  you - disabled by default, see
  [configuration-reference.md](configuration-reference.md).
- **Container** — Podman-based container definitions (image,
  entrypoint/command/arguments, capabilities, networking, port and
  volume mappings, environment variables, resource limits, health
  checks, and more), user-defined container Networks, and Registries
  (auth/mirror settings). An Images tab pulls/lists/deletes images
  directly (an immediate op-mode action, not staged like the rest of
  this area, since it can take several minutes for a large image) -
  the container-definition form also flags an image that hasn't been
  pulled yet with a "Pull now" prompt inline.
- **Service** — 17 tabs across two curated batches of `service`
  sub-areas: NTP, SSH, the HTTPS API this app itself uses (changing it
  carelessly can lock this app out - commit-confirm is essential
  here), DHCP/DHCPv6 relay, DNS forwarding, Dynamic DNS, IPv6 Router
  Advertisements, a DHCPv6 server, SNMP (v1/v2c and v3), TFTP server,
  broadcast-relay, mDNS repeater, LLDP, NDP proxy, event handler,
  console server, and Monitoring (Prometheus, Zabbix Agent, network
  events). See [roadmap.md](roadmap.md) for exactly what each tab
  covers and excludes.
- **VPN** — 8 tabs: IPsec (Crypto Groups for esp-group/ike-group
  proposals plus the global PSK/PPK stores, Site-to-Site peers/
  tunnels, IKEv2 Remote Access connections/pools/RADIUS, and global
  Settings), one tab each for the accel-ppp-based L2TP, PPTP, and SSTP
  remote-access VPN servers (authentication, client IP pools, PPP
  options - sharing one form/component set since VyOS models them
  almost identically), and OpenConnect (AnyConnect-compatible SSL VPN,
  with local/RADIUS/certificate authentication and per-user 2FA OTP
  support). See [roadmap.md](roadmap.md) for exactly what each tab
  covers and excludes.
- **Config Tree** — the entire running configuration as an editable tree,
  or as flat `set` commands (paste-friendly for bulk edits), each downloadable
  as a file (JSON or flat commands respectively). Every edit everywhere in
  the app — Firewall, DHCP, Interfaces, or here — queues into the same
  pending-changes cart at the bottom of the screen — nothing is sent to
  VyOS until you click **Commit**. A separate **Import** tab uploads a
  configuration file and applies it directly through VyOS (not the
  pending-changes cart, since a file replaces-or-overlays the whole
  candidate config in one step) — either **Merge** (additive, nothing
  removed) or **Full replace** (VyOS's own `load` semantics; can lock
  you out if the file doesn't include a working HTTPS API setup, so use
  Safe apply here too).
- **Pending changes bar** — review what you've queued, discard it, or
  commit it. "Safe apply" starts a VyOS commit-confirm timer: if you don't
  click **Keep changes** within the countdown, VyOS automatically reverts
  — useful when you're not 100% sure a change won't lock you out.
- **Commit vs Save** — mirrors VyOS's own distinction. **Commit** applies
  to the running configuration immediately (like typing `commit` at the
  CLI); **Save** persists the running configuration to `/config/config.boot`
  (like `save`), independent of Commit.
- **Ingress** — a separate nav group letting you reach a web UI
  elsewhere on the router's own network through this app, without
  opening a separate port for it, with optional request headers per
  entry (e.g. a static API key/bearer token the target expects).
  Disabled by default, see
  [configuration-reference.md](configuration-reference.md) — entries
  are managed here, not via env vars, and applied immediately (no
  pending-changes review step, since they aren't VyOS configuration).

Not every configuration surface has a dedicated form yet (most of
`service`, DHCPv6, PPPoE, RADIUS/TACACS+ authentication, NAT64/NAT66/CGNAT,
...) — see [roadmap.md](roadmap.md) for what's
built and what's next. The Config Tree editor is the permanent
fallback for anything not yet covered by a purpose-built page.

## Troubleshooting

- **"server is misconfigured (VyOS API key rejected)"** — the
  `VYOS_API_KEY` env var doesn't match a key configured under
  `service https api keys`. Check `show configuration commands | match "api keys"`.
- **"Unable to verify credentials right now" at login** (only in the
  default `AUTH_MODE=vyos-users` mode) — the backend reached its own
  HTTP listener but couldn't reach VyOS's API to check your password,
  distinct from actually getting the password wrong. Check the same
  things as "Container can't reach the API at all" below.
- **Login works with `AUTH_MODE=static` but not with a real VyOS user's
  password** — confirm the account isn't disabled (`system login user
  <name> disable`) and has a password set at all (`encrypted-password`
  defaults to `!`, VyOS's "locked" sentinel, until one is configured);
  RADIUS/TACACS+-backed users aren't supported, only local accounts with
  their own `encrypted-password`.
- **Container can't reach the API at all** — with host networking, check
  `service https` is actually listening (`show https certificates` or just
  `curl -k https://127.0.0.1/info`, unauthenticated). With bridge
  networking, verify the gateway address is reachable and not excluded by
  a `listen-address` restriction.
- **TLS certificate warnings** — expected with the auto-generated
  self-signed cert; mount a real one via `TLS_CERT_FILE`/`TLS_KEY_FILE`
  (see [configuration-reference.md](configuration-reference.md)).
- **Logs** — `show container log vyos-client`. The backend logs
  structured JSON to stdout; it never logs request bodies (so login
  passwords and commit payloads aren't logged), but does log VyOS API
  error messages for failed commits.
