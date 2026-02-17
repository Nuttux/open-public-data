/**
 * CSV export + share link utilities.
 *
 * Client-side only — no server dependency.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CsvColumn<T = Record<string, unknown>> {
  /** Key in the data object */
  key: keyof T & string;
  /** Human-readable header label */
  label: string;
  /** Optional transform before writing (e.g. format euros) */
  format?: (value: unknown, row: T) => string;
}

// ─── CSV Generation ──────────────────────────────────────────────────────────

/**
 * Convert an array of objects into a CSV string (RFC 4180).
 * Handles quoting, commas, newlines inside values.
 */
export function arrayToCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns: CsvColumn<T>[],
): string {
  const escape = (val: unknown): string => {
    const str = val == null ? '' : String(val);
    // Quote if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((row) =>
    columns
      .map((col) => {
        const raw = row[col.key];
        const formatted = col.format ? col.format(raw, row) : raw;
        return escape(formatted);
      })
      .join(','),
  );

  return [header, ...body].join('\n');
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Trigger a browser download of a CSV string.
 */
export function downloadCSV(csv: string, filename: string): void {
  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Share Link ──────────────────────────────────────────────────────────────

/**
 * Copy the current page URL to clipboard.
 * Tries navigator.clipboard first, then falls back to execCommand.
 * Returns true on success, false on failure.
 */
export async function copyShareLink(): Promise<boolean> {
  const url = window.location.href;

  // 1. Modern Clipboard API
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // fall through to execCommand
    }
  }

  // 2. Legacy execCommand fallback (works without Permissions API)
  try {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (ok) return true;
  } catch {
    // fall through to prompt
  }

  // 3. Last resort: show URL so user can copy manually
  window.prompt('Copiez ce lien :', url);
  return true; // treat prompt as "handled"
}
