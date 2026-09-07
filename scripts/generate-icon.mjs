/**
 * Generates assets/icon.ico with zero dependencies.
 * Draws a 256x256 logo (gold rounded-square + "H" bars on dark navy),
 * encodes it as PNG via zlib, and wraps it in a Vista-compatible
 * PNG-compressed ICO container.
 * Run: node scripts/generate-icon.mjs
 */
import { createDeflateRaw } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const deflateRaw = (buf) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const s = createDeflateRaw({ level: 9 });
    s.on('data', (c) => chunks.push(c));
    s.on('end', () => resolve(Buffer.concat(chunks)));
    s.on('error', reject);
    s.end(buf);
  });
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const W = 256;
const H = 256;
const NAVY = [15, 23, 42];
const GOLD = [212, 175, 55];
const DARK = [2, 6, 23];

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function paint() {
  const px = Buffer.alloc(W * H * 3, 0);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 3;
    px[o] = c[0];
    px[o + 1] = c[1];
    px[o + 2] = c[2];
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, NAVY);
  // Gold outer rounded square (border thickness 14, corner radius 40)
  const m = 18;
  const r = 40;
  const t = 14;
  for (let y = m; y < H - m; y++) {
    for (let x = m; x < W - m; x++) {
      const cx = Math.min(x - m, W - m - 1 - x);
      const cy = Math.min(y - m, H - m - 1 - y);
      const inOuter = cx >= 0 && cy >= 0;
      const cornerCut = cx < r && cy < r && (r - cx) ** 2 + (r - cy) ** 2 > r * r;
      const ix0 = m + t;
      const ix1 = W - m - t;
      const iy0 = m + t;
      const iy1 = H - m - t;
      const ccx = Math.min(x - ix0, ix1 - 1 - x);
      const ccy = Math.min(y - iy0, iy1 - 1 - y);
      const inInner = ccx >= 0 && ccy >= 0 && !(ccx < r && ccy < r && (r - ccx) ** 2 + (r - ccy) ** 2 > r * r);
      if (inOuter && !cornerCut && !inInner) set(x, y, GOLD);
    }
  }
  // Inner dark panel
  for (let y = m + t + 8; y < H - m - t - 8; y++)
    for (let x = m + t + 8; x < W - m - t - 8; x++) set(x, y, DARK);
  // Gold "H": two vertical bars + crossbar
  const bx0 = 78;
  const bx1 = 178;
  const bw = 26;
  const by0 = 66;
  const by1 = 190;
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x < bx0 + bw; x++) set(x, y, GOLD);
    for (let x = bx1 - bw; x < bx1; x++) set(x, y, GOLD);
  }
  for (let y = 115; y <= 141; y++) for (let x = bx0; x < bx1; x++) set(x, y, GOLD);
  return px;
}

async function toPng(px) {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    px.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = await deflateRaw(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const png = await toPng(paint());
// ICO: ICONDIR + 1 ICONDIRENTRY (256x256, 32bpp, PNG payload)
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
header[6] = 0; // width 256
header[7] = 0; // height 256
header[8] = 0; // colors
header[9] = 0; // reserved
header.writeUInt16LE(1, 10); // planes
header.writeUInt16LE(32, 12); // bpp
header.writeUInt32LE(png.length, 14); // size
header.writeUInt32LE(6 + 16, 18); // offset
mkdirSync(join(root, 'assets'), { recursive: true });
writeFileSync(join(root, 'assets', 'icon.ico'), Buffer.concat([header, png]));
console.log('Wrote assets/icon.ico');
