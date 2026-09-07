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
    setup: (password: string) => ipcRenderer.invoke('auth:setup', { password }),
    login: (password: string) => ipcRenderer.invoke('auth:login', { password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    changePassword: (oldPass: string, newPass: string) => ipcRenderer.invoke('auth:changePassword', { oldPass, newPass })
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
    save: (bill: any, printLabels?: any[]) => ipcRenderer.invoke('purchases:save', { bill, printLabels }),
    remove: (id: string) => ipcRenderer.invoke('purchases:delete', id)
  },
  labels: {
    preview: (job: any) => ipcRenderer.invoke('labels:preview', job),
    print: (jobs: any[]) => ipcRenderer.invoke('labels:print', jobs)
  },
  excel: {
    dialog: (mode: 'open' | 'save', filters?: any[]) => ipcRenderer.invoke('excel:dialog', mode, filters),
    exportProducts: (filePath: string) => ipcRenderer.invoke('excel:exportProducts', filePath),
    importProducts: (filePath: string) => ipcRenderer.invoke('excel:importProducts', filePath),
    exportLedgers: (filePath: string, group?: string) => ipcRenderer.invoke('excel:exportLedgers', { filePath, group }),
    importLedgers: (filePath: string) => ipcRenderer.invoke('excel:importLedgers', filePath),
    exportSales: (filePath: string, from?: string, to?: string) => ipcRenderer.invoke('excel:exportSales', { filePath, from, to })
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
    exit: () => ipcRenderer.invoke('app:exit')
  },
  backup: {
    dir: () => ipcRenderer.invoke('backup:dir'),
    list: () => ipcRenderer.invoke('backup:list'),
    now: () => ipcRenderer.invoke('backup:now'),
    counts: () => ipcRenderer.invoke('backup:counts'),
    restore: (archivePath: string) => ipcRenderer.invoke('backup:restore', archivePath)
  }
};

contextBridge.exposeInMainWorld('pos', api);
export type PosApi = typeof api;
