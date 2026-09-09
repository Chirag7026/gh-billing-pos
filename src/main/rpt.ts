/**
 * rpt — custom print-format templates (`.rpt` JSON files imported in Settings).
 *
 * Two kinds:
 *   receipt — 80mm thermal cash-memo layout (widths, titles, columns, footer)
 *   label   — 50x25mm barcode sticker overrides (brand, fonts, heights)
 *
 * Pure module (no electron imports) so it is trivially unit-testable.
 * Placeholders in text lines: {brand} {date} {time} {billNo} {customer}
 * {paymentType} {pricingMode} {itemCount} {packQty} {units} {subTotal} {grandTotal}
 */
import * as fs from 'node:fs';

export type RptKind = 'receipt' | 'label';

export interface ReceiptColumn {
  key: 'no' | 'name' | 'pack' | 'qty' | 'rate' | 'amount';
  label: string;
  width: number;
}

export interface ReceiptTemplate {
  kind: 'receipt';
  name: string;
  width?: number; // chars per line, default 42
  title?: string[]; // centered title lines, default ['G H']
  meta?: string[]; // header lines w/ placeholders (default cash-memo block)
  columns?: ReceiptColumn[]; // default classic 6-col layout
  summary?: string[]; // lines w/ placeholders (default item/qty/subtotal)
  grandTotalLabel?: string; // default 'Grand Total'
  grandTotalDouble?: boolean; // default true (ESC/POS double-size line)
  footer?: string[]; // default ['.','.','.','.','Note : ']
  feedLines?: number; // default 3
  cut?: boolean; // default true
}

export interface LabelTemplate {
  kind: 'label';
  name: string;
  brandHeader?: string; // default: app brand header
  titleMaxLen?: number; // default 24
  showPack?: boolean; // default true
  codeFont?: string; // TSPL font "2"|"3"|"4", default "4"
  barcodeHeight?: number; // default 45
}

export type RptTemplate = ReceiptTemplate | LabelTemplate;

export interface BillLike {
  billNo: string;
  date: string;
  time: string;
  paymentType: string;
  pricingMode: string;
  customerName: string;
  items: { name: string; barcode: string; pack: number; qty: number; unit?: string; rate: number; amount: number }[];
  totalItems: number;
  totalPackQty: number;
  totalUnits: number;
  subTotal: number;
  grandTotal: number;
}

export const DEFAULT_COLUMNS: ReceiptColumn[] = [
  { key: 'no', label: 'No.', width: 3 },
  { key: 'name', label: 'Particulars', width: 16 },
  { key: 'pack', label: 'Pack', width: 6 },
  { key: 'qty', label: 'Qty.', width: 6 },
  { key: 'rate', label: 'Rate', width: 6 },
  { key: 'amount', label: 'Amount', width: 7 }
];

const DEFAULT_META = [
  'Cash Memo               Date  :{date}',
  'Time  :{time}       No.   :{billNo}',
  'M/s.  {customer}'
];
const DEFAULT_SUMMARY = ['Item: {itemCount} Qty: {packQty} - {units}  Sub Total {subTotal}'];
const DEFAULT_FOOTER = ['.', '.', '.', '.', 'Note : '];

export function normalizeReceipt(t: any): ReceiptTemplate {
  if (!t || typeof t !== 'object') throw new Error('Receipt template must be a JSON object');
  const cols = Array.isArray(t.columns) && t.columns.length ? t.columns : DEFAULT_COLUMNS;
  for (const c of cols) {
    if (!['no', 'name', 'pack', 'qty', 'rate', 'amount'].includes(c.key)) throw new Error(`Bad column key: ${c.key}`);
    if (!Number.isFinite(Number(c.width)) || Number(c.width) < 2) throw new Error(`Bad width for column ${c.key}`);
  }
  return {
    kind: 'receipt',
    name: String(t.name || 'Custom Receipt'),
    width: Math.min(64, Math.max(24, Number(t.width) || 42)),
    title: Array.isArray(t.title) ? t.title.map(String) : ['G H'],
    meta: Array.isArray(t.meta) ? t.meta.map(String) : [...DEFAULT_META],
    columns: cols.map((c: any) => ({ key: c.key, label: String(c.label ?? c.key), width: Number(c.width) })),
    summary: Array.isArray(t.summary) ? t.summary.map(String) : [...DEFAULT_SUMMARY],
    grandTotalLabel: String(t.grandTotalLabel ?? 'Grand Total'),
    grandTotalDouble: t.grandTotalDouble !== false,
    footer: Array.isArray(t.footer) ? t.footer.map(String) : [...DEFAULT_FOOTER],
    feedLines: Math.min(9, Math.max(0, Number(t.feedLines ?? 3))),
    cut: t.cut !== false
  };
}

export function normalizeLabel(t: any): LabelTemplate {
  if (!t || typeof t !== 'object') throw new Error('Label template must be a JSON object');
  const font = String(t.codeFont ?? '4');
  if (!['2', '3', '4'].includes(font)) throw new Error(`Bad codeFont: ${font} (use 2, 3 or 4)`);
  return {
    kind: 'label',
    name: String(t.name || 'Custom Label'),
    brandHeader: t.brandHeader !== undefined ? String(t.brandHeader) : undefined,
    titleMaxLen: Math.min(40, Math.max(4, Number(t.titleMaxLen ?? 24))),
    showPack: t.showPack !== false,
    codeFont: font,
    barcodeHeight: Math.min(80, Math.max(20, Number(t.barcodeHeight ?? 45)))
  };
}

/** Parse + validate a `.rpt` file. Throws with a human-readable reason. */
export function parseRptFile(filePath: string): RptTemplate {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Cannot read file: ${filePath}`);
  }
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (e: any) {
    throw new Error(`Invalid .rpt (must be JSON): ${String(e?.message || e)}`);
  }
  if (data.kind === 'receipt') return normalizeReceipt(data);
  if (data.kind === 'label') return normalizeLabel(data);
  throw new Error(`Unknown template kind: ${JSON.stringify(data.kind)} (expected "receipt" or "label")`);
}

// ---------------- receipt rendering ----------------
function sub(line: string, bill: BillLike, brand: string): string {
  const m: Record<string, string> = {
    brand, date: bill.date, time: bill.time, billNo: bill.billNo,
    customer: bill.customerName, paymentType: bill.paymentType, pricingMode: bill.pricingMode,
    itemCount: String(bill.totalItems), packQty: String(bill.totalPackQty), units: String(bill.totalUnits),
    subTotal: Number(bill.subTotal).toFixed(2), grandTotal: Number(bill.grandTotal).toFixed(2)
  };
  return line.replace(/\{(\w+)\}/g, (_, k) => (m[k] !== undefined ? m[k] : `{${k}}`));
}

const center = (s: string, w: number) => {
  if (s.length >= w) return s.slice(0, w);
  const l = Math.floor((w - s.length) / 2);
  return ' '.repeat(l) + s + ' '.repeat(w - s.length - l);
};

function cellText(col: ReceiptColumn, item: BillLike['items'][number], idx: number): string {
  const f2 = (n: number) => Number(n).toFixed(2);
  switch (col.key) {
    case 'no': return String(idx + 1).padEnd(col.width, ' ').slice(0, col.width);
    case 'name': return item.name.slice(0, col.width).padEnd(col.width, ' ');
    case 'pack': return f2(item.pack).padStart(col.width, ' ').slice(-col.width);
    case 'qty': return f2(item.qty).padStart(col.width, ' ').slice(-col.width);
    case 'rate': return f2(item.rate).padStart(col.width, ' ').slice(-col.width);
    case 'amount': return f2(item.amount).padStart(col.width, ' ').slice(-col.width);
  }
}

function headerText(col: ReceiptColumn): string {
  const num = col.key !== 'no' && col.key !== 'name';
  const t = col.label.slice(0, col.width);
  return num ? t.padStart(col.width, ' ') : t.padEnd(col.width, ' ');
}

export interface RenderedLine {
  text: string;
  double?: boolean;
}

/** Render a bill through a receipt template (ESC/POS-ready lines). */
export function renderReceipt(bill: BillLike, tpl: ReceiptTemplate, brand: string): RenderedLine[] {
  const w = tpl.width || 42;
  const div = '-'.repeat(w);
  const L: RenderedLine[] = [];
  for (const t of tpl.title || []) L.push({ text: center(sub(t, bill, brand), w) });
  L.push({ text: div });
  for (const m of tpl.meta || []) L.push({ text: sub(m, bill, brand).slice(0, w) });
  L.push({ text: div });
  const cols = tpl.columns && tpl.columns.length ? tpl.columns : DEFAULT_COLUMNS;
  L.push({ text: cols.map(headerText).join(' ').slice(0, w) });
  L.push({ text: div });
  const nameCol = cols.find((c) => c.key === 'name');
  bill.items.forEach((item, i) => {
    const cells = cols.map((c) => (c.key === 'name' && nameCol ? item.name.slice(0, c.width).padEnd(c.width, ' ') : cellText(c, item, i)));
    L.push({ text: cells.join(' ').slice(0, w) });
    if (nameCol && item.name.length > nameCol.width) {
      L.push({ text: ('    ' + item.name.slice(nameCol.width)).slice(0, w) });
    }
  });
  L.push({ text: div });
  for (const s of tpl.summary || []) L.push({ text: sub(s, bill, brand).slice(0, w) });
  L.push({ text: div });
  const gt = `${tpl.grandTotalLabel || 'Grand Total'}${' '.repeat(Math.max(1, w - (tpl.grandTotalLabel || 'Grand Total').length - Number(bill.grandTotal).toFixed(2).length))}${Number(bill.grandTotal).toFixed(2)}`;
  L.push({ text: gt.slice(0, w), double: tpl.grandTotalDouble !== false });
  L.push({ text: div });
  for (const f of tpl.footer || []) L.push({ text: sub(f, bill, brand).slice(0, w) });
  for (let i = 0; i < (tpl.feedLines ?? 3); i++) L.push({ text: '' });
  return L;
}

export function renderReceiptText(bill: BillLike, tpl: ReceiptTemplate, brand: string): string {
  return renderReceipt(bill, tpl, brand)
    .map((l) => l.text)
    .join('\n');
}

// ---------------- samples ----------------
export function sampleReceiptTemplate(): ReceiptTemplate {
  return normalizeReceipt({
    kind: 'receipt',
    name: 'Sample 80mm Receipt',
    width: 42,
    title: ['G H', 'MAIN ROAD, CITY', 'PHONE: 98110 12345'],
    meta: [...DEFAULT_META, 'C/D: {paymentType}   Mode: {pricingMode}'],
    columns: DEFAULT_COLUMNS,
    summary: [...DEFAULT_SUMMARY],
    grandTotalLabel: 'Grand Total',
    grandTotalDouble: true,
    footer: [...DEFAULT_FOOTER, 'Thank you, visit again!'],
    feedLines: 3,
    cut: true
  });
}

export function sampleLabelTemplate(): LabelTemplate {
  return normalizeLabel({ kind: 'label', name: 'Sample 50x25 Label', showPack: true, codeFont: '4', barcodeHeight: 45, titleMaxLen: 24 });
}
