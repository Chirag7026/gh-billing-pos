import { ipcMain, dialog, BrowserWindow } from 'electron';
import { connectDb } from './db.js';
import { Product, Ledger, Sale, Purchase } from './models/index.js';
import { getSettings, saveSettings } from './config.js';
import { fmtDate, fmtTime, nextBarcode, nextBillNo, round2, wildcardToRegExp } from './util.js';
import { exportProducts, importProducts, exportLedgers, importLedgers, exportSalesRegister, exportPurchaseRegister, exportLowStock, lowStockRows } from './excel.js';
import { StockAdjustment, Master } from './models/index.js';
import { parseRptFile, sampleReceiptTemplate, sampleLabelTemplate } from './rpt.js';
import * as fs from 'node:fs';
import { printThermal, listWindowsPrinters, buildThermalText } from './printers/thermal.js';
import { printLabels, buildTspl, buildZpl, buildLabelHtml, LabelJob } from './printers/label.js';
import { syncNow, syncStatus, pauseSync, resumeSync, isSyncPaused } from './sync.js';
import { createBackup, listBackups, restoreBackup, dbCounts, backupDir, backupDirs, verifyIntegrity, latestValidSnapshot } from './backup.js';
import { needsSetup, setupAdmin, login, logout, changePassword, session, currentRole, listUsers, createUser, updateUser } from './auth.js';
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

export function registerIpc(getWindow: () => BrowserWindow | null, hooks?: { requestExit?: (withBackup: boolean) => void }) {
  // ---------- settings / db / sync ----------
  ipcMain.handle('settings:get', async () => ok(getSettings()));
  ipcMain.handle('settings:save', async (_e, patch) => {
    const s = saveSettings(patch);
    // Apply sync interval live.
    try {
      resumeSync(getWindow());
    } catch {}
    return ok(s);
  });
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
  ipcMain.handle('app:exit', async (_e, p?: { backup?: boolean }) => {
    // Renderer already confirmed unsaved bills / backup choice. Run the exit
    // pipeline: sync flush → optional snapshot backup → mongod stop → quit.
    setImmediate(() => hooks?.requestExit?.(p?.backup !== false));
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
  ipcMain.handle('backup:dirs', async () => {
    try {
      return ok(backupDirs());
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('backup:integrity', async () => ok(await verifyIntegrity()));
  ipcMain.handle('backup:latest', async () => ok(latestValidSnapshot()));

  // ---------- auth + users (RBAC) ----------
  ipcMain.handle('auth:session', async () => ok(await session()));
  ipcMain.handle('auth:needsSetup', async () => ok(await needsSetup()));
  ipcMain.handle('auth:setup', async (_e, p: { username: string; password: string }) => {
    try {
      return ok(await setupAdmin(p.username, p.password));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('auth:login', async (_e, p: { username: string; password: string }) => {
    try {
      return ok(await login(p.username, p.password));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('auth:logout', async () => ok(logout()));
  ipcMain.handle('auth:changePassword', async (_e, p: { username?: string; oldPass: string; newPass: string }) => {
    try {
      return ok(await changePassword(p.username || '', p.oldPass, p.newPass));
    } catch (e) {
      return fail(e);
    }
  });
  const needAdmin = () => {
    if (currentRole() !== 'ADMIN') throw new Error('ADMIN role required');
  };
  ipcMain.handle('users:list', async () => {
    try {
      needAdmin();
      await ensureDb();
      return ok(await listUsers());
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('users:create', async (_e, p: any) => {
    try {
      needAdmin();
      await ensureDb();
      return ok(await createUser(p));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('users:update', async (_e, p: { id: string; patch: any }) => {
    try {
      needAdmin();
      await ensureDb();
      return ok(await updateUser(p.id, p.patch));
    } catch (e) {
      return fail(e);
    }
  });

  // ---------- products ----------
  ipcMain.handle('products:list', async (_e, q: { search?: string; limit?: number } = {}) => {
    try {
      await ensureDb();
      const s = (q.search || '').trim();
      const rx = wildcardToRegExp(s);
      const filter: any = s
        ? { $or: [{ barcode: rx }, { name: rx }, { alias: rx }] }
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
      const barcode = String(doc.barcode).trim();
      const cf = Number(doc.convFactor) || 1;
      const gstRate = [0, 5, 12, 18, 28].includes(Number(doc.gstRate)) ? Number(doc.gstRate) : 0;
      const openingStock = Number(doc.openingStock) || 0;
      const payload: any = {
        name: String(doc.name).trim(),
        alias: String(doc.alias || '').trim() || barcode,
        barcode,
        group: doc.group || 'GENERAL',
        hsnCode: doc.hsnCode || '',
        gstRate,
        gstType: doc.gstType === 'GST Included' ? 'GST Included' : 'GST On Rate',
        minStock: doc.minStock !== undefined && doc.minStock !== null && doc.minStock !== '' ? Number(doc.minStock) : 1,
        convFactor: cf,
        openingStock: Number(doc.openingStock) || 0,
        purRate: Number(doc.purRate) || 0,
        whRate: Number(doc.whRate) || 0,
        rtRate: Number(doc.rtRate) || 0,
        mrp: Number(doc.mrp) || 0,
        unit: doc.unit || 'Pcs',
        boxStock: Number(doc.boxStock) || 0,
        cloQty: Number(doc.cloQty) || 0
      };
      let saved;
      if (doc._id) {
        saved = await Product.findByIdAndUpdate(doc._id, { $set: payload }, { new: true }).lean();
      } else {
        // V3.1 closing-stock engine: creation seeds cloQty = openingStock × convFactor.
        payload.cloQty = round2(openingStock * cf);
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
        const rx = wildcardToRegExp(q.search.trim());
        f.$and = [f.group ? { group: f.group } : {}, { $or: [{ accountName: rx }, { gstin: rx }, { phone: rx }, { city: rx }] }];
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
      const gstin = String(doc.gstin || '').trim().toUpperCase();
      if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) throw new Error('GSTIN must be 15 alphanumeric characters');
      const payload = {
        accountName: String(doc.accountName).trim(),
        phone: doc.phone || '',
        city: doc.city || '',
        gstin,
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
      const rx = wildcardToRegExp(s);
      const filter: any = s
        ? { $or: [{ billNo: rx }, { customerName: rx }] }
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
          alias: it.alias || '',
          pack: Number(it.pack) || 1,
          qty: Number(it.qty) || 0,
          unit: it.unit || 'Pcs',
          rate: round2(it.rate),
          gstAmount: round2(it.gstAmount || 0),
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
            if (it.productId) await Product.findByIdAndUpdate(it.productId, { $inc: { cloQty: saleUnits(it) } });
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
      // Decrement stock (qty × pack; zero/negative permitted, no validation)
      for (const it of doc.items as any[]) {
        if (it.productId) await Product.findByIdAndUpdate(it.productId, { $inc: { cloQty: -saleUnits(it) } });
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
          if (it.productId) await Product.findByIdAndUpdate(it.productId, { $inc: { cloQty: saleUnits(it) } });
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
  ipcMain.handle('purchases:list', async (_e, q: { search?: string; limit?: number } = {}) => {    try {
      await ensureDb();
      const s = (q.search || '').trim();
      const rx = wildcardToRegExp(s);
      const filter: any = s
        ? { $or: [{ purchaseBillNo: rx }, { supplierName: rx }] }
        : {};
      const rows = await Purchase.find(filter).sort({ date: -1 }).limit(q.limit || 500).lean();
      return ok(rows.map(leanId));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('purchases:get', async (_e, id: string) => {
    try {
      await ensureDb();
      const p = await Purchase.findById(id).lean();
      return ok(p ? leanId(p) : null);
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
      // V3.1: purchase movement in stock units (qty × product convFactor).
      const convOf = async (it: any): Promise<number> => {
        try {
          const p: any = it.productId
            ? await Product.findById(it.productId, { convFactor: 1 }).lean()
            : await Product.findOne({ barcode: it.barcode }, { convFactor: 1 }).lean();
          return Number(p?.convFactor) || 1;
        } catch {
          return 1;
        }
      };
      let saved: any;
      if (b._id) {
        // Edit path: reverse old stock + supplier balance first.
        const old: any = await Purchase.findById(b._id).lean();
        if (old) {
          for (const it of (old.items as any[]) || []) {
            const units = round2((Number(it.qty) || 0) * (await convOf(it)));
            if (it.productId) await Product.findByIdAndUpdate(it.productId, { $inc: { cloQty: -units } });
            else await Product.findOneAndUpdate({ barcode: it.barcode }, { $inc: { cloQty: -units } });
          }
          if (old.paymentType === 'Debit' && old.supplierId) {
            await Ledger.findByIdAndUpdate(old.supplierId, { $inc: { currentBalance: Number(old.totalPurchaseAmount) || 0 } });
          }
        }
        saved = (await Purchase.findByIdAndUpdate(b._id, { $set: doc }, { new: true }).lean()) as any;
      } else saved = (await Purchase.create(doc)).toObject();
      // Stock increment + rate master update
      for (const it of items) {
        const units = round2((Number(it.qty) || 0) * (await convOf(it)));
        if (it.productId) {
          await Product.findByIdAndUpdate(it.productId, {
            $inc: { cloQty: units },
            $set: { purRate: it.purRate, mrp: it.mrp, whRate: it.whRate, rtRate: it.rtRate }
          });
        } else {
          await Product.findOneAndUpdate(
            { barcode: it.barcode },
            {
              $set: { name: it.name, purRate: it.purRate, mrp: it.mrp, whRate: it.whRate, rtRate: it.rtRate },
              $inc: { cloQty: units }
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

  // ---------- print format templates (.rpt) ----------
  ipcMain.handle('rpt:import', async (_e, kind: 'receipt' | 'label') => {
    try {
      const win = getWindow();
      if (!win) throw new Error('No window');
      const picked = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Print template (.rpt)', extensions: ['rpt', 'json'] }]
      });
      if (picked.canceled || !picked.filePaths[0]) return ok({ canceled: true });
      const tpl = parseRptFile(picked.filePaths[0]);
      if (tpl.kind !== kind) throw new Error(`This .rpt is a "${tpl.kind}" template, but a "${kind}" one is required here.`);
      const s = saveSettings(kind === 'receipt' ? { receiptTemplate: tpl } : { labelTemplate: tpl });
      return ok({ canceled: false, template: tpl, file: picked.filePaths[0], active: kind === 'receipt' ? s.receiptTemplate : s.labelTemplate });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('rpt:clear', async (_e, kind: 'receipt' | 'label') => {
    const s = saveSettings(kind === 'receipt' ? { receiptTemplate: null } : { labelTemplate: null });
    return ok(kind === 'receipt' ? s.receiptTemplate : s.labelTemplate);
  });
  ipcMain.handle('rpt:sample', async (_e, kind: 'receipt' | 'label') => {
    try {
      const win = getWindow();
      if (!win) throw new Error('No window');
      const tpl = kind === 'receipt' ? sampleReceiptTemplate() : sampleLabelTemplate();
      const picked = await dialog.showSaveDialog(win, {
        defaultPath: `${tpl.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.rpt`,
        filters: [{ name: 'Print template (.rpt)', extensions: ['rpt'] }]
      });
      if (picked.canceled || !picked.filePath) return ok({ canceled: true });
      fs.writeFileSync(picked.filePath, JSON.stringify(tpl, null, 2), 'utf8');
      return ok({ canceled: false, file: picked.filePath });
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
  ipcMain.handle('excel:exportPurchase', async (_e, p: { filePath: string; supplier?: string; from?: string; to?: string }) => {
    try {
      await ensureDb();
      return ok(await exportPurchaseRegister(p.filePath, p.supplier, p.from, p.to));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('excel:exportLowStock', async (_e, filePath: string) => {
    try {
      await ensureDb();
      return ok(await exportLowStock(filePath));
    } catch (e) {
      return fail(e);
    }
  });

  // ---------- stock master / adjustment / low stock ----------
  ipcMain.handle('stock:master', async () => {
    try {
      await ensureDb();
      const all = await Product.find({}).sort({ name: 1 }).lean();
      const rows = all.map((p: any) => ({
        _id: String(p._id),
        name: p.name,
        barcode: p.barcode,
        alias: p.alias || '',
        group: p.group || '',
        unit: p.unit || 'Pcs',
        purRate: Number(p.purRate) || 0,
        cloQty: Number(p.cloQty) || 0,
        totalAmount: (Number(p.cloQty) || 0) * (Number(p.purRate) || 0)
      }));
      const total = rows.reduce((a: number, r: any) => a + r.totalAmount, 0);
      return ok({ rows, total });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('stock:low', async () => {
    try {
      await ensureDb();
      return ok(await lowStockRows());
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('stock:adjust', async (_e, p: { productId: string; mode: 'ADD' | 'SUBTRACT'; qty: number; reason: string; by: string }) => {
    try {
      await ensureDb();
      const prod: any = await Product.findById(p.productId);
      if (!prod) throw new Error('Product not found');
      const q = Math.abs(Number(p.qty) || 0);
      if (!q) throw new Error('Quantity must be greater than 0');
      const prev = Number(prod.cloQty) || 0;
      const next = p.mode === 'ADD' ? prev + q : prev - q;
      prod.cloQty = next;
      await prod.save();
      const rec = await StockAdjustment.create({
        productId: prod._id,
        productName: prod.name,
        barcode: prod.barcode,
        adjustmentType: p.mode,
        adjustedQty: q,
        previousQty: prev,
        newQty: next,
        reason: (p.reason || '').toUpperCase(),
        adjustedBy: (p.by || '').toUpperCase()
      });
      return ok({ newQty: next, recordId: String(rec._id) });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('stock:adjustments', async (_e, q: { limit?: number } = {}) => {
    try {
      await ensureDb();
      const rows = await StockAdjustment.find({}).sort({ date: -1 }).limit(q.limit || 200).lean();
      return ok(rows.map(leanId));
    } catch (e) {
      return fail(e);
    }
  });

  // ---------- masters (groups, units, GST slabs) ----------
  const MASTER_DEFAULTS: Record<string, any[]> = {
    group: [{ name: 'GENERAL' }],
    unit: ['Pcs', 'Box', 'Kg', 'Gm', 'Ltr', 'Mtr', 'Pkt', 'Pack'].map((n) => ({ name: n, code: n.toUpperCase() })),
    gstRate: [0, 5, 12, 18, 28].map((v) => ({ name: String(v), value: v }))
  };
  ipcMain.handle('masters:list', async (_e, q: { kind: string } = { kind: 'group' }) => {
    try {
      await ensureDb();
      if (!['group', 'unit', 'gstRate'].includes(q.kind)) throw new Error('Invalid master kind');
      let rows = await Master.find({ kind: q.kind }).sort({ name: 1 }).lean();
      if (!rows.length && MASTER_DEFAULTS[q.kind]) {
        try {
          await Master.insertMany(MASTER_DEFAULTS[q.kind].map((d: any) => ({ kind: q.kind, ...d })));
        } catch {}
        rows = await Master.find({ kind: q.kind }).sort({ name: 1 }).lean();
      }
      return ok(rows.map((r: any) => ({ _id: String(r._id), kind: r.kind, name: r.name, code: r.code || '', value: r.value ?? 0 })));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('masters:add', async (_e, p: { kind: string; name: string; code?: string; value?: number }) => {
    try {
      await ensureDb();
      if (!['group', 'unit', 'gstRate'].includes(p.kind)) throw new Error('Invalid master kind');
      const name = String(p.name || '').trim().toUpperCase();
      if (!name) throw new Error('Name required');
      const doc: any = { kind: p.kind, name };
      if (p.kind === 'unit') doc.code = String(p.code || name).toUpperCase();
      if (p.kind === 'gstRate') {
        const v = Number(p.value);
        if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error('Rate must be 0–100');
        doc.value = v;
        doc.name = String(v);
      }
      try {
        await Master.create(doc);
      } catch (e: any) {
        if (String(e?.message || '').includes('duplicate')) throw new Error(`${name} already exists`);
        throw e;
      }
      return ok({ name });
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle('masters:remove', async (_e, id: string) => {
    try {
      await ensureDb();
      await Master.findByIdAndDelete(id);
      return ok({ id });
    } catch (e) {
      return fail(e);
    }
  });
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** V3.1 closing-stock engine: line movement in stock units (qty × pack/convFactor). Zero/negative permitted. */
function saleUnits(it: any): number {
  return round2((Number(it.qty) || 0) * (Number(it.pack) || 1));
}
