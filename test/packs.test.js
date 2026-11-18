// 辞書・言語パックの仕組み：追加の辞書（読み）を重ねて使うこと、外国語の点字（liblouis）のつなぎ方
// 本物のパック（数十MB）はリポジトリに入れないので、ここでは小さな辞書と、点字を返すだけの代わりの関数で確かめる。
// packs/ にパックを置いてあるとき（手元で作ったとき）は、本物の辞書でも確かめる
const assert = require('assert');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { getTokenizer, engine: E } = require('./harness');

(async () => {
  const tk = await getTokenizer();
  const fallback = surf => { let o = ''; for (const ch of surf) { const t = tk.tokenize(ch)[0]; if (t && t.reading && t.reading !== '*') o += t.reading; else return null; } return o; };
  const kana = s => E.sumijiToKana(s, x => tk.tokenize(x), { fallback }).kana;
  let n = 0;
  const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

  // 辞書がないときは今までどおり
  eq(E.lexIds().length, 0);
  const plain = kana('相模国の任命権者');
  // 小さな辞書を2つ重ねる（見出しの順に並べる。# の行は説明）
  const A = ['# テスト用の地名', '相模国\tサガミノクニ\t\tL\t\tm\t13', '藤原宮\tフジワラノミヤ\t\tL\t\tm\t12'].join('\n') + '\n';
  const B = ['# テスト用の人名と一般の語', '任命権者\tニンメイケンジャ\t\tN\t\tm\t3', '源頼朝\tミナモトノヨリトモ\t\tP\t\tm\t15', '追納\tツイノウ\tツイノー\tN\t\tm\t15'].join('\n') + '\n';
  eq(E.loadLexicon(A, 'test-a'), 2, '説明の行は数えない');
  eq(E.loadLexicon(B, 'test-b'), 3);
  eq(E.lexIds().join(','), 'test-a,test-b');
  eq(E.lexGet('相模国').reading, 'サガミノクニ');
  eq(E.lexGet('なし'), null);

  // 字にない「の」が入る読みは「の」のあとで区切る（公式の点字：サガミノ クニ、フジワラノ ミヤ）
  eq(kana('相模国（神奈川県）に'), 'サガミノ クニ（カナガワケン）ニ');
  eq(kana('藤原宮の跡'), 'フジワラノ ミヤノ アト');
  eq(kana('源頼朝が'), 'ミナモトノ ヨリトモガ');
  // 字の読みが「ノ」で始まるときは区切らない（追納 ツイノー）
  eq(kana('追納する'), 'ツイノー スル');
  // 一部だけを直すときは、接尾語などの品詞のままで、分かち書きを変えない
  assert.ok(!/ニンメイケン ジャ/.test(kana('任命権者の')), '任命権者を区切らない'); n++;
  // 辞書を外すと元に戻る
  E.loadLexicon(null, 'test-a'); E.loadLexicon(null, 'test-b');
  eq(E.lexIds().length, 0);
  eq(kana('相模国の任命権者'), plain);

  // PDF の均等割り付けで1字ずつあいた文は詰める
  eq(kana('こ の ほ か 、 使 用 者 に よ る 障 害 者 虐 待 に つ い て は'), 'コノ ホカ、 シヨーシャニ ヨル ショーガイシャ ギャクタイニ ツイテワ');

  // 外国語の点字：代わりの関数でつなぎ方を確かめる
  const FAKE = { '안녕하세요': '⠣⠒⠉⠻⠚⠠⠝⠬', 'Спасибо': '⠎⠏⠁⠎⠊⠃⠕', 'Bonjour le monde': '⠨⠃⠕⠝⠚⠕⠥⠗⠀⠇⠑⠀⠍⠕⠝⠙⠑' };
  E.setForeign({ forward: (t, table) => FAKE[t] || null, back: (c, table) => Object.keys(FAKE).find(k => FAKE[k] === c) || null,
    scripts: { hangul: 'ko-g2.ctb', cyrillic: 'ru-litbrl.ctb' }, doc: 'fr-bfu-comp6.utb', name: t => t });
  // 日本語の文の中のハングル・キリル文字は、外国語引用符の中にその言語の点字で書く
  eq(E.kanaToBraille(kana('「안녕하세요」と言った')).cells, '⠤⠦⠣⠒⠉⠻⠚⠠⠝⠬⠴⠤⠞⠀⠃⠂⠕');
  eq(E.kanaToBraille('Спасибо').cells, '⠦⠎⠏⠁⠎⠊⠃⠕⠴');
  const fp = E.sumijiToKana('안녕하세요', x => tk.tokenize(x), { fallback }).foreign;
  eq(fp.length, 1); eq(fp[0].table, 'ko-g2.ctb', '外国語の一覧に、使った表を入れる');
  // 文書の言語が外国語のとき：行の頭に DOC_MARK
  eq(E.kanaToBraille(E.DOC_MARK + 'Bonjour le monde').cells, '⠨⠃⠕⠝⠚⠕⠥⠗⠀⠇⠑⠀⠍⠕⠝⠙⠑');
  const nr = E.kanaToBraille(E.DOC_MARK + 'Inconnu');
  eq(nr.cells, ''); eq(nr.unknown.length, 1, '点字にできないときは知らせる');
  E.setForeign(null);
  eq(E.kanaToBraille('안녕').cells, '⠿⠿', 'パックがないときは今までどおり');

  // 本物のパック（packs/ にあるとき）
  const P = path.join(__dirname, '../packs/ja');
  if (fs.existsSync(path.join(P, 'ja-places.tsv.gz'))) {
    for (const id of ['ja-words', 'ja-people', 'ja-places', 'ja-names']) E.loadLexicon(zlib.gunzipSync(fs.readFileSync(path.join(P, id + '.tsv.gz'))).toString('utf8'), id);
    eq(kana('栗東市の金勝で'), 'リットーシノ コンゼデ');
    eq(kana('相模国に'), 'サガミノ クニニ');
    eq(kana('任命権者は'), 'ニンメイケンシャワ', '公式の点字で確かめて、大きな辞書の読み（ケンジャ）を使わない');
    for (const id of E.lexIds()) E.loadLexicon(null, id);
  }
  console.log(`packs: all passed (${n})`);
})().catch(e => { console.error(e); process.exit(1); });
