// Tracks open unsaved bills/invoices so the TitleBar ✕ can warn before exit.
// Pages with draft state (SaleAdd, PurchaseAdd) call setUnsaved(key, rows>0).
const dirty = new Set<string>();
const listeners = new Set<() => void>();

export function setUnsaved(key: string, on: boolean) {
  const had = dirty.size > 0;
  if (on) dirty.add(key);
  else dirty.delete(key);
  if ((dirty.size > 0) !== had) listeners.forEach((l) => l());
}

export function hasUnsaved(): boolean {
  return dirty.size > 0;
}

export function unsavedKeys(): string[] {
  return [...dirty];
}

export function subscribeUnsaved(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
