// Utility to escape and normalize text for Bluesky posts
// - Escapes problematic Unicode, invisible, and control characters
// - Optionally normalizes line endings and whitespace

export function escapeBlueskyText(text: string): string {
  // Remove control characters except for common whitespace (tab, newline)
  let safe = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

  // Replace problematic Unicode (e.g., directional isolates, ZWJ/ZWNJ, etc.)
  safe = safe.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');

  // Normalize whitespace: collapse multiple spaces, remove leading/trailing
  safe = safe.replace(/[ \t\xA0]{2,}/g, ' ');
  safe = safe.trim();

  // Optionally, normalize line endings
  safe = safe.replace(/\r\n?/g, '\n');

  return safe;
}
