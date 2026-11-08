// 数式（数学点字）：文部科学省「点字学習指導の手引」（令和5年）第8章第3節・第4節の例
const assert = require('assert');
const { getTokenizer, engine: E } = require('./harness');
(async () => {
  const tk = await getTokenizer();
  const fallback = surf => { let o = ''; for (const ch of surf) { const t = tk.tokenize(ch)[0]; if (t && t.reading && t.reading !== '*') o += t.reading; else return null; } return o; };
  const cells = s => E.kanaToBraille(E.sumijiToKana(s, x => tk.tokenize(x), { fallback }).kana).cells;
  let n = 0;
  const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };
  // 手引の例そのもの
  eq(cells('3x=a+2b'), '⠼⠉⠭⠒⠒⠁⠢⠼⠃⠰⠃', '3x=a+2b（数字のすぐ後の b に外字符）');
  eq(cells('3½'), '⠼⠉⠷⠼⠁⠌⠼⠃⠾', '帯分数');
  eq(cells('V=RI'), '⠰⠠⠧⠒⠒⠠⠗⠠⠊', '大文字の式');
  eq(cells('a₂'), '⠰⠁⠠⠆', '1桁の添え字（下がり数字）');
  eq(cells('5²'), '⠼⠑⠣', '2乗');
  eq(cells('7³'), '⠼⠛⠩', '3乗');
  eq(cells('235>218'), '⠼⠃⠉⠑⠢⠢⠼⠃⠁⠓', '大なり');
  eq(cells('215<218'), '⠼⠃⠁⠑⠔⠔⠼⠃⠁⠓', '小なり');
  eq(cells('8÷2=4'), '⠼⠓⠌⠌⠼⠃⠒⠒⠼⠙', 'わり算');
  eq(cells('面積は10㎡です。'), '⠿⠴⠻⠣⠄⠀⠼⠁⠚⠰⠍⠣⠀⠐⠟⠹⠲', '単位の2乗（公式の点字データの形）');
  eq(cells('100cm³'), '⠼⠁⠚⠚⠰⠉⠍⠩', '単位の3乗');
  // 書き方のきまり
  eq(cells('1+2=3、10×3=30'), '⠼⠁⠢⠼⠃⠒⠒⠼⠉⠰⠀⠼⠁⠚⠡⠼⠉⠒⠒⠼⠉⠚', '式の中はマスをあけない');
  eq(cells('式は y=2x+1 です。'), '⠳⠣⠄⠀⠰⠽⠒⠒⠼⠃⠭⠢⠼⠁⠀⠐⠟⠹⠲', '数字で始まらない式は数式指示符');
  eq(cells('x²+2x+1=0'), '⠰⠭⠣⠢⠼⠃⠭⠢⠼⠁⠒⠒⠼⠚', '2次式');
  eq(cells('√(x+1)'), '⠰⠜⠦⠭⠢⠼⠁⠴', '根号の中が2つ以上の要素');
  eq(cells('(a+b)/2'), '⠰⠷⠁⠢⠃⠌⠼⠃⠾', '分数（外側のカッコは分数囲みが代わる）');
  eq(cells('1/2+1/3=5/6'), '⠰⠷⠼⠁⠌⠼⠃⠾⠢⠷⠼⠁⠌⠼⠉⠾⠒⠒⠷⠼⠑⠌⠼⠋⠾', '分数の式');
  eq(cells('x^10'), '⠰⠭⠘⠼⠁⠚', '累乗');
  // 数式にしないもの
  eq(cells('2026-11-08に'), '⠼⠃⠚⠃⠋⠤⠼⠁⠁⠤⠼⠚⠓⠇', '日付');
  eq(cells('電話 03-1234-5678'), '⠐⠟⠴⠄⠀⠼⠚⠉⠤⠼⠁⠃⠉⠙⠤⠼⠑⠋⠛⠓', '電話番号');
  eq(cells('縦×横'), '⠕⠟⠀⠡⠫⠙⠀⠜⠪', '語と語のあいだの×はカケル（⠐⠿ や「バツ」にしない）');
  eq(cells('○○市'), '⠐⠵⠐⠵⠀⠳', '伏せ字');
  // 読み戻し
  for (const k of ['3x=a+2b', '3½', 'x²+2x+1=0', '(a+b)/(a-b)', 'a₂+a₃', '√(x+1)', '8÷2=4', 'V=RI']) {
    const c = cells(k); const back = E.brailleToKana(c);
    eq(back, '⟮' + k + '⟯', '点字から式に戻す: ' + k);
    eq(E.kanaToBraille(back).cells, c, '戻した式から同じ点字: ' + k);
  }
  eq(E.brailleToKana('⠼⠁⠚⠰⠍⠣'), '10⟮m²⟯', '単位の2乗を読む');
  for (const [c, k] of [['⠼⠉⠡⠐⠫⠝', '3カゲツ'], ['⠼⠑⠣⠚', '5キロ'], ['⠰⠠⠠⠉⠙⠤⠔', 'CDヲ'], ['⠰⠄⠼⠉⠡⠐⠫⠝⠐⠳⠠⠆', '〈3カゲツジ〉']]) eq(E.brailleToKana(c), k, '数式と読まない: ' + k);
  console.log(`math: all passed (${n})`);
})().catch(e => { console.error(e); process.exit(1); });
