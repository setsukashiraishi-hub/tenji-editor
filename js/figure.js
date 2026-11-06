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

  // ---------- 画像の処理（AIを使わない画像処理） ----------
  // proc（調整）：
  //   mode     … 'auto'（写真は外形、図は塗り）| 'outline'（外形だけ）| 'edges'（輪郭線。中の線も）| 'fill'（塗りつぶし）| 'both'（外形＋薄い塗り）
  //   denoise  … ノイズ除去 0〜3（細かすぎる模様・小さな点を省く）
  //   contrast … コントラスト -50〜100
  //   level    … 点にする濃さの境目 -50（濃い部分だけ）〜 50（薄い部分も）
  //   edge     … 輪郭の感度 1〜10（輪郭線のとき。大きいほど線が多い）
  //   line     … 線の太さ 1〜2（点の数）
  //   fill     … 塗りの密度 'all' | 'half'（市松） | 'sparse'（まばら）
  //   invert   … 白黒を反転
  //   width    … 本文に描くときの幅（マス）。0 ならページの幅いっぱい
  const DEFAULT_PROC = { mode: 'auto', denoise: 1, contrast: 0, level: 0, edge: 5, line: 1, fill: 'all', invert: false, width: 0 };
  const procOf = p => ({ ...DEFAULT_PROC, ...(p || {}) });

  async function loadGray(blob, W, H) {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); // 透明部分は白として扱う
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    return gray;
  }
  // 横・縦の箱型ぼかしを2回（ガウスぼかしの代わり）
  function blur(g, W, H, r) {
    if (r < 1) return g;
    let src = g, tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) {
        let acc = 0; const row = y * W;
        for (let x = -r; x <= r; x++) acc += src[row + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) {
          tmp[row + x] = acc / (2 * r + 1);
          acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < H; y++) {
          out[y * W + x] = acc / (2 * r + 1);
          acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
        }
      }
      src = out; out = new Float32Array(W * H);
    }
    return src;
  }
  // 小さなかたまり（ノイズ）を消す。value のかたまりで、面積が min より小さいものを反対の値にする
  function dropSmall(m, W, H, min, value, eight) {
    if (min < 2) return m;
    const seen = new Uint8Array(W * H), stack = new Int32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (seen[i] || m[i] !== value) continue;
      let top = 0, n = 0; const list = [];
      stack[top++] = i; seen[i] = 1;
      while (top) {
        const j = stack[--top]; list.push(j); n++;
        const x = j % W, y = (j / W) | 0;
        if (x > 0 && !seen[j - 1] && m[j - 1] === value) { seen[j - 1] = 1; stack[top++] = j - 1; }
        if (x < W - 1 && !seen[j + 1] && m[j + 1] === value) { seen[j + 1] = 1; stack[top++] = j + 1; }
        if (y > 0 && !seen[j - W] && m[j - W] === value) { seen[j - W] = 1; stack[top++] = j - W; }
        if (y < H - 1 && !seen[j + W] && m[j + W] === value) { seen[j + W] = 1; stack[top++] = j + W; }
        if (eight) for (const k of [j - W - 1, j - W + 1, j + W - 1, j + W + 1]) {
          const kx = k % W;
          if (k >= 0 && k < W * H && Math.abs(kx - x) === 1 && !seen[k] && m[k] === value) { seen[k] = 1; stack[top++] = k; }
        }
      }
      if (n < min) for (const j of list) m[j] = value ? 0 : 1;
    }
    return m;
  }
  // 作業用の大きさ（w×h の s 倍）から、w×h に縮める。any=true なら1つでも黒があれば黒（細い線を残す）
  function shrink(m, W, H, w, h, s, any) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let n = 0, t = 0;
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
        const yy = y * s + dy, xx = x * s + dx;
        if (yy < H && xx < W) { t++; n += m[yy * W + xx]; }
      }
      out[y * w + x] = any ? (n > 0 ? 1 : 0) : (n * 10 >= t * 3 ? 1 : 0); // 3割以上が黒なら点（細い線を残す）
    }
    return out;
  }
  const isEdgeOf = (m, w, h, i) => {
    const x = i % w, y = (i / w) | 0;
    return x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w];
  };
  function dilate(m, w, h) {
    const out = Uint8Array.from(m);
    for (let i = 0; i < w * h; i++) if (m[i]) {
      const x = i % w;
      if (x < w - 1) out[i + 1] = 1;
      if (i + w < w * h) out[i + w] = 1;
    }
    return out;
  }
  // ひとつだけ離れた点（ノイズ）を消す
  function dropIsolated(m, w, h) {
    const out = Uint8Array.from(m);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!m[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx]) n++;
      }
      if (!n) out[i] = 0;
    }
    return out;
  }

  // 画像を w×h の白黒（true＝点を打つ）にする。kind は 'photo' | 'drawing'
  async function imageToBits(blob, w, h, proc, kind) {
    const P = procOf(proc);
    const mode = P.mode === 'auto' ? (kind === 'photo' ? 'outline' : 'fill') : P.mode; // おまかせ：写真は外形、図は塗り
    // 作業用は3倍（大きすぎるときは小さく）の細かさで処理してから縮める
    const s = Math.max(1, Math.min(6, Math.floor(Math.sqrt(1.6e6 / (w * h)))));
    const W = w * s, H = h * s, N = W * H;
    let g = await loadGray(blob, W, H);
    // 明るさの幅を広げる（いちばん暗い2%〜明るい2%を0〜255に）＋コントラスト
    const hist = new Uint32Array(256);
    for (let i = 0; i < N; i++) hist[Math.max(0, Math.min(255, g[i] | 0))]++;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > N * 0.005) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > N * 0.005) { hi = v; break; } }
    if (hi - lo < 48) { lo = 0; hi = 255; } // ほとんど同じ明るさの画像は、幅を広げない（線画の細い線を消さないため）
    const span = Math.max(16, hi - lo), c = 1 + P.contrast / 50;
    for (let i = 0; i < N; i++) g[i] = Math.max(0, Math.min(255, ((g[i] - lo) / span * 255 - 128) * c + 128));
    // ノイズ除去：ぼかしで細かい模様をならす（点1つ分を基準に）。
    // 塗り・外形は軽く（細い線を消さない）、輪郭線は強めにぼかす
    const raw = g;
    g = blur(raw, W, H, Math.round([0, 0.7, 1.3, 2.2][P.denoise | 0] * s));
    const gm = blur(raw, W, H, Math.round([0, 0.25, 0.5, 0.9][P.denoise | 0] * s));
    const gray8 = new Uint8Array(N);
    for (let i = 0; i < N; i++) gray8[i] = gm[i] | 0;
    const minArea = [0, 0.0004, 0.0015, 0.004][P.denoise | 0] * N;

    // 塗り（暗い部分）
    const th = Math.max(1, Math.min(254, otsu(gray8) + P.level * 1.5));
    let mask = new Uint8Array(N), dark = 0;
    for (let i = 0; i < N; i++) if (gray8[i] < th) { mask[i] = 1; dark++; }
    const inv = (dark > N * 0.5) !== !!P.invert; // 暗い部分が多い画像（黒背景）は反転。反転を選ぶとさらに逆に
    if (inv) for (let i = 0; i < N; i++) mask[i] ^= 1;
    mask = dropSmall(mask, W, H, minArea, 1, true); // 小さな点を消す
    mask = dropSmall(mask, W, H, minArea, 0); // 小さな穴を埋める

    let lines = null, inner = null;
    if (mode === 'edges') {
      // 輪郭線：明るさが急に変わるところ（ソーベル）を、強い順に選ぶ
      const mag = new Float32Array(N), dir = new Uint8Array(N);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = -g[i - W - 1] - 2 * g[i - 1] - g[i + W - 1] + g[i - W + 1] + 2 * g[i + 1] + g[i + W + 1];
        const gy = -g[i - W - 1] - 2 * g[i - W] - g[i - W + 1] + g[i + W - 1] + 2 * g[i + W] + g[i + W + 1];
        mag[i] = Math.hypot(gx, gy);
        const a = (Math.atan2(gy, gx) * 180 / Math.PI + 180) % 180; // 明るさが変わる向き
        dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
      }
      // 細線化（キャニー法と同じ考え方）：変わる向きで、両どなりより強いところだけ残す
      const OFF = [[1, 0], [1, 1], [0, 1], [-1, 1]];
      const thin = new Float32Array(N);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, m = mag[i];
        if (!m) continue;
        const [dx, dy] = OFF[dir[i]];
        if (m >= mag[i + dy * W + dx] && m >= mag[i - dy * W - dx]) thin[i] = m;
      }
      const vals = [];
      for (let i = 0; i < N; i++) if (thin[i] > 0) vals.push(thin[i]);
      vals.sort((a, b) => a - b);
      const keep = 0.15 + (Math.max(1, Math.min(10, P.edge)) - 1) * 0.08; // 細線のうち強い 15%〜87% を残す
      const cut = Math.max(24, vals.length ? vals[Math.floor(vals.length * (1 - keep))] : 255);
      let e = new Uint8Array(N);
      // 強い線と、それにつながるやや弱い線を残す（ヒステリシス）
      const stack = [];
      for (let i = 0; i < N; i++) if (thin[i] >= cut) { e[i] = 1; stack.push(i); }
      while (stack.length) {
        const i = stack.pop();
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const j = i + dy * W + dx;
          if (j >= 0 && j < N && !e[j] && thin[j] >= cut * 0.5) { e[j] = 1; stack.push(j); }
        }
      }
      // 短い線のかけら（模様・ざらつき）を省く。ノイズ除去が強いほど長い線だけ残す
      e = dropSmall(e, W, H, Math.max(s * 4, (W + H) * [0.01, 0.05, 0.1, 0.16][P.denoise | 0]), 1, true);
      lines = shrink(e, W, H, w, h, s, true);
    } else {
      const m = shrink(mask, W, H, w, h, s, false);
      if (mode === 'outline' || mode === 'both') {
        lines = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) if (m[i] && isEdgeOf(m, w, h, i)) lines[i] = 1;
        if (mode === 'both') { inner = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) if (m[i] && !lines[i]) inner[i] = 1; }
      } else {
        // 塗りつぶし：ふちは全部の点、中は塗りの密度に合わせて間引く
        lines = new Uint8Array(w * h); inner = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) if (m[i]) (isEdgeOf(m, w, h, i) ? lines : inner)[i] = 1;
      }
    }
    if (P.denoise >= 1) lines = dropIsolated(lines, w, h);
    if (P.line >= 2) lines = dilate(lines, w, h);
    const fill = mode === 'both' && P.fill === 'all' ? 'sparse' : P.fill; // 外形＋塗りは、塗りを薄く
    const out = new Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = (i / w) | 0;
      let v = !!lines[i];
      if (!v && inner && inner[i]) v = fill === 'all' || (fill === 'half' ? (x + y) % 2 === 0 : x % 2 === 0 && y % 2 === 0);
      out[i] = v;
    }
    return out;
  }
  // 写真か、線画・図かを見分ける（中間の明るさが多く、色の数が多ければ写真）
  async function classifyImage(blob) {
    try {
      const bmp = await createImageBitmap(blob);
      const w = 96, h = Math.max(1, Math.round(bmp.height / bmp.width * 96));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let mid = 0; const colors = new Set();
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (g > 40 && g < 215) mid++;
        colors.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4));
      }
      const n = d.length / 4;
      return (mid / n > 0.35 && colors.size > 120) ? 'photo' : 'drawing';
    } catch (e) { return 'drawing'; }
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

  // ---------- 手直し（点を打つ・消す） ----------
  // 手直しは、図の枠に対する位置（0〜1）の「打つ／消す」の並び [u, v, 1|0] で覚える。
  // 調整（ノイズ除去など）や点の間隔を変えても、同じ場所に当てはめ直せる。
  function applyGridEdits(g, ops) {
    if (!ops || !ops.length) return g;
    for (const [u, v, on] of ops) {
      const x = Math.floor(u * g.w), y = Math.floor(v * g.h);
      if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.bits[y * g.w + x] = !!on;
    }
    return g;
  }
  function cellsToGrid(lines) {
    const w = Math.max(1, ...lines.map(l => Array.from(l).length)) * 2, h = lines.length * 3;
    const bits = new Array(w * h).fill(false);
    lines.forEach((line, ly) => Array.from(line).forEach((ch, cx) => {
      const b = ch.charCodeAt(0) - 0x2800;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) if (b & DOT_BIT[dy][dx]) bits[(ly * 3 + dy) * w + cx * 2 + dx] = true;
    }));
    return { bits, w, h };
  }
  // 点の並び（mm）に手直しを当てはめる。box は図の枠、grid は点を置く格子（なければ 0.5mm に合わせる）
  function applyDotEdits(lay, ops) {
    if (!ops || !ops.length || !lay.box) return lay;
    const b = lay.box, p = lay.grid ? lay.grid.p : 2.5;
    const cell = Math.max(0.5, p);
    const key = (x, y) => Math.round(x / cell) + ',' + Math.round(y / cell);
    const hash = new Map();
    const put = d => { const k = key(d.x, d.y); if (!hash.has(k)) hash.set(k, []); hash.get(k).push(d); };
    lay.dots.forEach(put);
    const near = (x, y, r) => {
      const out = [];
      const cx = Math.round(x / cell), cy = Math.round(y / cell), n = Math.ceil(r / cell);
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        const a = hash.get((cx + i) + ',' + (cy + j));
        if (a) for (const d of a) if (!d.gone && Math.hypot(d.x - x, d.y - y) <= r) out.push(d);
      }
      return out;
    };
    for (const [u, v, on] of ops) {
      let x = b.x0 + u * b.w, y = b.y0 + v * b.h;
      if (lay.grid) { x = lay.grid.ox + Math.round((x - lay.grid.ox) / p) * p; y = lay.grid.oy + Math.round((y - lay.grid.oy) / p) * p; }
      if (on) {
        if (near(x, y, p * 0.5).length) continue;
        const d = { x, y, d: lay.dotD || 1.2, kind: lay.dotKind || '1' };
        lay.dots.push(d); put(d);
      } else near(x, y, Math.max(0.8, p * 0.6)).forEach(d => { d.gone = true; });
    }
    lay.dots = lay.dots.filter(d => !d.gone);
    return lay;
  }
  // 本文に描く点図の格子（点字マスの点の並び。横2点×縦3点で1マス）
  async function imageToGrid(blob, opt) {
    opt = opt || {};
    const P = procOf(opt.proc);
    const maxCols = Math.min(opt.maxCols || 28, P.width > 0 ? P.width : 999), maxLines = opt.maxLines || 15;
    const size = await imageSize(blob);
    let w = maxCols * 2;
    let h = Math.round(size.h / size.w * w);
    h = Math.max(3, Math.ceil(h / 3) * 3);
    if (h > maxLines * 3) { h = maxLines * 3; w = Math.max(2, Math.round(size.w / size.h * h / 2) * 2); }
    return { bits: await imageToBits(blob, w, h, opt.proc, opt.kind), w, h };
  }

  async function imageToCells(blob, opt) {
    const g = await imageToGrid(blob, opt);
    applyGridEdits(g, opt && opt.edits);
    return dotsToCells(g.bits, g.w, g.h);
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
    out.dotD = d; out.dotKind = kind;
    const done = () => (out.rects.length ? out : applyDotEdits(out, src.edits));

    if (src.dots) {
      // エーデルなどから読み込んだ点：大きさはそのまま、用紙の中に収まるように縮める（大きくはしない）
      const xs = src.dots.map(p => p.x), ys = src.dots.map(p => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys), bw = Math.max(...xs) - minX || 1, bh = Math.max(...ys) - minY || 1;
      const scale = Math.min(1, areaW / bw, areaH / bh);
      const keep = opt.edel && scale === 1 && !opt.titleCells; // エーデルに書き戻すときは元の位置のまま
      for (const p of src.dots) {
        out.dots.push({ x: keep ? p.x : m + (p.x - minX) * scale, y: keep ? p.y : top + (p.y - minY) * scale, d: p.d, kind: p.kind });
      }
      out.box = keep ? { x0: minX, y0: minY, w: bw, h: bh } : { x0: m, y0: top, w: bw * scale, h: bh * scale };
      // 読み込んだ点図の点の間隔（いちばん近い点までの距離のよくある値）に合わせて描き足す
      const pitch0 = opt.pitch || 2.5;
      out.grid = { ox: out.box.x0, oy: out.box.y0, p: pitch0 };
      return done();
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
      out.box = { x0: m - p / 2, y0: top - p / 2, w: cols * p, h: rows * p };
      out.grid = { ox: m, oy: top, p, cols, rows };
      return done();
    }

    const size = await imageSize(src.blob);
    const fit = Math.min(areaW / size.w, areaH / size.h); // mm / 画像の1px
    const drawW = size.w * fit, drawH = size.h * fit;
    const x0 = m + (areaW - drawW) / 2, y0 = top;
    if (out.style === 'solid' && !opt.edel) {
      // 立体コピー用：0.4mm 単位の白黒で、黒い部分を塗る（横に続く部分はまとめる）
      const res = 0.4;
      const w = Math.max(2, Math.round(drawW / res)), h = Math.max(2, Math.round(drawH / res));
      const bits = await imageToBits(src.blob, w, h, src.proc, src.kind);
      for (let y = 0; y < h; y++) {
        let x = 0;
        while (x < w) {
          if (!bits[y * w + x]) { x++; continue; }
          const s = x;
          while (x < w && bits[y * w + x]) x++;
          out.rects.push({ x: x0 + s * res, y: y0 + y * res, w: (x - s) * res, h: res });
        }
      }
      out.box = { x0, y0, w: drawW, h: drawH };
      return out;
    }
    // 点図プリンタ用：点の間隔ごとに、黒い部分に点を打つ
    const pitch = opt.pitch || 2.5;
    const w = Math.max(2, Math.floor(drawW / pitch)), h = Math.max(2, Math.floor(drawH / pitch));
    const bits = await imageToBits(src.blob, w, h, src.proc, src.kind);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (bits[y * w + x]) out.dots.push({ x: x0 + x * pitch + pitch / 2, y: y0 + y * pitch + pitch / 2, d, kind });
    }
    out.box = { x0, y0, w: w * pitch, h: h * pitch };
    out.grid = { ox: x0 + pitch / 2, oy: y0 + pitch / 2, p: pitch, cols: w, rows: h };
    return done();
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
  // lay に配列を渡すと、1つの図を1ページにした複数ページの PDF にする
  function pageContent(lay) {
    const k = 72 / 25.4;
    const H = lay.pageH * k;
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
    return s;
  }
  function toPDF(lays) {
    if (!Array.isArray(lays)) lays = [lays];
    const k = 72 / 25.4;
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
    const kids = [];
    for (const lay of lays) {
      const s = pageContent(lay);
      const pageNo = objs.length + 1;
      kids.push(`${pageNo} 0 R`);
      objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(lay.pageW * k)} ${f2(lay.pageH * k)}] /Contents ${pageNo + 1} 0 R /Resources << >> >>`);
      objs.push(`<< /Length ${s.length} >>\nstream\n${s}endstream`);
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(pdf);
  }

  // 画面での確認用
  function drawPreview(canvas, lay, opt) {
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
    // 手直し中は、点を打てる場所を薄く出す
    if (opt && opt.ghost && lay.grid && lay.grid.cols && lay.grid.cols * lay.grid.rows < 60000) {
      ctx.fillStyle = 'rgba(31,95,107,.18)';
      const g = lay.grid;
      for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) { ctx.beginPath(); ctx.arc(g.ox + x * g.p, g.oy + y * g.p, Math.min(0.35, g.p * 0.15), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#111';
    }
    // 本文の点図：マスの区切り
    if (opt && opt.cellLines && lay.grid) {
      const g = lay.grid;
      ctx.strokeStyle = 'rgba(31,95,107,.25)'; ctx.lineWidth = 0.15;
      for (let cx = 0; cx * 2 <= g.cols; cx++) { const x = g.ox - g.p / 2 + cx * 2 * g.p; ctx.beginPath(); ctx.moveTo(x, g.oy - g.p / 2); ctx.lineTo(x, g.oy - g.p / 2 + g.rows * g.p); ctx.stroke(); }
      for (let ly = 0; ly * 3 <= g.rows; ly++) { const y = g.oy - g.p / 2 + ly * 3 * g.p; ctx.beginPath(); ctx.moveTo(g.ox - g.p / 2, y); ctx.lineTo(g.ox - g.p / 2 + g.cols * g.p, y); ctx.stroke(); }
    }
    for (const p of lay.dots) { ctx.beginPath(); ctx.arc(p.x, p.y, p.d / 2, 0, Math.PI * 2); ctx.fill(); }
    if (opt && opt.cursor) {
      ctx.strokeStyle = '#d9480f'; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.arc(opt.cursor.x, opt.cursor.y, (lay.grid ? lay.grid.p : 2.5) * 0.55, 0, Math.PI * 2); ctx.stroke();
    }
    return scale;
  }

  root.TenjiFigure = { imageToCells, dotsToCells, layoutTactile, toSVG, toPDF, drawPreview, classifyImage, imageToBits, imageToGrid, cellsToGrid, applyGridEdits, applyDotEdits, PAPERS, DOT_SIZES, DEFAULT_PROC, procOf };
})(typeof self !== 'undefined' ? self : this);
