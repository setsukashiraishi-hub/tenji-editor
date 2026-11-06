// 点図の手直し（点を打つ・消す）：格子と、用紙の上の点の両方
const assert = require('assert');
global.self = global;
require('../js/figure.js');
const F = global.TenjiFigure;

// 本文の点図（マス）：⠿ ⠀ のマスを格子にして、手直しを当てはめる
const g = F.cellsToGrid(['⠿⠀']);
assert.strictEqual(g.w, 4); assert.strictEqual(g.h, 3);
assert.strictEqual(g.bits.filter(Boolean).length, 6);
F.applyGridEdits(g, [[(0 + 0.5) / 4, (0 + 0.5) / 3, 0], [(2 + 0.5) / 4, (1 + 0.5) / 3, 1]]); // 1の点を消し、2マス目の2の点を打つ
assert.deepStrictEqual(F.dotsToCells(g.bits, g.w, g.h), ['⠾⠂']);

// 点図ファイル：格子に合わせて点を足し、近くの点を消す
const lay = { dots: [{ x: 10, y: 10, d: 1.2 }, { x: 12.5, y: 10, d: 1.2 }], rects: [], box: { x0: 8.75, y0: 8.75, w: 10, h: 10 }, grid: { ox: 10, oy: 10, p: 2.5 } };
F.applyDotEdits(lay, [[(12.4 - 8.75) / 10, (10.1 - 8.75) / 10, 0], [(15.1 - 8.75) / 10, (12.4 - 8.75) / 10, 1], [(15 - 8.75) / 10, (12.5 - 8.75) / 10, 1]]);
assert.strictEqual(lay.dots.length, 2, '1つ消して1つ足す（同じ場所に2度は打たない）');
assert.ok(lay.dots.some(d => d.x === 15 && d.y === 12.5), '格子の位置にそろえて打つ');
assert.ok(!lay.dots.some(d => d.x === 12.5), '近くの点を消す');
console.log('figure: all passed');
