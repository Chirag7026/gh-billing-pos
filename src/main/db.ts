import mongoose from 'mongoose';
import { getSettings } from './config.js';

let connected = false;
let connecting: Promise<void> | null = null;

export async function connectDb(uriOverride?: string): Promise<{ ok: boolean; uri: string; error?: string }> {
  const uri = uriOverride || getSettings().mongoUri || 'mongodb://localhost:27017/billing_pos';
  if (connected && mongoose.connection.readyState === 1) return { ok: true, uri };
  if (connecting) {
    try {
      await connecting;
      return { ok: true, uri };
    } catch (e: any) {
      return { ok: false, uri, error: String(e?.message || e) };
    }
  }
  connecting = (async () => {
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    connected = true;
  })();
  try {
    await connecting;
    return { ok: true, uri };
  } catch (e: any) {
    connected = false;
    return { ok: false, uri, error: String(e?.message || e) };
  } finally {
    connecting = null;
  }
}

export function dbStatus() {
  return { readyState: mongoose.connection.readyState, name: mongoose.connection.name || null };
}
