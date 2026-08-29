{
  description = "VyOS Client - a modern web UI for VyOS, running as a container on the router itself";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          name = "vyos-client-dev";

          packages = with pkgs; [
            # --- Go backend ---
            go_1_25
            gopls
            golangci-lint
            gotools
            delve

            # --- Frontend ---
            nodejs_22
            typescript-language-server

            # --- Containers ---
            docker

            # --- Real-VyOS end-to-end testing (see e2e/README.md) ---
            qemu
            minisign # verify VyOS nightly build signatures
            expect # serial console automation for VM bootstrap
            playwright-driver # e2e/tests' browser - see PLAYWRIGHT_BROWSERS_PATH below

            # --- Misc ---
            jq
            yq-go
            git
            gnumake
            actionlint
            shellcheck
          ];

          # Lets e2e/run.sh's `npx playwright test` use this pre-built,
          # nix-cached Chromium instead of downloading its own (which
          # would also need `apt-get`-installed OS packages this
          # NixOS-oriented shell doesn't have) - see e2e/tests/package.json's
          # @playwright/test version comment for why it's pinned to
          # match nixpkgs' playwright-driver exactly.
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";

          shellHook = ''
            echo "VyOS Client dev shell"
            echo "  go:      $(go version 2>/dev/null || echo 'not found')"
            echo "  node:    $(node --version 2>/dev/null || echo 'not found')"
            echo "  qemu:    $(qemu-system-x86_64 --version 2>/dev/null | head -n1 || echo 'not found')"
            echo ""
            echo "See docs/development.md to get started."
          '';
        };
      });
}
