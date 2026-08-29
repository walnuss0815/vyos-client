#!/usr/bin/env bash
# Manages a long-lived, real-VyOS VM + vyos-client backend for
# iterating on individual e2e specs during development - unlike
# run.sh (which boots a VM, runs the ENTIRE Playwright suite once, and
# always tears everything down on exit, matching CI's one-shot need),
# this script's `start` leaves both running in the background so you
# can run one spec at a time against the same instance, e.g.:
#
#   e2e/dev-vm.sh start
#   cd e2e/tests && npx playwright test specs/firewall.spec.ts
#   npx playwright test specs/nat.spec.ts   # same VM, no reboot
#   cd ../.. && e2e/dev-vm.sh stop
#
# Set VYOS_E2E_VERSION_KEY (one of: rolling, stream-0, stream-1,
# stream-2, stream-3 - see vyos-versions.env) before `start` to boot a
# specific pinned build instead of the default rolling - e.g. to
# reproduce a CI matrix failure against a particular Stream release:
#
#   VYOS_E2E_VERSION_KEY=stream-2 e2e/dev-vm.sh start
#
# Requires the same tools as run.sh (curl, minisign, expect, qemu, go,
# node, make, openssl - see flake.nix's dev shell). Needs KVM (/dev/kvm).
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
state_dir="$script_dir/.cache"
state_file="$state_dir/dev-vm.env"
bootstrap_log="$state_dir/dev-vm-bootstrap.log"
vyos_client_log="$state_dir/dev-vm-vyos-client.log"

cmd="${1:-}"

status() {
  if [ -f "$state_file" ]; then
    # shellcheck source=/dev/null
    source "$state_file"
    if kill -0 "$QEMU_PID" 2>/dev/null && kill -0 "$VYOS_CLIENT_PID" 2>/dev/null; then
      echo "running: QEMU pid $QEMU_PID, vyos-client pid $VYOS_CLIENT_PID"
      echo "  Version: ${VERSION_KEY:-rolling} (see e2e/vyos-versions.env)"
      echo "  UI:  https://localhost:$UI_PORT (login $LOGIN_USER / $LOGIN_PASSWORD)"
      echo "  API: https://localhost:$API_PORT (key $API_KEY)"
      echo "  state file (source this before running specs directly): $state_file"
      return 0
    fi
    echo "stale state file found ($state_file) but process(es) are gone - run 'stop' to clean up, then 'start' again."
    return 1
  fi
  echo "not running"
  return 1
}

stop() {
  if [ ! -f "$state_file" ]; then
    echo "not running (no state file at $state_file)"
    return 0
  fi
  # shellcheck source=/dev/null
  source "$state_file"
  echo "--- stopping dev VM ---"
  if [ -n "${VYOS_CLIENT_PID:-}" ] && kill -0 "$VYOS_CLIENT_PID" 2>/dev/null; then
    kill "$VYOS_CLIENT_PID" 2>/dev/null || true
  fi
  if [ -n "${QEMU_PID:-}" ] && kill -0 "$QEMU_PID" 2>/dev/null; then
    kill "$QEMU_PID" 2>/dev/null || true
  fi
  rm -f "$state_file"
  echo "stopped."
}

start() {
  if status > /dev/null 2>&1; then
    echo "already running - see 'e2e/dev-vm.sh status'. Run 'stop' first if you want a fresh VM."
    exit 1
  fi
  rm -f "$state_file"
  mkdir -p "$state_dir"
  # $state_dir holds $state_file, which has the plaintext API key and
  # login password in it (sourced by `status`/`stop`) - lock it down
  # rather than leaving it at mkdir's default (world-readable) mode,
  # and set umask so every file created under it for the rest of this
  # function (state file, both logs, the QEMU pid file) inherits
  # owner-only permissions too, including from the backgrounded
  # `nohup ... &` processes, which inherit this shell's umask.
  chmod 700 "$state_dir"
  umask 077

  # Populated as each process comes up; read by cleanup_on_failure
  # below, which fires on any failure for the rest of this function -
  # an explicit `exit 1`, or any command failing under this script's
  # `set -e` (e.g. `make build-backend`) - and kills whatever
  # cleanup_on_failure managed to start rather than leaving it running,
  # orphaned and disowned, forever. A successful run disarms the trap
  # just before returning, since the entire point of `start` is to
  # leave these processes running in the background for later specs to
  # use - mirroring run.sh's own `trap cleanup EXIT`, which this
  # lacked despite having the exact same "background process started,
  # then something later fails" exposure.
  qemu_pid_file=""
  vyos_client_pid=""
  cleanup_on_failure() {
    echo "--- start failed - cleaning up anything it managed to launch ---"
    if [ -n "$vyos_client_pid" ] && kill -0 "$vyos_client_pid" 2>/dev/null; then
      kill "$vyos_client_pid" 2>/dev/null || true
    fi
    if [ -n "$qemu_pid_file" ] && [ -f "$qemu_pid_file" ]; then
      qemu_pid="$(cat "$qemu_pid_file")"
      if kill -0 "$qemu_pid" 2>/dev/null; then
        kill "$qemu_pid" 2>/dev/null || true
      fi
    fi
    # Not separately killing the bootstrap.exp/expect job itself: once
    # its QEMU child above is killed, expect's own `expect eof` sees
    # QEMU exit and returns on its own shortly after - the same
    # indirect cleanup run.sh's cleanup() relies on.
    rm -f "$state_file"
  }
  trap cleanup_on_failure EXIT

  # Which pinned build to boot - one of: rolling, stream-0 (newest
  # Stream release), stream-1, stream-2, stream-3 (oldest of the 4
  # kept) - see vyos-versions.env. Defaults to rolling so an
  # unparameterized `dev-vm.sh start` behaves exactly as it always has.
  VERSION_KEY="${VYOS_E2E_VERSION_KEY:-rolling}"

  API_PORT="${VYOS_E2E_API_PORT:-18443}"
  UI_PORT="${VYOS_E2E_UI_PORT:-18080}"
  API_KEY="${VYOS_E2E_API_KEY:-$(openssl rand -hex 24)}"
  LOGIN_USER="${VYOS_E2E_LOGIN_USER:-e2elogin}"
  LOGIN_PASSWORD="${VYOS_E2E_LOGIN_PASSWORD:-$(openssl rand -hex 16)}"

  echo "--- downloading/verifying the pinned VyOS ISO ($VERSION_KEY) ---"
  "$script_dir/download-vyos-iso.sh" "$VERSION_KEY"
  iso_path="$script_dir/.cache/$VERSION_KEY/vyos.iso"

  echo "--- booting + bootstrapping VyOS under QEMU (this takes a minute or two) ---"
  qemu_pid_file="$state_dir/dev-vm-qemu.pid"
  rm -f "$qemu_pid_file"
  VYOS_E2E_ISO_PATH="$iso_path" \
    VYOS_E2E_API_KEY="$API_KEY" \
    VYOS_E2E_API_PORT="$API_PORT" \
    VYOS_E2E_LOGIN_USER="$LOGIN_USER" \
    VYOS_E2E_LOGIN_PASSWORD="$LOGIN_PASSWORD" \
    VYOS_E2E_QEMU_PID_FILE="$qemu_pid_file" \
    nohup expect "$script_dir/bootstrap.exp" > "$bootstrap_log" 2>&1 &
  bootstrap_job=$!
  disown

  echo "--- waiting for the VyOS REST API to become reachable on :$API_PORT ---"
  vyos_ready=""
  for _ in $(seq 1 60); do
    if curl -skf --max-time 3 "https://localhost:$API_PORT/info" > /dev/null 2>&1; then
      vyos_ready=1
      break
    fi
    if ! kill -0 "$bootstrap_job" 2>/dev/null; then
      echo "bootstrap process exited early - see $bootstrap_log"
      exit 1
    fi
    sleep 5
  done
  if [ -z "$vyos_ready" ]; then
    echo "timed out waiting for the VyOS REST API - see $bootstrap_log"
    exit 1
  fi
  echo "VyOS is up: $(curl -sk "https://localhost:$API_PORT/info")"
  qemu_pid="$(cat "$qemu_pid_file")"

  echo "--- building vyos-client (the real production build) ---"
  make -C "$repo_root" build-backend

  echo "--- starting vyos-client on :$UI_PORT ---"
  VYOS_API_URL="https://localhost:$API_PORT" \
    VYOS_API_KEY="$API_KEY" \
    VYOS_API_INSECURE_SKIP_VERIFY=true \
    SESSION_SECRET="e2e-dev-vm-session-secret-not-for-production-0123456789" \
    LISTEN_ADDR=":$UI_PORT" \
    nohup "$repo_root/backend/bin/vyos-client" > "$vyos_client_log" 2>&1 &
  vyos_client_pid=$!
  disown

  echo "--- waiting for vyos-client to become reachable ---"
  ui_ready=""
  for _ in $(seq 1 30); do
    if curl -skf --max-time 3 "https://localhost:$UI_PORT/healthz" > /dev/null 2>&1; then
      ui_ready=1
      break
    fi
    if ! kill -0 "$vyos_client_pid" 2>/dev/null; then
      echo "vyos-client exited early - see $vyos_client_log"
      exit 1
    fi
    sleep 2
  done
  if [ -z "$ui_ready" ]; then
    echo "timed out waiting for vyos-client - see $vyos_client_log"
    exit 1
  fi

  # Everything is up - disarm cleanup_on_failure so the normal exit at
  # the end of this function (and of the script) doesn't kill the very
  # processes `start` exists to leave running.
  trap - EXIT

  cat > "$state_file" <<EOF
QEMU_PID=$qemu_pid
VYOS_CLIENT_PID=$vyos_client_pid
VERSION_KEY=$VERSION_KEY
API_PORT=$API_PORT
UI_PORT=$UI_PORT
API_KEY=$API_KEY
LOGIN_USER=$LOGIN_USER
LOGIN_PASSWORD=$LOGIN_PASSWORD
export E2E_BASE_URL="https://localhost:$UI_PORT"
export E2E_UI_ADMIN_USER="$LOGIN_USER"
export E2E_UI_ADMIN_PASSWORD="$LOGIN_PASSWORD"
export E2E_VYOS_API_KEY="$API_KEY"
EOF

  echo "--- dev VM ready ---"
  status
  echo ""
  echo "Run a single spec with:"
  echo "  source $state_file && cd $script_dir/tests && npx playwright test specs/<name>.spec.ts"
}

case "$cmd" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *)
    echo "usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
