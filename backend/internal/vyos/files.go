package vyos

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// fileShowTimeout is used (via ShowWithTimeout) for every `show file
// <path>` call, in place of Client's normal ~30s default - a
// directory listing or a large file's contents can legitimately take
// longer than this app's other, well-bounded op-mode calls, the same
// reasoning ShowLogTail's logFetchTimeout documents. Deliberately kept
// under the backend's own http.Server.WriteTimeout (60s).
const fileShowTimeout = 45 * time.Second

// maxFileViewContentBytes bounds how much of a file's content (or, for
// a binary file, its hexdump) this backend will hold onto and return
// to the frontend. VyOS's `show file <path>` has no size limit of its
// own at all - `file.py` streams a text file's entire content, or
// hexdumps a binary one entirely, regardless of size (the same class
// of "unbounded op-mode command" issue that once caused the "system"
// log source to time out - see logs.go). This backend can't ask VyOS
// for a partial read (no such flag exists), so it can't avoid paying
// the cost of VyOS generating the full output server-side, but it can
// at least avoid holding/returning a pathologically large response
// itself by truncating client-side, the same accepted trade-off
// ShowLogTail already makes for per-service log sources.
const maxFileViewContentBytes = 2 * 1024 * 1024

// FileEntry is one row of a directory listing, parsed from `ls -hlFGL
// --group-directories-first`'s plain-text output - VyOS's `show file
// <path>` op-mode command has no JSON form at all (see vyos-1x's
// src/op_mode/file.py, show_locally()). Size/Modified are kept exactly
// as `ls -h` printed them (e.g. "4.0K", "Jan  1 00:00") rather than
// re-derived into bytes/a parsed time.Time - `-h` already rounds for
// display, and `ls` omits the year for anything not from the last ~6
// months, which would make a naive guessed year actively misleading.
type FileEntry struct {
	Name        string
	IsDir       bool
	Permissions string
	Size        string
	Modified    string
	// LinkTarget is set only when this entry is a symbolic link. `-L`
	// still makes `ls` report the *target's* type/size/permissions
	// for the rest of the row (so IsDir reflects the target, not the
	// link itself), but the "name -> target" arrow notation is
	// independent of that and still shown.
	LinkTarget string
}

// DirectoryListing is a parsed `show file <path>` result for a
// directory.
type DirectoryListing struct {
	Path    string
	Entries []FileEntry
}

// FileView is a parsed `show file <path>` result for a regular file.
type FileView struct {
	Path        string
	Type        string // from file(1), e.g. "ASCII text"
	Owner       string
	Permissions string
	Modified    string
	// IsBinary is true when file.py's own `file(1)`-based check
	// decided this wasn't human-readable text, in which case Content
	// is a `hexdump -C` dump rather than the file's literal contents.
	IsBinary bool
	Content  string
	// Truncated is true when Content was cut short at
	// maxFileViewContentBytes - see that constant's doc comment.
	Truncated bool
}

const (
	directoryListingHeader = "########## DIRECTORY LISTING ##########"
	fileInfoHeader         = "########## FILE INFO ##########"
	fileDataHeader         = "########## FILE DATA ##########"
)

// lsLineRE matches one `ls -hlFGL --group-directories-first` entry
// line: permissions, link count, owner, size, month, day,
// time-or-year, name. `-G` suppresses the group column entirely
// (otherwise present between owner and size in plain `ls -l`).
var lsLineRE = regexp.MustCompile(`^([a-zA-Z?-]{10})\s+\d+\s+(\S+)\s+(\S+)\s+(\w{3})\s+(\d+)\s+([\d:]+)\s+(.+)$`)

// ParseShowFile parses the raw text `show file <path>` returns into
// either a DirectoryListing or a FileView, whichever VyOS decided the
// path was - file.py's show_locally() branches on
// os.path.isdir/os.path.isfile server-side, and there's no way to
// know which to expect ahead of making the call.
//
// Format detection only inspects the first line of raw, not the whole
// payload: for a FileView, everything after the FILE DATA marker is
// the file's own (arbitrary, untrusted) content, and a
// strings.Contains over the entire string would misclassify a file
// whose content happens to contain either header verbatim - e.g. a
// log or backup of this very output format - silently returning the
// wrong (or an empty) result with no error. VyOS always emits one of
// these two headers as the literal first line, before any content
// exists to collide with it.
func ParseShowFile(path, raw string) (*DirectoryListing, *FileView, error) {
	firstLine, _, _ := strings.Cut(raw, "\n")
	firstLine = strings.TrimRight(firstLine, "\r")
	switch firstLine {
	case directoryListingHeader:
		return parseDirectoryListing(path, raw), nil, nil
	case fileInfoHeader:
		fv, err := parseFileView(path, raw)
		return nil, fv, err
	default:
		return nil, nil, fmt.Errorf("vyos: unrecognized 'show file' output for %q", path)
	}
}

func parseDirectoryListing(path, raw string) *DirectoryListing {
	listing := &DirectoryListing{Path: path, Entries: []FileEntry{}}
	inBody := false
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.Contains(line, directoryListingHeader) {
			inBody = true
			continue
		}
		if !inBody {
			continue
		}
		if strings.HasPrefix(line, "Path:") || strings.HasPrefix(line, "total ") || strings.TrimSpace(line) == "" {
			continue
		}
		if entry, ok := parseLsLine(line); ok {
			listing.Entries = append(listing.Entries, entry)
		}
	}
	return listing
}

// parseLsLine's regexp submatches (m[1], m[3], ...) are views into
// line's own backing array, not copies (regexp.FindStringSubmatch
// slices its input rather than allocating) - and line itself,
// transitively, views into the full raw `show file` response. Each
// FileEntry field stored here is explicitly strings.Clone'd (or, for
// Modified, already independent - strings.Join of more than one
// element always builds a fresh buffer) so a large directory listing
// doesn't keep its entire raw response text reachable through the GC
// for as long as any single entry's short Name/Permissions/Size
// string is - the same class of retention issue fixed in
// parseFileView just above.
func parseLsLine(line string) (FileEntry, bool) {
	m := lsLineRE.FindStringSubmatch(line)
	if m == nil {
		return FileEntry{}, false
	}
	perm, size, month, day, timeOrYear, name := m[1], m[3], m[4], m[5], m[6], m[7]

	entry := FileEntry{
		Permissions: strings.Clone(perm),
		Size:        strings.Clone(size),
		Modified:    strings.Join([]string{month, day, timeOrYear}, " "),
		IsDir:       strings.HasPrefix(perm, "d"),
	}

	if arrow := strings.Index(name, " -> "); arrow != -1 {
		entry.LinkTarget = strings.Clone(strings.TrimSuffix(name[arrow+len(" -> "):], "/"))
		name = name[:arrow]
	}
	// -F appends a single trailing indicator character: / for
	// directories, * for executables, = for sockets, | for FIFOs.
	// Stripped for the display/navigable name; IsDir is keyed off the
	// permission bits above instead, since that's authoritative.
	entry.Name = strings.Clone(strings.TrimRight(name, "/*=|"))
	return entry, true
}

// parseFileView parses the metadata block and content of a `show file
// <path>` FileView response. Every field it extracts is explicitly
// strings.Clone'd before being stored (see the inline comments below)
// rather than left as whatever substring strings.TrimPrefix/TrimSpace/
// slicing happened to produce: those operations re-slice rather than
// copy, so even a small, few-byte-long result (e.g. fv.Type) is still
// a view into raw's own, potentially multi-hundred-MB backing array
// (VyOS's own `show file` has no size limit at all - see
// maxFileViewContentBytes's doc comment) unless cloned. Keeping even
// one un-cloned field alive would keep the *entire* raw response
// reachable through the GC right along with it, regardless of how
// aggressively Content itself is truncated.
func parseFileView(path, raw string) (*FileView, error) {
	fv := &FileView{Path: path}
	lines := strings.Split(raw, "\n")
	dataHeaderLine := -1
	for i, line := range lines {
		line = strings.TrimRight(line, "\r")
		switch {
		case strings.HasPrefix(line, "Type:"):
			fv.Type = strings.Clone(strings.TrimSpace(strings.TrimPrefix(line, "Type:")))
		case strings.HasPrefix(line, "Owner:"):
			fv.Owner = strings.Clone(strings.TrimSpace(strings.TrimPrefix(line, "Owner:")))
		case strings.HasPrefix(line, "Permissions:"):
			fv.Permissions = strings.Clone(strings.TrimSpace(strings.TrimPrefix(line, "Permissions:")))
		case strings.HasPrefix(line, "Modified:"):
			fv.Modified = strings.Clone(strings.TrimSpace(strings.TrimPrefix(line, "Modified:")))
		case strings.Contains(line, fileDataHeader):
			dataHeaderLine = i
		}
		if dataHeaderLine != -1 {
			break
		}
	}
	if dataHeaderLine == -1 {
		return nil, fmt.Errorf("vyos: 'show file' output for %q had no FILE DATA section", path)
	}

	fv.IsBinary = !strings.Contains(fv.Type, "text")
	content := strings.Join(lines[dataHeaderLine+1:], "\n")
	if len(content) > maxFileViewContentBytes {
		content = content[:maxFileViewContentBytes]
		fv.Truncated = true
	}
	// strings.Clone, not a bare re-slice: slicing (or, for an
	// untruncated file, strings.Join's own single-element shortcut of
	// returning its input unchanged) shares the original's backing
	// array, so content alone - truncated or not - would otherwise
	// keep the *entire* untruncated raw response reachable through the
	// GC for as long as this result is held, defeating the whole
	// point of truncating it in the first place.
	content = strings.Clone(content)
	fv.Content = content
	return fv, nil
}

// ShowFile runs `show file <path>` and parses the result into either
// a DirectoryListing or a FileView - see ParseShowFile. Callers are
// responsible for restricting path to whatever roots this app
// considers safe to expose (VyOS itself imposes no restriction at all
// on what show file can read).
func (c *Client) ShowFile(ctx context.Context, path string) (*DirectoryListing, *FileView, error) {
	raw, err := c.ShowWithTimeout(ctx, []string{"file", path}, fileShowTimeout)
	if err != nil {
		return nil, nil, err
	}
	return ParseShowFile(path, raw)
}
