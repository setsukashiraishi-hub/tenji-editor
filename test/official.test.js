// 公式の点字データ（厚生労働省 点字ダウンロード）の読み・分かち書きと比べる。
// official_kana.json は、公式の点字をかなに読み戻したもの（墨字はその元の文）。
const assert = require('assert');
const { getTokenizer, engine: E } = require('./harness');
const data = require('./fixtures/official_kana.json');
const words = k => k.replace(/⁑/g, 'ヲヲ').replace(/[（）()「」『』]/g, '').replace(/ +/g, ' ').trim().split(' ');

(async () => {
  const tk = await getTokenizer();
  let total = 0, diff = 0;
  for (const { src, kana } of data) {
    const mine = E.sumijiToKana(src, t => tk.tokenize(t), {}).kana;
    const a = words(kana), b = words(mine);
    total += a.length;
    // 語の並びの差（LCS）
    const L = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
    for (let x = a.length - 1; x >= 0; x--) for (let y = b.length - 1; y >= 0; y--) L[x][y] = a[x] === b[y] ? L[x + 1][y + 1] + 1 : Math.max(L[x + 1][y], L[x][y + 1]);
    const d = a.length - L[0][0];
    if (d) { diff += d; if (process.env.VERBOSE) console.log(`  ${src.slice(0, 30)}…\n    公式: ${kana}\n    今  : ${mine}`); }
  }
  console.log(`official: ${data.length}段落・${total}語のうち、公式と違う語 ${diff}`);
  // 辞書の読み（ねんきん定期便・誕生月など）や、見出しの折り返しによる差だけが残る
  assert.ok(diff <= 15, `公式と違う語が多すぎます（${diff}）`);

  // 点字のきまり（公式データ・日本点字表記法による）
  const conv = s => E.sumijiToKana(s, t => tk.tokenize(t), {}).kana;
  const cases = [
    ['障害者であることを理由とする', 'ショーガイシャデ アル コトヲ リユート スル'],
    ['障害者に対して', 'ショーガイシャニ タイシテ'],
    ['理由として', 'リユート シテ'],
    ['防止するという観点', 'ボーシ スルト イウ カンテン'],
    ['募集又は採用', 'ボシュー マタワ サイヨー'],
    ['手当等の賃金', 'テアテ トーノ チンギン'],
    ['50歳未満の方には', '50サイ ミマンノ カタニワ'],
    ['措置のように', 'ソチノヨーニ'],
    ['できるように', 'デキルヨーニ'],
    ['合理的配慮（法第36条）', 'ゴーリテキ ハイリョ（ホー ダイ36ジョー）'],
    ['イ　障害者を排除すること。', 'イ。 ショーガイシャヲ ハイジョ スル コト。'],
    ['（1）「募集」とは', '（1） 「ボシュー」トワ'],
    ['第1　趣旨', 'ダイ1  シュシ'],
    ['1　募集及び採用', '1  ボシュー オヨビ サイヨー'],
    ['これは本ではない。', 'コレワ ホンデワ ナイ。'],
    ['美しくない。', 'ウツクシク ナイ。'],
    ['午前10時30分', 'ゴゼン 10ジ 30プン'],
    ['CDを買う', 'CDヲ カウ'],
  ];
  for (const [s, w] of cases) assert.strictEqual(conv(s), w, s);
  // 点字の形
  assert.strictEqual(E.kanaToBraille('（ア（イ）ウ）').cells, '⠶⠁⠰⠶⠃⠶⠆⠉⠶', 'カッコの中のカッコは ⠰⠶ … ⠶⠆');
  assert.strictEqual(E.kanaToBraille('CDヲ').cells, '⠰⠠⠠⠉⠙⠤⠔', '英字の後の仮名はつなぎ符');
  assert.strictEqual(E.kanaToBraille('FIELD NOTES').cells, '⠦⠠⠠⠋⠊⠑⠇⠙⠀⠠⠠⠝⠕⠞⠑⠎⠴', '2語以上の英語は外国語引用符');
  assert.strictEqual(E.kanaToBraille('Japanese').cells, '⠰⠠⠚⠁⠏⠁⠝⠑⠎⠑', '1語の英語は外字符');
  const back = E.brailleToKana('⠶⠁⠰⠶⠃⠶⠆⠉⠶');
  assert.strictEqual(typeof back === 'string' ? back : back.kana, '（ア（イ）ウ）', 'カッコの中のカッコを読み戻す');
  // 英語以外の外国語：アクセント記号つきの文字はアクセント符 ⠈ を前に付け、要確認にする。ほかの文字（ハングルなど）も要確認
  const fr = E.sumijiToKana('カフェ（café）', t => tk.tokenize(t), {});
  assert.ok(E.kanaToBraille(fr.kana).cells.includes('⠰⠉⠁⠋⠈⠑'), 'é はアクセント符＋e');
  assert.strictEqual(fr.foreign.length, 1, '英語以外の外国語として知らせる');
  assert.strictEqual(E.sumijiToKana('안녕하세요', t => tk.tokenize(t), {}).foreign[0].kind.slice(0, 4), 'ハングル');
  assert.strictEqual(E.sumijiToKana('Japanese [dʒæ̀pəníːz]', t => tk.tokenize(t), {}).foreign.length, 0, '発音記号は外国語にしない');
  console.log('official: all passed');
})().catch(e => { console.error(e); process.exit(1); });
