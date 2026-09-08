import { useEffect } from 'react';

/**
 * V2 strict all-caps: programmatically uppercases text entry globally
 * (CSS `text-transform` handles display; this enforces stored values).
 * Capture-phase `input` listener rewrites the DOM value before React's
 * bubble-phase onChange reads it. Passwords/numbers/emails untouched.
 */
export function useAllCaps(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!t) return;
      if (t.tagName === 'TEXTAREA') {
        if (t.value !== t.value.toUpperCase()) t.value = t.value.toUpperCase();
        return;
      }
      if (t.tagName === 'INPUT') {
        const ty = ((t as HTMLInputElement).type || 'text').toLowerCase();
        if (ty !== 'text' && ty !== 'search' && ty !== '') return;
        if (t.value !== t.value.toUpperCase()) t.value = t.value.toUpperCase();
      }
    };
    window.addEventListener('input', onInput, true);
    return () => window.removeEventListener('input', onInput, true);
  }, [enabled]);
}

export default function AllCaps() {
  useAllCaps(true);
  return null;
}
