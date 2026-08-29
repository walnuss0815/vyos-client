package vyos_test

import (
	"context"
	"runtime"
	"strings"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func TestParseShowFile_DirectoryListing(t *testing.T) {
	raw := "########## DIRECTORY LISTING ##########\n" +
		"Path:\t /config\n" +
		"total 24\n" +
		"drwxr-xr-x  2 root  4.0K Jan  1 00:00 scripts/\n" +
		"-rw-r--r--  1 root   123 Jan  1 00:00 config.boot\n" +
		"-rwxr-xr-x  1 root   456 Jan  2 12:34 backup.sh*\n" +
		"lrwxrwxrwx  1 root    11 Feb  3 08:00 current -> config.boot\n"

	dir, file, err := vyos.ParseShowFile("/config", raw)
	if err != nil {
		t.Fatalf("ParseShowFile: %v", err)
	}
	if file != nil {
		t.Fatalf("expected a directory result, got a file result: %+v", file)
	}
	if dir.Path != "/config" {
		t.Errorf("Path = %q, want /config", dir.Path)
	}
	if len(dir.Entries) != 4 {
		t.Fatalf("len(Entries) = %d, want 4: %+v", len(dir.Entries), dir.Entries)
	}

	scripts := dir.Entries[0]
	if scripts.Name != "scripts" || !scripts.IsDir || scripts.Size != "4.0K" {
		t.Errorf("scripts entry = %+v", scripts)
	}
	cfg := dir.Entries[1]
	if cfg.Name != "config.boot" || cfg.IsDir {
		t.Errorf("config.boot entry = %+v", cfg)
	}
	backup := dir.Entries[2]
	if backup.Name != "backup.sh" || backup.IsDir {
		t.Errorf("backup.sh entry (should have '*' stripped) = %+v", backup)
	}
	link := dir.Entries[3]
	if link.Name != "current" || link.LinkTarget != "config.boot" {
		t.Errorf("current entry = %+v", link)
	}
}

func TestParseShowFile_DirectoryListing_SkipsUnparseableLines(t *testing.T) {
	raw := "########## DIRECTORY LISTING ##########\n" +
		"Path:\t /config\n" +
		"total 4\n" +
		"this line does not look like an ls -l row at all\n" +
		"-rw-r--r--  1 root  123 Jan  1 00:00 config.boot\n"

	dir, _, err := vyos.ParseShowFile("/config", raw)
	if err != nil {
		t.Fatalf("ParseShowFile: %v", err)
	}
	if len(dir.Entries) != 1 || dir.Entries[0].Name != "config.boot" {
		t.Errorf("Entries = %+v, want just config.boot (unparseable line dropped, not fatal)", dir.Entries)
	}
}

// TestParseShowFile_DirectoryListing_DoesNotRetainRawResponse is a
// regression test for the same memory-retention issue fixed in
// parseFileView, applied to parseLsLine: regexp.FindStringSubmatch's
// results are views into their input, not copies, so each FileEntry's
// short Name/Permissions/Size string was still, transitively, a view
// into the *entire* raw listing response, keeping all of it reachable
// through the GC for as long as any single entry was held.
//
// Uses a handful of *unparseable* filler lines to inflate raw's own
// size without inflating the number of real, retained FileEntry
// structs - deliberately decoupling "raw is huge" from "many entries
// are kept", so the only way retained memory can meaningfully grow is
// via the bug this test guards against, not via ordinary per-entry
// struct/slice overhead at scale.
func TestParseShowFile_DirectoryListing_DoesNotRetainRawResponse(t *testing.T) {
	const paddingLines = 300_000 // ~20MB of raw response text

	// Two GC passes: a single pass can leave a just-freed large
	// allocation's memory counted as live for one more cycle in
	// practice, which is enough to flake a test this size-sensitive.
	runtime.GC()
	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)

	var dir *vyos.DirectoryListing
	func() {
		var b strings.Builder
		b.WriteString("########## DIRECTORY LISTING ##########\n")
		b.WriteString("Path:\t /config\n")
		b.WriteString("total 4\n")
		// Unparseable filler - parseLsLine's regex won't match this,
		// so it's dropped rather than turned into a FileEntry (see
		// TestParseShowFile_DirectoryListing_SkipsUnparseableLines),
		// but it still has to be part of raw for parseDirectoryListing
		// to scan past.
		for i := 0; i < paddingLines; i++ {
			b.WriteString("this line does not look like an ls -l row at all, it is just padding\n")
		}
		b.WriteString("-rw-r--r--  1 root  123 Jan  1 00:00 config.boot\n")
		raw := b.String()

		var file *vyos.FileView
		var err error
		dir, file, err = vyos.ParseShowFile("/config", raw)
		if err != nil {
			t.Fatalf("ParseShowFile: %v", err)
		}
		if file != nil {
			t.Fatalf("expected a directory result, got a file result: %+v", file)
		}
		// raw (and the strings.Builder behind it) goes out of scope
		// here - nothing outside this closure holds a reference.
	}()

	runtime.GC()
	runtime.GC()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)

	if len(dir.Entries) != 1 || dir.Entries[0].Name != "config.boot" {
		t.Fatalf("test setup assumption broken: Entries = %+v, want just config.boot", dir.Entries)
	}
	// The one retained entry's three short strings, plus ordinary
	// allocator overhead - comfortably below what the bug (retaining
	// the full ~20MB raw response via that one entry) would add.
	grew := int64(after.HeapAlloc) - int64(before.HeapAlloc)
	const maxExpectedGrowth = 4 * 1024 * 1024
	if grew > maxExpectedGrowth {
		t.Errorf("heap grew by %d bytes (%.1fMB) across the call, want < %.1fMB - the raw response appears to still be reachable through the one parsed entry", grew, float64(grew)/1024/1024, float64(maxExpectedGrowth)/1024/1024)
	}
}

func TestParseShowFile_FileView_Text(t *testing.T) {
	raw := "########## FILE INFO ##########\n" +
		"Path:\t\t/config/config.boot\n" +
		"Type:\t\tASCII text\n" +
		"Owner:\t\troot:vyattacfg\n" +
		"Permissions:\trw-r--r--\n" +
		"Modified:\t2024-01-01 12:00:00\n" +
		"\n" +
		"########## FILE DATA ##########\n" +
		"set system host-name 'vyos'\n" +
		"commit\n"

	_, fv, err := vyos.ParseShowFile("/config/config.boot", raw)
	if err != nil {
		t.Fatalf("ParseShowFile: %v", err)
	}
	if fv.IsBinary {
		t.Error("IsBinary = true, want false for an ASCII text file")
	}
	if fv.Type != "ASCII text" || fv.Owner != "root:vyattacfg" || fv.Permissions != "rw-r--r--" {
		t.Errorf("metadata = %+v", fv)
	}
	if !strings.Contains(fv.Content, "set system host-name 'vyos'") {
		t.Errorf("Content = %q, missing expected line", fv.Content)
	}
}

// TestParseShowFile_FileView_ContentContainingTheDirectoryListingHeader
// is a regression test: ParseShowFile used to dispatch on
// strings.Contains(raw, directoryListingHeader) over the *entire*
// payload, including a FileView's own file content. A text file
// (e.g. a backup of this very command's output, or a log that quotes
// it) whose content happened to contain that exact banner string
// would be misclassified as a directory listing instead of a file
// view, silently returning the wrong (and essentially empty) result.
// Detection now only inspects the first line, which content appearing
// later can never affect.
func TestParseShowFile_FileView_ContentContainingTheDirectoryListingHeader(t *testing.T) {
	raw := "########## FILE INFO ##########\n" +
		"Path:\t\t/config/backup.txt\n" +
		"Type:\t\tASCII text\n" +
		"Owner:\t\troot:vyattacfg\n" +
		"Permissions:\trw-r--r--\n" +
		"Modified:\t2024-01-01 12:00:00\n" +
		"\n" +
		"########## FILE DATA ##########\n" +
		"This file is a backup of an earlier 'show file' session:\n" +
		"########## DIRECTORY LISTING ##########\n" +
		"Path: /config\n" +
		"total 8\n" +
		"drwxr-xr-x 2 root vyattacfg 4.0K Jan  1 00:00 scripts\n"

	dir, fv, err := vyos.ParseShowFile("/config/backup.txt", raw)
	if err != nil {
		t.Fatalf("ParseShowFile: %v", err)
	}
	if dir != nil {
		t.Fatalf("got a DirectoryListing, want a FileView - content containing the header text should not affect detection: %+v", dir)
	}
	if fv == nil {
		t.Fatal("fv is nil, want a parsed FileView")
	}
	if !strings.Contains(fv.Content, "DIRECTORY LISTING") {
		t.Errorf("Content = %q, expected the embedded header text to be preserved as ordinary content", fv.Content)
	}
}

func TestParseShowFile_FileView_Binary(t *testing.T) {
	raw := "########## FILE INFO ##########\n" +
		"Path:\t\t/config/some.bin\n" +
		"Type:\t\tdata\n" +
		"Owner:\t\troot:root\n" +
		"Permissions:\trw-r--r--\n" +
		"Modified:\t2024-01-01 12:00:00\n" +
		"\n" +
		"########## FILE DATA ##########\n" +
		"00000000  23 21 2f 62 69 6e 2f 62  61 73 68 0a  |#!/bin/bash.|\n"

	_, fv, err := vyos.ParseShowFile("/config/some.bin", raw)
	if err != nil {
		t.Fatalf("ParseShowFile: %v", err)
	}
	if !fv.IsBinary {
		t.Error("IsBinary = false, want true for a non-text file() type")
	}
	if !strings.Contains(fv.Content, "23 21 2f 62") {
		t.Errorf("Content = %q, want the hexdump", fv.Content)
	}
}

func TestParseShowFile_FileView_TruncatesLargeContent(t *testing.T) {
	huge := strings.Repeat("x", 3*1024*1024)
	raw := "########## FILE INFO ##########\n" +
		"Type:\t\tASCII text\n" +
		"\n" +
		"########## FILE DATA ##########\n" +
		huge

	_, fv, err := vyos.ParseShowFile("/config/huge.txt", raw)
	if err != nil {
		t.Fatalf("ParseShowFile: %v", err)
	}
	if !fv.Truncated {
		t.Error("Truncated = false, want true for content over the max size")
	}
	if len(fv.Content) != 2*1024*1024 {
		t.Errorf("len(Content) = %d, want exactly the 2MB cap", len(fv.Content))
	}
}

// TestParseShowFile_FileView_TruncationDoesNotRetainOriginalBackingArray
// is a regression test for a memory-retention bug: truncating via a
// bare re-slice (content[:n]) shares the *original* string's backing
// array, so the entire untruncated content - up to multiple hundred
// MB, since VyOS's own `show file` has no size limit - stayed
// reachable through the GC for as long as the "truncated" result was
// held, defeating the whole point of truncating it.
//
// A direct pointer comparison isn't a reliable way to test this
// (strings.Join's own single-element shortcut and strings.Split's
// substring-views mean the untruncated content's backing array isn't
// simply "the original literal passed in" - tracing the exact chain
// is an internal implementation detail, not something worth asserting
// on directly). Measuring actual heap retention after dropping every
// other reference is unambiguous regardless of that internal
// plumbing: if the multi-MB source is still reachable only through
// fv.Content, live heap size after a GC will reflect that.
func TestParseShowFile_FileView_TruncationDoesNotRetainOriginalBackingArray(t *testing.T) {
	const hugeSize = 20 * 1024 * 1024

	// Two GC passes: a single pass can leave a just-freed large
	// allocation's memory counted as live for one more cycle in
	// practice, which is enough to flake a test this size-sensitive.
	runtime.GC()
	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)

	var fv *vyos.FileView
	func() {
		raw := "########## FILE INFO ##########\n" +
			"Type:\t\tASCII text\n" +
			"\n" +
			"########## FILE DATA ##########\n" +
			strings.Repeat("x", hugeSize)
		var err error
		_, fv, err = vyos.ParseShowFile("/config/huge.txt", raw)
		if err != nil {
			t.Fatalf("ParseShowFile: %v", err)
		}
		// raw (and everything built from it, other than fv.Content
		// itself) goes out of scope here - nothing outside this
		// closure holds a reference to it.
	}()

	runtime.GC()
	runtime.GC()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)

	if !fv.Truncated || len(fv.Content) != 2*1024*1024 {
		t.Fatalf("test setup assumption broken: Truncated=%v len(Content)=%d", fv.Truncated, len(fv.Content))
	}
	// Measures the *delta* across the call, not an absolute heap
	// size, so this is robust to whatever baseline overhead the test
	// binary/runtime/GC itself carries. The only thing still reachable
	// after the closure returns is fv.Content (~2MB) - a generous 8MB
	// growth allowance comfortably covers that plus incidental
	// allocator overhead/fragmentation, while remaining far below the
	// ~20MB the bug (retaining the full untruncated source) would add.
	grew := int64(after.HeapAlloc) - int64(before.HeapAlloc)
	const maxExpectedGrowth = 8 * 1024 * 1024
	if grew > maxExpectedGrowth {
		t.Errorf("heap grew by %d bytes (%.1fMB) across the call, want < %.1fMB - the untruncated ~%dMB source appears to still be reachable through the truncated result", grew, float64(grew)/1024/1024, float64(maxExpectedGrowth)/1024/1024, hugeSize/1024/1024)
	}
}

func TestParseShowFile_UnrecognizedOutput_ReturnsError(t *testing.T) {
	_, _, err := vyos.ParseShowFile("/whatever", "Error: File or directory /whatever not found.\n")
	if err == nil {
		t.Fatal("expected an error for output matching neither known header")
	}
}

func TestShowFile_Directory(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["file /config"] = "########## DIRECTORY LISTING ##########\n" +
		"Path:\t /config\n" +
		"total 4\n" +
		"-rw-r--r--  1 root  123 Jan  1 00:00 config.boot\n"

	dir, file, err := c.ShowFile(context.Background(), "/config")
	if err != nil {
		t.Fatalf("ShowFile: %v", err)
	}
	if file != nil {
		t.Fatalf("expected a directory result, got %+v", file)
	}
	if len(dir.Entries) != 1 || dir.Entries[0].Name != "config.boot" {
		t.Errorf("Entries = %+v", dir.Entries)
	}
}

func TestShowFile_PropagatesVyOSError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowErrors["file /config/nonexistent"] = "File or directory /config/nonexistent not found."

	_, _, err := c.ShowFile(context.Background(), "/config/nonexistent")
	if err == nil {
		t.Fatal("expected an error")
	}
	apiErr, ok := err.(*vyos.APIError)
	if !ok {
		t.Fatalf("expected *vyos.APIError, got %T: %v", err, err)
	}
	if !strings.Contains(apiErr.Message, "not found") {
		t.Errorf("Message = %q", apiErr.Message)
	}
}
