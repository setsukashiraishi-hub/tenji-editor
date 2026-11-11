// 英語の点字：UEB（統一英語点字）グレード１と、日本語の文中の英語（外字符・外国語引用符）
// 例は文部科学省「点字学習指導の手引」（令和5年）第8章第5節と、日本点字委員会の決まり（2023年）から。
// 大量の英文での確認は liblouis（オープンソースの点訳ソフト）の UEB の表と比べて行った（データはリポジトリに入れない）
const assert = require('assert');
const { getTokenizer, engine: E } = require('./harness');

(async () => {
  const tk = await getTokenizer();
  const fallback = surf => { let o = ''; for (const ch of surf) { const t = tk.tokenize(ch)[0]; if (t && t.reading && t.reading !== '*') o += t.reading; else return null; } return o; };
  const cells = s => E.kanaToBraille(E.sumijiToKana(s, x => tk.tokenize(x), { fallback }).kana).cells;
  let n = 0;
  const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };
  const U = t => E.englishBraille(t, true);

  // UEB（手引の例）
  eq(U('lemon cake'), '⠇⠑⠍⠕⠝⠀⠉⠁⠅⠑');
  eq(U('Louis Braille'), '⠠⠇⠕⠥⠊⠎⠀⠠⠃⠗⠁⠊⠇⠇⠑');
  eq(U('NEW YORK'), '⠠⠠⠝⠑⠺⠀⠠⠠⠽⠕⠗⠅', '大文字単語符');
  eq(U('FIR-TREE'), '⠠⠠⠋⠊⠗⠤⠠⠠⠞⠗⠑⠑', 'ハイフンの後も大文字単語符');
  eq(U("BETTY’S HAT"), '⠠⠠⠃⠑⠞⠞⠽⠄⠠⠎⠀⠠⠠⠓⠁⠞', 'アポストロフィの後は大文字符');
  eq(U('THE SOUND OF MUSIC'), '⠠⠠⠠⠞⠓⠑⠀⠎⠕⠥⠝⠙⠀⠕⠋⠀⠍⠥⠎⠊⠉⠠⠄', '3語以上は大文字パッセージ符と大文字終止符');
  eq(U('2023'), '⠼⠃⠚⠃⠉');
  eq(U('3.14'), '⠼⠉⠲⠁⠙', '小数点 ⠲');
  eq(U('50,000'), '⠼⠑⠚⠂⠚⠚⠚', '桁区切り ⠂');
  eq(U('8m 95cm'), '⠼⠓⠍⠀⠼⠊⠑⠰⠉⠍', '数字の後の a〜j に１級記号符');
  eq(U('3D'), '⠼⠉⠠⠙');
  eq(U('“No,” said Paul.'), '⠦⠠⠝⠕⠂⠴⠀⠎⠁⠊⠙⠀⠠⠏⠁⠥⠇⠲');
  eq(U('sandwich(es)'), '⠎⠁⠝⠙⠺⠊⠉⠓⠐⠣⠑⠎⠐⠜');
  eq(U('café'), '⠉⠁⠋⠘⠌⠑', '修飾符');
  eq(U('À La Carte'), '⠠⠘⠡⠁⠀⠠⠇⠁⠀⠠⠉⠁⠗⠞⠑');
  // liblouis と同じになることを確かめた例
  eq(U('SDGs'), '⠠⠠⠎⠙⠛⠠⠄⠎', '大文字の後に小文字が続くときは大文字終止符');
  eq(U('$12.50 50% A/B'), '⠈⠎⠼⠁⠃⠲⠑⠚⠀⠼⠑⠚⠨⠴⠀⠠⠁⠸⠌⠠⠃');
  eq(U('[x] — ok...'), '⠨⠣⠭⠨⠜⠀⠠⠤⠀⠕⠅⠲⠲⠲');
  eq(U('CHAPTER XIV MINA HARKER’S JOURNAL 2'), '⠠⠠⠠⠉⠓⠁⠏⠞⠑⠗⠀⠭⠊⠧⠀⠍⠊⠝⠁⠀⠓⠁⠗⠅⠑⠗⠄⠎⠀⠚⠕⠥⠗⠝⠁⠇⠠⠄⠀⠼⠃', '数字だけの語は大文字の続きを切らない');
  // 点字から英文へ
  for (const t of ['THE SOUND OF MUSIC', 'Louis Braille', '50,000 and 3.14', 'NASA’s 3D map', '“No,” said Paul.', 'café', 'sandwich(es)', 'SDGs'])
    eq(E.englishFromBraille(U(t), true).replace(/’/g, "'"), t.replace(/’/g, "'"), '読み戻し ' + t);

  // 一般の日本語の文章：アクセント符 ⠈（日本点字委員会 2023年）
  eq(E.englishBraille('café', false), '⠉⠁⠋⠈⠑');
  eq(E.englishFromBraille('⠉⠁⠋⠈⠑', false), 'café');

  // 日本語の文中（手引の例）
  eq(cells('new の反意語は old。'), '⠦⠝⠑⠺⠴⠀⠎⠀⠥⠴⠃⠐⠪⠄⠀⠦⠕⠇⠙⠴⠲', '英単語は外国語引用符、閉じの後は1マスあけ');
  eq(cells('経済学（economics）を学んだ。'), '⠫⠃⠐⠱⠃⠐⠡⠩⠶⠦⠑⠉⠕⠝⠕⠍⠊⠉⠎⠴⠶⠔⠀⠵⠅⠴⠐⠕⠲');
  eq(cells('U ターンする'), '⠰⠠⠥⠀⠕⠒⠴⠀⠹⠙', '文字として使うアルファベットは外字符');
  eq(cells('ALT'), '⠰⠠⠠⠁⠇⠞');
  eq(cells('SDGs'), '⠰⠠⠠⠎⠙⠛⠰⠎');
  assert.ok(cells('iPhone を買った').startsWith('⠦⠊⠠⠏⠓⠕⠝⠑⠴⠀'), '公式データ：英単語は1語でも外国語引用符'); n++;
  assert.ok(cells('café に行った').startsWith('⠦⠉⠁⠋⠈⠑⠴'), 'アクセント記号の付いた文字は外字符では書けない'); n++;
  assert.ok(cells('2000kcal').endsWith('⠰⠅⠉⠁⠇'), '単位は外字符'); n++;
  assert.ok(cells('id を入力').startsWith('⠰⠊⠙'), '略語は外字符'); n++;
  // 番号のハイフン（公式データ：Q１－３－１ は ⠟⠼⠁⠤⠼⠉⠤⠼⠁）は数式にしない
  assert.ok(cells('Q１－３－１．').includes('⠟⠼⠁⠤⠼⠉⠤⠼⠁⠲'), 'Q番号'); n++;
  // 点字から読み戻すとき（公式の点字データで見つかった形）
  const back = (lines) => { const st = {}; return lines.map(l => E.brailleToKana(l, st)).join('\n'); };
  eq(back(['⠔⠔⠀⠪⠒⠻⠃⠀⠦⠠⠏⠗⠑⠎⠎⠀', '⠗⠑⠇⠑⠁⠎⠑⠴⠀⠇⠀⠜⠙⠲']), '⁑ コーセイ ⟪Press ⟫\n⟪release⟫ ニ ヨル。', '行をまたぐ外国語引用符');
  eq(back(['⠦⠠⠊⠞⠀⠴⠀⠛⠕⠕⠙⠲⠴⠀⠞']), '⟪It was good.⟫ ト', '縮約（グレード２）の was');
  eq(back(['⠦⠠⠧⠊⠝⠑⠇⠯⠤⠠⠠⠊⠊⠴']), '⟪Vineland-II⟫', '縮約 and');
  eq(back(['⠦⠠⠢⠞⠊⠞⠇⠑⠰⠞⠴']), '⟪Entitlement⟫', '縮約 en・ment');
  eq(back(['⠦⠠⠠⠇⠑⠛⠕⠶⠰⠠⠗⠶⠴']), '⟪LEGO(R)⟫', '英語の中の日本語のカッコ');
  // グレード２（liblouis の表で書いた英文を読み戻せる）
  eq(E.englishFromBraille2('⠠⠝⠕⠗⠀⠔⠀⠮⠀⠠⠎⠏⠻⠍⠀⠠⠱⠁⠇⠑⠀⠜⠑⠀⠐⠮⠀⠁⠝⠽⠀⠷⠀⠘⠹⠀⠃⠇⠎⠀⠷⠀⠃⠐⠕⠆'), 'Nor in the Sperm Whale are there any of those blinds of bone;');
  eq(E.englishFromBraille2('⠠⠊⠄⠇⠇⠀⠞⠑⠇⠇⠀⠽⠀⠭⠄⠎⠀⠛⠗⠞⠻⠀⠹⠁⠝⠀⠽⠗⠎⠲'), "I'll tell you it's greater than yours.");
  console.log(`english: all passed (${n})`);
})().catch(e => { console.error(e); process.exit(1); });
