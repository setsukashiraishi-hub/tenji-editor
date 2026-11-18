// MeCab の sys.dic（ダブル配列＋語の表＋素性）から、すべての見出し語と素性を取り出す
// 使い方: node mecabdump.js sys.dic 出力.tsv
const fs = require('fs');
const [IN, OUT] = process.argv.slice(2);
const buf = fs.readFileSync(IN);
let o = 0;
const u32 = () => { const v = buf.readUInt32LE(o); o += 4; return v; };
const magic = u32(), version = u32(), type = u32(), lexsize = u32(), lsize = u32(), rsize = u32(), dsize = u32(), tsize = u32(), fsize = u32(), dummy = u32();
const charset = buf.slice(o, o + 32).toString('latin1').replace(/\0.*$/, ''); o += 32;
console.error({ version, type, lexsize, lsize, rsize, dsize, tsize, fsize, charset });
const daOff = o, tokOff = daOff + dsize, featOff = tokOff + tsize;
const n = dsize / 8;
const base = new Int32Array(n), check = new Uint32Array(n);
for (let i = 0; i < n; i++) { base[i] = buf.readInt32LE(daOff + i * 8); check[i] = buf.readUInt32LE(daOff + i * 8 + 4); }
const feature = off => { let e = featOff + off; while (buf[e] !== 0) e++; return buf.toString('utf8', featOff + off, e); };
const out = fs.openSync(OUT, 'w');
let lines = [], count = 0;
const flush = () => { if (lines.length) { fs.writeSync(out, lines.join('')); lines = []; } };
// Darts 0.32（MeCab）：状態は「base の値 b」。子（バイト x）は p = b + x + 1 で check[p] === b、次の状態は base[p]
// 語の終わり：check[b] === b かつ base[b] < 0 のとき、値 = -base[b] - 1（上位が語の表の位置、下位8ビットが同じ見出しの数）
const stack = [[base[0], []]];
while (stack.length) {
  const [b, key] = stack.pop();
  if (b >= 0 && b < n && check[b] === b && base[b] < 0) {
    const v = -base[b] - 1;
    const num = v & 0xff, idx = v >>> 8;
    const surface = Buffer.from(key).toString('utf8');
    for (let k = 0; k < num; k++) {
      const p = tokOff + (idx + k) * 16;
      const wcost = buf.readInt16LE(p + 6), fo = buf.readUInt32LE(p + 8);
      lines.push(surface + '\t' + wcost + '\t' + feature(fo) + '\n');
      count++;
    }
    if (lines.length > 20000) flush();
  }
  for (let x = 0; x < 256; x++) {
    const p = b + x + 1;
    if (p > 0 && p < n && check[p] === b && p !== b) stack.push([base[p], key.concat([x])]);
  }
}
flush(); fs.closeSync(out);
console.error('entries', count);
