# Configuration reference

VyOS Client is configured exclusively via environment variables — there is
no config file. This is the complete list, matching
`backend/internal/config/config.go`.

## Required

| Variable | Description |
|---|---|
| `VYOS_API_KEY` | Plaintext VyOS REST API key, from `set service https api keys id ... key ...`. Grants full configuration access — VyOS API keys aren't scoped to specific operations. |

## Optional

| Variable | Default | Description |
|---|---|---|
| `AUTH_MODE` | `vyos-users` | How VyOS Client's own login is verified. `vyos-users` (the default) verifies against a real VyOS local user's own password, read from `system login user <name> authentication encrypted-password` using `VYOS_API_KEY` above — no separate credential to manage, but login now depends on VyOS's API being reachable, and RADIUS/TACACS+-backed users aren't supported (see [security.md](security.md#why-not-vyos-login-credentials)). `static` uses a single shared `UI_ADMIN_USER`/`UI_ADMIN_PASSWORD_HASH` account instead, entirely independent of VyOS's own user database — useful as a break-glass login path, or if you'd rather not couple UI login to VyOS's API health. |
| `UI_ADMIN_USER` | — | The VyOS Client login username. Required (and only used) when `AUTH_MODE=static`; ignored (with a startup warning) otherwise. |
| `UI_ADMIN_PASSWORD_HASH` | — | Bcrypt hash of the VyOS Client login password. Required (and only used) when `AUTH_MODE=static`; ignored (with a startup warning) otherwise. Generate with `vyos-client hash-password` (or `docker run --rm <image> hash-password`). **Never set a plaintext password here or anywhere** — VyOS's own `show configuration` does not mask arbitrary container environment values. |
| `LISTEN_ADDR` | `:8443` | Address the backend's own listener binds to (HTTPS by default; see `TLS_ENABLED`). Passed straight through to Go's `net.Listen`, unvalidated — any `host:port` form works, including a specific interface address like `192.168.1.1:8443` to bind only that interface (e.g. LAN-only, not WAN) rather than the `:8443` default's bind-everywhere behavior. See [security.md](security.md#restricting-access-to-lan-clients-only) for why you'd want this with host networking. |
| `VYOS_API_URL` | `https://127.0.0.1` | Base URL of the VyOS HTTPS API. With host networking (recommended default), `127.0.0.1` always works; with a dedicated bridge network, use the bridge gateway address instead. |
| `VYOS_API_INSECURE_SKIP_VERIFY` | `false` | Skip TLS verification when calling the VyOS API. Only for lab/dev use against VyOS's auto-generated self-signed certificate — never in production. |
| `TLS_ENABLED` | `true` | Whether the backend's own listener serves HTTPS (`true`) or plain HTTP (`false`). Only set this to `false` behind a trusted reverse proxy that terminates real TLS, or on a fully isolated/trusted network — see [security.md](security.md#serving-plain-http-instead-tls_enabledfalse). Also controls the default for `COOKIE_SECURE`, below. |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | unset | Path to a real TLS certificate/key for the backend's own HTTPS listener (mount as a volume). Only used when `TLS_ENABLED=true` (the default); if either is unset in that case, a self-signed certificate is generated at startup, mirroring VyOS's own default behavior for its API — fine for evaluation, but browsers will warn. |
| `COOKIE_SECURE` | matches `TLS_ENABLED` | Whether session/CSRF cookies get the `Secure` attribute (browsers drop `Secure` cookies sent over plain HTTP, so this defaults to `TLS_ENABLED`). Override independently for a TLS-terminating reverse proxy in front of this process (`TLS_ENABLED=false`, but the browser's own connection to the proxy is genuinely HTTPS) — set `COOKIE_SECURE=true` in that case. Setting it to `false` while `TLS_ENABLED=true` is flagged with a startup warning (almost always a mistake). See [security.md](security.md#serving-plain-http-instead-tls_enabledfalse). |
| `SESSION_SECRET` | randomly generated at startup | HMAC key signing session and CSRF tokens. **Set this explicitly** if you want sessions to survive a container restart; otherwise a fresh random secret each boot means every session is invalidated on restart (unless `DATA_DIR` is set - see below). Treat it as a high-value secret. |
| `DATA_DIR` | unset | Directory this backend may persist local state to across restarts: a generated `SESSION_SECRET` (when that variable itself is left unset - see above) and the in-app notification feed (see [architecture.md](architecture.md#notifications-the-one-thing-this-backend-persists-beyond-vyos-itself)). Optional — both features work with no `DATA_DIR` at all, just without surviving a restart. Must already exist, be a directory, **and actually be writable by this container's user (UID/GID `65532`, the distroless `nonroot` image's fixed identity)** — checked at startup with a real write-test, not just `stat`. This trips up a real, common case: a container engine that auto-creates a missing bind-mount source directory can leave it with a mode that omits the execute/"search" bit (e.g. `0666` instead of `0755`) even when its ownership already matches — see [security.md](security.md#threat-model-notes) for the exact fix (`chown` **and** `chmod`, not `chown` alone). The backend never creates the directory itself. |
| `SAFE_APPLY_DEFAULT_SECONDS` | `90` | Default commit-confirm countdown (seconds) the UI's "safe apply" toggle suggests. Always overridable per-commit in the UI. |
| `CONFIG_WARNINGS_ENABLED` | `false` | Whether the UI's persistent "configuration warnings" banner (firewall default-action, SSH password auth, HTTPS API restrictions, SNMP default community strings, users with no password/SSH key) is shown at all. Disabled by default since the checks are opinionated security-posture judgment calls, not factual VyOS state — enable if you want them. |
| `SELF_UPGRADE_ENABLED` | `false` | Whether System > Upgrades checks this app's own GitHub releases for an update and lets you pull/queue a new image. Disabled by default — this is the only outbound-to-the-internet call anywhere in the backend; everything else only ever talks to VyOS's own API. See [architecture.md](architecture.md#self-upgrade). |
| `SELF_UPGRADE_CONTAINER_NAME` | — | Required (and only used) when `SELF_UPGRADE_ENABLED=true`; ignored (with a startup warning) otherwise. Must match the `NAME` in this deployment's own `set container name <NAME> image ...` on VyOS — the backend has no other way to know its own container name. Startup fails with a clear error if `SELF_UPGRADE_ENABLED=true` and this is unset. |
| `SELF_UPGRADE_GITHUB_REPO` | `walnuss0815/vyos-client` | `owner/repo` self-upgrade checks releases for and pulls images from (`ghcr.io/<repo>`). Only meaningfully different for a fork publishing its own releases/images under a different repo. |
| `CONTAINER_UPDATE_CHECKS_ENABLED` | `false` | Whether the Containers page's "Check for update" button is available, for *any* container configured on the router (not just this app's own). Disabled by default — unlike `SELF_UPGRADE_ENABLED` above, this contacts whatever registry a container's own image reference points at (Docker Hub, GHCR, Quay, or a self-hosted registry), triggered manually per container. No further configuration needed. See [architecture.md](architecture.md#container-image-update-checks). |
| `FILE_BROWSER_ENABLED` | `false` | Whether the Files page (a read-only browser over `/config` and `/var/log`) is available. Disabled by default — unlike `SELF_UPGRADE_ENABLED`/`CONTAINER_UPDATE_CHECKS_ENABLED` above, this makes no outbound-to-the-internet call at all; it's opt-in because it's still real filesystem read access on the router, even restricted to this curated allowlist. See [architecture.md](architecture.md#files-a-curated-read-only-viewer-over-show-file-path). |

> **Upgrading from an older version?** `AUTH_MODE` defaults to
> `vyos-users`, not `static` — if you're relying on
> `UI_ADMIN_USER`/`UI_ADMIN_PASSWORD_HASH`, set `AUTH_MODE=static`
> explicitly before upgrading, or that login will stop working (you'll
> instead need a real VyOS local user's own credentials). See
> [get-started.md](get-started.md) for the full explanation.

## Not yet configurable (hardcoded, documented for transparency)

- Login rate limiting: 5 attempts before exponential backoff kicks in
  (1s, doubling up to a 5 minute cap), reset after 15 minutes of
  inactivity. See `backend/internal/auth/ratelimit.go`.
- Config commit/import rate limiting: 30 requests per 5 minutes per
  authenticated user, applied to `POST /api/config/commit`,
  `POST /api/config/commit/confirm`, and `POST /api/config/import` -
  the routes that trigger a real VyOS commit, which VyOS itself has no
  rate limit of its own on. See `backend/internal/auth/requestlimiter.go`.
- Session TTL: 30 minutes, sliding (renewed on every authenticated
  request), capped at 12 hours from login regardless of activity
  (`backend/internal/auth/session.go`).
- Notification feed retention: 200 entries, oldest evicted first
  regardless of read state (`backend/internal/notifications`). The
  frontend polls `GET /api/notifications` every 30 seconds.

## Generating secrets

```sh
# Bcrypt password hash for UI_ADMIN_PASSWORD_HASH (AUTH_MODE=static only)
docker run --rm ghcr.io/<org>/vyos-client:latest hash-password

# A random SESSION_SECRET
openssl rand -hex 32
```
