/*
 * 点図を作る（自由にお絵かき）
 * TenjiDraw.open({ ops, title }) → Promise<{ blob, ops, title } | null>
 * 描いたものは「操作の並び（ops）」で持つので、元に戻す・やり直す・あとから描き直すができる。
 * マウス・指・ペンで描くほか、キーボードでも描ける（矢印で動く、スペースでペンを下ろす／上げる）。
 */
(function (root) {
  'use strict';
  // キャンバスの大きさ（描く範囲。A4 の点図の描ける範囲に近い縦横比）。1px ≒ 0.31mm
  const W = 600, H = 840, MM = 186 / W;
  const WIDTHS = { thin: 8, normal: 14, thick: 24 }; // 点の間隔（約2.5mm＝8px）より細い線は点にならないので、細くても8px
  const TOOLS = { pen: 'ペン', line: '直線', rect: '四角', ellipse: '丸', dot: '点', eraser: '消しゴム' };
  const $ = id => document.getElementById(id);

  let D = null; // 開いている間の状態
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c) e.append(c);
    return e;
  }

  // ---------- 描く ----------
  function drawOp(ctx, op) {
    if (op.tool === 'clear') { ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); return; } // 全部消す
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ink = op.tool === 'eraser' ? '#fff' : '#000';
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = op.w;
    const [a, b] = [op.pts[0], op.pts[op.pts.length - 1]];
    if (op.tool === 'pen' || op.tool === 'eraser') {
      ctx.beginPath();
      if (op.pts.length === 1) { ctx.arc(a.x, a.y, op.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.moveTo(a.x, a.y); for (const p of op.pts.slice(1)) ctx.lineTo(p.x, p.y); ctx.stroke(); }
    } else if (op.tool === 'line') {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (op.tool === 'rect') {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      if (op.fill) ctx.fillRect(x, y, w, h); else ctx.strokeRect(x, y, w, h);
    } else if (op.tool === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(1, Math.abs(b.x - a.x) / 2), Math.max(1, Math.abs(b.y - a.y) / 2), 0, 0, Math.PI * 2);
      if (op.fill) ctx.fill(); else ctx.stroke();
    } else if (op.tool === 'dot') {
      ctx.beginPath(); ctx.arc(a.x, a.y, op.w * 0.75, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function paint() {
    const ctx = D.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    for (const op of D.ops) drawOp(ctx, op);
    if (D.live) drawOp(ctx, D.live);
    // キーボードで描くときのカーソル（十字）。描いたものには入らない（書き出しは ops から描き直す）
    if (D.kbd) {
      const c = D.cur;
      ctx.save();
      ctx.strokeStyle = D.penDown || D.anchor ? '#d9480f' : '#1f5f6b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(c.x - 12, c.y); ctx.lineTo(c.x + 12, c.y); ctx.moveTo(c.x, c.y - 12); ctx.lineTo(c.x, c.y + 12); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.stroke();
      if (D.anchor) { ctx.setLineDash([4, 4]); ctx.strokeRect(D.anchor.x - 4, D.anchor.y - 4, 8, 8); }
      ctx.restore();
    }
    updateButtons();
  }
  const newOp = (tool, p) => ({ tool, w: WIDTHS[D.width] || WIDTHS.normal, fill: !!D.fill && (tool === 'rect' || tool === 'ellipse'), pts: [p] });
  function commit(op) {
    if (!op) return;
    D.ops.push(op); D.redo = []; D.live = null;
    paint();
  }

  // ---------- マウス・指・ペン ----------
  function pos(ev) {
    const r = D.canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(W, (ev.clientX - r.left) * W / r.width)), y: Math.max(0, Math.min(H, (ev.clientY - r.top) * H / r.height)) };
  }
  function onDown(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.preventDefault();
    try { D.canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 枠の外に出ても描き続けられないだけ */ }
    D.kbd = false;
    const p = pos(ev);
    D.live = newOp(D.tool, p);
    if (D.tool === 'dot') { commit(D.live); return; }
    paint();
  }
  function onMove(ev) {
    if (!D.live) return;
    ev.preventDefault();
    const p = pos(ev);
    if (D.live.tool === 'pen' || D.live.tool === 'eraser') {
      const q = D.live.pts[D.live.pts.length - 1];
      if (Math.hypot(p.x - q.x, p.y - q.y) >= 1.5) D.live.pts.push(p);
    } else D.live.pts[1] = p;
    paint();
  }
  function onUp() {
    if (!D.live) return;
    const op = D.live;
    // 図形は、ほとんど動かさなかったら描かない（押しただけ）
    if (op.tool !== 'pen' && op.tool !== 'eraser' && (!op.pts[1] || Math.hypot(op.pts[1].x - op.pts[0].x, op.pts[1].y - op.pts[0].y) < 4)) { D.live = null; paint(); return; }
    commit(op);
    say(`${TOOLS[op.tool]}で描きました`);
  }

  // ---------- キーボード：矢印で動く、スペースでペンを下ろす／上げる（図形は始めと終わりの2回） ----------
  const cm = v => (v * MM / 10).toFixed(1);
  function inkAt(x, y) {
    try {
      const d = D.canvas.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return d[0] < 128;
    } catch (e) { return false; }
  }
  function onKey(ev) {
    const k = ev.key;
    const step = ev.shiftKey ? 40 : 10;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
    if (mv) {
      ev.preventDefault();
      if (!D.kbd) { D.kbd = true; }
      const c = D.cur;
      c.x = Math.max(0, Math.min(W, c.x + mv[0])); c.y = Math.max(0, Math.min(H, c.y + mv[1]));
      if (D.penDown && D.live) D.live.pts.push({ x: c.x, y: c.y });
      if (D.anchor && D.live) D.live.pts[1] = { x: c.x, y: c.y };
      // 線の上を通ったかどうかを知らせる（描いたものを確かめられるように）。カーソルを描く前に調べる
      const onInk = !D.penDown && !D.anchor && (() => { D.kbd = false; paint(); const r = inkAt(c.x, c.y); D.kbd = true; return r; })();
      paint();
      say(`横${cm(c.x)}、縦${cm(c.y)}センチ${onInk ? '、線の上' : ''}`);
      return;
    }
    if (k === ' ' || ev.code === 'Space') {
      ev.preventDefault();
      if (ev.repeat) return;
      D.kbd = true;
      const c = { x: D.cur.x, y: D.cur.y };
      if (D.tool === 'dot') { commit(newOp('dot', c)); say('点を打ちました'); return; }
      if (D.tool === 'pen' || D.tool === 'eraser') {
        if (!D.penDown) { D.penDown = true; D.live = newOp(D.tool, c); paint(); say(D.tool === 'eraser' ? '消しゴムを下ろしました。矢印で動くと消します' : 'ペンを下ろしました。矢印で動くと線を描きます'); }
        else { D.penDown = false; const op = D.live; commit(op); say(D.tool === 'eraser' ? '消しゴムを上げました' : 'ペンを上げました'); }
        return;
      }
      if (!D.anchor) { D.anchor = c; D.live = newOp(D.tool, c); D.live.pts[1] = { ...c }; paint(); say(`${TOOLS[D.tool]}の始めの位置を決めました。矢印で動いて、もう一度スペースで終わりの位置を決めます`); }
      else { D.anchor = null; commit(D.live); say(`${TOOLS[D.tool]}を描きました`); }
      return;
    }
    if (k === 'Escape' && (D.penDown || D.anchor)) {
      ev.preventDefault(); ev.stopPropagation();
      D.penDown = false; D.anchor = null; D.live = null; paint(); say('やめました');
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (k === 'z' || k === 'Z')) { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && (k === 'y' || k === 'Y')) { ev.preventDefault(); redo(); return; }
    // 道具の切り替え：P ペン、L 直線、R 四角、O 丸、D 点、E 消しゴム、1〜3 太さ、F 塗りつぶし
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const toolKey = { p: 'pen', l: 'line', r: 'rect', o: 'ellipse', d: 'dot', e: 'eraser' }[k.toLowerCase()];
    if (toolKey) { ev.preventDefault(); setTool(toolKey, true); return; }
    const wk = { 1: 'thin', 2: 'normal', 3: 'thick' }[k];
    if (wk) { ev.preventDefault(); setWidth(wk, true); return; }
    if (k.toLowerCase() === 'f') { ev.preventDefault(); D.fill = !D.fill; $('dr-fill').checked = D.fill; say(D.fill ? '塗りつぶします' : '塗りつぶしません'); }
  }

  // ---------- 操作 ----------
  function undo() { if (!D.ops.length) { say('元に戻すものはありません'); return; } D.redo.push(D.ops.pop()); paint(); say('元に戻しました'); }
  function redo() { if (!D.redo.length) { say('やり直すものはありません'); return; } D.ops.push(D.redo.pop()); paint(); say('やり直しました'); }
  function clearAll() {
    if (!D.ops.length) return;
    if (!confirm('描いたものを全部消しますか？')) return;
    // 全部消すも1つの操作にする（元に戻せる）
    D.redo = []; D.ops.push({ tool: 'clear', pts: [{ x: 0, y: 0 }] });
    paint(); say('全部消しました');
  }
  function setTool(t, speak) {
    D.tool = t; D.penDown = false; D.anchor = null; D.live = null;
    for (const b of D.dlg.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
    paint();
    if (speak) say(TOOLS[t]);
  }
  function setWidth(w, speak) {
    D.width = w;
    for (const b of D.dlg.querySelectorAll('[data-width]')) b.setAttribute('aria-pressed', String(b.dataset.width === w));
    if (speak) say({ thin: '細い線', normal: 'ふつうの線', thick: '太い線' }[w]);
  }
  function updateButtons() {
    if (!D) return;
    $('dr-undo').disabled = !D.ops.length;
    $('dr-redo').disabled = !D.redo.length;
    $('dr-ok').disabled = !D.ops.some(o => o.tool !== 'eraser' && o.tool !== 'clear');
  }
  let sayTimer = null;
  function say(t) {
    const live = $('dr-live');
    clearTimeout(sayTimer);
    live.textContent = '';
    sayTimer = setTimeout(() => { live.textContent = t; }, 30);
  }

  // 描いたものを PNG に（カーソルなどは入れない）
  function toBlob() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    for (const op of D.ops) drawOp(ctx, op);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
  // 点にしたときの見え方
  async function preview() {
    const pv = $('dr-pv');
    if (!root.TenjiFigure) return;
    const blob = await toBlob();
    try {
      const lay = await root.TenjiFigure.layoutTactile({ blob, kind: 'drawing' }, { paper: 'a4', pitch: 2.5, size: 'medium', style: 'dots' });
      pv.hidden = false;
      root.TenjiFigure.drawPreview($('dr-pv-canvas'), lay);
      say(`点にすると、点が${lay.dots.length}個になります`);
    } catch (e) { say('点の見え方を作れませんでした'); }
  }

  // ---------- 画面 ----------
  function build() {
    if ($('draw-dlg')) return $('draw-dlg');
    const tb = (tool, label, key) => el('button', { type: 'button', class: 'btn dr-tool', 'data-tool': tool, 'aria-pressed': 'false', title: `${label}（${key}）`, onclick: () => setTool(tool, true) }, label);
    const wb = (w, label, key) => el('button', { type: 'button', class: 'btn dr-w', 'data-width': w, 'aria-pressed': 'false', title: `${label}（${key}）`, onclick: () => setWidth(w, true) }, label);
    const dlg = el('dialog', { class: 'tactile draw', id: 'draw-dlg', 'aria-labelledby': 'dr-head', 'aria-describedby': 'dr-desc' },
      el('div', { class: 'dr-layout' },
        el('div', { class: 'dr-side' },
          el('h2', { id: 'dr-head', tabindex: '-1', text: '点図を作成' }),
          el('p', { class: 't-lead', id: 'dr-desc', text: '自由に絵を描いて、点図にします。マウス・指・ペンで描けます。キーボードでは、絵の枠で矢印キーで動き、スペースでペンを下ろす／上げます（直線・四角・丸は、始めと終わりでスペース）。描いたものは、本文の点字の中の図と、点図ファイル（点図プリンタ用PDF・立体コピー用PDF・エーデル・SVG）にできます。' }),
          el('label', { class: 'field col', for: 'dr-title' }, el('span', { text: '図の名前（見出しにします）' }), el('input', { id: 'dr-title', type: 'text', placeholder: '例：日本地図' })),
          el('div', { class: 'dr-group', role: 'group', 'aria-label': '道具' },
            tb('pen', 'ペン', 'P'), tb('line', '直線', 'L'), tb('rect', '四角', 'R'), tb('ellipse', '丸', 'O'), tb('dot', '点', 'D'), tb('eraser', '消しゴム', 'E')),
          el('div', { class: 'dr-group', role: 'group', 'aria-label': '線の太さ' }, wb('thin', '細い', '1'), wb('normal', 'ふつう', '2'), wb('thick', '太い', '3')),
          el('label', { class: 'check', for: 'dr-fill' }, el('input', { id: 'dr-fill', type: 'checkbox', onchange: ev => { D.fill = ev.target.checked; } }), ' 四角・丸を塗りつぶす（F）'),
          el('div', { class: 'dr-group' },
            el('button', { type: 'button', class: 'btn', id: 'dr-undo', onclick: undo, title: 'Ctrl＋Z' }, '元に戻す'),
            el('button', { type: 'button', class: 'btn', id: 'dr-redo', onclick: redo, title: 'Ctrl＋Y' }, 'やり直す'),
            el('button', { type: 'button', class: 'btn', id: 'dr-clear', onclick: clearAll }, '全部消す')),
          el('button', { type: 'button', class: 'btn', id: 'dr-preview', onclick: preview }, '点にしたときの見え方'),
          el('div', { class: 'dr-pv', id: 'dr-pv', hidden: '' }, el('canvas', { id: 'dr-pv-canvas', 'aria-hidden': 'true' })),
          el('p', { class: 'sheet-small', text: '点の間隔（約2.5mm）より細い線は点になりにくいので、線は「ふつう」か「太い」がおすすめです。作ったあとも、図の行の「点図の調整・手直し・書き出し…」で点を1つずつ直せます。' }),
          el('div', { class: 'sheet-actions' },
            el('button', { type: 'button', class: 'btn primary', id: 'dr-ok' }, '点図にする'),
            el('button', { type: 'button', class: 'btn', id: 'dr-cancel' }, 'やめる'))),
        el('div', { class: 'dr-stage' },
          el('canvas', { id: 'dr-canvas', width: String(W), height: String(H), tabindex: '0', role: 'application',
            'aria-label': '絵を描く枠。矢印キーで動き、スペースでペンを下ろす・上げる。P ペン、L 直線、R 四角、O 丸、D 点、E 消しゴム、1・2・3 で線の太さ', 'aria-roledescription': 'お絵かき' }))),
      el('div', { class: 'sr-only', id: 'dr-live', 'aria-live': 'polite' }));
    document.body.appendChild(dlg);
    const cv = $('dr-canvas');
    cv.addEventListener('pointerdown', ev => D && onDown(ev));
    cv.addEventListener('pointermove', ev => D && onMove(ev));
    cv.addEventListener('pointerup', () => D && onUp());
    cv.addEventListener('pointercancel', () => D && onUp());
    cv.addEventListener('keydown', ev => D && onKey(ev));
    cv.addEventListener('focus', () => { if (D && !D.kbdShown) { D.kbdShown = true; } });
    return dlg;
  }

  function open(opt) {
    opt = opt || {};
    const dlg = build();
    return new Promise(resolve => {
      D = { dlg, canvas: $('dr-canvas'), ops: (opt.ops || []).map(o => JSON.parse(JSON.stringify(o))), redo: [], live: null,
        tool: 'pen', width: 'normal', fill: false, cur: { x: W / 2, y: H / 2 }, kbd: false, penDown: false, anchor: null };
      $('dr-title').value = opt.title || '';
      $('dr-fill').checked = false;
      $('dr-pv').hidden = true;
      $('dr-ok').textContent = opt.ops ? '描き直した点図にする' : '点図にする';
      setTool('pen'); setWidth('normal');
      paint();
      const finish = async ok => {
        if (!D) return;
        let res = null;
        if (ok) res = { blob: await toBlob(), ops: D.ops, title: $('dr-title').value.trim() };
        D = null;
        dlg.close();
        resolve(res);
      };
      $('dr-ok').onclick = () => finish(true);
      $('dr-cancel').onclick = () => finish(false);
      dlg.oncancel = ev => {
        // 描きかけ（ペンを下ろしている・図形の途中）のときの Esc は、その操作だけやめる
        if (D && (D.penDown || D.anchor)) { ev.preventDefault(); return; }
        if (D && D.ops.length && !confirm('描いたものを捨てて閉じますか？')) { ev.preventDefault(); return; }
        ev.preventDefault(); finish(false);
      };
      dlg.showModal();
      $('dr-head').focus();
    });
  }

  root.TenjiDraw = { open, W, H, _state: () => D };
})(typeof self !== 'undefined' ? self : this);
