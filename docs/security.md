# Security

## Why not VyOS login credentials?

The original goal was to let the UI's login reuse credentials already
configured on the router. Three candidate approaches turned out to be
structurally impossible given two other hard constraints (REST-only, no
SSH):

- VyOS's REST API — the only part of the HTTP API that can read or write
  configuration — authenticates exclusively with a static API key
  (`service https api keys`). There is no username/password concept
  anywhere in its request models.
- VyOS's GraphQL API *does* have a PAM-backed `AuthToken(username,
  password)` mutation that validates against real system credentials
  (local users, or RADIUS/TACACS+ if PAM is configured to chain to them)
  — but it can't perform configuration writes (see
  [architecture.md](architecture.md#why-rest-only-no-ssh-no-graphql)), and
  using it purely for login while using REST for everything else was
  explicitly ruled out in favor of staying REST-only throughout.
- SSH-based credential verification (attempting an SSH auth handshake
  against VyOS's own sshd) was the other candidate and was also
  explicitly ruled out.

A fourth path, however, works and is what `AUTH_MODE=vyos-users` (the
default) uses: `system login user <name> authentication
encrypted-password` is returned **verbatim** by `/retrieve` (confirmed
against vyos-1x's actual source — the `****************` masking you'd
see in the interactive `show configuration` CLI is an opt-in flag the
REST API never passes, not a property of the underlying config-tree
storage everything shares), and VyOS's own conf-mode script hashes it
with `sha512_crypt` (`$6$...`) when a `plaintext-password` is
configured — a scheme `backend/internal/auth`'s pure-Go, no-cgo
`github.com/GehirnInc/crypt`-based verification supports directly
(along with `$1$`/`$5$`/apr1, for a hand-pasted `encrypted-password` in
a different format; `$y$` yescrypt is not supported and is treated as
non-matching, but VyOS never auto-generates one). This means a login
attempt can be verified against a real VyOS local user's real password
using only the backend's existing `VYOS_API_KEY` — no SSH, PAM, or
VyOS's GraphQL surface needed.

VyOS Client supports two login modes, selected by `AUTH_MODE`
(`backend/internal/auth/verifier.go`,
`backend/internal/auth/vyos_verifier.go`):

- **`vyos-users` (the default)** — verifies against a real local VyOS
  user's own password, as above. VyOS becomes the source of truth for
  accounts; there's no separate credential store to manage. Trade-offs
  to know about:
  - **Login now depends on VyOS's REST API being reachable.** If VyOS's
    `service https` is down or restarting, nobody can log into
    VyOS Client either — a real availability coupling that doesn't
    exist in `static` mode. The backend surfaces this distinctly (HTTP
    503, not 401) so it isn't mistaken for a wrong password.
  - **RADIUS/TACACS+-backed users aren't supported.** They authenticate
    via PAM against a remote server, not a local `encrypted-password`
    leaf, so there's nothing to verify against locally. Only local
    `system login user` accounts work.
  - A disabled account (`system login user <name> disable`) or one
    with no password set (`encrypted-password` defaults to `!`, VyOS's
    "locked" sentinel) is correctly rejected, same as VyOS's own login
    would reject it.
- **`static`** — the single shared admin account
  (`UI_ADMIN_USER`/`UI_ADMIN_PASSWORD_HASH`, bcrypt-hashed), entirely
  independent of VyOS's own user database, exactly as VyOS Client's
  login worked before this feature existed. Useful as a break-glass
  login that doesn't depend on VyOS's API being reachable, or if you'd
  rather not tie VyOS Client login to real router accounts at all.

Either way, VyOS Client's session/CSRF layer is unaffected — only the
credential-verification step at login differs. And regardless of
`AUTH_MODE`, the backend still uses one static `VYOS_API_KEY` for every
actual VyOS API call; a `vyos-users` login only decides *who's allowed
in*, it doesn't change what that one API key can do.

**Known consequence (either mode):** there's no per-human audit trail
on the VyOS side for changes made through the UI — VyOS's own logs
will show the shared API key was used, not which person was logged
into VyOS Client at the time. `vyos-users` mode makes VyOS the source
of truth for *credentials*, but doesn't fix this. If multiple people
administer the router through this UI, that's a real limitation to be
aware of (mitigated somewhat by VyOS Client's own request logging,
which does log the authenticated username per request, just not
inside VyOS itself).

## Session model

Sessions are stateless, HMAC-signed tokens (`backend/internal/auth/session.go`)
with a 30-minute sliding TTL — no server-side session store. Every
successfully-authenticated request reissues a fresh token/cookie with
a renewed 30-minute window, so an actively-used session stays signed
in; an idle one expires 30 minutes after its last request. Renewal is
capped at 12 hours from the original login (`MaxAbsoluteSessionTTL`)
regardless of activity, so an always-open browser tab can't stay
signed in indefinitely. `SESSION_SECRET` should be set explicitly and
treated as a high-value secret: anyone who has it can mint a valid
session without knowing the actual password. Rotating it invalidates
every outstanding session at once, which is the only revocation
mechanism available (individual sessions can't be revoked before they
expire, by design — see
[architecture.md](architecture.md#auth-stateless-sessions) for the
trade-off rationale).

**Considered and declined: auto-invalidating a session when the
underlying VyOS user's credentials change mid-session.** A session
token only encodes `{subject, issued_at, expires_at}` — nothing about
the credential state it was issued against — and `RequireSession`
reissues a fresh token on every request without re-checking VyOS at
all (that's the whole point of a stateless session). This means that
if a `system login user`'s password or SSH keys are changed (by this
app or by any other means) while someone is still signed in under
that username, their existing browser session keeps working until it
naturally expires (up to the 12-hour `MaxAbsoluteSessionTTL` above) —
changing a password does not, by itself, kick out an already-signed-in
session. Building real-time revocation would mean either a server-side
session store (the stateless design's whole reason for existing) or a
VyOS round-trip on every request (a real latency cost for something
that's rarely actually needed) — not attempted in this pass. Rotating
`SESSION_SECRET`, restarting the backend, or simply waiting out the
TTL remain the only ways to force an existing session out today.

Login attempts are rate-limited per source IP with exponential backoff
(`backend/internal/auth/ratelimit.go`) to slow down brute-forcing of the
shared credential.

CSRF protection uses the double-submit cookie pattern: a non-HttpOnly
CSRF cookie whose value must be echoed back in an `X-CSRF-Token` header
on every mutating request.

## Masking

Config leaves whose name matches
[`/shared/sensitive-fields.json`](../shared/sensitive-fields.json) —
`password`, `secret`, `pre-shared-key`, `pre-shared-secret`, `community`,
`credential`, `token`, `pin`, `key`, and a few more — are masked
**server-side**, before the config ever reaches the browser, in both the
tree view and the flat set-commands view. The list is deliberately broad
(better to over-mask than leak): a plain `key` leaf name catches SSH
public keys too, for example, which aren't actually secret — that's an
accepted false positive, not a bug.

This matters for VyOS specifically because, unlike `system login user`
passwords (which VyOS hashes on commit and never returns in plaintext),
many other secret-shaped leaves — API keys, RADIUS/TACACS+ shared
secrets, IPsec pre-shared secrets, WireGuard private keys — **are**
returned verbatim by `/retrieve`.

**Tag-node identifiers, not just fixed leaf names:** the exact-match
rule above only ever catches a fixed, known-in-advance schema leaf name
— it can't help with a container's or event-handler's `environment`
variables, where every value sits under the exact same generic `value`
leaf regardless of its own key (`environment DB_PASSWORD value
'hunter2'` and `environment TZ value 'UTC'` are structurally identical
except for that one identifier). For this shape specifically —
`<KEY> value <VALUE>` — the same `sensitive-fields.json` file also lists
`sensitiveKeyPatterns`: a case-insensitive **substring** match
(`pass`, `secret`, `token`, `key`, `credential`, `pwd`, `private`,
`auth`) against the identifier itself. `DB_PASSWORD`, `STRIPE_API_KEY`
and `SESSION_SECRET` are all masked this way; `TZ` and `NODE_ENV` are
not. This generalizes to any `KEY -> {value}` tag-node collection, not
just containers — it also covers `service event-handler ... script
environment`. Deliberately scoped to that one generic `value` leaf, not
applied as a blanket rule against arbitrary structural field names —
otherwise a leaf named `authentication` would incorrectly match the
`auth` substring pattern. The frontend's `KeyValuePairList.tsx` (the
shared UI for container/event-handler environment variables, labels,
and sysctl parameters) offers the same masked-display and on-demand
Reveal treatment as the Config Tree view for entries matched this way —
but only for already-fetched, already-committed entries: a not-yet-
created container's local draft entries (typed by the user, never
fetched from the router) are shown in the clear, since there's nothing
server-masked to reveal.

**Known gap:** the identifier-substring matching above only fires when
there's a separate generic `value` leaf to mask. A secret that's
structurally the tag-node identifier *itself*, with no separate value
leaf beside it (the canonical example: an SNMP community string used as
`community <the-secret-itself> { authorization ro }`) still isn't
caught — the identifier is the whole secret, and neither the tree view
nor the flat-text redaction has a generic leaf to redact in its place.
This is documented and tested explicitly (see
`backend/internal/mask/setcommands_test.go`) rather than silently
missing.

Because masking happens server-side, sensitive fields are write-only
by default: the config tree/set-commands views never send a real
secret value to the browser on their own. A single-value sensitive
leaf (the vast majority in practice — API keys, PSKs, passwords) can
still be revealed **on demand**, one value at a time, via a dedicated
`POST /api/config/reveal` endpoint
(`backend/internal/api/config_handlers.go`'s `handleReveal`) — the
Config Tree's "Reveal"/"Hide" toggle on a sensitive leaf calls it.
Design choices worth being explicit about:

- **POST with a JSON body, not a GET query parameter** — the target
  path is itself a hint about which secret is being requested, so
  keeping it out of a URL avoids browser history, the visible address
  bar, and some proxy/access logs capturing it more readily than a
  request body.
- **Scoped to masked leaves only** — the endpoint rejects a path that
  doesn't match `mask.IsMaskedPath` (an exact sensitive leaf name, or a
  generic `value` leaf whose tag-node identifier looks sensitive — see
  above), both to keep its audit log meaningful (every entry really is
  a secret being revealed) and to avoid becoming a redundant, wider
  bypass of the ordinary masked read path.
- **Every successful reveal is logged** at `Warn` level (path +
  authenticated username), independent of the generic per-request
  logger, so it's easy to grep/alert on separately from ordinary
  traffic.
- **No step-up re-authentication in v1** — revealing a value requires
  only the same active session + CSRF token every other authenticated
  action does, not a fresh password prompt. This is a real trade-off
  (a hijacked or left-open browser session can reveal secrets, not
  just edit them), accepted for now given this codebase's session
  model has no existing step-up/re-auth precedent to build on; worth
  revisiting if that trade-off proves too permissive in practice.
- **Single-value leaves only** — VyOS's own `returnValue` op (which
  the endpoint calls directly, bypassing masking on purpose) is
  documented as single-value only. A sensitive *multi-value* array
  leaf (rare in practice) stays exactly as masked/write-only as
  before; the Config Tree UI simply doesn't offer a Reveal control for
  individual array items.

## TLS

By default, if `TLS_CERT_FILE`/`TLS_KEY_FILE` aren't set, the backend
generates a self-signed certificate at startup (mirroring VyOS's own
documented default behavior for its API). This is fine for evaluation
but browsers will show a warning, and there's no certificate pinning
protecting the connection from a network-level MITM in that mode. For
production use, either:

- Mount a real certificate (e.g. issued by an internal PKI, or via
  VyOS's own `pki` subsystem export) and set `TLS_CERT_FILE`/
  `TLS_KEY_FILE`, or
- Put a reverse proxy with a real certificate in front of the container
  and set `TLS_ENABLED=false` (see below) so the backend itself serves
  plain HTTP behind it, rather than doubly encrypting the same
  connection.

### Serving plain HTTP instead (`TLS_ENABLED=false`)

Set `TLS_ENABLED=false` to make the backend's own listener serve plain
HTTP rather than HTTPS. `TLS_CERT_FILE`/`TLS_KEY_FILE` are ignored in
this mode (a startup warning is logged if they're set anyway, since
that combination is almost always a mistake).

**Only do this when you have a trusted reverse proxy terminating real
TLS in front of this container, or the container is reachable only over
a fully isolated/trusted network** (e.g. it's already confined to
VyOS's own container networking with no exposed host port). With TLS
disabled:

- All traffic — including the login form's plaintext password and the
  session cookie — travels unencrypted between the client and this
  process.
- The session cookie's `Secure` attribute is also dropped automatically
  by default (it has to be, in the general case — browsers silently
  refuse to send a `Secure` cookie back over a plain HTTP connection,
  so leaving it set would make login appear to succeed while the
  session never actually persists). **If the reverse proxy in front of
  this process terminates real TLS** (the intended use of this mode -
  see above), the browser's own connection genuinely is HTTPS even
  though this process itself only ever sees plain HTTP from the proxy,
  so the cookie both can and should still be marked `Secure` in that
  case. Set `COOKIE_SECURE=true` to opt back into that, independently
  of `TLS_ENABLED` — without it, that topology silently ends up with
  non-`Secure` cookies on what the browser considers an HTTPS origin.
  (The reverse combination — `COOKIE_SECURE=false` while
  `TLS_ENABLED=true` — is flagged with a startup warning, since it's
  almost always a mistake rather than an intentional choice.)

This is the same trade-off as the "reverse proxy in front" option
above, made explicit and first-class instead of requiring the backend
to redundantly re-encrypt a connection the proxy already secured.

Similarly, `VYOS_API_INSECURE_SKIP_VERIFY` disables certificate
verification on the backend→VyOS connection; only use it in lab
environments against VyOS's own self-signed default, never in
production. If VyOS's HTTPS API has a real certificate bound (`service
https certificates certificate <name>`), leave this at its default
(`false`).

## Security headers

Every response (the API's own JSON responses and the embedded SPA's
HTML/asset responses alike) carries a baseline set of security headers,
set by `api.SecurityHeaders` and wired up around the entire outer mux
in `cmd/vyos-client/serve.go` (`backend/internal/api/security_headers.go`):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — only
  when `TLS_ENABLED=true` (advertising HSTS while actually serving
  plain HTTP would tell browsers to *require* HTTPS for this host going
  forward, breaking the next plain-HTTP visit).

This is deliberate defense-in-depth independent of the LAN-only threat
model described below: nothing about being LAN-only prevents
clickjacking or MIME-sniffing against a browser on a phished or
otherwise compromised LAN client, and these headers cost nothing
functionally for a single-origin app with no legitimate reason to be
framed or to load third-party content.

`style-src` keeps `'unsafe-inline'` for a handful of genuinely dynamic
inline styles (live-computed progress-bar widths, chart positioning)
that can't be expressed as static classes — CSS injection is
lower-severity than script injection, and `script-src` itself has no
such exception: the one script that used to be inline in `index.html`
(early theme detection, so there's no flash of the wrong theme before
first paint) was deliberately extracted into a separate static file,
`frontend/public/theme-init.js`, referenced with a plain `<script
src="/theme-init.js">` tag instead, specifically so `script-src` could
stay `'self'` with no exception at all.

## Threat model notes

- The container is designed to run with **host networking** by default,
  meaning it shares the router's network namespace. This is a
  deliberate simplicity/reliability trade-off (see
  [architecture.md](architecture.md)) — it is *not* isolated from the
  host's network the way a bridge-networked container would be. Use the
  [bridge networking example](../deploy/container-config-examples/bridge-networking.txt)
  if that trade-off is unacceptable for your environment.
- **This app should never be directly reachable from WAN**, regardless
  of which networking mode you use — see
  [Restricting access to LAN clients only](#restricting-access-to-lan-clients-only)
  below for how to actually enforce that with host networking, the
  recommended default.
- The final container image is built `FROM
  gcr.io/distroless/static-debian12:nonroot` — no shell, no package
  manager, runs as a non-root user. The Dockerfile's `HEALTHCHECK` uses a
  subcommand of the app binary itself (`vyos-client healthcheck`) rather
  than `curl`/shell, since neither is present in the final image.
- `VYOS_API_KEY` grants full, unscoped configuration access to VyOS.
  Treat the container's environment configuration with the same care as
  root/admin credentials on the router itself — because, functionally,
  it is one.
- **Rate limiting exists on login (always) and on every route that
  triggers a real VyOS commit — commit, commit/confirm, import, and
  rollback (per authenticated user)**, but not on every authenticated
  route.
  `POST /api/config/save` and the file browser
  (`GET /api/files`, when `FILE_BROWSER_ENABLED=true`) are bounded by
  request/response size caps instead (`maxRequestBodyBytes`,
  `maxFileViewContentBytes`) rather than a request-frequency limit —
  reasonable given every affected route already requires
  authentication first, so this is a modest self-DoS/compromised-
  session concern, not an external attack surface, in keeping with
  this app's single-operator, LAN-only threat model.
- **`SELF_UPGRADE_ENABLED` is the one deliberate exception** to this
  app never talking to anything but VyOS's own API — when set, the
  backend makes unauthenticated HTTPS calls to `api.github.com` to
  check for new releases, and to `ghcr.io` to verify each newer
  release's image actually exists before enabling its "Upgrade"
  button (see [architecture.md](architecture.md#self-upgrade)).
  Disabled by default. If you enable it, be aware that a
  compromised/typo'd `SELF_UPGRADE_GITHUB_REPO` could point this at an
  image reference you don't control — the value is trusted as-is, the
  same "trust the authenticated deployment configuration" posture the
  rest of `internal/config` already takes for every other env var.
- **`CONTAINER_UPDATE_CHECKS_ENABLED` is the other exception**, and a
  broader one: when set, an authenticated operator's "Check for
  update" click on the Containers page makes the backend contact
  *whatever registry that container's own image reference points at*
  — not a single fixed host like self-upgrade's GitHub API (see
  [architecture.md](architecture.md#container-image-update-checks)).
  This is the same trust model already accepted for the system image
  install URL field (see
  [roadmap.md](roadmap.md)'s security-review-findings entry): every
  authenticated user already has full VyOS configuration access
  regardless, so an operator-supplied image string determining an
  outbound request's destination isn't a new privilege boundary being
  crossed. Disabled by default; also note that checking a container
  whose image matches a `container registry <name>` entry with
  credentials configured reads that registry's password directly
  (`vyos.Client.ReturnValue`, not the browser-facing reveal endpoint)
  to authenticate the request — logged server-side (`"registry
  credentials read for a container image update check"`) each time.
- **`FILE_BROWSER_ENABLED` gates the Files page for a different
  reason than the two flags above**: it makes no outbound-to-the-
  internet call at all (it only ever talks to VyOS's own API, same as
  almost everything else in this app). Disabled by default because
  it's still real filesystem read access on the router — VyOS's own
  `show file <path>` op-mode command imposes no path restriction of
  its own (see [architecture.md](architecture.md#files-a-curated-read-only-viewer-over-show-file-path)),
  so even this app's own curated allowlist (`/config`, `/var/log`) is
  something an operator may reasonably want to opt out of entirely
  rather than rely on that allowlist alone.

### Restricting access to LAN clients only

With host networking (the recommended default), this app's listener
binds directly onto the router's own network namespace — there is no
container-level network isolation keeping WAN-side clients out the way
a bridge network's own address space would. Two independent layers,
used together, are how you actually restrict access to LAN clients:

1. **Bind `LISTEN_ADDR` to a specific LAN interface address**, not the
   `:8443` default (which binds every interface, WAN included). `LISTEN_ADDR`
   is passed straight through to Go's `net.Listen` with no validation —
   any `IP:port` form works, e.g. `LISTEN_ADDR=192.168.1.1:8443` for a
   router whose LAN interface has that address. This alone is enough to
   make the listener socket itself unreachable from WAN, and needs no
   code changes — it already works today, it's just not the default
   (which optimizes for "just works" over "secure by default", since a
   fresh deployment can't know your LAN interface's address in advance).
2. **A VyOS firewall rule blocking WAN → local traffic to that port**,
   as defense-in-depth in case `LISTEN_ADDR` is ever accidentally reset
   to the wildcard form (e.g. during an upgrade, or a config rollback).
   See the
   [host networking example](../deploy/container-config-examples/host-networking.txt)'s
   step 4 for a concrete zone-based firewall rule, assuming you already
   have `LAN`/`WAN` zones configured (this app's own Firewall > Zones
   page manages exactly this kind of config).

Neither layer alone is as strong as both together: `LISTEN_ADDR` binding
is simple and needs no firewall configured, but a config mistake (or a
future default change) could silently re-expose the port; the firewall
rule is explicit and auditable, but only helps if it's actually present
and its zone/interface assumptions still match your topology. Bridge
networking (see above) is a different, complementary trade-off — it
gets you a separate network namespace, but you then have to reason
about the bridge's own address space and port-publish rules instead,
which isn't automatically LAN-only either unless configured as such.
