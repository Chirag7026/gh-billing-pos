# Golden Heera POS — Windows Desktop Billing & Inventory

Standalone high-performance billing + inventory for fast retail/wholesale checkout
with wireless barcode (wedge) scanner, 80mm ESC/POS thermal receipts and 50×25mm
barcode stickers (TSPL/ZPL/Windows driver).

## Stack

- Electron + React (TypeScript) + Tailwind + Node.js
- Local MongoDB `mongodb://localhost:27017/billing_pos` via Mongoose
- `exceljs` import/export pipelines (exact header mappings from spec)
- Background differential sync every 10s against remote REST API
- ESC/POS thermal + TSPL/ZPL label printing, raw Windows fallback

## Prerequisites

1. Node.js 20+ (Windows)
2. Local MongoDB running on `mongodb://localhost:27017/billing_pos`
   - Quick start: `mongod --dbpath C:\data\db` or install MongoDB Community as a service.
3. Printers: 80mm thermal (USB/Network/COM) + label printer (TSPL/ZPL or Windows driver).

## Install & Run

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev:all   # vite :5173 + electron
```

Individual:

```powershell
npm run dev          # renderer only (browser preview; IPC bridge disabled)
npm run dev:electron # electron only (needs vite running or falls back to dist/)
npm run typecheck
npm run build        # electron-builder → release/
```

## First Run

1. Create master Admin password (setup wizard at `/login`).
2. Settings → verify MongoDB URI → Test MongoDB.
3. Settings → select thermal + label printers; thermal interface accepts
   `printer:POS-80`, `tcp://192.168.1.50:9100`, or `COM3`.
4. Products → Import XLSX (empty barcodes auto-sequenced) or Product Add (F5 auto-fills next code).
5. Sales Add (F1): scanner trap auto-focused; wedge burst + Enter adds the line.

## Keyboard Map

F1 Sales Add · F2 Sales Display · F3 Purchase Add · F4 Purchase Display ·
F5 Product Add · F6 Product Display · F7 Supplier Add · F8 Supplier Display

Enter works as Tab in every form (advances + auto-selects). Exemption: the
barcode field keeps focus on Enter — the scan resolves, the line is added or
its quantity incremented, the field clears for the next scan.

## Backup & Restore

- Engine: `src/main/backup.ts` using bundled `mongodump.exe`/`mongorestore.exe`
  (`resources/bin/`, stage via `scripts/download-mongo-tools.ps1`).
- Triggers: silent daily snapshot (24h scheduler), snapshot on TitleBar ✕ exit,
  manual button in Settings → Backup & Restore (Admin-gated).
- Archives: `%APPDATA%/billing_pos/backups/backup_YYYY-MM-DD_HH-mm-ss.tar.gz`
  (custom folder supported — USB / OneDrive / Drive); last 30 kept, older pruned.
- Restore: pick a local snapshot or external `.tar.gz`, type RESTORE to confirm;
  sync pauses, `mongorestore --drop` runs, before/after counts verify, sync resumes.

## Excel Formats

- Products: `Product Name | Barcode | HSN Code | GST% | Conv. | Group | Unit | MRP | Pur Rate | WH Rate | Rt.Rate | Box Stock | Clo. Qty`
- Customers: `Sr | Customer Name | Phone | City | Group | Opening Balance | Cr/Dr`
- Suppliers: `Sr | Account | City | Group | Opening Balance`
- Sales Register: `Sr. | Aud | Date | C/D | Bill No. | Account | Customer Name | City | Amount`

## Sync Protocol

Every 10s: push docs with `updatedAt > lastSync` (cap 2000/collection) to
`POST {endpoint}/push`, then `GET {endpoint}/pull?since=ISO`. Bearer token from
Settings. Failures recorded on the status badge, never thrown.

## Print Layouts

- Thermal: byte-exact `printThermalBill` from spec (G H header, 48-col table,
  Grand Total double-size, feed + cut). ESC/POS → raw TCP → Windows Out-Printer.
- Label 50×25mm TSPL: exact 11-line command block from spec; ZPL + CSS page-media
  fallback included.

## Project Map

- `src/main/` — Electron main, Mongoose models, IPC, sync engine, printers, Excel
- `src/renderer/` — React pages (13), scanner hook, sync badge, layouts
- `src/shared/types.ts` — DTOs shared over IPC
