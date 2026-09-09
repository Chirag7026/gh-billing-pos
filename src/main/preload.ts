import { contextBridge, ipcRenderer } from 'electron';

const api = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (patch: any) => ipcRenderer.invoke('settings:save', patch)
  },
  db: {
    connect: (uri?: string) => ipcRenderer.invoke('db:connect', uri)
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    now: () => ipcRenderer.invoke('sync:now'),
    pause: () => ipcRenderer.invoke('sync:pause'),
    resume: () => ipcRenderer.invoke('sync:resume'),
    onStatus: (cb: (s: any) => void) => {
      const fn = (_e: any, s: any) => cb(s);
      ipcRenderer.on('sync:status', fn);
      return () => ipcRenderer.removeListener('sync:status', fn);
    }
  },
  printers: {
    list: () => ipcRenderer.invoke('printers:list')
  },
  auth: {
    session: () => ipcRenderer.invoke('auth:session'),
    needsSetup: () => ipcRenderer.invoke('auth:needsSetup'),
    setup: (username: string, password: string) => ipcRenderer.invoke('auth:setup', { username, password }),
    login: (username: string, password: string) => ipcRenderer.invoke('auth:login', { username, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    changePassword: (username: string, oldPass: string, newPass: string) =>
      ipcRenderer.invoke('auth:changePassword', { username, oldPass, newPass })
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (u: any) => ipcRenderer.invoke('users:create', u),
    update: (id: string, patch: any) => ipcRenderer.invoke('users:update', { id, patch })
  },
  products: {
    list: (q?: any) => ipcRenderer.invoke('products:list', q || {}),
    getByBarcode: (barcode: string) => ipcRenderer.invoke('products:getByBarcode', barcode),
    nextBarcode: () => ipcRenderer.invoke('products:nextBarcode'),
    save: (doc: any) => ipcRenderer.invoke('products:save', doc),
    remove: (id: string) => ipcRenderer.invoke('products:delete', id)
  },
  ledgers: {
    list: (q?: any) => ipcRenderer.invoke('ledgers:list', q || {}),
    save: (doc: any) => ipcRenderer.invoke('ledgers:save', doc),
    remove: (id: string) => ipcRenderer.invoke('ledgers:delete', id)
  },
  sales: {
    nextBillNo: () => ipcRenderer.invoke('sales:nextBillNo'),
    list: (q?: any) => ipcRenderer.invoke('sales:list', q || {}),
    get: (id: string) => ipcRenderer.invoke('sales:get', id),
    save: (bill: any, print: boolean) => ipcRenderer.invoke('sales:save', { bill, print }),
    remove: (id: string) => ipcRenderer.invoke('sales:delete', id),
    reprint: (id: string) => ipcRenderer.invoke('sales:reprint', id)
  },
  purchases: {
    list: (q?: any) => ipcRenderer.invoke('purchases:list', q || {}),
    get: (id: string) => ipcRenderer.invoke('purchases:get', id),
    save: (bill: any, printLabels?: any[]) => ipcRenderer.invoke('purchases:save', { bill, printLabels }),
    remove: (id: string) => ipcRenderer.invoke('purchases:delete', id)
  },
  labels: {
    preview: (job: any) => ipcRenderer.invoke('labels:preview', job),
    print: (jobs: any[]) => ipcRenderer.invoke('labels:print', jobs)
  },
  rpt: {
    import: (kind: 'receipt' | 'label') => ipcRenderer.invoke('rpt:import', kind),
    clear: (kind: 'receipt' | 'label') => ipcRenderer.invoke('rpt:clear', kind),
    sample: (kind: 'receipt' | 'label') => ipcRenderer.invoke('rpt:sample', kind)
  },
  excel: {
    dialog: (mode: 'open' | 'save', filters?: any[]) => ipcRenderer.invoke('excel:dialog', mode, filters),
    exportProducts: (filePath: string) => ipcRenderer.invoke('excel:exportProducts', filePath),
    importProducts: (filePath: string) => ipcRenderer.invoke('excel:importProducts', filePath),
    exportLedgers: (filePath: string, group?: string) => ipcRenderer.invoke('excel:exportLedgers', { filePath, group }),
    importLedgers: (filePath: string) => ipcRenderer.invoke('excel:importLedgers', filePath),
    exportSales: (filePath: string, from?: string, to?: string) => ipcRenderer.invoke('excel:exportSales', { filePath, from, to }),
    exportPurchase: (filePath: string, supplier?: string, from?: string, to?: string) =>
      ipcRenderer.invoke('excel:exportPurchase', { filePath, supplier, from, to }),
    exportLowStock: (filePath: string) => ipcRenderer.invoke('excel:exportLowStock', filePath)
  },
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    onMaxState: (cb: (maxed: boolean) => void) => {
      const fn = (_e: any, v: boolean) => cb(v);
      ipcRenderer.on('win:maxState', fn);
      return () => ipcRenderer.removeListener('win:maxState', fn);
    }
  },
  app: {
    exit: (backup = true) => ipcRenderer.invoke('app:exit', { backup })
  },
  backup: {
    dir: () => ipcRenderer.invoke('backup:dir'),
    dirs: () => ipcRenderer.invoke('backup:dirs'),
    list: () => ipcRenderer.invoke('backup:list'),
    now: () => ipcRenderer.invoke('backup:now'),
    counts: () => ipcRenderer.invoke('backup:counts'),
    integrity: () => ipcRenderer.invoke('backup:integrity'),
    latest: () => ipcRenderer.invoke('backup:latest'),
    restore: (archivePath: string) => ipcRenderer.invoke('backup:restore', archivePath)
  },
  stock: {
    master: () => ipcRenderer.invoke('stock:master'),
    low: () => ipcRenderer.invoke('stock:low'),
    adjust: (p: any) => ipcRenderer.invoke('stock:adjust', p),
    adjustments: (limit?: number) => ipcRenderer.invoke('stock:adjustments', { limit })
  }
};

contextBridge.exposeInMainWorld('pos', api);
export type PosApi = typeof api;
