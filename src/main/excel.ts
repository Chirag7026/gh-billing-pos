/**
 * Legacy Excel 97–2004 (.xls BIFF8) import/export engine (SheetJS `xlsx`).
 * All reads/writes use bookType 'biff8'. Column headers follow the spec exactly.
 */
import * as XLSX from 'xlsx';
import { Product, Ledger, Sale, Purchase } from './models/index.js';
import { nextBarcode } from './util.js';
import { getSettings } from './config.js';

export const PRODUCT_HEADERS = [
  'Product Name', 'Barcode', 'Alias', 'HSN Code', 'GST%', 'Conv.', 'Group', 'Unit',
  'MRP', 'Pur Rate', 'WH Rate', 'Rt.Rate', 'Box Stock', 'Clo. Qty'
];
export const CUSTOMER_HEADERS = ['Sr', 'Customer Name', 'Phone', 'City', 'Group', 'Opening Balance', 'Cr/Dr'];
export const SUPPLIER_HEADERS = ['Sr', 'Account', 'City', 'Group', 'Opening Balance'];
export const SALES_REGISTER_HEADERS = ['Sr.', 'Aud', 'Date', 'C/D', 'Bill No.', 'Account', 'Customer Name', 'City', 'Amount'];
export const PURCHASE_REGISTER_HEADERS = ['Sr.', 'Date', 'Bill No.', 'Supplier Name', 'Total Amount', 'Payment Type'];
export const LOWSTOCK_HEADERS = ['Product Name', 'Barcode', 'Alias', 'Group', 'Available Qty', 'Minimum Stock', 'Unit'];

function writeXls(filePath: string, sheetName: string, headers: string[], rows: any[][]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filePath, { bookType: 'biff8' });
}

function readXls(filePath: string): any[][] {
  const wb = XLSX.readFile(filePath, { type: 'file' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as any[][];
}

function headerIndex(header: any[], names: string[]): number {
  const norm = header.map((h) => String(h ?? '').trim().toLowerCase());
  for (const n of names) {
    const i = norm.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

async function maxNumericBarcode(): Promise<string | null> {
  const rows = await Product.find({ barcode: /^\d+$/ }, { barcode: 1 }).lean();
  let max: string | null = null;
  for (const r of rows) {
    if (!max || r.barcode.length > max.length || (r.barcode.length === max.length && r.barcode > max)) max = r.barcode;
  }
  return max;
}

const num = (x: any, d = 0) => (x === null || x === undefined || x === '' ? d : Number(x) || 0);

// ---------------- products ----------------
export async function exportProducts(filePath: string) {
  const rows = await Product.find({}).sort({ name: 1 }).lean();
  writeXls(
    filePath,
    'Products',
    PRODUCT_HEADERS,
    rows.map((p: any) => [p.name, p.barcode, p.alias || '', p.hsnCode, p.gstRate, p.convFactor, p.group, p.unit, p.mrp, p.purRate, p.whRate, p.rtRate, p.boxStock, p.cloQty])
  );
  return { ok: true, count: rows.length, filePath };
}

export async function importProducts(filePath: string) {
  const data = readXls(filePath);
  const header = data[0] || [];
  const c = (names: string[]) => headerIndex(header, names);
  const iName = c(['Product Name']);
  const iBar = c(['Barcode']);
  let max = await maxNumericBarcode();
  let upserted = 0;
  const errors: string[] = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row || (row[iName] === '' && row[iBar] === '')) continue;
    try {
      const at = (i: number) => (i >= 0 ? row[i] : '');
      let barcode = String(at(iBar) ?? '').trim();
      if (!barcode) {
        max = nextBarcode(max, '10001');
        barcode = max;
      }
      const name = String(at(iName) ?? '').trim();
      if (!name) throw new Error(`row ${r + 1}: missing Product Name`);
      const cf = num(at(c(['Conv.'])), 1) || 1;
      const doc = {
        name,
        barcode,
        alias: String(at(c(['Alias'])) ?? '').trim() || barcode,
        hsnCode: String(at(c(['HSN Code'])) ?? ''),
        gstRate: num(at(c(['GST%']))),
        gstType: 'GST On Rate',
        minStock: getSettings().minStockDefault === 'convFactor' ? cf : 1,
        convFactor: cf,
        group: String(at(c(['Group'])) ?? '') || 'GENERAL',
        unit: String(at(c(['Unit'])) ?? '') || 'Pcs',
        mrp: num(at(c(['MRP']))),
        purRate: num(at(c(['Pur Rate']))),
        whRate: num(at(c(['WH Rate']))),
        rtRate: num(at(c(['Rt.Rate']))),
        boxStock: num(at(c(['Box Stock']))),
        cloQty: num(at(c(['Clo. Qty'])))
      };
      await Product.findOneAndUpdate({ barcode }, { $set: doc }, { upsert: true });
      upserted++;
      if (/^\d+$/.test(barcode) && (!max || barcode.length > max.length || (barcode.length === max.length && barcode > max))) max = barcode;
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }
  }
  return { ok: true, upserted, errors: errors.slice(0, 50) };
}

// ---------------- ledgers ----------------
export async function exportLedgers(filePath: string, group?: string) {
  const q: any = group ? { group } : {};
  const rows = await Ledger.find(q).sort({ accountName: 1 }).lean();
  const isSupplier = group === 'Sundry Creditors';
  writeXls(
    filePath,
    'Ledgers',
    isSupplier ? SUPPLIER_HEADERS : CUSTOMER_HEADERS,
    rows.map((l: any, i: number) =>
      isSupplier
        ? [i + 1, l.accountName, l.city, l.group, l.openingBalance]
        : [i + 1, l.accountName, l.phone, l.city, l.group, l.openingBalance, l.balanceType]
    )
  );
  return { ok: true, count: rows.length, filePath };
}

export async function importLedgers(filePath: string) {
  const data = readXls(filePath);
  const header = data[0] || [];
  const cName = headerIndex(header, ['Customer Name', 'Account']);
  const cPhone = headerIndex(header, ['Phone']);
  const cCity = headerIndex(header, ['City']);
  const cGroup = headerIndex(header, ['Group']);
  const cOb = headerIndex(header, ['Opening Balance']);
  const cCd = headerIndex(header, ['Cr/Dr']);
  let upserted = 0;
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const name = String(cName >= 0 ? row[cName] ?? '' : '').trim().toUpperCase();
    if (!name) continue;
    const group = String(cGroup >= 0 ? row[cGroup] ?? 'Sundry Debtors' : 'Sundry Debtors');
    await Ledger.findOneAndUpdate(
      { accountName: name },
      {
        $set: {
          accountName: name,
          phone: cPhone >= 0 ? String(row[cPhone] ?? '') : '',
          city: cCity >= 0 ? String(row[cCity] ?? '') : '',
          group: ['Bank Account', 'Sundry Creditors', 'Sundry Debtors'].includes(group) ? group : 'Sundry Debtors',
          openingBalance: cOb >= 0 ? num(row[cOb]) : 0,
          balanceType: cCd >= 0 ? (String(row[cCd]).toLowerCase().startsWith('cr') ? 'Cr' : 'Dr') : 'Dr'
        }
      },
      { upsert: true }
    );
    upserted++;
  }
  return { ok: true, upserted };
}

// ---------------- sales register ----------------
const normDMY = (s: string) => {
  const m = /^(\d\d)\/(\d\d)\/(\d\d\d\d)$/.exec(s || '');
  return m ? `${m[3]}${m[2]}${m[1]}` : '';
};

export async function exportSalesRegister(filePath: string, fromDDMMYYYY?: string, toDDMMYYYY?: string) {
  const all = await Sale.find({}).sort({ billNo: 1 }).lean();
  const nFrom = fromDDMMYYYY ? normDMY(fromDDMMYYYY) : '';
  const nTo = toDDMMYYYY ? normDMY(toDDMMYYYY) : '';
  const rows: any[][] = [];
  let i = 0;
  for (const b of all) {
    const n = normDMY(b.date);
    if (nFrom && n < nFrom) continue;
    if (nTo && n > nTo) continue;
    i++;
    rows.push([i, '', b.date, b.paymentType === 'Cash' ? 'C' : 'D', b.billNo, b.customerName, b.customerName, '', b.grandTotal]);
  }
  writeXls(filePath, 'Sales Register', SALES_REGISTER_HEADERS, rows);
  return { ok: true, count: i, filePath };
}

// ---------------- purchase register ----------------
export async function exportPurchaseRegister(filePath: string, supplier?: string, fromISO?: string, toISO?: string) {
  const all = await Purchase.find({}).sort({ date: 1 }).lean();
  const rows: any[][] = [];
  let i = 0;
  for (const b of all) {
    if (supplier && !(b.supplierName || '').toLowerCase().includes(supplier.toLowerCase())) continue;
    const d = b.date ? new Date(b.date).toISOString().slice(0, 10) : '';
    if (fromISO && d < fromISO) continue;
    if (toISO && d > toISO) continue;
    i++;
    rows.push([i, d.split('-').reverse().join('/'), b.purchaseBillNo, b.supplierName, b.totalPurchaseAmount, b.paymentType]);
  }
  writeXls(filePath, 'Purchase Register', PURCHASE_REGISTER_HEADERS, rows);
  return { ok: true, count: i, filePath };
}

// ---------------- low stock ----------------
export async function lowStockRows() {
  const all = await Product.find({}).sort({ name: 1 }).lean();
  return all
    .filter((p: any) => (Number(p.cloQty) || 0) <= (Number(p.minStock) || 0))
    .map((p: any) => ({
      _id: String(p._id),
      name: p.name,
      barcode: p.barcode,
      alias: p.alias || '',
      group: p.group || '',
      cloQty: Number(p.cloQty) || 0,
      minStock: Number(p.minStock) || 0,
      unit: p.unit || 'Pcs'
    }));
}

export async function exportLowStock(filePath: string) {
  const rows = await lowStockRows();
  writeXls(
    filePath,
    'Low Stock',
    LOWSTOCK_HEADERS,
    rows.map((p) => [p.name, p.barcode, p.alias, p.group, p.cloQty, p.minStock, p.unit])
  );
  return { ok: true, count: rows.length, filePath };
}
