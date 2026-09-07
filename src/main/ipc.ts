import { ipcMain, dialog, BrowserWindow } from 'electron';
import { connectDb } from './db.js';
import { Product, Ledger, Sale, Purchase } from './models/index.js';
import { getSettings, saveSettings } from './config.js';
import { fmtDate, fmtTime, nextBarcode, nextBillNo, round2 } from './util.js';
import { exportProducts, importProducts, exportLedgers, importLedgers, exportSalesRegister } from './excel.js';
import { printThermal, listWindowsPrinters, buildThermalText } from './printers/thermal.js';
import { printLabels, buildTspl, buildZpl, buildLabelHtml, LabelJob } from './printers/label.js';
import { syncNow, syncStatus, pauseSync, resumeSync, isSyncPaused } from './sync.js';
import { createBackup, listBackups, restoreBackup, dbCounts, backupDir } from './backup.js';
import { needsSetup, setupAdmin, login, logout, changePassword, session } from './auth.js';
import type { SaleDTO } from '../shared/types.js';

const ok = <T>(data: T) => ({ ok: true, data });
const fail = (e: unknown) => ({ ok: false, error: String((e as any)?.message || e) });

async function ensureDb() {
  const r = await connectDb();
  if (!r.ok) throw new Error(`MongoDB unavailable at ${r.uri}: ${r.error}`);
}

function leanId(d: any): any {
  if (!d) return d;
  const o: any = { ...d };
  if (o._id) o._id = String(o._id);
  if (o.customerId) o.customerId = String(o.customerId);
  if (o.supplierId) o.supplierId = String(o.supplierId);
  if (o.productId) o.productId = String(o.productId);
  (o.items || []).forEach((it: any) => {
    if (it.productId) it.productId = String(it.productId);
  });
  return o;
}

export function registerIpc(getWindow: () => BrowserWindow | null, hooks?: { requestExit?: () => void }) {
  // ---------- settings / db / sync ----------
  ipcMain.handle('settings:get', async () => ok(getSettings()));
  ipcMain.handle('settings:save', async (_e, patch) => ok(saveSettings(patch)));
  ipcMain.handle('db:connect', async (_e, uri?: string) => {
    const r = await connectDb(uri);
    return r.ok ? ok(r) : fail(r.error);
  });
  ipcMain.handle('sync:status', async () => ok(syncStatus()));
  ipcMain.handle('sync:now', async () => ok(await syncNow(getWindow())));
  ipcMain.handle('sync:pause', async () => {
    pauseSync();
    return ok({ paused: isSyncPaused() });
  });
  ipcMain.handle('sync:resume', async () => {
    resumeSync(getWindow());
    return ok({ paused: isSyncPaused() });
  });
  ipcMain.handle('printers:list', async () => ok(await listWindowsPrinters()));

  // ---------- frameless window controls + guarded exit ----------
  ipcMain.handle('win:minimize', async () => {
    getWindow()?.minimize();
    return ok({ minimized: true });
  });
  ipcMain.handle('win:toggleMaximize', async () => {
    const w = getWindow();
    if (!w) return fail('No window');
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
    return ok({ maximized: w.isMaximized() });
  });
  ipcMain.handle('win:isMaximized', async () => ok({ maximized: !!getWindow()?.isMaximized() }));
  ipcMain.handle('app:exit', async () => {
    // Renderer already confirmed unsaved bills. Run the exit pipeline:
    // sync flush → snapshot backup → mongod stop → quit.
    setImmediate(() => hooks?.requestExit?.());
    return ok({ exiting: true });
  });

  // ---------- backup & restore ----------
  ipcMain.handle('backup:dir', async () => {
    try {
      return ok({ dir: backupDir() });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('backup:list', async () => ok(listBackups()));
  ipcMain.handle('backup:now', async () => {
    try {
      return ok(await createBackup('manual'));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('backup:counts', async () => {
    try {
      return ok(await dbCounts());
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('backup:restore', async (_e, archivePath: string) => {
    // Pause the 10s sync, restore with --drop, report counts, resume sync.
    // Renderer reloads state afterwards.
    pauseSync();
    try {
      const r = await restoreBackup(archivePath);
      return ok(r);
    } catch (e) {
      return fail(e);
    } finally {
      resumeSync(getWindow());
    }
  });

  // ---------- auth ----------
  ipcMain.handle('auth:session', async () => ok(session()));
  ipcMain.handle('auth:needsSetup', async () => ok(await needsSetup()));
  ipcMain.handle('auth:setup', async (_e, p: { password: string }) => {
    try {
      return ok(await setupAdmin('admin', p.password));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('auth:login', async (_e, p: { password: string }) => {
    try {
      return ok(await login(p.password));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('auth:logout', async () => ok(logout()));
  ipcMain.handle('auth:changePassword', async (_e, p: { oldPass: string; newPass: string }) => {
    try {
      return ok(await changePassword(p.oldPass, p.newPass));
    } catch (e) {
      return fail(e);
    }
  });

  // ---------- products ----------
  ipcMain.handle('products:list', async (_e, q: { search?: string; limit?: number } = {}) => {
    try {
      await ensureDb();
      const s = (q.search || '').trim();
      const filter: any = s
        ? { $or: [{ barcode: new RegExp(escapeReg(s), 'i') }, { name: new RegExp(escapeReg(s), 'i') }] }
        : {};
      const rows = await Product.find(filter).sort({ name: 1 }).limit(q.limit || 500).lean();
      return ok(rows.map(leanId));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('products:getByBarcode', async (_e, barcode: string) => {
    try {
      await ensureDb();
      const p = await Product.findOne({ barcode: String(barcode).trim() }).lean();
      return ok(p ? leanId(p) : null);
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('products:nextBarcode', async () => {
    try {
      await ensureDb();
      const rows = await Product.find({ barcode: /^\d+$/ }, { barcode: 1 }).lean();
      let max: string | null = null;
      for (const r of rows) {
        if (!max || r.barcode.length > max.length || (r.barcode.length === max.length && r.barcode > max)) max = r.barcode;
      }
      return ok({ next: nextBarcode(max, '10001'), max });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('products:save', async (_e, doc: any) => {
    try {
      await ensureDb();
      if (!doc.name?.trim()) throw new Error('Product name required');
      if (!doc.barcode?.trim()) throw new Error('Barcode required');
      const payload = {
        name: String(doc.name).trim(),
        barcode: String(doc.barcode).trim(),
        hsnCode: doc.hsnCode || '',
        gstRate: Number(doc.gstRate) || 0,
        convFactor: Number(doc.convFactor) || 1,
        group: doc.group || '',
        unit: doc.unit || 'Pcs',
        mrp: Number(doc.mrp) || 0,
        purRate: Number(doc.purRate) || 0,
        whRate: Number(doc.whRate) || 0,
        rtRate: Number(doc.rtRate) || 0,
        boxStock: Number(doc.boxStock) || 0,
        cloQty: Number(doc.cloQty) || 0
      };
      let saved;
      if (doc._id) saved = await Product.findByIdAndUpdate(doc._id, { $set: payload }, { new: true }).lean();
      else {
        try {
          saved = (await Product.create(payload)).toObject();
        } catch (e: any) {
          if (String(e?.message || '').includes('duplicate')) throw new Error(`Barcode ${payload.barcode} already exists`);
          throw e;
        }
      }
      return ok(leanId(saved));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('products:delete', async (_e, id: string) => {
    try {
      await ensureDb();
      await Product.findByIdAndDelete(id);
      return ok({ id });
    } catch (e) {
      return fail(e);
    }
  });

  // ---------- ledgers ----------
  ipcMain.handle('ledgers:list', async (_e, q: { search?: string; group?: string } = {}) => {
    try {
      await ensureDb();
      const f: any = {};
      if (q.group) f.group = q.group;
      if (q.search?.trim()) {
        f.$and = [f.group ? { group: f.group } : {}, { accountName: new RegExp(escapeReg(q.search.trim()), 'i') }];
        delete f.group;
      }
      const rows = await Ledger.find(f).sort({ accountName: 1 }).limit(1000).lean();
      return ok(rows.map(leanId));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('ledgers:save', async (_e, doc: any) => {
    try {
      await ensureDb();
      if (!doc.accountName?.trim()) throw new Error('Account name required');
      const payload = {
        accountName: String(doc.accountName).trim(),
        phone: doc.phone || '',
        city: doc.city || '',
        group: doc.group || 'Sundry Debtors',
        openingBalance: Number(doc.openingBalance) || 0,
        balanceType: doc.balanceType || 'Dr',
        currentBalance: doc.currentBalance !== undefined ? Number(doc.currentBalance) : undefined
      };
      if (payload.currentBalance === undefined) delete (payload as any).currentBalance;
      let saved;
      if (doc._id) saved = await Ledger.findByIdAndUpdate(doc._id, { $set: payload }, { new: true }).lean();
      else {
        if ((payload as any).currentBalance === undefined) {
          (payload as any).currentBalance = payload.balanceType === 'Cr' ? -Math.abs(payload.openingBalance) : Math.abs(payload.openingBalance);
        }
        saved = (await Ledger.create(payload)).toObject();
      }
      return ok(leanId(saved));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('ledgers:delete', async (_e, id: string) => {
    try {
      await ensureDb();
      await Ledger.findByIdAndDelete(id);
      return ok({ id });
    } catch (e) {
      return fail(e);
    }
  });

  // ---------- sales ----------
  ipcMain.handle('sales:nextBillNo', async () => {
    try {
      await ensureDb();
      const rows = await Sale.find({ billNo: /^\d+$/ }, { billNo: 1 }).lean();
      let max: string | null = null;
      for (const r of rows) if (!max || (r.billNo.length >= max.length && r.billNo >= max)) max = r.billNo;
      return ok({ next: nextBillNo(max), max, date: fmtDate(), time: fmtTime() });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('sales:list', async (_e, q: { search?: string; limit?: number } = {}) => {
    try {
      await ensureDb();
      const s = (q.search || '').trim();
      const filter: any = s
        ? { $or: [{ billNo: new RegExp(escapeReg(s), 'i') }, { customerName: new RegExp(escapeReg(s), 'i') }] }
        : {};
      const rows = await Sale.find(filter).sort({ billNo: -1 }).limit(q.limit || 500).lean();
      return ok(rows.map(leanId));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('sales:get', async (_e, id: string) => {
    try {
      await ensureDb();
      const s = await Sale.findById(id).lean();
      return ok(s ? leanId(s) : null);
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('sales:save', async (_e, p: { bill: SaleDTO; print: boolean }) => {
    try {
      await ensureDb();
      const b = p.bill;
      if (!b.items?.length) throw new Error('Add at least one item');
      const now = new Date();
      const billNo = b.billNo || nextBillNo(null);
      const doc: any = {
        billNo,
        date: b.date || fmtDate(now),
        time: b.time || fmtTime(now),
        paymentType: b.paymentType || 'Cash',
        pricingMode: b.pricingMode || 'Wholesale',
        customerName: b.customerName || '12345678 CASH',
        items: b.items.map((it: any) => ({
          productId: it.productId || undefined,
          name: it.name,
          barcode: it.barcode,
          pack: Number(it.pack) || 1,
          qty: Number(it.qty) || 0,
          unit: it.unit || 'Pcs',
          rate: round2(it.rate),
          amount: round2(it.amount)
        })),
        totalItems: b.items.length,
        totalPackQty: round2(b.items.reduce((a: number, it: any) => a + (Number(it.qty) || 0), 0)),
        totalUnits: round2(b.items.reduce((a: number, it: any) => a + (Number(it.qty) || 0) * (Number(it.pack) || 1), 0)),
        subTotal: round2(b.items.reduce((a: number, it: any) => a + (Number(it.amount) || 0), 0))
      };
      doc.grandTotal = doc.subTotal;
      if (b.customerId) doc.customerId = b.customerId;

      let saved: any;
      const existing = await Sale.findOne({ billNo }).lean();
      if ((b as any)._id || existing) {
        // Edit path: restock old quantities first, then apply new.
        const oldDoc: any = (b as any)._id ? await Sale.findById((b as any)._id).lean() : existing;
        if (oldDoc) {
          for (const it of (oldDoc.items as any[]) || []) {
            if (it.productId) await Product.findByIdAndUpdate(it.productId, { $inc: { cloQty: Number(it.qty) || 0 } });
          }
          saved = (await Sale.findByIdAndUpdate(oldDoc._id, { $set: doc }, { new: true }).lean()) as any;
        } else {
          saved = (await Sale.create(doc)).toObject();
        }
      } else {
        try {
          saved = (await Sale.create(doc)).toObject();
        } catch (e: any) {
          if (String(e?.message || '').includes('duplicate')) {
            doc.billNo = nextBillNo(billNo);
            saved = (await Sale.create(doc)).toObject();
          } else throw e;
        }
      }
      // Decrement stock
      for (const it of doc.items as any[]) {
        if (it.productId) await Product.findByIdAndUpdate(it.productId, { $inc: { cloQty: -(Number(it.qty) || 0) } });
      }
      // Debit-customer ledger adjustment
      if (doc.paymentType === 'Debit' && doc.customerId) {
        await Ledger.findByIdAndUpdate(doc.customerId, { $inc: { currentBalance: doc.grandTotal } });
      }
      let printResult: any = null;
      if (p.print) printResult = await printThermal(saved as SaleDTO);
      return ok({ bill: leanId(saved), print: printResult, text: buildThermalText(saved as SaleDTO) });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('sales:delete', async (_e, id: string) => {
    try {
      await ensureDb();
      const old: any = await Sale.findById(id).lean();
      if (old) {
        for (const it of old.items || []) {
          if (it.productId) await Product.findByIdAndUpdate(it.productId, { $inc: { cloQty: Number(it.qty) || 0 } });
        }
        await Sale.findByIdAndDelete(id);
      }
      return ok({ id });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('sales:reprint', async (_e, id: string) => {
    try {
      await ensureDb();
      const s: any = await Sale.findById(id).lean();
      if (!s) throw new Error('Bill not found');
      const r = await printThermal(s as SaleDTO);
      return ok({ print: r, text: buildThermalText(s as SaleDTO) });
    } catch (e) {
      return fail(e);
    }
  });

  // ---------- purchases ----------
  ipcMain.handle('purchases:list', async (_e, q: { search?: string; limit?: number } = {}) => {
    try {
      await ensureDb();
      const s = (q.search || '').trim();
      const filter: any = s
        ? { $or: [{ purchaseBillNo: new RegExp(escapeReg(s), 'i') }, { supplierName: new RegExp(escapeReg(s), 'i') }] }
        : {};
      const rows = await Purchase.find(filter).sort({ date: -1 }).limit(q.limit || 500).lean();
      return ok(rows.map(leanId));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('purchases:save', async (_e, p: { bill: any; printLabels?: LabelJob[] }) => {
    try {
      await ensureDb();
      const b = p.bill;
      if (!b.items?.length) throw new Error('Add at least one item');
      const items = b.items.map((it: any) => ({
        productId: it.productId || undefined,
        name: it.name,
        barcode: it.barcode,
        qty: Number(it.qty) || 0,
        purRate: Number(it.purRate) || 0,
        mrp: Number(it.mrp) || 0,
        whRate: Number(it.whRate) || 0,
        rtRate: Number(it.rtRate) || 0,
        amount: round2((Number(it.qty) || 0) * (Number(it.purRate) || 0))
      }));
      const doc: any = {
        purchaseBillNo: b.purchaseBillNo,
        date: b.date ? new Date(b.date) : new Date(),
        supplierName: b.supplierName,
        paymentType: b.paymentType || 'Cash',
        items,
        totalPurchaseAmount: round2(items.reduce((a: number, it: any) => a + it.amount, 0))
      };
      if (b.supplierId) doc.supplierId = b.supplierId;
      let saved: any;
      if (b._id) saved = (await Purchase.findByIdAndUpdate(b._id, { $set: doc }, { new: true }).lean()) as any;
      else saved = (await Purchase.create(doc)).toObject();
      // Stock increment + rate master update
      for (const it of items) {
        if (it.productId) {
          await Product.findByIdAndUpdate(it.productId, {
            $inc: { cloQty: it.qty },
            $set: { purRate: it.purRate, mrp: it.mrp, whRate: it.whRate, rtRate: it.rtRate }
          });
        } else {
          await Product.findOneAndUpdate(
            { barcode: it.barcode },
            {
              $set: { name: it.name, purRate: it.purRate, mrp: it.mrp, whRate: it.whRate, rtRate: it.rtRate },
              $inc: { cloQty: it.qty }
            },
            { upsert: true }
          );
        }
      }
      if (doc.paymentType === 'Debit' && doc.supplierId) {
        await Ledger.findByIdAndUpdate(doc.supplierId, { $inc: { currentBalance: -doc.totalPurchaseAmount } });
      }
      let labelResult: any = null;
      if (p.printLabels?.length) labelResult = await printLabels(p.printLabels);
      return ok({ bill: leanId(saved), labels: labelResult });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('purchases:delete', async (_e, id: string) => {
    try {
      await ensureDb();
      await Purchase.findByIdAndDelete(id);
      return ok({ id });
    } catch (e) {
      return fail(e);
    }
  });

  // ---------- labels ----------
  ipcMain.handle('labels:preview', async (_e, job: LabelJob) => {
    return ok({ tspl: buildTspl(job), zpl: buildZpl(job), html: buildLabelHtml(job) });
  });
  ipcMain.handle('labels:print', async (_e, jobs: LabelJob[]) => ok(await printLabels(jobs)));

  // ---------- excel ----------
  ipcMain.handle('excel:dialog', async (_e, mode: 'open' | 'save', filters?: { name: string; extensions: string[] }[]) => {
    const win = getWindow();
    if (!win) return fail('No window');
    const res =
      mode === 'open'
        ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
        : await dialog.showSaveDialog(win, { filters });
    if ((res as any).canceled) return ok({ canceled: true });
    return ok({ canceled: false, path: (res as any).filePath || (res as any).filePaths?.[0] });
  });
  ipcMain.handle('excel:exportProducts', async (_e, filePath: string) => {
    try {
      await ensureDb();
      return ok(await exportProducts(filePath));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('excel:importProducts', async (_e, filePath: string) => {
    try {
      await ensureDb();
      return ok(await importProducts(filePath));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('excel:exportLedgers', async (_e, p: { filePath: string; group?: string }) => {
    try {
      await ensureDb();
      return ok(await exportLedgers(p.filePath, p.group));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('excel:importLedgers', async (_e, filePath: string) => {
    try {
      await ensureDb();
      return ok(await importLedgers(filePath));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('excel:exportSales', async (_e, p: { filePath: string; from?: string; to?: string }) => {
    try {
      await ensureDb();
      return ok(await exportSalesRegister(p.filePath, p.from, p.to));
    } catch (e) {
      return fail(e);
    }
  });
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
