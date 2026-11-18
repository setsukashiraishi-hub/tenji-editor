// よく使う語の同音語があるか：読み（cpat.txt の各行）ごとに、よく使う語（SudachiDict のコスト 7600 以下・UniDic の普通名詞でコスト 9300 以下）の見出しを数える
// → bigdict/chomo2.tsv（読みの番号 \t 数 \t 最初の見出し）
const fs = require('fs'), readline = require('readline');
const D = (process.env.TENJI_WORK || './work/') + 'bigdict/';
const N1 = w => w.replace(/([オコゴソゾトドノホボポモヨロヲョォウクグスズツヅヌフブプムユルュゥヴ])ウ/g, '$1ー');
const N = s => s.split(/[ 　]+/).map(N1).join('');
const pats = fs.readFileSync(D + 'cpat.txt', 'utf8').split('\n');
const pid = new Map(); pats.forEach((p, i) => { if (p) pid.set(p, i); });
const cnt = new Int32Array(pats.length), first = new Array(pats.length);
const lastS = new Map();
(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(D + 'cands.sorted.tsv'), crlfDelay: Infinity });
  for await (const line of rl) {
    const [surf, read, pron, pos, cost, src] = line.split('\t');
    const c = +cost;
    const common = (src === 'S' && c > 0 && c <= 7600) || (src === 'U' && pos === 'N' && c <= 9300);
    if (!common) continue;
    for (const r of [read, pron]) {
      if (!r) continue;
      const id = pid.get(N(r));
      if (id === undefined || lastS.get(id) === surf) continue;
      lastS.set(id, surf);
      if (!cnt[id]) first[id] = surf;
      cnt[id]++;
    }
  }
  const out = [];
  for (let i = 0; i < pats.length; i++) if (cnt[i]) out.push(i + '\t' + cnt[i] + '\t' + first[i]);
  fs.writeFileSync(D + 'chomo2.tsv', out.join('\n') + '\n');
  const ex = ['キンショー', 'コンゼ', 'コージ', 'コーニン', 'ニンメイケンシャ', 'タイホー', 'ゴンジャ', 'ニホン', 'マイトシ'].map(s => s + '=' + cnt[pid.get(s)] + (first[pid.get(s)] || ''));
  console.log('readings with common words', out.length, ex.join(' '));
})();
