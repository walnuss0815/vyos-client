/**
 * Triggers a browser "Save As" download for in-memory text content -
 * no server round-trip beyond whatever already fetched the content
 * (e.g. getSetCommands()/getConfigTree()). Used by the Config Tree
 * page's export buttons.
 */
export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Timestamp suffix for export filenames, e.g. "2026-08-27T14-30-00". */
export function exportTimestamp(date = new Date()): string {
  return date.toISOString().replace(/:/g, '-').replace(/\..+$/, '')
}
