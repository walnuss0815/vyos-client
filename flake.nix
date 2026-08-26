{
  description = "VyOS Configuration Client – Development Environment";

  inputs = {
    nixpkgs.url     = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = false;
        };

        # ── Gemeinsame CLI-Tools (Front- und Backend) ─────────────────────────
        commonPackages = with pkgs; [
          git
          curl
          jq
          docker
          docker-compose
        ];

        # ── Node.js Version ────────────────────────────────────────────────────
        nodejs = pkgs.nodejs_22;

        # ── NPM-basierte globale Dev-Tools ─────────────────────────────────────
        nodePackages = with pkgs; [
          typescript-language-server   # LSP für VS Code / neovim / helix
          vscode-langservers-extracted # HTML/CSS/JSON/ESLint LSP
        ];

      in
      {
        # ── Standard-Shell für die gesamte Anwendung ──────────────────────────
        devShells.default = pkgs.mkShell {
          name = "vyos-client-dev";

          packages = commonPackages ++ nodePackages ++ [
            nodejs
          ];

          shellHook = ''
            echo ""
            echo "╔═══════════════════════════════════════════════════╗"
            echo "║    VyOS Configuration Client – Dev Environment    ║"
            echo "╠═══════════════════════════════════════════════════╣"
            echo "║  node   $(node  --version)                                  "
            echo "║  npm    $(npm   --version)                                  "
            echo "╠═══════════════════════════════════════════════════╣"
            echo "║  Befehle:                                         ║"
            echo "║  dev:start  – Frontend + Backend parallel starten ║"
            echo "║  fe:install – npm install im frontend/            ║"
            echo "║  be:install – npm install im backend/             ║"
            echo "║  fe:build   – Produktions-Build des Frontends     ║"
            echo "║  dc:up      – docker compose up --build           ║"
            echo "║  dc:down    – docker compose down                 ║"
            echo "╚═══════════════════════════════════════════════════╝"
            echo ""

            # ── Shell-Aliases / Hilfsfunktionen ──────────────────────────────
            fe:install() { (cd frontend && npm install "$@"); }
            be:install() { (cd backend  && npm install "$@"); }
            fe:build()   { (cd frontend && npm run build); }

            dev:start() {
              (cd backend  && npm run dev) &
              BE_PID=$!
              (cd frontend && npm run dev) &
              FE_PID=$!
              echo "Backend  PID: $BE_PID"
              echo "Frontend PID: $FE_PID"
              echo "Stoppen mit: kill $BE_PID $FE_PID"
              wait
            }

            dc:up()   { docker compose up --build "$@"; }
            dc:down() { docker compose down "$@"; }

            export -f fe:install be:install fe:build dev:start dc:up dc:down

            # ── Warnung wenn .env fehlt ───────────────────────────────────────
            if [ ! -f .env ]; then
              echo "⚠  Hinweis: .env nicht gefunden."
              echo "   Erstelle sie mit: cp .env.example .env"
              echo ""
            fi
          '';
        };

        # ── Separate Shell: nur Frontend ──────────────────────────────────────
        devShells.frontend = pkgs.mkShell {
          name = "vyos-client-frontend";

          packages = [ nodejs ] ++ nodePackages;

          shellHook = ''
            echo "Frontend-Shell aktiv – node $(node --version)"
            cd frontend
            if [ ! -d node_modules ]; then
              echo "Installiere Abhängigkeiten..."
              npm install
            fi
          '';
        };

        # ── Separate Shell: nur Backend ───────────────────────────────────────
        devShells.backend = pkgs.mkShell {
          name = "vyos-client-backend";

          packages = [ nodejs ];

          shellHook = ''
            echo "Backend-Shell aktiv – node $(node --version)"
            cd backend
            if [ ! -d node_modules ]; then
              echo "Installiere Abhängigkeiten..."
              npm install
            fi
            if [ ! -f ../.env ]; then
              echo "⚠  Keine .env gefunden – cp .env.example .env nicht vergessen"
            fi
          '';
        };
      }
    );
}
