import { useEffect } from 'react';
import { SCANNER_ATTR } from './useScanner';

const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PASSTHROUGH_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'file',
  'submit',
  'button',
  'reset',
  'image',
  'range',
  'color'
]);

function isVisible(el: Element): boolean {
  return (el as HTMLElement).getClientRects().length > 0;
}

function nextFocusable(current: HTMLElement): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
  const i = all.indexOf(current);
  if (i < 0) return null;
  return all[i + 1] ?? null; // no wrap: Enter on the last field stays put
}

/**
 * Global Enter-as-Tab: Enter in any standard input/select moves focus to the
 * next sequential field and auto-selects its text.
 *
 * Exemptions (Enter keeps native behavior):
 * - `[data-scanner-input]` (barcode field: resolve + keep focus, owned by useScanner)
 * - textarea / button / link, checkbox/radio/file/range/color inputs
 * - modifier combos (Ctrl/Alt/Meta/Shift+Enter)
 * - events already preventDefaulted (e.g. consumed by useScanner as a scan)
 *
 * Mount ONCE near the app root. Page-level useScanner listeners register
 * first (child effects run before parent effects), so a consumed scan Enter
 * is always marked before this handler runs.
 */
export function useEnterAsTab(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest(`[${SCANNER_ATTR}]`)) return; // barcode exemption
      const tag = (t.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
      if (tag === 'INPUT') {
        const type = ((t as HTMLInputElement).type || 'text').toLowerCase();
        if (PASSTHROUGH_INPUT_TYPES.has(type)) return;
      }
      if (tag !== 'INPUT' && tag !== 'SELECT') return;
      const next = nextFocusable(t);
      if (!next) return; // last field: leave focus (and native behavior) alone
      e.preventDefault();
      next.focus();
      try {
        (next as HTMLInputElement).select?.();
      } catch {
        /* non-text controls have no select() */
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** Mount-once component form for App root. */
export default function EnterAsTab() {
  useEnterAsTab(true);
  return null;
}
