// 大きな辞書の語ごとに、kuromoji（今の辞書）の読みと比べる。どの辞書の読みとも合わないものだけ残す
const fs = require('fs'), readline = require('readline');
const { getTokenizer } = require('../../test/harness');
const D = (process.env.TENJI_WORK || './work/') + 'bigdict/';
const W = { U: 3, S: 2, E: 1, J: 2, K: 1 };
const norm = r => r.replace(/ヅ/g, 'ズ').replace(/ヂ/g, 'ジ').replace(/ヴァ/g, 'バ');
(async () => {
  const tk = await getTokenizer();
  const out = fs.createWriteStream(D + 'kept.tsv');
  const stat = { groups: 0, agree: 0, kept: 0, single: 0, unknown: 0, multi: 0 };
  let cur = null, rows = [];
  const flush = () => {
    if (!cur) return;
    stat.groups++;
    const toks = tk.tokenize(cur);
    let kRead = '', unk = false;
    for (const t of toks) { if (t.reading && t.reading !== '*') kRead += t.reading; else { unk = true; } }
    const cands = new Map();
    // 日本郵便（J 住所・K 事業所）の読みは小さい「ャュョッ」を大きく書くので、ほかの辞書の読みの裏付けにだけ使う
    const big = r => r.replace(/[ァィゥェォャュョッヮ]/g, c => 'アイウエオヤユヨツワ'['ァィゥェォャュョッヮ'.indexOf(c)]);
    const jk = new Set();
    for (const [, read, pron, pos, cost, src] of rows) {
      if (src === 'J' || src === 'K') { jk.add(big(read)); continue; }
      const k = read;
      if (!cands.has(k)) cands.set(k, { read, pron: '', pos: new Set(), srcs: new Set(), costU: 1e9, costS: 1e9 });
      const c = cands.get(k);
      c.srcs.add(src); c.pos.add(pos); if (pron && !c.pron) c.pron = pron;
      if (src === 'U') c.costU = Math.min(c.costU, +cost); if (src === 'S') c.costS = Math.min(c.costS, +cost);
    }
    if (!cands.size) { stat.jkOnly = (stat.jkOnly || 0) + 1; return; }
    if (!unk && [...cands.keys()].some(r => norm(r) === norm(kRead))) { stat.agree++; return; }
    const list = [...cands.values()].map(c => ({ ...c, score: [...c.srcs].reduce((a, s) => a + W[s], 0) + (jk.has(big(c.read)) ? 2 : 0), jp: jk.has(big(c.read)) }))
      .sort((a, b) => b.score - a.score || a.costU - b.costU || a.costS - b.costS);
    const kind = unk ? 'u' : toks.length === 1 ? 's' : 'm';
    stat[{ u: 'unknown', s: 'single', m: 'multi' }[kind]]++; stat.kept++;
    out.write([cur, kind, toks.map(t => t.surface_form + ':' + (t.reading || '?') + ':' + t.pos + ':' + t.pos_detail_1).join('|'),
      list.map(c => `${c.read}/${c.pron || ''}/${[...c.pos].join('')}/${[...c.srcs].sort().join('')}${c.jp ? 'J' : ''}/${c.score}`).join(' ')].join('\t') + '\n');
  };
  const rl = readline.createInterface({ input: fs.createReadStream(D + 'cands.sorted.tsv'), crlfDelay: Infinity });
  for await (const line of rl) {
    const f = line.split('\t');
    if (f[0] !== cur) { flush(); cur = f[0]; rows = []; }
    rows.push(f);
  }
  flush(); out.end();
  console.log(stat);
})();
