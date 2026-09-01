package atomicfile_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/atomicfile"
)

func TestWrite_CreatesFileWithContentAndPermissions(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example.txt")

	if err := atomicfile.Write(path, []byte("hello"), 0o600); err != nil {
		t.Fatalf("Write: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(data) != "hello" {
		t.Errorf("content = %q, want %q", data, "hello")
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("permissions = %v, want 0600", info.Mode().Perm())
	}
}

func TestWrite_ReplacesExistingFileEntirely(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example.txt")

	if err := atomicfile.Write(path, []byte("this is the original, longer content"), 0o600); err != nil {
		t.Fatalf("Write (first): %v", err)
	}
	if err := atomicfile.Write(path, []byte("short"), 0o600); err != nil {
		t.Fatalf("Write (second): %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	// The core atomicity guarantee: a shorter second write must not
	// leave any trailing bytes from the longer first write behind (an
	// in-place truncate-then-write, rather than write-to-temp-then-
	// rename, could do exactly that).
	if string(data) != "short" {
		t.Errorf("content = %q, want %q (no leftover bytes from the previous, longer write)", data, "short")
	}
}

func TestWrite_DoesNotLeaveATempFileBehind(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example.txt")

	if err := atomicfile.Write(path, []byte("hello"), 0o600); err != nil {
		t.Fatalf("Write: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	if len(entries) != 1 {
		t.Errorf("directory has %d entries, want exactly 1 (the final file, no leftover temp file): %v", len(entries), entries)
	}
}

func TestWrite_FailsIfParentDirectoryDoesNotExist(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "does-not-exist", "example.txt")

	if err := atomicfile.Write(path, []byte("hello"), 0o600); err == nil {
		t.Error("expected an error for a missing parent directory, got nil")
	}
}
