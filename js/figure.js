/*
 * 画像 → 点図（6点の点の並びで描いた図）
 * 1マス＝横2点×縦3点として、画像を白黒にしてから点に置き換えます。
 * 写真よりも、線画・グラフ・地図のような単純な図に向いています。
 */
(function (root) {
  'use strict';

  // 大津の方法で白黒のしきい値を決める
  function otsu(gray) {
    const hist = new Array(256).fill(0);
    for (const g of gray) hist[g]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; th = t; }
    }
    return th;
  }

  // 点の並び（true=点あり）→ 点字の行
  const DOT_BIT = [[1, 8], [2, 16], [4, 32]]; // [行][列] → 点のビット（1〜6の点）
  function dotsToCells(dots, w, h) {
    const lines = [];
    for (let y = 0; y < h; y += 3) {
      let line = '';
      for (let x = 0; x < w; x += 2) {
        let bits = 0;
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < h && xx < w && dots[yy * w + xx]) bits |= DOT_BIT[dy][dx];
        }
        line += String.fromCharCode(0x2800 + bits);
      }
      lines.push(line.replace(/⠀+$/, ''));
    }
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    while (lines.length && !lines[0]) lines.shift();
    return lines;
  }

  async function imageToCells(blob, opt) {
    opt = opt || {};
    const maxCols = opt.maxCols || 28, maxLines = opt.maxLines || 15;
    const bmp = await createImageBitmap(blob);
    let w = maxCols * 2;
    let h = Math.round(bmp.height / bmp.width * w);
    if (h > maxLines * 3) { h = maxLines * 3; w = Math.max(2, Math.round(bmp.width / bmp.height * h)); }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // 透明部分は白として扱う
    ctx.drawImage(bmp, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    const th = otsu(gray);
    // 暗い部分を点にする。暗い部分が半分を超える画像（黒背景など）は反転する
    let dots = Array.from(gray, g => g < th);
    if (dots.filter(Boolean).length > dots.length / 2) dots = dots.map(d => !d);
    return dotsToCells(dots, w, h);
  }

  root.TenjiFigure = { imageToCells, dotsToCells };
})(typeof self !== 'undefined' ? self : this);
