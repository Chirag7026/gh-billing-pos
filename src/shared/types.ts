// Shared types mirrored between main + renderer (serialized over IPC).
export type PaymentType = 'Cash' | 'Debit';
export type PricingMode = 'Wholesale' | 'Retail';
export type LedgerGroup = 'Bank Account' | 'Sundry Creditors' | 'Sundry Debtors';
export type BalanceType = 'Cr' | 'Dr';

export interface ProductDTO {
  _id?: string;
  name: string;
  barcode: string;
  hsnCode?: string;
  gstRate?: number;
  convFactor?: number;
  group?: string;
  unit?: string;
  mrp?: number;
  purRate?: number;
  whRate?: number;
  rtRate?: number;
  boxStock?: number;
  cloQty?: number;
  updatedAt?: string;
}

export interface LedgerDTO {
  _id?: string;
  accountName: string;
  phone?: string;
  city?: string;
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
  pack: number;
  qty: number;
  unit?: string;
  rate: number;
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

export interface AppSettings {
  mongoUri: string;
  syncEndpoint: string;
  syncToken: string;
  syncEnabled: boolean;
  thermalPrinter: string;
  thermalInterface: string; // e.g. printer:POS-80 | tcp://192.168.1.50 | COM3
  labelPrinter: string;
  labelMode: 'TSPL' | 'ZPL' | 'WINDOWS';
  brandHeader: string;
  backupPath: string; // custom backup dir (USB / OneDrive / Drive); '' = %APPDATA%/billing_pos/backups
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
  backupPath: ''
};
