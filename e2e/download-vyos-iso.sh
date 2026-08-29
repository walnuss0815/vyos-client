#!/usr/bin/env bash
# Downloads and minisign-verifies a pinned VyOS ISO (see
# vyos-versions.env). Idempotent: skips the download if an
# already-verified ISO for the currently-pinned tag of the requested
# version-key is cached.
#
# Usage: download-vyos-iso.sh <version-key> [output-dir]
#   <version-key> is one of: rolling, stream-0, stream-1, stream-2,
#   stream-3 (see vyos-versions.env for what each currently points at).
# Requires: curl, minisign (both in flake.nix's dev shell / CI image).
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vyos-versions.env
source "$script_dir/vyos-versions.env"

version_key="${1:-}"
if [ -z "$version_key" ]; then
  echo "usage: $0 <version-key> [output-dir]" >&2
  echo "  version-key is one of: rolling, stream-0, stream-1, stream-2, stream-3" >&2
  exit 1
fi

# Resolves version_key to this build's tag, minisign public key, and
# download-URL template - the two channels' ISOs live at different
# hosts with different directory layouts, but each is otherwise a
# straightforward <tag> substitution into a fixed pattern (confirmed
# against https://vyos.net/get/nightly-builds/ and
# https://vyos.net/get/stream/ directly, across both of Stream's two
# tag-naming eras - see vyos-versions.env's own doc comment).
case "$version_key" in
  rolling)
    tag="$VYOS_ROLLING_TAG"
    minisign_pubkey="$VYOS_ROLLING_MINISIGN_PUBKEY"
    iso_url="https://github.com/vyos/vyos-nightly-build/releases/download/${tag}/vyos-${tag}-generic-amd64.iso"
    ;;
  stream-0 | stream-1 | stream-2 | stream-3)
    tag_var="VYOS_$(echo "$version_key" | tr '[:lower:]-' '[:upper:]_')_TAG"
    tag="${!tag_var}"
    minisign_pubkey="$VYOS_STREAM_MINISIGN_PUBKEY"
    iso_url="https://community-downloads.vyos.dev/stream/${tag}/vyos-${tag}-generic-amd64.iso"
    ;;
  *)
    echo "unknown version-key '$version_key' - expected one of: rolling, stream-0, stream-1, stream-2, stream-3" >&2
    exit 1
    ;;
esac
sig_url="${iso_url}.minisig"

out_dir="${2:-$script_dir/.cache}/$version_key"
mkdir -p "$out_dir"
iso_path="$out_dir/vyos.iso"
sig_path="$out_dir/vyos.iso.minisig"
marker_path="$iso_path.verified"

if [ -f "$marker_path" ] && [ "$(cat "$marker_path")" = "$tag" ]; then
  echo "Already have a signature-verified $version_key ($tag) ISO at $iso_path - skipping download."
  echo "iso_path=$iso_path"
  exit 0
fi

echo "Downloading VyOS $version_key ($tag) ISO..."
curl -fL --retry 3 --retry-delay 5 -o "$iso_path.tmp" "$iso_url"
curl -fL --retry 3 --retry-delay 5 -o "$sig_path" "$sig_url"

echo "Verifying minisign signature against VyOS's published public key for this channel..."
rm -f "$marker_path"
minisign -Vm "$iso_path.tmp" -x "$sig_path" -P "$minisign_pubkey"

mv "$iso_path.tmp" "$iso_path"
echo "$tag" > "$marker_path"
echo "Verified. iso_path=$iso_path"
