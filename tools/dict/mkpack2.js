// 追加の辞書（読み）を作る：kept.tsv ＋ 公式の点字での出現数（corpus2.js）→ lex.tsv（見出し順）
// 使い方: node mkpack2.js 出力.tsv [除く発行元,…]
// 行: 見出し \t 読み \t 発音 \t 品詞 \t ほかの読み（, 区切り） \t 種類（u 今の辞書にない / m 組み合わせで読みが違う / s 1語で読みが違う） \t 点数（点字で確かめた語は +10）
const fs = require('fs'), readline = require('readline');
const D = (process.env.TENJI_WORK || './work/') + 'bigdict/';
const OUT = process.argv[2] || D + 'lex.tsv';
const TAGS = ['mhlw', 'jlpt', 'tsukuba', 'nagoya', 'crawl', 'jprint'], T = TAGS.length;
const EX = new Set((process.argv[3] || '').split(',').filter(Boolean));
const OK = /^[一-鿿々〆ヶ㐀-䶿豈-鶴ぁ-ゖァ-ヺー・]+$/;
const N1 = w => w.replace(/([オコゴソゾトドノホボポモヨロヲョォウクグスズツヅヌフブプムユルュゥヴ])ウ/g, '$1ー');
const N = s => s.split(/[ 　]+/).map(N1).join('');
const pats = fs.readFileSync(D + 'cpat.txt', 'utf8').split('\n');
const pid = new Map(); pats.forEach((p, i) => { if (p) pid.set(p, i); });
const cnt = new Int32Array(fs.readFileSync(D + 'ccount.bin').buffer.slice(0));
const use = TAGS.map(t => !EX.has(t));
// よく使う語の同音語（キンショー＝僅少・金賞、コージ＝工事）がある読みは、点字に出てくる数があてにならない
const HOMO = new Map();
for (const l of fs.readFileSync(D + 'chomo2.tsv', 'utf8').split('\n')) { if (!l) continue; const [i, n, f] = l.split('\t'); HOMO.set(+i, { n: +n, f }); }
const homo = (s, surf) => { const id = pid.get(N(s)); const h = id === undefined ? null : HOMO.get(id); return !!h && (h.n >= 2 || h.f !== surf); };
const count = (s, mode = 2) => { // 0 語頭 1 どこでも 2 語全体（助詞が続くだけ）
  if (!s) return 0;
  const id = pid.get(N(s));
  if (id === undefined) return 0;
  let n = 0;
  for (let t = 0; t < T; t++) if (use[t]) n += cnt[(id * T + t) * 3 + mode];
  return n;
};
(async () => {
  const rows = [];
  const stat = { total: 0, skipChars: 0, skipSingle: 0, skipWeak: 0, kept: 0, ambiguous: 0, byBraille: 0, dropByBraille: 0, rescued: 0, verified: 0 };
  const rl = readline.createInterface({ input: fs.createReadStream(D + 'kept.tsv'), crlfDelay: Infinity });
  for await (const line of rl) {
    stat.total++;
    const [surf, kind, toks, cands] = line.split('\t');
    if (!OK.test(surf) || !/[一-鿿々〆ヶ㐀-䶿豈-鶴]/.test(surf)) { stat.skipChars++; continue; }
    const tk = toks.split('|').map(x => x.split(':'));
    const K = tk.every(t => t[1] && t[1] !== '?') ? tk.map(t => t[1]).join('') : null;
    const cs = cands.split(' ').map(x => { const [read, pron, pos, srcs, score] = x.split('/'); return { read, pron, pos, srcs, score: +score }; });
    for (const c of cs) c.n = count(c.pron || c.read);
    const nK = K ? count(K) : 0;
    const long = s => N(s).length >= 3;
    let best = cs[0], verified = false;
    // 公式の点字に出てくる読みを選ぶ（語の頭に2回以上、ほかの読みより多いとき）
    // （同音語のない読みで、3回以上出てきて、いまの読みが一度も出てこないときだけ）
    const rd = c => c.pron || c.read;
    const byN = cs.filter(c => c.score >= 2 && long(rd(c))).slice().sort((a, b) => b.n - a.n);
    if (byN.length && byN[0] !== best && byN[0].n >= 2 && (byN.length < 2 || byN[0].n > byN[1].n) && (!homo(rd(byN[0]), surf) || byN[0].n >= 3 * (best.n + 1))) {
      cs.splice(cs.indexOf(byN[0]), 1); cs.unshift(byN[0]); best = cs[0]; stat.byBraille++;
    }
    // 今の辞書の読みのほうが公式の点字に多く出てくるなら、使わない（任命権者 ニンメイケンシャ）
    if (K && long(K) && long(rd(best)) && !homo(K, surf) && nK >= 2 && nK > best.n) { stat.dropByBraille++; continue; }
    if (long(rd(best)) && !homo(rd(best), surf) && best.n >= 2 && (!K || nK === 0)) verified = true;
    if (verified) stat.verified++;
    if (!verified) {
      if (kind === 's' && best.score < 5) { stat.skipSingle++; continue; }
      // 組み合わせの語は、NEologd だけにある語は使わない（人名の取り違えが多い）。人名は UniDic か SudachiDict にあるものだけ
      if (kind === 'm' && (best.score < 2 || (best.pos.includes('P') && !/[US]/.test(best.srcs)))) { stat.skipWeak++; continue; }
    } else if ((kind === 's' && best.score < 5) || (kind === 'm' && (best.score < 2 || (best.pos.includes('P') && !/[US]/.test(best.srcs))))) stat.rescued++;
    // 用言（活用形）は、このエディタでは使わない（今の辞書の区切りで読むほうが確か）
    if ((best.pos[0] || 'N') === 'V' || (best.pos[0] || 'N') === 'X') { stat.skipVerb = (stat.skipVerb || 0) + 1; continue; }
    const alts = cs.slice(1).filter(c => (c.score >= 2 && best.score - c.score <= 2) || c.n >= 2).map(c => c.read);
    if (alts.length) stat.ambiguous++;
    stat.kept++;
    // 発音：UniDic の発音があればそれを使う。ないときは、オ段・ウ段のあとの「ウ」を長音にする（動詞・形容詞は語の終わりの「ウ」をそのまま）
    const heur = best.read.replace(/([オコゴソゾトドノホボポモヨロヲョォウクグスズツヅヌフブプムユルュゥヴ])ウ(?!$)/g, '$1ー').replace(/([オコゴソゾトドノホボポモヨロヲョォウクグスズツヅヌフブプムユルュゥヴ])ウ$/, (m, a) => best.pos.includes('V') ? m : a + 'ー');
    const pron = best.pron && /U/.test(best.srcs) ? best.pron : heur;
    rows.push([surf, best.read, pron !== best.read ? pron : '', best.pos[0] || 'N', alts.slice(0, 4).join(','), kind, best.score + (verified ? 10 : 0)]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  fs.writeFileSync(OUT, rows.map(r => r.join('\t')).join('\n') + '\n');
  console.log(OUT, [...EX].join(','), JSON.stringify(stat), 'bytes', fs.statSync(OUT).size);
})();
