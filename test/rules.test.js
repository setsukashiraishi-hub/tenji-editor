// 点字表記の基本ルールの確認（『点字のきまり』の例文など）
const assert = require('assert');
const { getTokenizer, engine: E } = require('./harness.js');

const CASES = [
  ['兄はやさしい。', 'アニワ ヤサシイ。'],
  ['駅へ行く。', 'エキエ イク。'],
  ['おとうさん', 'オトーサン'],
  ['言う', 'イウ'],
  ['雨が降った。風も吹いた。', 'アメガ フッタ。  カゼモ フイタ。'],
  ['明子はひまわりのように明るく笑った。', 'アキコワ ヒマワリノヨーニ アカルク ワラッタ。'],
  ['列車が遅れたため駅はひどく混み合っていた。', 'レッシャガ オクレタ タメ エキワ ヒドク コミアッテ イタ。'],
  ['点字用紙', 'テンジ ヨーシ'],
  ['松並木', 'マツナミキ'],
  ['勉強する', 'ベンキョー スル'],
  ['関係ない。', 'カンケイ ナイ。'],
  ['間違えない。', 'マチガエナイ。'],
  ['書こうと思う。', 'カコート オモウ。'],
  ['山田太郎さん', 'ヤマダ タローサン'],
  ['ルイ・ブライユ', 'ルイ ブライユ']
];

const BRAILLE = [
  ['アメガ フッタ。  カゼモ フイタ。', '⠁⠿⠐⠡⠀⠭⠂⠕⠲⠀⠀⠡⠐⠻⠾⠀⠭⠃⠕⠲'],
  ['10エン', '⠼⠁⠚⠤⠋⠴'],          // 数字のあとのア行はつなぎ符
  ['2カイ', '⠼⠃⠡⠃'],
  ['NHK', '⠰⠠⠠⠝⠓⠅'],             // 二重大文字符
  ['Aガタ', '⠰⠠⠁⠤⠐⠡⠕'],         // 英字と仮名の間はつなぎ符
  ['キャ ギャ ピャ', '⠈⠡⠀⠘⠡⠀⠨⠥'],
  ['ファイル ティー', '⠢⠥⠃⠙⠀⠈⠗⠒'],
  ['「ウン」', '⠤⠉⠴⠤'],
  ['3.14', '⠼⠉⠂⠁⠙']
];

(async () => {
  const tk = await getTokenizer();
  let fail = 0;
  for (const [src, want] of CASES) {
    const got = E.tokensToKana(tk.tokenize(E.normalizeInput(src))).kana;
    if (got !== want) { fail++; console.log('NG', src, '\n  want:', want, '\n  got: ', got); }
  }
  for (const [kana, want] of BRAILLE) {
    const got = E.kanaToBraille(kana).cells;
    if (got !== want) { fail++; console.log('NG', kana, '\n  want:', want, '\n  got: ', got); }
    assert.strictEqual(E.brailleToKana(got), kana, '逆変換: ' + kana);
  }
  if (fail) { console.log(fail + ' 件失敗'); process.exit(1); }
  console.log('rules: all passed (' + (CASES.length + BRAILLE.length) + ')');
})().catch(e => { console.error(e); process.exit(1); });
