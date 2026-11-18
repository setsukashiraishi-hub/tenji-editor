// 大きな辞書の候補（kept.tsv）の読みが、公式の点字（allkana.txt）に何回出てくるかを数える
// 出力 bigdict/ccount.bin（Int32、読みごとに [発行元6つ × (語頭, どこでも)]）と bigdict/cpat.txt（読みの一覧）
const fs = require('fs');
const D = (process.env.TENJI_WORK || './work/');
const TAGS = ['mhlw', 'jlpt', 'tsukuba', 'nagoya', 'crawl', 'jprint'];
const T = TAGS.length;
// 点字の書き方にそろえる：オ段・ウ段のあとのウを長音に
const N1 = w => w.replace(/([オコゴソゾトドノホボポモヨロヲョォウクグスズツヅヌフブプムユルュゥヴ])ウ/g, '$1ー');
const N = s => s.split(/[ 　]+/).map(N1).join('');
const pat = new Map();
const pats = [];
const add = s => { if (!s || s.length < 2) return; s = N(s); if (s.length < 2 || s.length > 24) return; if (!pat.has(s)) { pat.set(s, pats.length); pats.push(s); } };
const lines = fs.readFileSync(D + 'bigdict/kept.tsv', 'utf8').split('\n');
let maxLen = 0;
for (const line of lines) {
  if (!line) continue;
  const f = line.split('\t');
  const toks = f[2].split('|').map(x => x.split(':'));
  if (toks.every(t => t[1] && t[1] !== '?')) add(toks.map(t => t[1]).join(''));
  for (const c of f[3].split(' ')) { const [read, pron] = c.split('/'); add(read); if (pron) add(pron); }
}
for (const s of pats) if (s.length > maxLen) maxLen = s.length;
console.error('patterns', pats.length, 'maxLen', maxLen);
const cnt = new Int32Array(pats.length * T * 3);
// 語の終わり（または助詞などが続くだけ）で終わるか
const TAILOK = /^(?:ノ|ヲ|ガ|ニ|ワ|デ|ト|モ|ヘ|ヤ|カ|カラ|マデ|ヨリ|ナド|ダケ|ホド|シカ|サエ|コソ|デス|ダ|デシタ|ダッタ|ナラ)*[、。，．」』）)〕］】”！？・…⠀-⣿]*$/;
const rows = fs.readFileSync(D + 'jprint/allkana.txt', 'utf8').split('\n');
let nr = 0;
const t0 = Date.now();
for (const row of rows) {
  const tab = row.indexOf('\t');
  if (tab < 0) continue;
  const ti = TAGS.indexOf(row.slice(0, tab));
  if (ti < 0) continue;
  const words = row.slice(tab + 1).trim().split(/[ 　]+/).filter(Boolean);
  let s = '';
  const ws = new Set();
  const wend = []; // 位置 → その語の終わり
  for (const w0 of words) {
    let w = N1(w0);
    // 語の頭のカッコ・記号は飛ばす
    const m = /^[「『（(〔［【⦅｟“⁑・]+/.exec(w);
    if (m) { for (let k = 0; k < m[0].length; k++) wend.push(s.length + m[0].length); s += m[0]; w = w.slice(m[0].length); }
    ws.add(s.length);
    for (let k = 0; k < w.length; k++) wend.push(s.length + w.length);
    s += w;
  }
  for (let p = 0; p < s.length - 1; p++) {
    const isWs = ws.has(p);
    const lim = Math.min(maxLen, s.length - p);
    for (let len = 2; len <= lim; len++) {
      const id = pat.get(s.substr(p, len));
      if (id === undefined) continue;
      const b = (id * T + ti) * 3;
      cnt[b + 1]++;
      if (isWs) {
        cnt[b]++;
        const e = p + len, we = wend[e - 1];
        if (e === we || TAILOK.test(s.slice(e, we))) cnt[b + 2]++;
      }
    }
  }
  if (++nr % 200000 === 0) console.error(nr, Math.round((Date.now() - t0) / 1000) + 's');
}
fs.writeFileSync(D + 'bigdict/cpat.txt', pats.join('\n') + '\n');
fs.writeFileSync(D + 'bigdict/ccount.bin', Buffer.from(cnt.buffer));
console.error('done', nr, Math.round((Date.now() - t0) / 1000) + 's');
