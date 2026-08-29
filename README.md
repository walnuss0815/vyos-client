# VyOS Client

A modern web UI for [VyOS](https://vyos.io), designed to run as a container
on the router itself and manage it entirely through VyOS's own HTTPS REST
API — no separate database, no config file, no server-side state beyond
an ephemeral login session. All configuration lives only in VyOS.

[![CI](https://github.com/walnuss0815/vyos-client/actions/workflows/ci.yml/badge.svg)](https://github.com/walnuss0815/vyos-client/actions/workflows/ci.yml)

## Why

VyOS is a powerful router/firewall OS, but its native interfaces are the
CLI and a low-level HTTP API — there's no first-party web UI. VyOS Client
fills that gap with something closer to what you'd expect from a
consumer/prosumer router (EdgeOS, UniFi): a dashboard, a config tree
editor, a dedicated Firewall UI, and (in progress — see
[roadmap](docs/roadmap.md)) a DHCP page, all backed by real commit/save
semantics and a "safe apply" countdown for risky changes.

## Features

- **Config Tree editor** — the entire VyOS running configuration, as an
  editable tree or as flat `set` commands, covering anything not (yet)
  covered by a dedicated page.
- **Firewall UI** — zones, rulesets (base chains and custom
  `firewall ipv4 name` chains) with full rule CRUD, address/network/port/
  interface/mac/domain groups, and global options.
- **Commit / Save, matching VyOS's own model** — nothing is sent to VyOS
  until you click Commit; Save (persist to `/config/config.boot`) is a
  separate, independent action, exactly like the CLI.
- **Safe apply** — optional VyOS commit-confirm countdown: if you don't
  confirm, VyOS automatically reverts. No custom revert logic — this is a
  native VyOS feature.
- **Secret masking** — API keys, PSKs, RADIUS/TACACS+ secrets, and
  similar are masked everywhere config is shown, server-side.
- **Runs on the router** — ships as a small (~17MB), distroless,
  non-root container you deploy with `set container ...`, same as any
  other VyOS container workload.

## Get started

See **[docs/get-started.md](docs/get-started.md)** for the full walkthrough
(enable the API, deploy the container, log in).

### Try it locally without a router

```sh
cp .env.example .env
docker compose up --build
```

This runs VyOS Client alongside a pre-seeded mock VyOS API for local
testing — see [docs/development.md](docs/development.md) for details.

## Documentation

- [Get started](docs/get-started.md)
- [Architecture](docs/architecture.md)
- [Configuration reference](docs/configuration-reference.md)
- [Security](docs/security.md)
- [Development](docs/development.md)
- [Roadmap](docs/roadmap.md)

## Status

Foundation, auth, the commit/save engine, the Config Tree editor, and the
Firewall UI are implemented and tested. A DHCP page, the dashboard, and
real-VyOS VM-based end-to-end testing are in progress — see
[docs/roadmap.md](docs/roadmap.md) for the current state and what's next.

## License

[Apache License 2.0](LICENSE). This is an independent community project,
not affiliated with or endorsed by the VyOS project.
