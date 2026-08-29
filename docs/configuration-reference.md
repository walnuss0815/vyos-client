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
| `TLS_ENABLED` | `true` | Whether the backend's own listener serves HTTPS (`true`) or plain HTTP (`false`). Only set this to `false` behind a trusted reverse proxy that terminates real TLS, or on a fully isolated/trusted network — see [security.md](security.md#serving-plain-http-instead-tls_enabledfalse). Also controls whether the session cookie gets the `Secure` attribute, since browsers drop `Secure` cookies sent over plain HTTP. |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | unset | Path to a real TLS certificate/key for the backend's own HTTPS listener (mount as a volume). Only used when `TLS_ENABLED=true` (the default); if either is unset in that case, a self-signed certificate is generated at startup, mirroring VyOS's own default behavior for its API — fine for evaluation, but browsers will warn. |
| `SESSION_SECRET` | randomly generated at startup | HMAC key signing session and CSRF tokens. **Set this explicitly** if you want sessions to survive a container restart; otherwise a fresh random secret each boot means every session is invalidated on restart. Treat it as a high-value secret. |
| `SAFE_APPLY_DEFAULT_SECONDS` | `90` | Default commit-confirm countdown (seconds) the UI's "safe apply" toggle suggests. Always overridable per-commit in the UI. |
| `CONFIG_WARNINGS_ENABLED` | `false` | Whether the UI's persistent "configuration warnings" banner (firewall default-action, SSH password auth, HTTPS API restrictions, SNMP default community strings, users with no password/SSH key) is shown at all. Disabled by default since the checks are opinionated security-posture judgment calls, not factual VyOS state — enable if you want them. |

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
- Session TTL: 30 minutes, sliding (renewed on every authenticated
  request), capped at 12 hours from login regardless of activity
  (`backend/internal/auth/session.go`).

## Generating secrets

```sh
# Bcrypt password hash for UI_ADMIN_PASSWORD_HASH (AUTH_MODE=static only)
docker run --rm ghcr.io/<org>/vyos-client:latest hash-password

# A random SESSION_SECRET
openssl rand -hex 32
```
