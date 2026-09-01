// Package atomicfile provides a single small helper - writing a file's
// full contents without ever leaving a partially-written or corrupt
// file behind if the process crashes or is killed mid-write. Shared by
// the two features in this codebase that persist anything to local
// disk at all (session-secret persistence and the notification
// store - see cmd/vyos-client/sessionsecret.go and
// internal/notifications), rather than duplicating the same
// write-to-temp-then-rename logic in both places.
package atomicfile

import (
	"fmt"
	"os"
	"path/filepath"
)

// Write atomically replaces path's contents with data: it writes to a
// new temporary file in the same directory as path (so the final
// rename is guaranteed to be on the same filesystem, and therefore
// atomic), sets its permissions to perm, and renames it into place.
// Any process that reads path either sees its previous complete
// contents or the new complete contents - never a truncated or
// partially-written file, even if this process is killed mid-write.
//
// path's parent directory must already exist; Write does not create
// it.
func Write(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return fmt.Errorf("atomicfile: creating temp file in %q: %w", dir, err)
	}
	tmpPath := tmp.Name()
	// Removing an already-renamed-away temp path is a no-op (the OS
	// simply reports "not found", which is ignored) - this is just a
	// best-effort cleanup for every *other* early-return path below.
	defer func() { _ = os.Remove(tmpPath) }()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("atomicfile: writing %q: %w", tmpPath, err)
	}
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("atomicfile: setting permissions on %q: %w", tmpPath, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("atomicfile: closing %q: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("atomicfile: renaming %q to %q: %w", tmpPath, path, err)
	}
	return nil
}
