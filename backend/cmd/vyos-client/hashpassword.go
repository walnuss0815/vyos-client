package main

import (
	"flag"
	"fmt"
	"os"

	"golang.org/x/term"

	"github.com/walnuss0815/vyos-client/backend/internal/auth"
)

// runHashPassword implements `vyos-client hash-password`, printing a
// bcrypt hash suitable for the UI_ADMIN_PASSWORD_HASH environment
// variable. Operators use this instead of putting a plaintext password
// into VyOS's own `set container ... environment` config, which VyOS
// does not mask or encrypt.
func runHashPassword(args []string) error {
	fs := flag.NewFlagSet("hash-password", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: vyos-client hash-password [password]")
		fmt.Fprintln(os.Stderr, "If password is omitted, it is read interactively without echo.")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}

	var password string
	if fs.NArg() > 0 {
		password = fs.Arg(0)
	} else {
		fmt.Fprint(os.Stderr, "Password: ")
		raw, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		if err != nil {
			return fmt.Errorf("reading password: %w", err)
		}
		password = string(raw)
	}

	if password == "" {
		return fmt.Errorf("password must not be empty")
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	fmt.Println(hash)
	return nil
}
