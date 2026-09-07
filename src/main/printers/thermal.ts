import { exec } from 'node:child_process';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getSettings } from '../config.js';
import type { SaleDTO } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Thermal (ESC/POS 80mm) — exact bill format from spec
// ---------------------------------------------------------------------------

/** Build the exact plain-text receipt so both ESC/POS and Windows fallback match. */
export function buildThermalText(bill: SaleDTO): string {
  const L: string[] = [];
  const push = (s = '') => L.push(s);
  push('                 G H');
  push('------------------------------------------');
  push(`Cash Memo               Date  :${bill.date}`);
  push(`Time  :${bill.time}       No.   :${bill.billNo}`);
  push(`M/s.  ${bill.customerName}`);
  push('------------------------------------------');
  push('No. Particulars      Pack   Qty.   Rate   Amount');
  push('------------------------------------------');
  bill.items.forEach((item, i) => {
    const num = String(i + 1).padEnd(3, ' ');
    const name = item.name.slice(0, 16).padEnd(16, ' ');
    const pack = Number(item.pack).toFixed(2).padStart(6, ' ');
    const qty = Number(item.qty).toFixed(2).padStart(6, ' ');
    const rate = Number(item.rate).toFixed(2).padStart(6, ' ');
    const amt = Number(item.amount).toFixed(2).padStart(7, ' ');
    push(`${num}${name}${pack} ${qty} ${rate} ${amt}`);
    if (item.name.length > 16) push(`    ${item.name.slice(16)}`);
  });
  push('------------------------------------------');
  push(
    `Item: ${String(bill.totalItems).padEnd(8)} Qty: ${bill.totalPackQty} - ${bill.totalUnits}  Sub Total ${Number(bill.subTotal).toFixed(2)}`
  );
  push('------------------------------------------');
  push(`          Grand Total          ${Number(bill.grandTotal).toFixed(2)}`);
  push('------------------------------------------');
  push('.');
  push('.');
  push('.');
  push('.');
  push('Note : ');
  push('');
  push('');
  push('');
  return L.join('\n');
}

/** Spec-faithful ESC/POS sequence using node-thermal-printer API shape. */
export function printThermalBillEscPos(printer: any, bill: SaleDTO) {
  printer
    .align('ct')
    .size(1, 1)
    .text('G H')
    .text('------------------------------------------')
    .align('lt')
    .size(0, 0)
    .text(`Cash Memo               Date  :${bill.date}`)
    .text(`Time  :${bill.time}       No.   :${bill.billNo}`)
    .text(`M/s.  ${bill.customerName}`)
    .text('------------------------------------------')
    .text('No. Particulars      Pack   Qty.   Rate   Amount')
    .text('------------------------------------------');

  bill.items.forEach((item, i) => {
    const num = String(i + 1).padEnd(3, ' ');
    const name = item.name.slice(0, 16).padEnd(16, ' ');
    const pack = Number(item.pack).toFixed(2).padStart(6, ' ');
    const qty = Number(item.qty).toFixed(2).padStart(6, ' ');
    const rate = Number(item.rate).toFixed(2).padStart(6, ' ');
    const amt = Number(item.amount).toFixed(2).padStart(7, ' ');
    printer.text(`${num}${name}${pack} ${qty} ${rate} ${amt}`);
    if (item.name.length > 16) printer.text(`    ${item.name.slice(16)}`);
  });

  printer
    .text('------------------------------------------')
    .text(
      `Item: ${String(bill.totalItems).padEnd(8)} Qty: ${bill.totalPackQty} - ${bill.totalUnits}  Sub Total ${Number(bill.subTotal).toFixed(2)}`
    )
    .text('------------------------------------------')
    .size(1, 1)
    .text(`Grand Total          ${Number(bill.grandTotal).toFixed(2)}`)
    .size(0, 0)
    .text('------------------------------------------')
    .text('.\n.\n.\n.\nNote : ')
    .feed(3)
    .cut();
}

export interface ThermalTarget {
  type: 'printer' | 'tcp' | 'serial';
  name: string;
  host?: string;
  port?: number;
}

/** Parse "printer:POS-80" | "tcp://192.168.1.50:9100" | "COM3" style interface strings. */
export function parseThermalInterface(raw: string, fallbackName: string): ThermalTarget {
  const s = (raw || '').trim();
  if (s.startsWith('tcp://')) {
    const u = new URL(s);
    return { type: 'tcp', name: fallbackName || 'escpos-network', host: u.hostname, port: Number(u.port || 9100) };
  }
  if (/^COM\d+$/i.test(s)) return { type: 'serial', name: s.toUpperCase() };
  if (s.startsWith('printer:')) return { type: 'printer', name: s.slice('printer:'.length) };
  if (s) return { type: 'printer', name: s };
  return { type: 'printer', name: fallbackName };
}

export function listWindowsPrinters(): Promise<string[]> {
  return new Promise((resolve) => {
    if (os.platform() !== 'win32') return resolve([]);
    exec('wmic printer get name', { windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && l.toLowerCase() !== 'name');
      resolve(lines);
    });
  });
}

/** Raw Windows driver print via PowerShell Out-Printer (no dialog). */
function windowsRawPrint(printerName: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `gh-bill-${Date.now()}.txt`);
    fs.writeFileSync(tmp, text, 'utf8');
    const ps = `Get-Content -LiteralPath '${tmp.replace(/'/g, "''")}' -Raw | Out-Printer -Name '${printerName.replace(/'/g, "''")}'`;
    exec(`powershell -NoProfile -Command "${ps.replace(/"/g, '`"')}"`, { windowsHide: true }, (err) => {
      fs.rm(tmp, { force: true }, () => undefined);
      if (err) reject(err);
      else resolve();
    });
  });
}

function tcpEscPosPrint(host: string, port: number, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ESC = '\x1b';
    // init + centered header + left body + feed + full cut
    const payload = `${ESC}@${ESC}a\x01G H\n${ESC}a\x00${text}\n\n\n${ESC}d\x03${ESC}i`;
    const sock = net.connect(port, host, () => {
      sock.write(payload, 'binary', () => sock.end());
    });
    sock.on('close', () => resolve());
    sock.on('error', reject);
    setTimeout(() => {
      try {
        sock.destroy();
      } catch {}
      resolve();
    }, 4000);
  });
}

export async function printThermal(bill: SaleDTO): Promise<{ ok: boolean; via: string; error?: string }> {
  const s = getSettings();
  const text = buildThermalText(bill);
  const target = parseThermalInterface(s.thermalInterface, s.thermalPrinter);

  // 1) Try node-thermal-printer ESC/POS (USB/network/serial)
  try {
    // Lazy require so missing native deps don't crash startup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: target.type === 'tcp' ? `tcp://${target.host}:${target.port}` : target.name,
      width: 48
    });
    const isConnected = await printer.isPrinterConnected().catch(() => false);
    if (isConnected) {
      printThermalBillEscPos(printer, bill);
      await printer.execute();
      return { ok: true, via: `escpos:${target.name}` };
    }
  } catch (e: any) {
    // fall through to raw paths
    if (process.env.GH_POS_DEBUG) console.warn('[print] escpos failed, falling back:', e?.message);
  }

  // 2) Raw TCP ESC/POS
  if (target.type === 'tcp' && target.host) {
    try {
      await tcpEscPosPrint(target.host, target.port || 9100, text);
      return { ok: true, via: `tcp:${target.host}:${target.port}` };
    } catch (e: any) {
      return { ok: false, via: 'tcp', error: String(e?.message || e) };
    }
  }

  // 3) Windows driver raw print
  if (os.platform() === 'win32' && target.name) {
    try {
      await windowsRawPrint(target.name, text);
      return { ok: true, via: `windows:${target.name}` };
    } catch (e: any) {
      return { ok: false, via: `windows:${target.name}`, error: String(e?.message || e) };
    }
  }

  // 4) Nothing configured — still return text so renderer can preview/save.
  return { ok: false, via: 'none', error: 'No thermal printer configured. Set it in Settings → Printer.' };
}
