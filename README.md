# VyOS Client

A modern web UI for [VyOS](https://vyos.io), designed to run as a container
on the router itself and manage it entirely through VyOS's own HTTPS REST
API — no separate database, no config file, no server-side state beyond
ephemeral login sessions and in-memory rate-limit bookkeeping. All
configuration lives only in VyOS.

[![CI](https://github.com/walnuss0815/vyos-client/actions/workflows/ci.yml/badge.svg)](https://github.com/walnuss0815/vyos-client/actions/workflows/ci.yml)

## Why

VyOS is a powerful router/firewall OS, but its native interfaces are the
CLI and a low-level HTTP API — there's no first-party web UI. VyOS Client
fills that gap with something closer to what you'd expect from a
consumer/prosumer router (EdgeOS, UniFi): a dashboard, a config tree
editor, and dedicated UIs for most major VyOS configuration areas, all
backed by real commit/save semantics and a "safe apply" countdown for
risky changes.

## Features

- **Dashboard** — hostname, VyOS version, uptime/load, CPU/memory/disk
  usage, a live interface preview, and full IPv4/IPv6 routing tables.
- **Config Tree editor** — the entire VyOS running configuration, as an
  editable tree or as flat `set` commands, covering anything not (yet)
  covered by a dedicated page.
- **Dedicated config UIs** — typed forms instead of raw config paths for
  Firewall, DHCP, Interfaces, Routing (Static/BGP/OSPF), NAT, Policy,
  PKI, System, Container, Service (17 tabs), VPN (8 tabs), Load
  Balancing, High Availability, and Traffic Policy/QoS, plus a Logs
  viewer and an optional read-only Files browser — see
  **[docs/get-started.md](docs/get-started.md)**'s Tour for the full
  breakdown of what each area covers.
- **Commit / Save, matching VyOS's own model** — nothing is sent to VyOS
  until you click Commit; Save (persist to `/config/config.boot`) is a
  separate, independent action, exactly like the CLI. Committed-but-
  unsaved changes stay visible until saved or rolled back, so nothing
  silently gets lost on a reboot.
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

Foundation, auth, the commit/save engine, the Config Tree editor, the
Dashboard, and dedicated config UIs for Firewall, DHCP, Interfaces,
Routing, NAT, Policy, PKI, System, Container, Service, VPN, Load
Balancing, High Availability, and Traffic Policy/QoS are implemented and
tested, including real-VyOS VM-based end-to-end testing. See
[docs/roadmap.md](docs/roadmap.md) for exactly what's covered and the
remaining `service` sub-areas still planned.

## License

[Apache License 2.0](LICENSE). This is an independent community project,
not affiliated with or endorsed by the VyOS project.
