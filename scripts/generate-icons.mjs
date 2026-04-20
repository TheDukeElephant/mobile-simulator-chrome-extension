// Generates placeholder PNG icons (solid rounded square with a phone glyph)
// at 16/32/48/128 px. Uses only Node built-ins (zlib).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// Brand colors
const BG = [9, 105, 218, 255];     // accent blue
const FG = [255, 255, 255, 255];   // white phone

function makeIcon(size) {
  const w = size;
  const h = size;
  const pixels = Buffer.alloc(w * h * 4);

  const radius = Math.max(2, Math.round(size * 0.18));
  // Phone body: centered rectangle ~60% wide, ~80% tall
  const phoneW = Math.round(size * 0.5);
  const phoneH = Math.round(size * 0.78);
  const phoneX = Math.round((size - phoneW) / 2);
  const phoneY = Math.round((size - phoneH) / 2);
  const phoneR = Math.max(1, Math.round(size * 0.08));
  // Inner screen ~80% of phone
  const screenInsetX = Math.max(1, Math.round(phoneW * 0.08));
  const screenInsetY = Math.max(1, Math.round(phoneH * 0.12));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let color;
      if (insideRoundedRect(x, y, 0, 0, w, h, radius)) {
        color = BG;
        if (insideRoundedRect(x, y, phoneX, phoneY, phoneW, phoneH, phoneR)) {
          color = FG;
          if (
            insideRoundedRect(
              x,
              y,
              phoneX + screenInsetX,
              phoneY + screenInsetY,
              phoneW - screenInsetX * 2,
              phoneH - screenInsetY * 2,
              Math.max(1, Math.round(phoneR * 0.5)),
            )
          ) {
            color = BG;
          }
        }
      } else {
        color = [0, 0, 0, 0];
      }
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = color[3];
    }
  }

  return encodePng(w, h, pixels);
}

function insideRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || py < y || px >= x + w || py >= y + h) return false;
  const corners = [
    { cx: x + r, cy: y + r, qx: px < x + r, qy: py < y + r },
    { cx: x + w - r - 1, cy: y + r, qx: px > x + w - r - 1, qy: py < y + r },
    { cx: x + r, cy: y + h - r - 1, qx: px < x + r, qy: py > y + h - r - 1 },
    { cx: x + w - r - 1, cy: y + h - r - 1, qx: px > x + w - r - 1, qy: py > y + h - r - 1 },
  ];
  for (const c of corners) {
    if (c.qx && c.qy) {
      const dx = px - c.cx;
      const dy = py - c.cy;
      if (dx * dx + dy * dy > r * r) return false;
    }
  }
  return true;
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Add filter byte (0) at start of each row
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

for (const size of [16, 32, 48, 128]) {
  const png = makeIcon(size);
  writeFileSync(resolve(outDir, `icon-${size}.png`), png);
  console.log(`Wrote icon-${size}.png (${png.length} bytes)`);
}
