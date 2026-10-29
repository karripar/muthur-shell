// Reproducible application icon, drawn from a small code-native glyph.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
const size = 256,
  raw = Buffer.alloc((size * 4 + 1) * size);
const glyph = ["10001", "11011", "10101", "10001", "10001", "10001", "10001"];
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const i = y * (size * 4 + 1) + 1 + x * 4;
    const gx = Math.floor((x - 58) / 28),
      gy = Math.floor((y - 30) / 28);
    const ink = gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && glyph[gy][gx] === "1";
    raw[i] = ink ? 165 : 8;
    raw[i + 1] = ink ? 215 : 13;
    raw[i + 2] = ink ? 140 : 8;
    raw[i + 3] = 255;
  }
function crc(data) {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    n = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  n.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([n, t, data, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
mkdirSync("src-tauri/icons", { recursive: true });
writeFileSync("src-tauri/icons/icon.png", png);
writeFileSync("src-tauri/icons/icon.ico", Buffer.concat([ico, png]));
