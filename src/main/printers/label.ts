import { exec } from 'node:child_process';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getSettings } from '../config.js';

export interface LabelJob {
  title: string; // product title, e.g. BINDI-1D-B CARD-D54
  pack: string | number; // conv factor
  code: string; // centered bold numeric, e.g. 54984
  barcodeData: string; // Code128 data, e.g. 010069
  copies?: number;
  brandHeader?: string;
}

// ---------------------------------------------------------------------------
// TSPL (50mm x 25mm) — exact structure from spec
// ---------------------------------------------------------------------------
export function buildTspl(job: LabelJob): string {
  const brand = job.brandHeader ?? getSettings().brandHeader ?? 'G H';
  const copies = Math.max(1, Math.min(999, job.copies ?? 1));
  return [
    'SIZE 50 mm, 25 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
    `TEXT 200,10,"3",0,1,1,"${brand}"`,
    `TEXT 15,40,"2",0,1,1,"${truncate(job.title, 24)}"`,
    `TEXT 360,40,"2",0,1,1,"${job.pack}"`,
    `TEXT 140,65,"4",0,1,1,"${job.code}"`,
    `BARCODE 30,110,"128",45,1,0,2,2,"${job.barcodeData}"`,
    `TEXT 330,120,"2",90,1,1,"${job.barcodeData}"`,
    `PRINT 1,${copies}`
  ].join('\n');
}

export function buildZpl(job: LabelJob): string {
  const copies = Math.max(1, Math.min(999, job.copies ?? 1));
  return [
    '^XA',
    '^PW400^LL200',
    `^FO150,10^A0N,30,30^FD${job.brandHeader ?? 'G H'}^FS`,
    `^FO15,45^A0N,22,22^FD${truncate(job.title, 24)}^FS`,
    `^FO340,45^A0N,22,22^FD${job.pack}^FS`,
    `^FO120,75^A0N,40,40^FD${job.code}^FS`,
    `^FO20,125^BCN,45,Y,N,N^FD${job.barcodeData}^FS`,
    `^FO300,125^A0N,20,20^FD${job.barcodeData}^FS`,
    `^PQ${copies}`,
    '^XZ'
  ].join('\n');
}

/** CSS Page Media fallback (50mm x 25mm) — printable HTML for Windows driver. */
export function buildLabelHtml(job: LabelJob): string {
  const brand = job.brandHeader ?? getSettings().brandHeader ?? 'G H';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: 50mm 25mm; margin: 0; }
html,body { margin:0; padding:0; width:50mm; height:25mm; font-family: Arial, sans-serif; }
.label { width:50mm; height:25mm; padding:1mm 2mm; box-sizing:border-box; }
.brand { text-align:center; font-weight:bold; font-size:11pt; }
.row { display:flex; justify-content:space-between; font-size:8pt; margin-top:1mm; }
.code { text-align:center; font-weight:bold; font-size:14pt; margin-top:0.5mm; }
.bottom { display:flex; justify-content:space-between; align-items:flex-end; margin-top:1mm; }
.barcode { font-family:'Libre Barcode 128', monospace; font-size:22pt; }
.vert { writing-mode: vertical-rl; font-size:8pt; }
</style></head><body><div class="label">
<div class="brand">${escapeHtml(brand)}</div>
<div class="row"><span>${escapeHtml(truncate(job.title, 24))}</span><span>${escapeHtml(String(job.pack))}</span></div>
<div class="code">${escapeHtml(job.code)}</div>
<div class="bottom"><span class="barcode">*${escapeHtml(job.barcodeData)}*</span><span class="vert">${escapeHtml(job.barcodeData)}</span></div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`;
}

function truncate(s: string, n: number) {
  return (s || '').slice(0, n).replace(/"/g, '');
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function sendRawToPrinter(printerName: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `gh-label-${Date.now()}.prn`);
    fs.writeFileSync(tmp, data, 'utf8');
    const ps = `$b=[IO.File]::ReadAllBytes('${tmp.replace(/'/g, "''")}'); $p=Get-WmiObject Win32_Printer | Where-Object {$_.Name -eq '${printerName.replace(/'/g, "''")}'}; $p.PrintByteStream($b) | Out-Null`;
    exec(`powershell -NoProfile -Command "${ps.replace(/"/g, '`"')}"`, { windowsHide: true }, (err) => {
      fs.rm(tmp, { force: true }, () => undefined);
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function printLabels(jobs: LabelJob[]): Promise<{ ok: boolean; via: string; error?: string }> {
  const s = getSettings();
  const mode = s.labelMode || 'TSPL';
  const printerName = s.labelPrinter;

  if (mode === 'WINDOWS' || !printerName) {
    // Return HTML so renderer can open print window; if printer set, also try raw.
    return { ok: !printerName ? false : true, via: 'windows-html', error: printerName ? undefined : 'Label printer not configured' };
  }
  const payload = jobs.map((j) => (mode === 'ZPL' ? buildZpl(j) : buildTspl(j))).join('\n');
  try {
    if (os.platform() === 'win32' && printerName) {
      await sendRawToPrinter(printerName, payload);
      return { ok: true, via: `${mode.toLowerCase()}:${printerName}` };
    }
    // TCP fallback if labelPrinter looks like tcp://host:9100
    if (printerName.startsWith('tcp://')) {
      const u = new URL(printerName);
      await new Promise<void>((resolve, reject) => {
        const sock = net.connect(Number(u.port || 9100), u.hostname, () => sock.write(payload, () => sock.end()));
        sock.on('close', () => resolve());
        sock.on('error', reject);
      });
      return { ok: true, via: printerName };
    }
    return { ok: false, via: mode, error: 'Unsupported label target' };
  } catch (e: any) {
    return { ok: false, via: mode, error: String(e?.message || e) };
  }
}
