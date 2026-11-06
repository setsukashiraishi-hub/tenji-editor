// BSE：見本のファイルと同じ作り（512バイトのヘッダ、各ページの1行目はページ行、FFなし、大文字）
const assert = require('assert');
const E = require('../js/engine.js');
global.TenjiEngine = E;
const F = require('../js/formats.js');

const body = k => ({ type: 'body', kana: k, cells: E.kanaToBraille(k).cells, para: true });
const rows = [{ type: 'h2', kana: 'ダイ1  シュシ', cells: E.kanaToBraille('ダイ1  シュシ').cells }];
for (let i = 0; i < 25; i++) rows.push(body('コレワ ホンブンノ ギョーデス。'));
rows.splice(3, 0, { type: 'frame-start' }, body('ワクノ ナカ'), { type: 'frame-end' });
const opt = { cols: 32, lines: 18, pageNumbers: true, indent: true };
(async () => {
const data = await F.exportFile('bse', rows, opt);
const text = Buffer.from(data).toString('latin1');
const lines = text.split('\r\n');
assert.strictEqual(lines[0].length, 512, 'ヘッダは512バイト');
assert.ok(/^ {504}\d{8}$/.test(lines[0]), 'ヘッダは空白504個＋8けた');
const pages = +lines[0].slice(504, 508);
assert.strictEqual(lines[0].slice(508), '3218', 'マス数・行数');
assert.ok(!text.includes('\f'), '改ページの記号（FF）は使わない');
assert.ok(text.endsWith('\r\n'));
const bodyLines = lines.slice(1, -1);
assert.strictEqual(Math.ceil(bodyLines.length / 18), pages, 'ページ数');
for (let p = 0; p < pages; p++) assert.strictEqual(bodyLines[p * 18], ' '.repeat(27) + '#' + 'ABCDEFGHI'[p], `${p + 1}ページのページ行（28マス目から）`);
assert.ok(bodyLines.every(l => l.length <= 32));
assert.ok(!/[a-z]/.test(text.slice(512)), '大文字のNABCC');
assert.ok(bodyLines.includes('6' + '3'.repeat(30) + '4') && bodyLines.includes('H' + '3'.repeat(30) + 'J'), '枠線は1マス目から行いっぱい');
assert.ok(bodyLines.some(l => l.startsWith('    "OB#A  ')), '見出しは5マス目、番号のあとの全角スペースは2マスあけ');

// 読み込み：ヘッダを読み、行数ごとにページに分け、ページ行を見分ける
const res = await F.readFile('t.bse', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), {});
  {
  assert.deepStrictEqual(res.layout, { cols: 32, lines: 18 });
  assert.ok(!res.rows[0].cells.includes('⠀'.repeat(100)), 'ヘッダを点字の行として読まない');
  assert.strictEqual(res.rows.filter(r => r.pagebreak).length, pages - 1, '行数ごとにページを分ける');
  assert.ok(res.rows.filter(r => r.pageLine).length === pages, '各ページの1行目はページ行');
  // 見出しの2行目以降は2マス下げる
  const hl = E.headingLines(E.kanaToBraille('ショーガイシャ ジリツ シエンホーノ ミナオシニ カカル オモナ ロンテン').cells, 6, 32);
  assert.ok(hl[0].startsWith('⠀'.repeat(6)) && !hl[0].startsWith('⠀'.repeat(7)));
  assert.ok(hl.slice(1).every(l => l.startsWith('⠀'.repeat(8)) && !l.startsWith('⠀'.repeat(9))), '2行目は9マス目から');
  console.log('bse: all passed');
  }
})().catch(e => { console.error(e); process.exit(1); });
