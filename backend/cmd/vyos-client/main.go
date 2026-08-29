// Command vyos-client is the vyos-client backend: it serves the web UI
// and its backend-for-frontend API. Run without arguments to start the
// server; run `vyos-client hash-password` to generate a bcrypt hash for
// UI_ADMIN_PASSWORD_HASH; run `vyos-client version` to print the build
// version.
package main

import (
	"fmt"
	"os"
)

// version is the release version this binary was built from - set via
// `-ldflags="-X main.version=..."` (see deploy/Dockerfile's VERSION
// build-arg), computed by .github/workflows/release.yml from
// Conventional Commits (see .releaserc.json). Left at its "dev"
// default for local/non-release builds (`make build-backend`,
// `go run ./cmd/vyos-client`), which is expected and not an error.
var version = "dev"

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "hash-password":
			if err := runHashPassword(os.Args[2:]); err != nil {
				fmt.Fprintln(os.Stderr, "error:", err)
				os.Exit(1)
			}
			return
		case "healthcheck":
			if err := runHealthcheck(); err != nil {
				fmt.Fprintln(os.Stderr, "error:", err)
				os.Exit(1)
			}
			return
		case "version":
			fmt.Println(version)
			return
		}
	}

	if err := runServer(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
