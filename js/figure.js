/*
 * 点図
 *  1) 本文の中に入れる点図：画像 → 6点の点字マス（1マス＝横2点×縦3点）
 *  2) 別ファイルの点図：マス目に縛られず、用紙全体に等間隔で点を打つ（PDF / SVG）
 *     - 点で打つ（ViewPlus Tiger など、点図の打てる点字プリンタ向け）
 *     - 塗りで描く（立体コピー・カプセルペーパー向け）
 *     図の上に、見出しを点字（点の並び）で入れられます。
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

  // 画像を w×h の白黒（true＝黒＝点を打つ）にする
  async function imageToBits(blob, w, h) {
    const bmp = await createImageBitmap(blob);
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
    let bits = Array.from(gray, g => g < th);
    if (bits.filter(Boolean).length > bits.length / 2) bits = bits.map(d => !d);
    return bits;
  }
  async function imageSize(blob) {
    const bmp = await createImageBitmap(blob);
    return { w: bmp.width, h: bmp.height };
  }

  // ---------- 1) 本文に入れる点図（マス目） ----------
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
    const size = await imageSize(blob);
    let w = maxCols * 2;
    let h = Math.round(size.h / size.w * w);
    if (h > maxLines * 3) { h = maxLines * 3; w = Math.max(2, Math.round(size.w / size.h * h)); }
    return dotsToCells(await imageToBits(blob, w, h), w, h);
  }

  // ---------- 2) 別ファイルの点図（用紙全体・等間隔） ----------
  const PAPERS = {
    a4: { label: 'A4（210×297mm）', w: 210, h: 297 },
    b5: { label: 'B5（182×257mm）', w: 182, h: 257 },
    braille: { label: '点字用紙（8×10インチ）', w: 203.2, h: 254 },
    b4: { label: 'B4（257×364mm）', w: 257, h: 364 },
    a3: { label: 'A3（297×420mm）', w: 297, h: 420 }
  };
  // kind はエーデル形式での点の種類の数字（点字の点と同じ大きさ＝2）
  const DOT_SIZES = { large: { label: '大', d: 1.6, kind: '2' }, medium: { label: '中', d: 1.2, kind: '1' }, small: { label: '小', d: 0.8, kind: '3' } };
  // エーデルの描ける範囲（32マス×約700目盛り）
  const EDEL_AREA = { w: 480 * 0.4, h: 690 * 2.4 / 7 };
  // 点字（見出し用）の寸法：点の間隔 2.3mm、マスの間隔 6.0mm、行の間隔 10mm
  const BR = { dot: 2.3, cell: 6.0, line: 10.0, d: 1.4 };

  // 点字の行（Unicode 点字）→ 点の座標（mm）
  function brailleDots(text, x0, y0, maxW) {
    const dots = [];
    let x = x0, y = y0;
    for (const ch of Array.from(text)) {
      if (ch === '\n') { x = x0; y += BR.line; continue; }
      if (x + BR.dot > x0 + maxW) { x = x0; y += BR.line; }
      const bits = ch.charCodeAt(0) - 0x2800;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) {
        if (bits & DOT_BIT[dy][dx]) dots.push({ x: x + dx * BR.dot, y: y + dy * BR.dot, d: BR.d, kind: '2' });
      }
      x += BR.cell;
    }
    return { dots, bottom: y + 2 * BR.dot };
  }

  /*
   * 点図の配置を作る（単位 mm）
   * src: { blob } 画像 または { cells: [点字の行] } 本文の点図
   * opt: paper, margin, pitch（点の間隔）, size（点の大きさ）, style（'dots' | 'solid'）, titleCells, landscape
   */
  async function layoutTactile(src, opt) {
    const paper = opt.edel ? EDEL_AREA : (PAPERS[opt.paper] || PAPERS.a4);
    const pw = opt.landscape && !opt.edel ? paper.h : paper.w, ph = opt.landscape && !opt.edel ? paper.w : paper.h;
    const m = opt.edel ? 0 : (opt.margin == null ? 12 : opt.margin);
    const out = { pageW: pw, pageH: ph, dots: [], rects: [], style: opt.style || 'dots' };
    let top = m;
    if (opt.titleCells) {
      const t = brailleDots(opt.titleCells, m, m, pw - 2 * m);
      out.dots.push(...t.dots);
      top = t.bottom + 6;
    }
    const areaW = pw - 2 * m, areaH = ph - top - m;
    const sz = DOT_SIZES[opt.size] || DOT_SIZES.medium;
    const d = sz.d, kind = sz.kind;

    if (src.dots) {
      // エーデルなどから読み込んだ点：大きさはそのまま、用紙の中に収まるように縮める（大きくはしない）
      const xs = src.dots.map(p => p.x), ys = src.dots.map(p => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys), bw = Math.max(...xs) - minX || 1, bh = Math.max(...ys) - minY || 1;
      const scale = Math.min(1, areaW / bw, areaH / bh);
      const keep = opt.edel && scale === 1 && !opt.titleCells; // エーデルに書き戻すときは元の位置のまま
      for (const p of src.dots) {
        out.dots.push({ x: keep ? p.x : m + (p.x - minX) * scale, y: keep ? p.y : top + (p.y - minY) * scale, d: p.d, kind: p.kind });
      }
      return out;
    }

    if (src.cells) {
      // 本文の点図（点字マス）：マスの点の位置をそのまま等間隔の格子に置き直す
      const pitch = opt.pitch || 2.5;
      const rows = src.cells.length * 3, cols = Math.max(...src.cells.map(l => Array.from(l).length)) * 2;
      const scale = Math.min(1, areaW / (cols * pitch), areaH / (rows * pitch));
      const p = pitch * scale;
      src.cells.forEach((line, ly) => Array.from(line).forEach((ch, cx) => {
        const bits = ch.charCodeAt(0) - 0x2800;
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) {
          if (bits & DOT_BIT[dy][dx]) out.dots.push({ x: m + (cx * 2 + dx) * p, y: top + (ly * 3 + dy) * p, d, kind });
        }
      }));
      return out;
    }

    const size = await imageSize(src.blob);
    const fit = Math.min(areaW / size.w, areaH / size.h); // mm / 画像の1px
    const drawW = size.w * fit, drawH = size.h * fit;
    const x0 = m + (areaW - drawW) / 2, y0 = top;
    if (out.style === 'solid' && !opt.edel) {
      // 立体コピー用：0.4mm 単位の白黒で、黒い部分を塗る（横に続く部分はまとめる）
      const res = 0.4;
      const w = Math.max(2, Math.round(drawW / res)), h = Math.max(2, Math.round(drawH / res));
      const bits = await imageToBits(src.blob, w, h);
      for (let y = 0; y < h; y++) {
        let x = 0;
        while (x < w) {
          if (!bits[y * w + x]) { x++; continue; }
          const s = x;
          while (x < w && bits[y * w + x]) x++;
          out.rects.push({ x: x0 + s * res, y: y0 + y * res, w: (x - s) * res, h: res });
        }
      }
      return out;
    }
    // 点図プリンタ用：点の間隔ごとに、黒い部分に点を打つ
    const pitch = opt.pitch || 2.5;
    const w = Math.max(2, Math.floor(drawW / pitch)), h = Math.max(2, Math.floor(drawH / pitch));
    const bits = await imageToBits(src.blob, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (bits[y * w + x]) out.dots.push({ x: x0 + x * pitch + pitch / 2, y: y0 + y * pitch + pitch / 2, d, kind });
    }
    return out;
  }

  // ---------- 書き出し ----------
  const f2 = n => (Math.round(n * 100) / 100).toString();
  function toSVG(lay) {
    const parts = [`<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(lay.pageW)}mm" height="${f2(lay.pageH)}mm" viewBox="0 0 ${f2(lay.pageW)} ${f2(lay.pageH)}">`,
      `<rect width="100%" height="100%" fill="#fff"/>`, `<g fill="#000">`];
    for (const r of lay.rects) parts.push(`<rect x="${f2(r.x)}" y="${f2(r.y)}" width="${f2(r.w)}" height="${f2(r.h + 0.02)}"/>`);
    for (const p of lay.dots) parts.push(`<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${f2(p.d / 2)}"/>`);
    parts.push('</g>', '</svg>');
    return parts.join('\n');
  }

  // PDF（自前で最小限を書く）。単位は pt（1mm = 72/25.4 pt）、原点は左下
  function toPDF(lay) {
    const k = 72 / 25.4;
    const W = lay.pageW * k, H = lay.pageH * k;
    const c = 0.5523; // 円をベジェ曲線4本で描くときの係数
    let s = '0 g\n';
    for (const r of lay.rects) s += `${f2(r.x * k)} ${f2(H - (r.y + r.h) * k)} ${f2(r.w * k)} ${f2(r.h * k + 0.05)} re f\n`;
    for (const p of lay.dots) {
      const x = p.x * k, y = H - p.y * k, r = p.d / 2 * k, o = r * c;
      s += `${f2(x + r)} ${f2(y)} m ${f2(x + r)} ${f2(y + o)} ${f2(x + o)} ${f2(y + r)} ${f2(x)} ${f2(y + r)} c ` +
        `${f2(x - o)} ${f2(y + r)} ${f2(x - r)} ${f2(y + o)} ${f2(x - r)} ${f2(y)} c ` +
        `${f2(x - r)} ${f2(y - o)} ${f2(x - o)} ${f2(y - r)} ${f2(x)} ${f2(y - r)} c ` +
        `${f2(x + o)} ${f2(y - r)} ${f2(x + r)} ${f2(y - o)} ${f2(x + r)} ${f2(y)} c f\n`;
    }
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(W)} ${f2(H)}] /Contents 4 0 R /Resources << >> >>`,
      `<< /Length ${s.length} >>\nstream\n${s}endstream`
    ];
    let pdf = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(pdf);
  }

  // 画面での確認用
  function drawPreview(canvas, lay) {
    const css = canvas.clientWidth || 320;
    const dpr = window.devicePixelRatio || 1;
    const scale = css / lay.pageW;
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(lay.pageH * scale * dpr);
    canvas.style.height = (lay.pageH * scale) + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lay.pageW, lay.pageH);
    ctx.fillStyle = '#111';
    for (const r of lay.rects) ctx.fillRect(r.x, r.y, r.w, r.h + 0.02);
    for (const p of lay.dots) { ctx.beginPath(); ctx.arc(p.x, p.y, p.d / 2, 0, Math.PI * 2); ctx.fill(); }
  }

  root.TenjiFigure = { imageToCells, dotsToCells, layoutTactile, toSVG, toPDF, drawPreview, PAPERS, DOT_SIZES };
})(typeof self !== 'undefined' ? self : this);
