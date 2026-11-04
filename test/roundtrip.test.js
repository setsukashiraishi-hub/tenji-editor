// 書き出したファイルを読み戻して、点字が一致するかを確認する
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getTokenizer, engine: E } = require('./harness.js');
const F = require('../js/formats.js');

const SAMPLE = `点字は、ルイ・ブライユが考案した文字です。
ブライユが生まれたのは、１８０９年１月４日です。
「おいしい？」「うん」
ＮＨＫは10円の切手をA型の人に売る。列車が遅れたため駅はひどく混み合っていた。毎日日記を書こうと思う。`;

(async () => {
  const tk = await getTokenizer();
  const rows = SAMPLE.split('\n').map(src => {
    const k = E.tokensToKana(tk.tokenize(E.normalizeInput(src)));
    return { src, kana: k.kana, cells: E.kanaToBraille(k.kana).cells, para: true };
  });
  const opt = { cols: 32, lines: 18, indent: true, title: 'テスト' };
  const expected = E.layoutPages(rows, opt).flat().join('\n');
  for (const id of ['bse', 'brl', 'brf', 'pef', 'bes', 'txt-braille']) {
    const data = await F.exportFile(id, rows, opt);
    const ext = F.EXPORTS.find(x => x.id === id).ext;
    const back = await F.readFile('x.' + ext, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    assert.strictEqual(back.mode, 'braille', id);
    const got = back.rows.filter(r => !r.pagebreak).map(r => r.cells).join('\n');
    assert.strictEqual(got, expected, id + ' の読み戻しが一致しません');
    console.log('OK', id, data.length, 'bytes');
  }
  for (const id of ['docx-kana', 'docx-braille']) {
    const data = await F.exportFile(id, rows, opt);
    const text = await F.readDocxText(data.buffer);
    if (id === 'docx-kana') assert.strictEqual(text, rows.map(r => r.kana).join('\n'));
    console.log('OK', id, data.length, 'bytes');
  }
  // 折り返した段落でも、頭の2マスあけが残ること
  const firstLines = E.layoutPages(rows, opt).flat().filter(l => l.startsWith('⠀⠀'));
  assert.strictEqual(firstLines.length, rows.length, '段落の頭のマスあけ');
  // 32マスを超える行がないこと
  E.layoutPages(rows, opt).flat().forEach(l => assert.ok(Array.from(l).length <= 32));
  // 点字 → かな → 点字 が元に戻ること
  for (const r of rows) assert.strictEqual(E.kanaToBraille(E.brailleToKana(r.cells)).cells, r.cells, r.src);
  // 他のビューアのサンプル（BES/BSE）が読めること
  const S = process.env.SAMPLES;
  if (S) {
    for (const f of ['test_all_bes_patterns.bes', 'test_all_bse_patterns.bse']) {
      const b = fs.readFileSync(path.join(S, f));
      const r = await F.readFile(f, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      console.log('OK read', f, r.rows.length, 'rows; first:', r.rows[0].cells);
    }
  }
  console.log('all passed');
})().catch(e => { console.error(e); process.exit(1); });
