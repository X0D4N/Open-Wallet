#!/usr/bin/env node
// Draws the app icon (four layered rounded bands on a white rounded square)
// into assets/icon.png with no dependencies: pixels are computed with
// anti-aliased signed-distance shapes and written as a PNG with zlib.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256;
const px = new Float32Array(S * S * 4); // premultiplied RGBA, 0..1

function roundRectSdf(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function fill(shape, rgb) {
  const [r, g, b] = rgb.map((v) => v / 255);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = shape(x + 0.5, y + 0.5);
      const a = Math.min(1, Math.max(0, 0.5 - d));
      if (a <= 0) continue;
      const i = (y * S + x) * 4;
      px[i] = r * a + px[i] * (1 - a);
      px[i + 1] = g * a + px[i + 1] * (1 - a);
      px[i + 2] = b * a + px[i + 2] * (1 - a);
      px[i + 3] = a + px[i + 3] * (1 - a);
    }
  }
}

// Background tile.
fill((x, y) => roundRectSdf(x, y, 128, 128, 120, 120, 56), [255, 255, 255]);
// Bands (48-unit design scaled to 256 with a margin).
const k = 256 / 48 * 0.78;
const off = 128 - 24 * k;
const band = (top, rgb) => fill((x, y) => roundRectSdf(x, y, off + 24 * k, off + (top + 6) * k, 18 * k, 6 * k, 6 * k), rgb);
band(9, [76, 141, 246]);
band(16, [47, 179, 107]);
band(23, [246, 182, 43]);
band(28, [238, 91, 71]);

// Encode PNG.
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const a = px[i + 3];
    const o = y * (S * 4 + 1) + 1 + x * 4;
    raw[o] = a ? Math.round((px[i] / a) * 255) : 0;
    raw[o + 1] = a ? Math.round((px[i + 1] / a) * 255) : 0;
    raw[o + 2] = a ? Math.round((px[i + 2] / a) * 255) : 0;
    raw[o + 3] = Math.round(a * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
]);
const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${png.length} bytes)`);
