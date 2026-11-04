/* 点訳エディタ 画面の動き */
(function () {
  'use strict';
  const E = window.TenjiEngine;
  const F = window.TenjiFormats;
  const $ = id => document.getElementById(id);

  const SAMPLE = [
    '点字のしくみ',
    '点字は、フランスのルイ・ブライユが考案した文字です。',
    'ブライユが生まれたのは、１８０９年１月４日です。',
    '──────────',
    '「おいしい？」「うん」',
    'その後、列車が遅れたため駅はひどく混み合っていた。',
    'ＮＨＫの番組で、10円玉とＡ型の話を聞いた。'
  ].join('\n');

  const state = {
    tokenizer: null,
    mode: 'sumiji',
    rows: [],
    fileBase: '点訳',
    typeMap: new Map([['点字のしくみ', 'h2']]), // 原文の行 → 行の種類（手で選んだもの・Wordの見出しなど）
    figures: new Map(),     // ［図：名前］→ { lines: [点字の行], alt }
    checkCursor: -1
  };

  const els = {
    src: $('src'), rows: $('rows'), mode: $('mode'), cols: $('cols'), lines: $('lines'),
    indent: $('indent'), hira: $('hira'), pagenum: $('pagenum'), genpon: $('genpon'),
    fileName: $('file-name'), note: $('file-note'),
    stDict: $('st-dict'), stCount: $('st-count'), stWarn: $('st-warn'), navCheck: $('nav-check'),
    exportBtn: $('btn-export'), exportPop: $('export-pop'), toast: $('toast'), dropHint: $('drop-hint'),
    sumiji: $('sumiji'), raw: $('raw'), btnRaw: $('btn-raw'), sumijiActions: $('sumiji-actions'), join: $('join'),
    srcTitle: $('src-title'), outTitle: $('out-title'), outLegend: $('out-legend'),
    sixdot: $('sixdot'), sixdotWrap: $('sixdot-wrap')
  };

  // ---------- 設定の保存（このブラウザだけ） ----------
  const PREF_KEYS = ['cols', 'lines', 'indent', 'hira', 'pagenum', 'genpon'];
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('tenji-editor-prefs') || '{}');
      for (const k of PREF_KEYS) {
        if (p[k] === undefined) continue;
        if (els[k].type === 'checkbox') els[k].checked = !!p[k]; else els[k].value = p[k];
      }
    } catch (e) { /* 保存できない環境では既定値のまま */ }
  }
  function savePrefs() {
    try {
      const p = {};
      for (const k of PREF_KEYS) p[k] = els[k].type === 'checkbox' ? els[k].checked : +els[k].value;
      localStorage.setItem('tenji-editor-prefs', JSON.stringify(p));
    } catch (e) { /* 何もしない */ }
  }
  const layoutOpt = () => ({
    cols: Math.max(10, Math.min(60, +els.cols.value || 32)),
    lines: Math.max(5, Math.min(40, +els.lines.value || 18)),
    indent: els.indent.checked,
    pageNumbers: els.pagenum.checked,
    genpon: els.genpon.checked,
    title: state.fileBase
  });

  // ---------- 通知 ----------
  let toastTimer = null;
  function toast(msg, isErr) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('err', !!isErr);
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, isErr ? 7000 : 3500);
  }
  function setNote(text, warn) {
    els.note.textContent = text || '';
    els.note.hidden = !text;
    els.note.classList.toggle('warn', !!warn);
  }

  // ---------- 変換 ----------
  const RULE_RE = /^[\s　]*[─━―\-=＝_＿*＊~～・･]{5,}[\s　]*$/;
  const FRAME_TOP_RE = /^[\s　]*[┌┏╔╭]/;
  const FRAME_BOTTOM_RE = /^[\s　]*[└┗╚╰]/;
  const FRAME_SIDE_RE = /^[\s　]*[│┃║]\s*|\s*[│┃║][\s　]*$/g;
  const FIGURE_RE = /^［図[:：](.+?)］$/;
  const GENPON_RE = /^［(?:原本|p\.?|P\.?)\s*(\d+)］$/;

  function autoType(src) {
    if (!src.trim()) return 'blank';
    if (GENPON_RE.test(src.trim())) return 'genpon';
    if (FIGURE_RE.test(src.trim())) return 'figure';
    if (FRAME_TOP_RE.test(src)) return 'frame-start';
    if (FRAME_BOTTOM_RE.test(src)) return 'frame-end';
    if (RULE_RE.test(src)) return 'rule';
    if (src.includes('\t')) return 'table';
    return 'body';
  }

  function convertLine(text) {
    let kana = text, unresolved = [], checks = [];
    if (state.tokenizer) {
      const r = E.tokensToKana(state.tokenizer.tokenize(E.normalizeInput(text)));
      kana = r.kana; unresolved = r.unresolved; checks = r.checks;
    }
    const b = E.kanaToBraille(kana);
    return { kana, cells: b.cells, unknown: b.unknown, bad: b.bad, unresolved, checks };
  }

  function sumijiToRows(text, oldRows) {
    const old = new Map();
    (oldRows || []).forEach(r => { if (r.edited && r.src !== undefined) old.set(r.src, r); });
    return text.replace(/\r/g, '').split('\n').map(src => {
      const type = state.typeMap.get(src) || autoType(src);
      const keep = old.get(src);
      if (keep) { keep.type = type; return keep; } // かなを手で直した行は、原文が同じなら残す
      const base = { src, type, kana: '', cells: '', unknown: [], unresolved: [], bad: [], checks: [], para: type === 'body' };
      if (type === 'blank') return base;
      if (type === 'genpon') return { ...base, page: GENPON_RE.exec(src.trim())[1] };
      if (E.DECOR_TYPES.has(type)) return base;
      if (type === 'figure') {
        const m = FIGURE_RE.exec(src.trim());
        const fig = m && state.figures.get(m[1]);
        // 点図にできない（しない）ときのために「⦅図⦆」の点字も用意しておく
        return { ...base, figure: fig ? fig.lines : null, blob: fig ? fig.blob : null, tactile: fig ? fig.tactile : null, alt: m ? m[1] : '', ...convertLine('⦅ズ⦆'), checks: [], unresolved: [] };
      }
      if (type === 'table') {
        // 表の行：セルごとに点訳して、セルの間を2マスあける
        const parts = src.split('\t').map(c => c.trim() ? convertLine(c.trim()) : { kana: '', unresolved: [], checks: [] });
        const kana = parts.map(p => p.kana).join('  ').replace(/ +$/, '');
        const b = E.kanaToBraille(kana);
        return { ...base, kana, cells: b.cells, unknown: b.unknown, bad: b.bad,
          unresolved: parts.flatMap(p => p.unresolved), checks: parts.flatMap(p => p.checks) };
      }
      return { ...base, ...convertLine(src.replace(FRAME_SIDE_RE, '')) };
    });
  }

  function brailleToRows(rows) {
    const out = [];
    const DENSE = /^[⠀⠿⠾⠷⠯⠟⠻⠽⠸⠇⠼⠧⠏⠹⠳]+$/;
    for (const r of rows) {
      if (r.pagebreak) { out.push({ pagebreak: true }); continue; }
      // ページ行（右寄せの数符＋数字だけの行）は本文として読まない
      const pm = /^⠀*(?:⠼([⠁-⠚]+)⠀{2,})?⠀{6,}⠼([⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚]+)$/.exec(r.cells || '');
      if (pm) {
        const no = E.brailleToKana('⠼' + pm[2]);
        out.push({ src: r.cells, type: 'pageno', fixed: true, cells: r.cells, kana: '', page: no, para: false });
        continue;
      }
      const decor = E.detectDecor(r.cells);
      if (decor) {
        out.push({ src: r.cells, type: decor, fixed: true, cells: r.cells, kana: E.decorText(decor, r.cells), para: false });
        continue;
      }
      const kana = E.brailleToKana(r.cells);
      const prevFig = out[out.length - 1] && out[out.length - 1].type === 'figure' && out[out.length - 1].fixed;
      if (E.looksLikeGraphic(r.cells, kana) || (prevFig && DENSE.test(r.cells))) {
        // 点図・模様の行は読まずに図として残す（墨字にも点の形のまま起こす）
        const prev = out[out.length - 1];
        if (prev && prev.type === 'figure' && prev.fixed) { prev.figure.push(r.cells); prev.src += '\n' + r.cells; continue; }
        out.push({ src: r.cells, type: 'figure', fixed: true, figure: [r.cells], cells: '', kana: '', para: false });
        continue;
      }
      out.push({ src: r.cells, type: 'body', kana, cells: r.cells, unknown: [], bad: [], checks: [],
        unresolved: kana.includes('〓') ? ['〓'] : [], para: false });
    }
    return out;
  }

  function convertAll() {
    if (state.mode === 'sumiji') {
      state.rows = sumijiToRows(els.src.value, state.rows);
    } else {
      const parsed = F.parseRaw(els.raw.value, state.mode === 'braille-nabcc' ? 'nabcc' : 'unicode') || [];
      const edited = new Map();
      state.rows.forEach(r => { if (r.edited && r.src) edited.set(r.src, r); });
      state.rows = brailleToRows(parsed).map(r => (!r.pagebreak && edited.has(r.src)) ? edited.get(r.src) : r);
    }
    render();
  }

  // ---------- 描画 ----------
  const displayKana = k => els.hira.checked ? E.toHiragana(k) : k;
  const cellLen = s => Array.from(s || '').length;
  const TYPE_LABEL = Object.fromEntries(E.ROW_TYPES);
  const needsCheck = r => !r.pagebreak && !r.reviewed &&
    ((r.checks && r.checks.length) || (r.unknown && r.unknown.length) || (r.unresolved && r.unresolved.length));

  // 表示用のマスあけ記号（書き出すデータには入らない）
  const SPACE_MARK = '□';
  const showSpaces = t => t.replace(/[ 　]/g, SPACE_MARK);
  const hideSpaces = t => t.replace(/□/g, ' ');

  const chipEl = (text, cls) => { const s = document.createElement('span'); s.className = 'chip' + (cls ? ' ' + cls : ''); s.textContent = text; return s; };

  function rowCellsForDisplay(row) {
    const opt = layoutOpt();
    if (E.DECOR_TYPES.has(row.type)) return row.fixed ? row.cells : E.decorCells(row.type, opt.cols);
    return row.cells || '';
  }

  function fillMeta(meta, row, onChange) {
    meta.textContent = '';
    const opt = layoutOpt();
    // 行の種類（見出し・区切り線など）
    if (row.type !== 'genpon') {
      const sel = document.createElement('select');
      sel.className = 'type-sel';
      sel.setAttribute('aria-label', 'この行の種類');
      for (const [v, label] of E.ROW_TYPES) {
        const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o);
      }
      sel.value = row.type || 'body';
      sel.addEventListener('change', () => changeType(row, sel.value));
      meta.appendChild(sel);
    }
    const cells = rowCellsForDisplay(row);
    if (cells && row.type !== 'figure') {
      const ind = E.HEAD_INDENT[row.type] || (row.para && opt.indent ? 2 : 0);
      const n = cellLen(cells) + ind;
      const wrapped = E.wrapCells(cells, opt.cols - ind).length;
      meta.appendChild(chipEl(`${n}マス` + (wrapped > 1 ? `・${wrapped}行に折り返し` : '')));
    }
    if (E.HEAD_INDENT[row.type]) meta.appendChild(chipEl(`${E.HEAD_INDENT[row.type] + 1}マス目から`));
    if (row.type === 'figure' && row.figure && state.mode === 'sumiji') {
      const lab = document.createElement('label');
      lab.className = 'check mini';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !row.noFigure;
      cb.addEventListener('change', () => { row.noFigure = !cb.checked; onChange(); });
      lab.append(cb, document.createTextNode(' 点図として入れる（外すと「⦅図⦆」とだけ書く）'));
      meta.appendChild(lab);
    }
    if (row.type === 'figure' && (row.blob || row.tactile || (row.figure && row.figure.length))) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt ok-btn'; b.textContent = '点図ファイルに書き出す…';
      b.title = 'マス目に縛られない点図（点図プリンタ用・立体コピー用のPDF / SVG）にする';
      b.addEventListener('click', ev => { ev.stopPropagation(); openTactile(row); });
      meta.appendChild(b);
    }
    const miss = [...new Set([...(row.unknown || []), ...(row.unresolved || [])])].filter(x => x !== '〓');
    if (miss.length) meta.appendChild(chipEl('辞書にない語：' + miss.join(' '), 'warn'));
    if (row.unresolved && row.unresolved.includes('〓')) meta.appendChild(chipEl('読めない点字があります', 'warn'));
    // 読みが割れる語：候補を押すと差し替える
    for (const ck of (row.checks || [])) {
      if (ck.done) continue;
      const box = document.createElement('span');
      box.className = 'check-box';
      box.appendChild(chipEl(`読みを確認：${ck.surface}`, 'warn'));
      for (const opt2 of ck.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opt' + (opt2 === ck.kana ? ' current' : '');
        b.textContent = displayKana(opt2);
        b.title = opt2 === ck.kana ? '今の読み（このままでよい）' : 'この読みにする';
        b.addEventListener('click', ev => {
          ev.stopPropagation();
          if (opt2 !== ck.kana && row.kana.includes(ck.kana)) {
            row.kana = row.kana.replace(ck.kana, opt2);
            const r = E.kanaToBraille(row.kana);
            row.cells = r.cells; row.bad = r.bad; row.unknown = r.unknown; row.edited = true;
          }
          ck.kana = opt2; ck.done = true;
          if (!(row.checks || []).some(c => !c.done) && !(row.unknown || []).length && !(row.unresolved || []).length) row.reviewed = true;
          onChange();
        });
        box.appendChild(b);
      }
      meta.appendChild(box);
    }
    if (needsCheck(row)) {
      const ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'opt ok-btn'; ok.textContent = '確認した';
      ok.addEventListener('click', ev => { ev.stopPropagation(); row.reviewed = true; (row.checks || []).forEach(c => { c.done = true; }); onChange(); });
      meta.appendChild(ok);
    }
    if (row.edited) meta.appendChild(chipEl('かなを手直し済み', 'edited'));
  }

  // かなの1単位と点字のマスを縦にそろえて描く
  function cellBox(cell, cls) {
    const d = document.createElement('span');
    d.className = 'c' + (cls ? ' ' + cls : '');
    d.textContent = cell;
    return d;
  }
  function unitEl(label, cells, opts) {
    const unit = document.createElement('span');
    const n = Array.from(cells).length;
    unit.className = 'u' + (opts.space ? ' sp' : '') + (n > 1 ? ' multi' : '') + (opts.decor ? ' decor' : '');
    unit.style.setProperty('--n', Math.max(1, n));
    const k = document.createElement('span');
    k.className = 'u-k' + (Array.from(label).length > n ? ' tight' : '');
    k.textContent = label;
    const c = document.createElement('span');
    c.className = 'u-c';
    Array.from(cells).forEach((cell, i) => c.appendChild(cellBox(cell, opts.bad && opts.bad.has(opts.pos + i) ? 'bad' : '')));
    unit.append(k, c);
    return unit;
  }
  function paintAlign(el, row) {
    el.textContent = '';
    el.classList.remove('plain', 'figure-view');
    const type = row.type || 'body';
    if (type === 'figure') {
      el.classList.add('figure-view');
      const cap = document.createElement('div');
      cap.className = 'fig-cap';
      const useFig = row.figure && !row.noFigure;
      cap.textContent = useFig ? `図${row.alt ? '：' + row.alt : ''}（点図 ${row.figure.length}行）` : `図${row.alt ? '：' + row.alt : ''}（点図にせず「⦅図⦆」と書きます）`;
      el.appendChild(cap);
      for (const line of (useFig ? row.figure : [row.cells || ''])) {
        const ln = document.createElement('div');
        ln.className = 'fig-line';
        Array.from(line).forEach(c => ln.appendChild(cellBox(c, c === '⠀' ? 'blank' : '')));
        el.appendChild(ln);
      }
      return;
    }
    if (E.DECOR_TYPES.has(type)) {
      // 飾りの行：点の上に、墨字にしたときの形（─ ┌ ┐ など）を出す
      const cells = rowCellsForDisplay(row);
      const design = Array.from(E.decorText(type, cells.replace(/^⠀+/, '')));
      let di = 0;
      for (const cell of cells) {
        const isSp = cell === '⠀';
        el.appendChild(unitEl(isSp ? '' : (design[di++] || ''), cell, { decor: true, space: isSp }));
      }
      return;
    }
    if (type === 'blank') { el.appendChild(unitEl(SPACE_MARK, '⠀', { space: true })); return; }
    const b = row.kana ? E.kanaToBraille(row.kana) : null;
    const bad = new Set(row.bad || []);
    if (E.HEAD_INDENT[type]) for (let i = 0; i < E.HEAD_INDENT[type]; i++) el.appendChild(unitEl('', '⠀', { space: true, decor: true }));
    if (b && b.cells === row.cells) {
      let pos = 0;
      for (const u of b.units) {
        const isSp = /^[ 　]+$/.test(u.text);
        el.appendChild(unitEl(isSp ? SPACE_MARK : displayKana(u.text), u.cells, { space: isSp, bad, pos }));
        pos += u.cells.length;
      }
      return;
    }
    // かなと点字が1対1に対応しないとき（読めない点字が混じるなど）は2段で並べる
    const k = document.createElement('div');
    k.className = 'plain-k';
    k.textContent = showSpaces(displayKana(row.kana || ''));
    const c = document.createElement('div');
    c.className = 'plain-c';
    c.textContent = row.cells || ' ';
    el.classList.add('plain');
    el.append(k, c);
  }

  function buildRow(row, idx) {
    const li = document.createElement('li');
    if (row.pagebreak) {
      li.className = 'row pagebreak';
      li.innerHTML = '<div class="pb">改ページ</div>';
      return li;
    }
    if (row.type === 'pageno') {
      li.className = 'row pagebreak genpon';
      const d = document.createElement('div'); d.className = 'pb'; d.textContent = `点字 ${row.page}ページ（ページ行）`;
      li.appendChild(d);
      return li;
    }
    if (row.type === 'genpon') {
      li.className = 'row pagebreak genpon';
      const d = document.createElement('div'); d.className = 'pb'; d.textContent = `原本 ${row.page}ページ`;
      li.appendChild(d);
      return li;
    }
    const type = row.type || 'body';
    li.className = 'row type-' + type + (row.cells || row.figure || E.DECOR_TYPES.has(type) ? '' : ' empty') + (needsCheck(row) ? ' needs-check' : '');
    const no = document.createElement('div');
    no.className = 'row-no';
    no.textContent = idx + 1;
    const body = document.createElement('div');
    body.className = 'row-body';

    const align = document.createElement('div');
    align.className = 'align';
    const editable = !E.DECOR_TYPES.has(type) && type !== 'figure' && type !== 'blank';
    if (editable) {
      align.tabIndex = 0;
      align.setAttribute('role', 'button');
      align.setAttribute('aria-label', `${idx + 1}行目：${row.kana || '空行'}。押すとかなを直せます`);
      align.title = 'クリックでかなを直す';
    } else {
      align.classList.add('static');
      align.setAttribute('aria-label', `${idx + 1}行目：${TYPE_LABEL[type]}`);
    }
    paintAlign(align, row);

    const editWrap = document.createElement('div');
    editWrap.className = 'edit-wrap';
    editWrap.hidden = true;
    const edit = document.createElement('input');
    edit.type = 'text';
    edit.className = 'kana-edit';
    edit.id = 'kana-' + idx;
    edit.setAttribute('aria-label', `${idx + 1}行目のかな（□はマスあけ）`);
    edit.spellcheck = false;
    const insBtn = document.createElement('button');
    insBtn.type = 'button';
    insBtn.className = 'btn small-btn';
    insBtn.textContent = '点訳者注 ⦅ ⦆';
    insBtn.title = '点訳者挿入符（⠠⠶ … ⠶⠄）を入れる。選んだ文字があれば囲む';
    editWrap.append(edit, insBtn);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const refresh = () => {
      paintAlign(align, row);
      fillMeta(meta, row, refresh);
      li.classList.toggle('needs-check', !!needsCheck(row));
      updateSumiji();
      updateStatus();
    };
    fillMeta(meta, row, refresh);

    const openEdit = () => {
      if (!editable) return;
      edit.value = showSpaces(displayKana(row.kana || ''));
      editWrap.hidden = false;
      edit.focus();
    };
    const applyEdit = () => {
      const pos = edit.selectionStart;
      const v = showSpaces(edit.value);
      if (v !== edit.value) { edit.value = v; edit.setSelectionRange(pos, pos); }
      row.kana = E.toKatakana(hideSpaces(v));
      const b = E.kanaToBraille(row.kana);
      row.cells = b.cells; row.unknown = b.unknown; row.bad = b.bad; row.unresolved = []; row.edited = true; row.reviewed = true;
      refresh();
    };
    align.addEventListener('click', openEdit);
    align.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEdit(); } });
    edit.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); edit.blur(); } });
    edit.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== insBtn && document.activeElement !== edit) editWrap.hidden = true; }, 0); });
    edit.addEventListener('input', applyEdit);
    insBtn.addEventListener('mousedown', ev => ev.preventDefault()); // 入力欄のフォーカスを保つ
    insBtn.addEventListener('click', () => {
      const a = edit.selectionStart, z = edit.selectionEnd;
      const v = edit.value;
      edit.value = v.slice(0, a) + '⦅' + v.slice(a, z) + '⦆' + v.slice(z);
      const caret = z === a ? a + 1 : z + 2;
      edit.focus(); edit.setSelectionRange(caret, caret);
      applyEdit();
    });

    body.append(align, editWrap, meta);
    li.append(no, body);
    li.dataset.idx = String(state.rows.indexOf(row));
    return li;
  }

  function changeType(row, type) {
    row.type = type;
    row.para = type === 'body';
    if (state.mode === 'sumiji' && row.src !== undefined) {
      state.typeMap.set(row.src, type);
      if (!E.DECOR_TYPES.has(type) && type !== 'blank' && type !== 'figure' && !row.cells && row.src.trim()) {
        Object.assign(row, convertLine(row.src.replace(FRAME_SIDE_RE, '')));
      }
    } else if (state.mode !== 'sumiji') {
      if (E.DECOR_TYPES.has(type)) { row.fixed = true; row.kana = E.decorText(type, row.cells || (row.figure || []).join('')); }
      if (type === 'body' && row.figure) { row.cells = row.figure.join(''); row.kana = E.brailleToKana(row.cells); }
    }
    render();
  }

  function render() {
    const frag = document.createDocumentFragment();
    let n = 0;
    state.rows.forEach(r => { frag.appendChild(buildRow(r, (r.pagebreak || r.type === 'genpon' || r.type === 'pageno') ? n : n++)); });
    els.rows.textContent = '';
    els.rows.appendChild(frag);
    updateSumiji();
    updateStatus();
  }

  function updateStatus() {
    const textRows = state.rows.filter(r => !r.pagebreak && r.type !== 'genpon' && r.type !== 'pageno');
    const opt = layoutOpt();
    const pages = E.layoutPages(state.rows, opt);
    const lines = pages.reduce((a, p) => a + p.length, 0);
    els.stCount.textContent = `${textRows.length}行 → 点字 ${lines}行・${pages.length}ページ（${opt.cols}マス×${opt.lines}行${opt.pageNumbers ? '・ページ番号あり' : ''}）`;
    const warnRows = textRows.filter(needsCheck).length;
    els.stWarn.textContent = warnRows ? `要確認 ${warnRows}行` : '';
    els.navCheck.hidden = !warnRows;
  }

  // 要確認の行へ順に移動する
  function goToCheck(dir) {
    const items = [...els.rows.querySelectorAll('.row.needs-check')];
    if (!items.length) return;
    const top = els.rows.getBoundingClientRect().top;
    let idx;
    if (dir > 0) {
      idx = items.findIndex(li => li.getBoundingClientRect().top > top + 12);
      if (idx < 0) idx = 0;
    } else {
      const before = items.filter(li => li.getBoundingClientRect().top < top - 4);
      idx = before.length ? items.indexOf(before[before.length - 1]) : items.length - 1;
    }
    const li = items[idx];
    li.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    li.classList.add('flash');
    setTimeout(() => li.classList.remove('flash'), 1200);
    const focusEl = li.querySelector('.check-box .opt, .align');
    if (focusEl) focusEl.focus({ preventScroll: true });
  }
  $('btn-next-check').addEventListener('click', () => goToCheck(1));
  $('btn-prev-check').addEventListener('click', () => goToCheck(-1));

  // ---------- 墨字に起こした文章（点字ファイルを読み込んだとき、右側に出す） ----------
  function buildSumijiText() {
    const out = [];
    let para = null;
    const flush = () => { if (para !== null) { out.push(para); para = null; } };
    for (const r of state.rows) {
      if (r.pagebreak) { flush(); if (!els.join.checked) out.push(''); continue; }
      const type = r.type || 'body';
      if (type === 'pageno' || type === 'genpon') continue;
      if (E.DECOR_TYPES.has(type)) { flush(); out.push(E.decorText(type, r.cells)); continue; }
      if (type === 'figure') {
        // 点図は点の形のまま墨字にも残す（目で見ても形がわかる）
        flush();
        out.push('［図］');
        for (const l of (r.figure || [])) out.push(l.replace(/⠀+$/, ''));
        out.push('［図ここまで］');
        continue;
      }
      const line = displayKana(r.kana || '').replace(/〓/g, '？').replace(/⦅/g, '【点訳者注：').replace(/⦆/g, '】');
      if (!els.join.checked) { out.push(line.replace(/^[ 　]+/, '')); continue; }
      if (!line.trim()) { flush(); out.push(''); continue; }
      // 行頭に4マス以上あいている行は見出しとして独立させる。2マスなら新しい段落、それ以外は前の行に続ける
      if (/^[ 　]{4,}/.test(line)) { flush(); out.push(''); out.push(line.trim()); out.push(''); continue; }
      if (para === null || /^[ 　]/.test(line)) { flush(); para = line.replace(/^[ 　]+/, ''); }
      else para += ' ' + line;
    }
    flush();
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function updateSumiji() {
    if (state.mode === 'sumiji') return;
    els.sumiji.value = buildSumijiText();
  }

  // ---------- 表示の切り替え ----------
  function setMode(mode) {
    state.mode = mode;
    els.mode.value = mode;
    const braille = mode !== 'sumiji';
    document.body.classList.toggle('braille', braille);
    els.src.hidden = braille;
    els.sumiji.hidden = !braille;
    els.sumijiActions.hidden = !braille;
    els.btnRaw.hidden = !braille;
    els.sixdotWrap.hidden = !braille;
    if (!braille) { els.raw.hidden = true; els.btnRaw.setAttribute('aria-expanded', 'false'); }
    els.raw.classList.toggle('braille', mode === 'braille-unicode');
    els.srcTitle.textContent = braille ? '墨字に起こしたもの' : '読み込んだファイル';
    els.outTitle.textContent = braille ? '点字' : '変換データ';
    els.outLegend.textContent = braille
      ? '上段：読み（□＝マスあけ）／下段：6点　行を押すと読みを直せます'
      : '上段：かな（□＝マスあけ）／下段：6点　行を押すとかなを直せます';
  }

  // ---------- ファイル ----------
  async function openFile(file) {
    try {
      const buf = await file.arrayBuffer();
      if (/\.pdf$/i.test(file.name)) toast('PDFを読み込んでいます…');
      const res = await F.readFile(file.name, buf, layoutOpt());
      state.rows = [];
      state.fileBase = file.name.replace(/\.[^.]+$/, '') || '点訳';
      els.fileName.textContent = file.name;
      setNote(res.note || '');
      if (res.mode === 'sumiji') {
        state.typeMap = new Map(res.types || []);
        state.figures = new Map(res.figures || []);
        setMode('sumiji');
        els.src.value = res.raw;
        if (!state.tokenizer) setNote('辞書の読み込みが終わると、漢字をかなに直して変換します。', true);
      } else {
        setMode(res.rawKind === 'nabcc' ? 'braille-nabcc' : 'braille-unicode');
        els.raw.value = res.raw;
        els.hira.checked = true; // 墨字はひらがなで起こす（設定はいつでも切り替えられる）
      }
      convertAll();
      toast(`${file.name} を読み込みました`);
    } catch (e) {
      toast(e.message || 'ファイルを読み込めませんでした。', true);
    }
  }

  async function saveFile(name, data) {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: name });
        const w = await h.createWritable();
        await w.write(blob); await w.close();
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  async function doExport(fmt) {
    closeMenu();
    if (!state.rows.some(r => r.cells || r.figure || E.DECOR_TYPES.has(r.type))) { toast('書き出す内容がありません。', true); return; }
    try {
      const rows = state.rows.map(r => ({ ...r, kana: r.kana ? displayKana(r.kana) : r.kana }));
      const data = await F.exportFile(fmt.id, rows, layoutOpt());
      const suffix = fmt.id.startsWith('txt-') || fmt.id.startsWith('docx-') ? '_' + fmt.id.split('-')[1] : '';
      const name = `${state.fileBase}${suffix}.${fmt.ext}`;
      const ok = await saveFile(name, data);
      if (ok) toast(`${name} を保存しました`);
    } catch (e) {
      toast(e.message || '書き出しに失敗しました。', true);
    }
  }

  // ---------- 書き出しメニュー ----------
  function buildMenu() {
    els.exportPop.textContent = '';
    let group = '';
    for (const fmt of F.EXPORTS) {
      if (fmt.group !== group) {
        group = fmt.group;
        const g = document.createElement('div');
        g.className = 'menu-group';
        g.textContent = group === '点字' ? '点字データ' : '墨字（かな）・確認用';
        els.exportPop.appendChild(g);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-item' + (fmt.id === 'bes' ? ' experimental' : '');
      b.setAttribute('role', 'menuitem');
      b.innerHTML = `<span class="label"></span><span class="ext"></span><span class="desc"></span>`;
      b.querySelector('.label').textContent = fmt.label;
      b.querySelector('.ext').textContent = '.' + fmt.ext;
      b.querySelector('.desc').textContent = fmt.note;
      b.addEventListener('click', () => doExport(fmt));
      els.exportPop.appendChild(b);
    }
  }
  function closeMenu() { els.exportPop.hidden = true; els.exportBtn.setAttribute('aria-expanded', 'false'); }
  els.exportBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    const open = els.exportPop.hidden;
    els.exportPop.hidden = !open;
    els.exportBtn.setAttribute('aria-expanded', String(open));
    if (open) { const first = els.exportPop.querySelector('.menu-item'); if (first) first.focus(); }
  });
  document.addEventListener('click', ev => { if (!$('export-menu').contains(ev.target)) closeMenu(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') closeMenu();
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'o') { ev.preventDefault(); $('file-input').click(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); doExport(F.EXPORTS[0]); }
    if (ev.key === 'F8') { ev.preventDefault(); goToCheck(ev.shiftKey ? -1 : 1); }
  });

  // ---------- 点図ファイル（マス目に縛られない点図） ----------
  const T = {
    dlg: $('tactile-dlg'), canvas: $('t-preview'), paper: $('t-paper'), landscape: $('t-landscape'),
    pitch: $('t-pitch'), size: $('t-size'), title: $('t-title'), info: $('t-info'), styleDots: $('t-style-dots'), styleSolid: $('t-style-solid')
  };
  let tactileRow = null, tactileTimer = null;
  for (const [k, v] of Object.entries(window.TenjiFigure ? window.TenjiFigure.PAPERS : {})) {
    const o = document.createElement('option'); o.value = k; o.textContent = v.label; T.paper.appendChild(o);
  }
  for (const [k, v] of Object.entries(window.TenjiFigure ? window.TenjiFigure.DOT_SIZES : {})) {
    const o = document.createElement('option'); o.value = k; o.textContent = `${v.label}（直径${v.d}mm）`; T.size.appendChild(o);
  }
  T.paper.value = 'a4'; T.size.value = 'medium';
  const tactileOpt = () => {
    const titleKana = E.toKatakana(T.title.value.trim());
    return {
      paper: T.paper.value, landscape: T.landscape.checked,
      pitch: Math.max(1, Math.min(5, +T.pitch.value || 2.5)), size: T.size.value,
      style: T.styleSolid.checked ? 'solid' : 'dots',
      titleCells: titleKana ? E.kanaToBraille(titleKana).cells : ''
    };
  };
  const tactileSrc = row => row.tactile ? { dots: row.tactile } : row.blob ? { blob: row.blob } : { cells: (row.figure || []).map(l => l.replace(/^⠀+/, '')) };
  async function refreshTactile() {
    if (!tactileRow) return;
    const opt = tactileOpt();
    T.pitch.disabled = opt.style === 'solid' && !!tactileRow.blob;
    try {
      const lay = await window.TenjiFigure.layoutTactile(tactileSrc(tactileRow), opt);
      window.TenjiFigure.drawPreview(T.canvas, lay);
      T.info.textContent = opt.style === 'solid'
        ? '立体コピー（カプセルペーパー）用：黒い部分が浮き上がります。見出しの点字も点で描きます。'
        : `点図プリンタ用：点 ${lay.dots.length.toLocaleString()} 個` + (lay.dots.length > 2000 ? '（2,000点を超えるので、ソフトによっては読み込めないことがあります）' : '');
    } catch (e) { T.info.textContent = '図を作れませんでした：' + (e.message || e); }
  }
  function openTactile(row) {
    tactileRow = row;
    // エーデルなどの点図はもとから見出しを含むので、見出しは空にしておく
    T.title.value = row.tactile ? '' : (row.alt ? 'ズ' + row.alt.replace(/^図/, '').replace(/\.[^.]+$/, '') : 'ズ');
    if (T.dlg.showModal) T.dlg.showModal(); else T.dlg.hidden = false;
    refreshTactile();
  }
  [T.paper, T.landscape, T.pitch, T.size, T.title, T.styleDots, T.styleSolid].forEach(el =>
    el.addEventListener('input', () => { clearTimeout(tactileTimer); tactileTimer = setTimeout(refreshTactile, 200); }));
  async function exportTactile(kind) {
    if (!tactileRow) return;
    const lay = await window.TenjiFigure.layoutTactile(tactileSrc(tactileRow), tactileOpt());
    const style = lay.style === 'solid' ? '立体コピー' : '点図';
    const base = `${state.fileBase}_${(tactileRow.alt || '図').replace(/\.[^.]+$/, '')}_${style}`;
    const data = kind === 'svg' ? new TextEncoder().encode(window.TenjiFigure.toSVG(lay)) : window.TenjiFigure.toPDF(lay);
    if (await saveFile(`${base}.${kind}`, data)) toast(`${base}.${kind} を保存しました`);
  }
  // エーデル形式：エーデルの描ける範囲（8×10インチの点字用紙）に合わせて点を置く
  async function exportEdel() {
    if (!tactileRow) return;
    try {
      const lay = await window.TenjiFigure.layoutTactile(tactileSrc(tactileRow), { ...tactileOpt(), edel: true, style: 'dots' });
      const alt = (tactileRow.alt || '図').replace(/\.[^.]+$/, '');
      const name = (alt === state.fileBase ? alt : `${state.fileBase}_${alt}`) + '.edl';
      if (await saveFile(name, F.toEDL(lay.dots))) toast(`${name} を保存しました`);
    } catch (e) { toast(e.message || 'エーデル形式にできませんでした。', true); }
  }
  $('t-edl').addEventListener('click', exportEdel);
  $('t-pdf').addEventListener('click', () => exportTactile('pdf'));
  $('t-svg').addEventListener('click', () => exportTactile('svg'));
  $('t-close').addEventListener('click', () => { if (T.dlg.close) T.dlg.close(); else T.dlg.hidden = true; });

  // ---------- 6点入力（F D S J K L ＝ 1 2 3 4 5 6 の点） ----------
  const DOT_KEYS = { KeyF: 1, KeyD: 2, KeyS: 4, KeyJ: 8, KeyK: 16, KeyL: 32 };
  const held = new Set();
  let chord = 0;
  function insertAtCaret(ta, text) {
    const a = ta.selectionStart, z = ta.selectionEnd;
    ta.value = ta.value.slice(0, a) + text + ta.value.slice(z);
    ta.setSelectionRange(a + text.length, a + text.length);
    ta.dispatchEvent(new Event('input'));
  }
  const cellFor = bits => state.mode === 'braille-nabcc' ? E.cellsToAscii(E.bitsCell(bits), true) : E.bitsCell(bits);
  els.raw.addEventListener('keydown', ev => {
    if (!els.sixdot.checked || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
    if (DOT_KEYS[ev.code]) {
      ev.preventDefault();
      if (!ev.repeat) { held.add(ev.code); chord |= DOT_KEYS[ev.code]; }
      return;
    }
    if (ev.code === 'Space') { ev.preventDefault(); insertAtCaret(els.raw, cellFor(0)); return; }
    // そのほかの文字キーは 6点入力中は無視（Enter・矢印・BackSpace は使える）
    if (ev.key.length === 1) ev.preventDefault();
  });
  els.raw.addEventListener('keyup', ev => {
    if (!els.sixdot.checked || !DOT_KEYS[ev.code]) return;
    ev.preventDefault();
    held.delete(ev.code);
    if (!held.size && chord) { insertAtCaret(els.raw, cellFor(chord)); chord = 0; }
  });
  els.sixdot.addEventListener('change', () => {
    if (els.sixdot.checked) {
      els.raw.hidden = false; els.btnRaw.setAttribute('aria-expanded', 'true'); els.raw.focus();
      toast('6点入力：F D S J K L を同時に押して離すと1マス入ります（1の点＝F … 6の点＝L、スペースでマスあけ）');
    }
    held.clear(); chord = 0;
  });

  // ---------- イベント ----------
  $('btn-open').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0];
    if (f) openFile(f);
    ev.target.value = '';
  });
  $('btn-new').addEventListener('click', () => {
    state.rows = [];
    state.typeMap = new Map();
    state.figures = new Map();
    state.fileBase = '点訳';
    els.fileName.textContent = '新規';
    setNote('');
    if (state.mode === 'sumiji') { els.src.value = ''; convertAll(); els.src.focus(); }
    else { els.raw.value = ''; els.raw.hidden = false; els.btnRaw.setAttribute('aria-expanded', 'true'); convertAll(); els.raw.focus(); }
  });
  let timer = null;
  els.src.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(convertAll, 350); });
  els.mode.addEventListener('change', () => {
    const wasSumiji = state.mode === 'sumiji';
    setMode(els.mode.value);
    if (wasSumiji && state.mode !== 'sumiji') {
      // 墨字の欄に点字データが貼ってあれば、それを点字として読み直す。墨字なら空で始める
      const v = els.src.value;
      const looksBraille = state.mode === 'braille-unicode'
        ? /[⠁-⣿]/.test(v) && !/[぀-ヿ一-鿿]/.test(v)
        : /^[\x20-\x7e\r\n\f]*$/.test(v) && v.trim() !== '';
      els.raw.value = looksBraille ? v : '';
      els.raw.hidden = false; els.btnRaw.setAttribute('aria-expanded', 'true');
    }
    state.rows = [];
    convertAll();
  });
  els.btnRaw.addEventListener('click', () => {
    els.raw.hidden = !els.raw.hidden;
    els.btnRaw.setAttribute('aria-expanded', String(!els.raw.hidden));
    if (!els.raw.hidden) els.raw.focus();
  });
  els.raw.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(convertAll, 250); });
  els.join.addEventListener('change', updateSumiji);
  $('btn-save-txt').addEventListener('click', async () => {
    const text = els.sumiji.value;
    if (!text.trim()) { toast('保存する内容がありません。', true); return; }
    const name = `${state.fileBase}_墨字.txt`;
    if (await saveFile(name, F.textFile(text))) toast(`${name} を保存しました`);
  });
  $('btn-save-docx').addEventListener('click', async () => {
    const text = els.sumiji.value;
    if (!text.trim()) { toast('保存する内容がありません。', true); return; }
    try {
      const name = `${state.fileBase}_墨字.docx`;
      if (await saveFile(name, await F.docxFromText(text))) toast(`${name} を保存しました`);
    } catch (e) { toast(e.message || '保存に失敗しました。', true); }
  });
  [els.cols, els.lines, els.indent, els.hira, els.pagenum, els.genpon].forEach(el => el.addEventListener('change', () => { savePrefs(); render(); }));

  // ドラッグ＆ドロップ
  let dragDepth = 0;
  window.addEventListener('dragenter', ev => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) { dragDepth++; els.dropHint.hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) els.dropHint.hidden = true; });
  window.addEventListener('dragover', ev => ev.preventDefault());
  window.addEventListener('drop', ev => {
    ev.preventDefault(); dragDepth = 0; els.dropHint.hidden = true;
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) openFile(f);
  });

  // ---------- 起動 ----------
  loadPrefs();
  buildMenu();
  setMode('sumiji');
  els.src.value = SAMPLE;
  convertAll();

  if (window.kuromoji) {
    window.kuromoji.builder({ dicPath: 'dict/' }).build((err, tokenizer) => {
      if (err) {
        els.stDict.textContent = '辞書を読み込めませんでした（漢字は変換されません）';
        els.stDict.className = 'pill err';
        return;
      }
      state.tokenizer = tokenizer;
      els.stDict.textContent = '辞書 準備完了';
      els.stDict.className = 'pill ok';
      if (state.mode === 'sumiji') {
        state.rows = state.rows.filter(r => r.edited);
        convertAll();
        if (els.note.classList.contains('warn')) setNote('');
      }
    });
  } else {
    els.stDict.textContent = '辞書ライブラリがありません';
    els.stDict.className = 'pill err';
  }
})();
