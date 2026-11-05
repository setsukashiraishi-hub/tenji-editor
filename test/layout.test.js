// 枠と表の形：枠線は中身に合わせ、表は列をそろえ、枠の中は3マス目から。1行に入らない表は項目ごとに書く
const { engine: E } = require('./harness');
const assert = require('assert');
const L = s => Array.from(s).length;
const tableRow = cells => { const tkana = cells; return { type: 'table', tkana, kana: cells.join('  '), cells: E.kanaToBraille(cells.join('  ')).cells }; };
const body = k => ({ type: 'body', kana: k, cells: E.kanaToBraille(k).cells, para: true });
const show = pages => pages.forEach((p, i) => { console.log(`--- page ${i + 1}`); p.forEach(l => console.log('|' + l.replace(/⠀/g, ' ') + '|')); });

// 1. 入る表：列の頭がそろい、枠の中（3マス目）から
let rows = [{ type: 'frame-start' }, tableRow(['セイサク・セッケイ', '82']), tableRow(['チョーサ', '68']), tableRow(['キョーユー・ハッシン', '55']), { type: 'frame-end' }];
let pages = E.layoutPages(rows, { cols: 32, lines: 18 });
show(pages);
let p = pages[0];
assert.ok(p[0].startsWith('⠀⠀⠖') && p[4].startsWith('⠀⠀⠓'), '枠線は3マス目から');
assert.strictEqual(L(p[0]), L(p[4]), '枠の上下は同じ長さ');
const col2 = p.slice(1, 4).map(l => l.indexOf('⠼'));
assert.ok(col2.every(x => x === col2[0]), '2列目の頭がそろう');
assert.ok(p.slice(1, 4).every(l => l.startsWith('⠀⠀') && L(l) < L(p[0])), '中身は枠の中に入る');
assert.ok(L(p[0]) < 32, '枠線は中身に合わせて短くなる');

// 2. 入らない表：項目ごと（見出し：値）
rows = [{ type: 'frame-start' }, tableRow(['コーモク', 'ナイヨー', 'ヨート']), tableRow(['シャシン', 'フンイキヤ クーカンノ イメージ', 'シカクテキナ ソキュー']),
  tableRow(['グラフ', 'スーチヤ ケイコーオ ミヤスク セイリ', 'ヒカク・ブンセキ']), { type: 'frame-end' }];
pages = E.layoutPages(rows, { cols: 32, lines: 18 });
show(pages);
p = pages[0];
assert.ok(p.every(l => L(l) <= 32), '32マスをこえない');
assert.ok(p.slice(1, -1).every(l => l.startsWith('⠀⠀')), '枠の中は3マス目から');
assert.ok(p.some(l => l.includes(E.kanaToBraille('ナイヨー').cells + '⠐⠂')), '列の見出し：値 で書く');
assert.ok(rows[2]._fit.mode === 'list');

// 3. 枠は、ページの終わりに入りきらなければ次のページへまとめて送る
rows = [];
for (let i = 0; i < 14; i++) rows.push(body('ホンブン'));
rows.push({ type: 'frame-start' }, tableRow(['ア', '1']), tableRow(['イ', '2']), tableRow(['ウ', '3']), { type: 'frame-end' });
pages = E.layoutPages(rows, { cols: 32, lines: 18 });
assert.strictEqual(pages.length, 2);
assert.ok(pages[1][0].includes('⠖'), '枠の始まりは次のページの頭');
assert.ok(!pages[0].some(l => l.includes('⠖')), '前のページに枠線だけ残らない');

// 4. 枠の中の文は3マス目から折り返し、枠線は32マスまで
rows = [{ type: 'frame-start' }, body('コレワ ワクノ ナカニ カイタ ナガイ ブンショーデ、 イチギョーニワ オサマラナイ ナガサデス。'), { type: 'frame-end' }];
pages = E.layoutPages(rows, { cols: 32, lines: 18, indent: true });
show(pages);
p = pages[0];
assert.ok(p.slice(1, -1).every(l => l.startsWith('⠀⠀') && L(l) <= 32));
assert.ok(p[1].startsWith('⠀⠀⠀⠀') && !p[2].startsWith('⠀⠀⠀'), '段落の頭は5マス目、続きは3マス目');
console.log('layout: all passed');
