#!/usr/bin/env bash
# Orchestrates the full real-VyOS end-to-end test run: download +
# verify the pinned ISO, boot + bootstrap it under QEMU, build and
# start vyos-client's real production binary pointed at it, run the
# Playwright suite, then tear everything down. See e2e/README.md.
#
# Requires (all in flake.nix's dev shell / the e2e CI job): curl,
# minisign, expect, qemu, go, node, make, openssl (used both for the
# API key/login password randomness below and, more heavily, by
# tests/specs/pki.spec.ts's own self-signed test certificate
# generation). Needs KVM (/dev/kvm) for a reasonable boot time -
# GitHub-hosted Actions runners support it.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

# Which pinned build to test against - one of: rolling, stream-0
# (newest Stream release), stream-1, stream-2, stream-3 (oldest of the
# 4 kept) - see vyos-versions.env. Defaults to rolling so an
# unparameterized `e2e/run.sh` behaves exactly as it always has; the
# CI matrix (.github/workflows/e2e.yml) sets this explicitly per job.
VERSION_KEY="${VYOS_E2E_VERSION_KEY:-rolling}"

API_PORT="${VYOS_E2E_API_PORT:-18443}"
UI_PORT="${VYOS_E2E_UI_PORT:-18080}"
API_KEY="${VYOS_E2E_API_KEY:-$(openssl rand -hex 24)}"
LOGIN_USER="${VYOS_E2E_LOGIN_USER:-e2elogin}"
LOGIN_PASSWORD="${VYOS_E2E_LOGIN_PASSWORD:-$(openssl rand -hex 16)}"

work_dir="$(mktemp -d)"
qemu_pid_file="$work_dir/qemu.pid"
bootstrap_log="$work_dir/bootstrap.log"
vyos_client_log="$work_dir/vyos-client.log"

vyos_client_pid=""

cleanup() {
  status=$?
  echo "--- e2e cleanup ---"
  if [ -n "$vyos_client_pid" ] && kill -0 "$vyos_client_pid" 2>/dev/null; then
    kill "$vyos_client_pid" 2>/dev/null || true
  fi
  if [ -f "$qemu_pid_file" ]; then
    qemu_pid="$(cat "$qemu_pid_file")"
    if kill -0 "$qemu_pid" 2>/dev/null; then
      kill "$qemu_pid" 2>/dev/null || true
    fi
  fi
  if [ "$status" -ne 0 ]; then
    echo "--- bootstrap log (last 100 lines) ---"
    tail -n 100 "$bootstrap_log" 2>/dev/null || true
    echo "--- vyos-client log (last 100 lines) ---"
    tail -n 100 "$vyos_client_log" 2>/dev/null || true
  fi
  rm -rf "$work_dir"
  exit "$status"
}
trap cleanup EXIT

echo "--- downloading/verifying the pinned VyOS ISO ($VERSION_KEY) ---"
"$script_dir/download-vyos-iso.sh" "$VERSION_KEY"
iso_path="$script_dir/.cache/$VERSION_KEY/vyos.iso"

echo "--- booting + bootstrapping VyOS under QEMU (this takes a minute or two) ---"
VYOS_E2E_ISO_PATH="$iso_path" \
  VYOS_E2E_API_KEY="$API_KEY" \
  VYOS_E2E_API_PORT="$API_PORT" \
  VYOS_E2E_LOGIN_USER="$LOGIN_USER" \
  VYOS_E2E_LOGIN_PASSWORD="$LOGIN_PASSWORD" \
  VYOS_E2E_QEMU_PID_FILE="$qemu_pid_file" \
  expect "$script_dir/bootstrap.exp" > "$bootstrap_log" 2>&1 &
bootstrap_job=$!

echo "--- waiting for the VyOS REST API to become reachable on :$API_PORT ---"
vyos_ready=""
for _ in $(seq 1 60); do
  if curl -skf --max-time 3 "https://localhost:$API_PORT/info" > /dev/null 2>&1; then
    vyos_ready=1
    break
  fi
  if ! kill -0 "$bootstrap_job" 2>/dev/null; then
    echo "bootstrap process exited early"
    exit 1
  fi
  sleep 5
done
if [ -z "$vyos_ready" ]; then
  echo "timed out waiting for the VyOS REST API"
  exit 1
fi
echo "VyOS is up: $(curl -sk "https://localhost:$API_PORT/info")"

echo "--- building vyos-client (the real production build: frontend + embedded Go binary) ---"
make -C "$repo_root" build-backend

echo "--- starting vyos-client on :$UI_PORT ---"
export VYOS_API_URL="https://localhost:$API_PORT"
export VYOS_API_KEY="$API_KEY"
export VYOS_API_INSECURE_SKIP_VERIFY=true
# AUTH_MODE is deliberately left unset (defaults to vyos-users): the
# whole point of this suite is exercising login against $LOGIN_USER's
# real, VyOS-hashed password (see bootstrap.exp), not the AUTH_MODE=static
# path - that one never talks to VyOS at all, so a real VM adds nothing
# over the existing unit/integration tests for it.
export SESSION_SECRET="e2e-test-session-secret-not-for-production-0123456789"
export LISTEN_ADDR=":$UI_PORT"
"$repo_root/backend/bin/vyos-client" > "$vyos_client_log" 2>&1 &
vyos_client_pid=$!

echo "--- waiting for vyos-client to become reachable ---"
ui_ready=""
for _ in $(seq 1 30); do
  if curl -skf --max-time 3 "https://localhost:$UI_PORT/healthz" > /dev/null 2>&1; then
    ui_ready=1
    break
  fi
  if ! kill -0 "$vyos_client_pid" 2>/dev/null; then
    echo "vyos-client exited early"
    exit 1
  fi
  sleep 2
done
if [ -z "$ui_ready" ]; then
  echo "timed out waiting for vyos-client"
  exit 1
fi

echo "--- running the Playwright suite against https://localhost:$UI_PORT ---"
export E2E_BASE_URL="https://localhost:$UI_PORT"
export E2E_UI_ADMIN_USER="$LOGIN_USER"
export E2E_UI_ADMIN_PASSWORD="$LOGIN_PASSWORD"
export E2E_VYOS_API_KEY="$API_KEY"
cd "$script_dir/tests"
npm ci
if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  # flake.nix's dev shell already provides Chromium via
  # playwright-driver.browsers (pinned to the same @playwright/test
  # version in package.json) - no download/apt-get needed.
  echo "Using nix-provided Playwright browsers at $PLAYWRIGHT_BROWSERS_PATH"
else
  # CI (ubuntu-latest, no nix devShell) - downloads Chromium plus its
  # OS-level dependencies via apt.
  npx playwright install --with-deps chromium
fi
npx playwright test
