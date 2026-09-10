import { Schema, model, models, Types } from 'mongoose';

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, index: true, trim: true, uppercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'OPERATOR', 'CASHIER'], default: 'CASHIER', index: true },
    allowedPages: { type: [String], default: [] },
    canEditReceipt: { type: Boolean, default: true },
    canDeleteReceipt: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);
UserSchema.index({ updatedAt: 1 });
export const User = models.User || model('User', UserSchema);

const ProductSchema = new Schema(
  {
    // V2 15-field order: name, alias, barcode, group, hsnCode, gstRate,
    // gstType, minStock, convFactor, openingStock, purRate, whRate, rtRate, mrp, unit
    name: { type: String, required: true, index: true, trim: true },
    alias: { type: String, default: '', index: true, trim: true },
    barcode: { type: String, required: true, unique: true, index: true, trim: true },
    group: { type: String, default: 'GENERAL', index: true },
    hsnCode: { type: String, default: '' },
    gstRate: { type: Number, default: 0 },
    gstType: { type: String, enum: ['GST On Rate', 'GST Included'], default: 'GST On Rate' },
    minStock: { type: Number, default: 1 },
    convFactor: { type: Number, default: 1 },
    openingStock: { type: Number, default: 0 },
    purRate: { type: Number, default: 0 },
    whRate: { type: Number, default: 0 },
    rtRate: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    unit: { type: String, default: 'Pcs' },
    boxStock: { type: Number, default: 0 },
    cloQty: { type: Number, default: 0 } // closing stock; zero/negative permitted
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
    gstin: { type: String, default: '', index: true, trim: true, uppercase: true },
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
    alias: String,
    pack: Number,
    qty: Number,
    unit: String,
    rate: Number,
    gstAmount: Number,
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

const StockAdjustmentSchema = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product', index: true },
    productName: { type: String, index: true },
    barcode: { type: String, index: true },
    adjustmentType: { type: String, enum: ['ADD', 'SUBTRACT'], required: true },
    adjustedQty: { type: Number, required: true },
    previousQty: { type: Number, required: true },
    newQty: { type: Number, required: true },
    reason: { type: String, default: '' },
    adjustedBy: { type: String, default: '' },
    date: { type: Date, default: Date.now, index: true }
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);
export const StockAdjustment =
  models.StockAdjustment || model('StockAdjustment', StockAdjustmentSchema);

// V3.1 masters: product groups, units, custom GST% slabs.
const MasterSchema = new Schema(
  {
    kind: { type: String, enum: ['group', 'unit', 'gstRate'], required: true, index: true },
    name: { type: String, required: true, trim: true, uppercase: true },
    code: { type: String, default: '' }, // unit short code
    value: { type: Number, default: 0 } // gst rate numeric
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);
MasterSchema.index({ kind: 1, name: 1 }, { unique: true });
export const Master = models.Master || model('Master', MasterSchema);
