import ExcelJS from 'exceljs';
import { Product, Ledger } from './models/index.js';
import { Sale } from './models/index.js';
import { nextBarcode } from './util.js';

export const PRODUCT_HEADERS = [
  'Product Name', 'Barcode', 'HSN Code', 'GST%', 'Conv.', 'Group', 'Unit',
  'MRP', 'Pur Rate', 'WH Rate', 'Rt.Rate', 'Box Stock', 'Clo. Qty'
];
export const CUSTOMER_HEADERS = ['Sr', 'Customer Name', 'Phone', 'City', 'Group', 'Opening Balance', 'Cr/Dr'];
export const SUPPLIER_HEADERS = ['Sr', 'Account', 'City', 'Group', 'Opening Balance'];
export const SALES_REGISTER_HEADERS = ['Sr.', 'Aud', 'Date', 'C/D', 'Bill No.', 'Account', 'Customer Name', 'City', 'Amount'];

async function maxNumericBarcode(): Promise<string | null> {
  const rows = await Product.find({ barcode: /^\d+$/ }, { barcode: 1 }).lean();
  let max: string | null = null;
  for (const r of rows) {
    if (!max || (r.barcode.length > max.length || (r.barcode.length === max.length && r.barcode > max))) max = r.barcode;
  }
  return max;
}

export async function exportProducts(filePath: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.addRow(PRODUCT_HEADERS);
  const rows = await Product.find({}).sort({ name: 1 }).lean();
  for (const p of rows) {
    ws.addRow([p.name, p.barcode, p.hsnCode, p.gstRate, p.convFactor, p.group, p.unit, p.mrp, p.purRate, p.whRate, p.rtRate, p.boxStock, p.cloQty]);
  }
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(filePath);
  return { ok: true, count: rows.length, filePath };
}

export async function importProducts(filePath: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  const header = ws.getRow(1).values as any[];
  const idx = (name: string) => header.findIndex((h) => String(h).trim().toLowerCase() === name.toLowerCase());
  let max = await maxNumericBarcode();
  let upserted = 0;
  const errors: string[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.getCell(1).value && !row.getCell(2).value) continue;
    try {
      const v = (c: number) => row.getCell(c).value as any;
      const ci = (name: string) => {
        const i = idx(name);
        return i > 0 ? row.getCell(i).value as any : undefined;
      };
      let barcode = String(ci('Barcode') ?? v(2) ?? '').trim();
      if (!barcode) {
        max = nextBarcode(max, '10001');
        barcode = max;
      }
      const num = (x: any, d = 0) => (x === null || x === undefined || x === '' ? d : Number(x) || 0);
      const doc = {
        name: String(ci('Product Name') ?? v(1) ?? '').trim(),
        barcode,
        hsnCode: String(ci('HSN Code') ?? '').trim(),
        gstRate: num(ci('GST%')),
        convFactor: num(ci('Conv.'), 1) || 1,
        group: String(ci('Group') ?? ''),
        unit: String(ci('Unit') ?? 'Pcs'),
        mrp: num(ci('MRP')),
        purRate: num(ci('Pur Rate')),
        whRate: num(ci('WH Rate')),
        rtRate: num(ci('Rt.Rate')),
        boxStock: num(ci('Box Stock')),
        cloQty: num(ci('Clo. Qty'))
      };
      if (!doc.name) throw new Error(`row ${r}: missing Product Name`);
      await Product.findOneAndUpdate({ barcode }, { $set: doc }, { upsert: true });
      upserted++;
      if (/^\d+$/.test(barcode) && (!max || barcode.length > max.length || (barcode.length === max.length && barcode > max))) max = barcode;
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }
  }
  return { ok: true, upserted, errors: errors.slice(0, 50) };
}

export async function exportLedgers(filePath: string, group?: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ledgers');
  const isSupplier = group === 'Sundry Creditors';
  ws.addRow(isSupplier ? SUPPLIER_HEADERS : CUSTOMER_HEADERS);
  const q: any = group ? { group } : {};
  const rows = await Ledger.find(q).sort({ accountName: 1 }).lean();
  rows.forEach((l, i) => {
    if (isSupplier) ws.addRow([i + 1, l.accountName, l.city, l.group, l.openingBalance]);
    else ws.addRow([i + 1, l.accountName, l.phone, l.city, l.group, l.openingBalance, l.balanceType]);
  });
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(filePath);
  return { ok: true, count: rows.length, filePath };
}

export async function importLedgers(filePath: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  const header = (ws.getRow(1).values as any[]).map((h) => String(h || '').trim().toLowerCase());
  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n.toLowerCase());
      if (i > 0) return i;
    }
    return -1;
  };
  const cName = col(['customer name', 'account']);
  const cPhone = col(['phone']);
  const cCity = col(['city']);
  const cGroup = col(['group']);
  const cOb = col(['opening balance']);
  const cCd = col(['cr/dr']);
  let upserted = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = String(cName > 0 ? row.getCell(cName).value ?? '' : '').trim();
    if (!name) continue;
    const group = String(cGroup > 0 ? row.getCell(cGroup).value ?? 'Sundry Debtors' : 'Sundry Debtors');
    await Ledger.findOneAndUpdate(
      { accountName: name },
      {
        $set: {
          accountName: name,
          phone: cPhone > 0 ? String(row.getCell(cPhone).value ?? '') : '',
          city: cCity > 0 ? String(row.getCell(cCity).value ?? '') : '',
          group: ['Bank Account', 'Sundry Creditors', 'Sundry Debtors'].includes(group) ? group : 'Sundry Debtors',
          openingBalance: cOb > 0 ? Number(row.getCell(cOb).value) || 0 : 0,
          balanceType: cCd > 0 ? (String(row.getCell(cCd).value).toLowerCase().startsWith('cr') ? 'Cr' : 'Dr') : 'Dr'
        }
      },
      { upsert: true }
    );
    upserted++;
  }
  return { ok: true, upserted };
}

export async function exportSalesRegister(filePath: string, fromDDMMYYYY?: string, toDDMMYYYY?: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sales Register');
  ws.addRow(SALES_REGISTER_HEADERS);
  const all = await Sale.find({}).sort({ billNo: 1 }).lean();
  // Date filter on DD/MM/YYYY strings via lexicographic-normalized compare
  const norm = (s: string) => {
    const m = /^(\d\d)\/(\d\d)\/(\d\d\d\d)$/.exec(s || '');
    return m ? `${m[3]}${m[2]}${m[1]}` : '';
  };
  const nFrom = fromDDMMYYYY ? norm(fromDDMMYYYY) : '';
  const nTo = toDDMMYYYY ? norm(toDDMMYYYY) : '';
  let i = 0;
  for (const b of all) {
    const n = norm(b.date);
    if (nFrom && n < nFrom) continue;
    if (nTo && n > nTo) continue;
    i++;
    ws.addRow([i, '', b.date, b.paymentType === 'Cash' ? 'C' : 'D', b.billNo, b.customerName, b.customerName, '', b.grandTotal]);
  }
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(filePath);
  return { ok: true, count: i, filePath };
}
