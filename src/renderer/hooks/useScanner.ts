import { useEffect, useRef } from 'react';

interface Opts {
  /** Minimum chars to treat as a scan (wedge scanners dump fast). */
  minLength?: number;
  /** Gap (ms) after last keystroke before firing. Spec: automated debounce. */
  debounceMs?: number;
  /** Max interval between keystrokes to still count as scanner (vs typing). */
  scanGapMs?: number;
  enabled?: boolean;
  onScan: (code: string) => void;
}

/** Marker attribute for the dedicated barcode input (exempt from Enter-as-Tab). */
export const SCANNER_ATTR = 'data-barcode-field';

function isInScannerField(el: EventTarget | null): boolean {
  return !!(el as HTMLElement)?.closest?.(`[${SCANNER_ATTR}]`);
}

/**
 * Barcode-scanner listener for keystroke-wedge scanners (USB HID acting as
 * keyboard). Scanner input arrives as a burst of fast keystrokes + Enter.
 *
 * Enter ownership rules (shared with useEnterAsTab via preventDefault):
 * - Focus inside `[data-scanner-input]` → Enter ALWAYS resolves the code
 *   (human-typed or wedge burst), consumes the event, never moves focus.
 * - Focus elsewhere → Enter resolves ONLY for scanner-fast bursts
 *   (whole burst ≤ len×60ms and Enter lands ≤200ms after the last key).
 *   Slow typing + Enter is left alone so Enter-as-Tab can advance the form.
 */
export function useScanner({ minLength = 3, debounceMs = 60, scanGapMs = 50, enabled = true, onScan }: Opts) {
  const buf = useRef('');
  const firstT = useRef(0);
  const lastT = useRef(0);
  const timer = useRef<any>(null);
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const reset = () => {
      buf.current = '';
      firstT.current = 0;
      lastT.current = 0;
    };
    const push = (ch: string) => {
      const now = performance.now();
      if (buf.current.length > 0 && now - lastT.current > Math.max(scanGapMs * 6, 200)) {
        // Long pause — previous burst ended without Enter; restart.
        buf.current = '';
        firstT.current = 0;
      }
      if (!buf.current) firstT.current = now;
      lastT.current = now;
      buf.current += ch;
    };
    /** Scanner-fast = whole burst arrived at wedge speed (≤60ms/char). */
    const isFastBurst = () => {
      const len = buf.current.trim().length;
      if (len === 0) return false;
      return lastT.current - firstT.current <= len * 60;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const code = buf.current.trim();
        const fast = isFastBurst();
        const gapOk = e.timeStamp > 0 && e.timeStamp - lastT.current <= 200;
        reset();
        if (timer.current) clearTimeout(timer.current);
        if (code.length >= minLength && (isInScannerField(e.target) || (fast && gapOk))) {
          // Consumed: onScan owns this Enter (resolve + keep focus).
          // preventDefault signals useEnterAsTab to skip focus-advance.
          e.preventDefault();
          cb.current(code);
        }
        return;
      }
      if (e.key.length !== 1) {
        // Non-printable (F1..F12, arrows, etc.) — reset buffer
        if (!['Shift'].includes(e.key)) reset();
        return;
      }
      // Ignore modifier combos (shortcuts)
      if (e.ctrlKey || e.altKey || e.metaKey) {
        reset();
        return;
      }
      push(e.key);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // Debounced auto-fire: wedge scanners sometimes omit Enter.
        // Fire only for scan-field focus or fast bursts — slow typing in
        // ordinary fields must not trigger product lookups.
        const code = buf.current.trim();
        const fire =
          code.length >= Math.max(minLength, 6) &&
          (isInScannerField(document.activeElement) || isFastBurst());
        reset();
        if (fire) cb.current(code);
      }, debounceMs);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, minLength, debounceMs, scanGapMs]);
}
