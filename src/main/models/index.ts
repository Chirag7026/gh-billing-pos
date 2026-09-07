import { Schema, model, models, Types } from 'mongoose';

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, index: true, trim: true },
    barcode: { type: String, required: true, unique: true, index: true, trim: true },
    hsnCode: { type: String, default: '' },
    gstRate: { type: Number, default: 0 },
    convFactor: { type: Number, default: 1 },
    group: { type: String, default: '', index: true },
    unit: { type: String, default: 'Pcs' },
    mrp: { type: Number, default: 0 },
    purRate: { type: Number, default: 0 },
    whRate: { type: Number, default: 0 },
    rtRate: { type: Number, default: 0 },
    boxStock: { type: Number, default: 0 },
    cloQty: { type: Number, default: 0 }
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);
ProductSchema.index({ name: 'text' });

export const Product = models.Product || model('Product', ProductSchema);

const LedgerSchema = new Schema(
  {
    accountName: { type: String, required: true, index: true, trim: true },
    phone: { type: String, default: '' },
    city: { type: String, default: '' },
    group: { type: String, enum: ['Bank Account', 'Sundry Creditors', 'Sundry Debtors'], default: 'Sundry Debtors', index: true },
    openingBalance: { type: Number, default: 0 },
    balanceType: { type: String, enum: ['Cr', 'Dr'], default: 'Dr' },
    currentBalance: { type: Number, default: 0 }
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);
export const Ledger = models.Ledger || model('Ledger', LedgerSchema);

const SaleItem = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product' },
    name: String,
    barcode: String,
    pack: Number,
    qty: Number,
    unit: String,
    rate: Number,
    amount: Number
  },
  { _id: false }
);

const SaleSchema = new Schema(
  {
    billNo: { type: String, unique: true, index: true },
    date: { type: String, index: true }, // DD/MM/YYYY
    time: { type: String },
    paymentType: { type: String, enum: ['Cash', 'Debit'], default: 'Cash', index: true },
    pricingMode: { type: String, enum: ['Wholesale', 'Retail'], default: 'Wholesale' },
    customerId: { type: Types.ObjectId, ref: 'Ledger' },
    customerName: { type: String, default: '12345678 CASH', index: true },
    items: [SaleItem],
    totalItems: Number,
    totalPackQty: Number,
    totalUnits: Number,
    subTotal: Number,
    grandTotal: Number
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);
export const Sale = models.Sale || model('Sale', SaleSchema);

const PurchaseItem = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product' },
    name: String,
    barcode: String,
    qty: Number,
    purRate: Number,
    mrp: Number,
    whRate: Number,
    rtRate: Number,
    amount: Number
  },
  { _id: false }
);

const PurchaseSchema = new Schema(
  {
    purchaseBillNo: { type: String, index: true },
    date: { type: Date, index: true },
    supplierId: { type: Types.ObjectId, ref: 'Ledger' },
    supplierName: { type: String, index: true },
    paymentType: { type: String, enum: ['Cash', 'Debit'], default: 'Cash' },
    items: [PurchaseItem],
    totalPurchaseAmount: Number
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);
export const Purchase = models.Purchase || model('Purchase', PurchaseSchema);

const SyncStateSchema = new Schema({
  key: { type: String, unique: true },
  lastSyncAt: { type: Date, default: null }
});
export const SyncState = models.SyncState || model('SyncState', SyncStateSchema);
