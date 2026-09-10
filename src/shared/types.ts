// Shared types mirrored between main + renderer (serialized over IPC).
export type PaymentType = 'Cash' | 'Debit';
export type PricingMode = 'Wholesale' | 'Retail';
export type LedgerGroup = 'Bank Account' | 'Sundry Creditors' | 'Sundry Debtors';
export type BalanceType = 'Cr' | 'Dr';
export type UserRole = 'ADMIN' | 'OPERATOR' | 'CASHIER';
export type GstType = 'GST On Rate' | 'GST Included';

export interface UserDTO {
  _id?: string;
  username: string;
  role: UserRole;
  allowedPages: string[];
  canEditReceipt?: boolean;
  canDeleteReceipt?: boolean;
  isActive: boolean;
  updatedAt?: string;
}

/** Canonical page-permission keys (RBAC). */
export const PAGE_KEYS = [
  'dashboard', 'sales-add', 'sales-display', 'purchase-add', 'purchase-display',
  'product-add', 'product-display', 'stock-master', 'stock-adjustment',
  'low-stock', 'barcode-print', 'sales-ledger', 'purchase-ledger',
  'supplier-ledger', 'settings'
] as const;

/**
 * Legacy coarse page keys (shown in Settings → User Management, matching
 * existing user records) mapped onto canonical keys for permission checks.
 */
export const LEGACY_PAGE_KEYS = [
  'dashboard', 'billing', 'products', 'purchase', 'accounts', 'stock',
  'reports', 'users', 'settings'
] as const;

export const LEGACY_PAGE_MAP: Record<string, string[]> = {
  dashboard: ['dashboard'],
  billing: ['sales-add', 'sales-display', 'sales-ledger'],
  products: ['product-add', 'product-display'],
  purchase: ['purchase-add', 'purchase-display', 'purchase-ledger'],
  accounts: ['supplier-add', 'supplier-display', 'supplier-ledger'],
  stock: ['stock-master', 'stock-adjustment', 'low-stock', 'barcode-print'],
  reports: ['sales-ledger', 'purchase-ledger'],
  users: ['settings'],
  settings: ['settings']
};

export interface ProductDTO {
  _id?: string;
  name: string;
  alias?: string;
  barcode: string;
  group?: string;
  hsnCode?: string;
  gstRate?: number;
  gstType?: GstType;
  minStock?: number;
  convFactor?: number;
  openingStock?: number;
  purRate?: number;
  whRate?: number;
  rtRate?: number;
  mrp?: number;
  unit?: string;
  boxStock?: number;
  cloQty?: number;
  updatedAt?: string;
}

export interface LedgerDTO {
  _id?: string;
  accountName: string;
  phone?: string;
  city?: string;
  gstin?: string;
  group: LedgerGroup;
  openingBalance?: number;
  balanceType?: BalanceType;
  currentBalance?: number;
  updatedAt?: string;
}

export interface SaleItemDTO {
  productId?: string;
  name: string;
  barcode: string;
  alias?: string;
  pack: number;
  qty: number;
  unit?: string;
  rate: number;
  gstAmount?: number;
  amount: number;
}

export interface SaleDTO {
  _id?: string;
  billNo: string;
  date: string; // DD/MM/YYYY
  time: string; // HH:MM:SS
  paymentType: PaymentType;
  pricingMode: PricingMode;
  customerId?: string;
  customerName: string;
  items: SaleItemDTO[];
  totalItems: number;
  totalPackQty: number;
  totalUnits: number;
  subTotal: number;
  grandTotal: number;
  updatedAt?: string;
}

export interface PurchaseItemDTO {
  productId?: string;
  name: string;
  barcode: string;
  qty: number;
  purRate: number;
  mrp?: number;
  whRate?: number;
  rtRate?: number;
  amount: number;
}

export interface PurchaseDTO {
  _id?: string;
  purchaseBillNo: string;
  date: string; // ISO
  supplierId?: string;
  supplierName: string;
  paymentType: PaymentType;
  items: PurchaseItemDTO[];
  totalPurchaseAmount: number;
  updatedAt?: string;
}

export interface StockAdjustmentDTO {
  _id?: string;
  productId?: string;
  productName: string;
  barcode: string;
  adjustmentType: 'ADD' | 'SUBTRACT';
  adjustedQty: number;
  previousQty: number;
  newQty: number;
  reason: string;
  adjustedBy: string;
  date?: string;
}

export interface AppSettings {
  mongoUri: string;
  syncEndpoint: string;
  syncToken: string;
  syncEnabled: boolean;
  syncIntervalSec: number; // 5–300, default 10
  thermalPrinter: string;
  thermalInterface: string; // e.g. printer:POS-80 | tcp://192.168.1.50 | COM3
  labelPrinter: string;
  labelMode: 'TSPL' | 'ZPL' | 'WINDOWS';
  brandHeader: string;
  backupPath: string; // Destination A override; '' = %APPDATA%/billing_pos/backups
  backupPathB: string; // Destination B (USB / drive / share); '' = disabled
  autoPrintReceipt: boolean;
  autoPrintBarcode: boolean;
  beepDurationSec: number; // item-not-found tone length
  minStockDefault: '1' | 'convFactor';
  receiptTemplate: any | null; // imported receipt .rpt (null = built-in layout)
  labelTemplate: any | null; // imported label .rpt (null = built-in layout)
}

export const DEFAULT_SETTINGS: AppSettings = {
  mongoUri: 'mongodb://localhost:27017/billing_pos',
  syncEndpoint: '',
  syncToken: '',
  syncEnabled: true,
  thermalPrinter: '',
  thermalInterface: '',
  labelPrinter: '',
  labelMode: 'TSPL',
  brandHeader: 'G H',
  backupPath: '',
  backupPathB: '',
  syncIntervalSec: 10,
  autoPrintReceipt: true,
  autoPrintBarcode: false,
  beepDurationSec: 1.5,
  minStockDefault: '1',
  receiptTemplate: null,
  labelTemplate: null
};
