// Decode the 8-bit RGB/RGBA PNGs emitted by CDP, without adding a dependency.
import { inflateSync } from "node:zlib";
export function decode(data) {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(data, "base64");
  let w, h, c;
  const parts = [];
  for (let i = 8; i < b.length;) {
    const n = b.readUInt32BE(i),
      t = b.toString("ascii", i + 4, i + 8),
      d = b.subarray(i + 8, i + 8 + n);
    if (t === "IHDR") {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      if (d[8] !== 8 || ![2, 6].includes(d[9])) throw Error("Unsupported PNG");
      c = d[9] === 6 ? 4 : 3;
    }
    if (t === "IDAT") parts.push(d);
    i += n + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)),
    out = Buffer.alloc(w * h * c),
    stride = w * c;
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    for (let x = 0; x < stride; x++) {
      const a = x >= c ? out[y * stride + x - c] : 0,
        u = y ? out[(y - 1) * stride + x] : 0,
        l = y && x >= c ? out[(y - 1) * stride + x - c] : 0;
      let v = 0;
      if (f === 1) v = a;
      if (f === 2) v = u;
      if (f === 3) v = (a + u) >> 1;
      if (f === 4) {
        const q = a + u - l,
          pa = Math.abs(q - a),
          pb = Math.abs(q - u),
          pc = Math.abs(q - l);
        v = pa <= pb && pa <= pc ? a : pb <= pc ? u : l;
      }
      out[y * stride + x] = (raw[p++] + v) & 255;
    }
  }
  return { w, h, c, data: out };
}
