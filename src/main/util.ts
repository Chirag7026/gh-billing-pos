import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat as any);

export const fmtDate = (d: Date = new Date()) => dayjs(d).format('DD/MM/YYYY');
export const fmtTime = (d: Date = new Date()) => dayjs(d).format('HH:mm:ss');
export const parseDMY = (s: string) => dayjs(s, 'DD/MM/YYYY').toDate();

export function padBillNo(n: number, width = 5): string {
  return String(n).padStart(width, '0');
}

/** Next numeric barcode: max(existing numeric barcodes) + 1, preserving width. */
export function nextBarcode(maxBarcode: string | null, fallback = '10001'): string {
  if (!maxBarcode || !/^\d+$/.test(maxBarcode)) return fallback;
  const width = maxBarcode.length;
  const next = (parseInt(maxBarcode, 10) + 1).toString();
  return next.padStart(Math.max(width, next.length), '0');
}

/** Next bill no: max numeric billNo + 1, padded to same width (default 5). */
export function nextBillNo(maxBillNo: string | null, width = 5): string {
  if (!maxBillNo || !/^\d+$/.test(maxBillNo)) return padBillNo(1, width);
  const w = Math.max(width, maxBillNo.length);
  return padBillNo(parseInt(maxBillNo, 10) + 1, w);
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Wildcard search: `*`/`%` match zero or more chars, `?`/`_` match exactly
 * one char. Everything else is regex-escaped. Case-insensitive, partial
 * match (no ^$ anchors) so plain text still behaves like "contains".
 */
export function wildcardToRegExp(q: string): RegExp {
  let out = '';
  for (const ch of q) {
    if (ch === '*' || ch === '%') out += '.*';
    else if (ch === '?' || ch === '_') out += '.';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(out, 'i');
}
