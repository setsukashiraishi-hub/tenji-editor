/* 点訳エディタ 画面の動き */
(function () {
  'use strict';
  const E = window.TenjiEngine;
  const F = window.TenjiFormats;
  const $ = id => document.getElementById(id);

  const state = {
    tokenizer: null,
    mode: 'sumiji',
    rows: [],
    fileBase: '点訳',
    typeMap: new Map(), // 原文の行 → 行の種類（手で選んだもの・Wordの見出しなど）
    figures: new Map(),     // ［図：名前］→ { lines: [点字の行], alt }
    checkCursor: -1
  };

  const els = {
    src: $('src'), rows: $('rows'), mode: $('mode'), cols: $('cols'), lines: $('lines'),
    indent: $('indent'), hira: $('hira'), pagenum: $('pagenum'), genpon: $('genpon'), framefit: $('framefit'),
    fileName: $('file-name'), note: $('file-note'),
    stDict: $('st-dict'), stCount: $('st-count'), stWarn: $('st-warn'), navCheck: $('nav-check'),
    exportBtn: $('btn-export'), exportPop: $('export-pop'), toast: $('toast'), dropHint: $('drop-hint'),
    sumiji: $('sumiji'), raw: $('raw'), btnRaw: $('btn-raw'), sumijiActions: $('sumiji-actions'), join: $('join'),
    srcTitle: $('src-title'), outTitle: $('out-title'), outLegend: $('out-legend'),
    sixdot: $('sixdot'), sixdotWrap: $('sixdot-wrap'), srmode: $('srmode'),
    srPolite: $('sr-polite'), srAssertive: $('sr-assertive')
  };

  // ---------- スクリーンリーダーへのお知らせ ----------
  let announceTimer = null;
  function announce(msg, urgent) {
    const el = urgent ? els.srAssertive : els.srPolite;
    clearTimeout(announceTimer);
    el.textContent = '';
    // 同じ文でも読み直させるため、いったん空にしてから入れる
    announceTimer = setTimeout(() => { el.textContent = msg; }, 60);
  }
  // 点字1マスを点の番号で読む（例：⠋ → 1 2 4の点）
  function cellDots(c) {
    const b = c.charCodeAt(0) - 0x2800;
    if (!b) return 'マスあけ';
    const n = [];
    for (let i = 0; i < 6; i++) if (b & (1 << i)) n.push(i + 1);
    return n.join(' ') + 'の点';
  }
  const cellsDots = cells => Array.from(cells || '').map(cellDots).join('、');
  // 6点入力：F D S J K L を同時に押して離すと1マス。onCell(bits) を呼ぶ。enabled() が偽のときは何もしない
  const SIX_KEYS = { KeyF: 1, KeyD: 2, KeyS: 4, KeyJ: 8, KeyK: 16, KeyL: 32 };
  function attachSixKey(el, onCell, enabled) {
    const held = new Set();
    let chord = 0;
    el.addEventListener('keydown', ev => {
      if ((enabled && !enabled()) || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
      if (SIX_KEYS[ev.code]) {
        ev.preventDefault();
        if (!ev.repeat) { held.add(ev.code); chord |= SIX_KEYS[ev.code]; }
        return;
      }
      if (ev.code === 'Space') { ev.preventDefault(); onCell(0); return; }
      if (ev.key.length === 1) ev.preventDefault(); // ほかの文字キーは入れない（Enter・矢印・BackSpace は使える）
    });
    el.addEventListener('keyup', ev => {
      if ((enabled && !enabled()) || !SIX_KEYS[ev.code]) return;
      ev.preventDefault();
      held.delete(ev.code);
      if (!held.size && chord) { const b = chord; chord = 0; onCell(b); }
    });
    el.addEventListener('blur', () => { held.clear(); chord = 0; });
  }
  // 入れた1マスを読み上げる（かなと点の番号）
  const speakCell = bits => {
    const c = E.bitsCell(bits);
    if (!bits) return 'マスあけ';
    const kana = E.brailleToKana(c).replace(/〓/g, '').trim();
    return (kana ? kana + '、' : '') + cellDots(c);
  };
  // 行を読み上げ用の文にする
  function speakRow(row, n) {
    const type = row.type || 'body';
    const label = TYPE_LABEL[type] || '';
    const cells = rowCellsForDisplay(row);
    const parts = [`${n}行目`];
    if (type !== 'body') parts.push(label);
    if (type === 'figure') parts.push(row.alt ? row.alt : '', row.figKind === 'photo' ? '写真' : '',
      row.figure && !row.noFigure ? `本文に点図 ${row.figure.length}行` : `本文には「${displayKana(row.kana || '')}」`,
      (row.blob || row.tactile) && (row.noFigure || !row.figure) ? '点図は別ファイル' : '');
    else if (E.DECOR_TYPES.has(type)) parts.push(`${cellLen(cells)}マス`);
    else if (type !== 'blank') {
      parts.push(displayKana(row.kana || '') || '空行');
      if (cells) parts.push(`点字 ${cellLen(cells)}マス`);
      if (els.srmode.value === 'dots' && cells) parts.push('点字：' + cellsDots(cells));
    }
    if (needsCheck(row)) parts.push('要確認');
    if (row.edited) parts.push('手直し済み');
    return parts.filter(Boolean).join('、');
  }

  // ---------- 設定の保存（このブラウザだけ） ----------
  const PREF_KEYS = ['cols', 'lines', 'indent', 'hira', 'pagenum', 'genpon', 'framefit', 'srmode'];
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('tenji-editor-prefs') || '{}');
      for (const k of PREF_KEYS) {
        if (p[k] === undefined) continue;
        if (els[k].type === 'checkbox') els[k].checked = !!p[k]; else els[k].value = p[k];
        if (els[k].tagName === 'SELECT' && !els[k].value) els[k].selectedIndex = 0;
      }
    } catch (e) { /* 保存できない環境では既定値のまま */ }
  }
  function savePrefs() {
    try {
      const p = {};
      for (const k of PREF_KEYS) p[k] = els[k].type === 'checkbox' ? els[k].checked : (els[k].tagName === 'SELECT' ? els[k].value : +els[k].value);
      localStorage.setItem('tenji-editor-prefs', JSON.stringify(p));
    } catch (e) { /* 何もしない */ }
  }
  const layoutOpt = () => ({
    cols: Math.max(10, Math.min(60, +els.cols.value || 32)),
    lines: Math.max(5, Math.min(40, +els.lines.value || 18)),
    indent: els.indent.checked,
    pageNumbers: els.pagenum.checked,
    frameFit: els.framefit.checked,
    genpon: els.genpon.checked,
    title: state.fileBase
  });

  // ---------- 通知 ----------
  let toastTimer = null;
  function toast(msg, isErr) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('err', !!isErr);
    els.toast.hidden = false;
    announce(msg, !!isErr);
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

  // 辞書にない語は、1字ずつ辞書で読む（読めた語も「要確認」に残す）
  function readByChar(surf) {
    let out = '';
    for (const ch of surf) {
      if (/[ぁ-ゖァ-ヺー]/.test(ch)) { out += E.toKatakana(ch); continue; }
      const t = state.tokenizer.tokenize(ch)[0];
      if (t && t.reading && t.reading !== '*') { out += t.reading; continue; }
      if (E.READ[ch] !== undefined) { out += E.READ[ch]; continue; }
      return null;
    }
    return out || null;
  }

  function convertLine(text) {
    let kana = text, unresolved = [], checks = [], foreign = [];
    if (state.tokenizer) {
      const r = E.sumijiToKana(text, t => state.tokenizer.tokenize(t), { fallback: readByChar });
      kana = r.kana; unresolved = r.unresolved; checks = r.checks; foreign = r.foreign || [];
    }
    const b = E.kanaToBraille(kana);
    return { kana, cells: b.cells, unknown: b.unknown, bad: b.bad, unresolved, checks, foreign };
  }

  function sumijiToRows(text, oldRows) {
    state.figRows = new Map((oldRows || []).filter(r => r.type === 'figure').map(r => [r.src, r]));
    const old = new Map();
    (oldRows || []).forEach(r => { if (r.edited && r.src !== undefined) old.set(r.src, r); });
    if (!text.trim()) return []; // 何も入っていないときは行を作らない
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
        // 本文に書く注記：写真は「点図は別紙」、線画は点字の中に描く（描かない設定のときは「⦅図n⦆」とだけ書く）
        const no = fig && fig.no ? fig.no : ((m && /\d+/.exec(m[1])) || [''])[0];
        const photo = !!(fig && fig.kind === 'photo');
        const kana = photo ? `⦅ズ${no} シャシン テンズワ ベッシ⦆` : `⦅ズ${no}⦆`;
        const b = E.kanaToBraille(kana);
        const old = state.figRows && state.figRows.get(src);
        return { ...base, figure: fig ? fig.lines : null, blob: fig ? fig.blob : null, tactile: fig ? fig.tactile : null,
          proc: fig ? fig.proc : null, dotEdits: fig ? fig.dotEdits : null, baseFigure: fig ? fig.baseLines : null,
          figKind: photo ? 'photo' : 'drawing', figNo: no, srcAlt: fig ? fig.alt : '',
          noFigure: old ? old.noFigure : (photo || !(fig && fig.lines && fig.lines.length)),
          alt: m ? m[1] : '', kana, cells: b.cells, unknown: [], bad: [], checks: [], unresolved: [] };
      }
      if (type === 'table') {
        // 表の行：セルごとに点訳して、セルの間を2マスあける
        const parts = src.split('\t').map(c => c.trim() ? convertLine(c.trim()) : { kana: '', unresolved: [], checks: [] });
        const kana = parts.map(p => p.kana).join('  ').replace(/ +$/, '');
        const b = E.kanaToBraille(kana);
        return { ...base, kana, cells: b.cells, unknown: b.unknown, bad: b.bad, tkana: parts.map(p => p.kana),
          unresolved: parts.flatMap(p => p.unresolved), checks: parts.flatMap(p => p.checks), foreign: parts.flatMap(p => p.foreign || []) };
      }
      return { ...base, ...convertLine(src.replace(FRAME_SIDE_RE, '')) };
    });
  }

  function brailleToRows(rows) {
    const out = [];
    const st = {}; // 行をまたぐ読み取りの状態（アドレスの続きの行）
    const DENSE = /^[⠀⠿⠾⠷⠯⠟⠻⠽⠸⠇⠼⠧⠏⠹⠳]+$/;
    for (const r of rows) {
      if (r.pagebreak) { out.push({ pagebreak: true }); continue; }
      // ページ行（右寄せの数符＋数字だけの行）は本文として読まない
      const pm = /^⠀*(?:⠼([⠁-⠚]+)⠀{2,})?⠀{6,}⠼([⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚]+)$/.exec(r.cells || '');
      // BSE の各ページの1行目（ページ行）：空ならページ番号なし
      if (r.pageLine && !pm && !(r.cells || '').replace(/⠀/g, '')) {
        out.push({ src: '', type: 'pageno', fixed: true, cells: '', kana: '', page: '', para: false });
        continue;
      }
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
      const kana = E.brailleToKana(r.cells, st);
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

  function convertAll(noRender) {
    if (state.mode === 'sumiji') {
      state.rows = sumijiToRows(els.src.value, state.rows);
    } else {
      const parsed = F.parseRaw(els.raw.value, state.mode === 'braille-nabcc' ? 'nabcc' : 'unicode', { pageLines: state.pageLines }) || [];
      const edited = new Map();
      state.rows.forEach(r => { if (r.edited && r.src) edited.set(r.src, r); });
      state.rows = brailleToRows(parsed).map(r => (!r.pagebreak && edited.has(r.src)) ? edited.get(r.src) : r);
    }
    if (!noRender) render();
    // まとめて読み込んだファイルの一覧（要確認の数）も新しくする
    const d = state.docs && state.docs[state.docIndex];
    if (!noRender && d && d.snap) { d.snap.rows = state.rows; updateDocNav(); }
  }

  // ---------- 描画 ----------
  // 発音記号の印 ⟦ ⟧ は、画面では [ ] で見せる（[ ] のまま直しても発音記号の点字になる）
  // 画面と墨字では、内部の印（英語の語句 ⟪ ⟫・アドレス ⟬ ⟭・続きの行 ↪）を見せない
  const displayKana = k => (els.hira.checked ? E.toHiragana(k) : k).replace(/⟦/g, '[').replace(/⟧/g, ']').replace(/[⟪⟫⟬⟭↪⟮⟯\ue0f0]/g, '');
  const cellLen = s => Array.from(s || '').length;
  const TYPE_LABEL = Object.fromEntries(E.ROW_TYPES);
  const needsCheck = r => !r.pagebreak && !r.reviewed &&
    ((r.checks && r.checks.length) || (r.unknown && r.unknown.length) || (r.unresolved && r.unresolved.length) || (r.foreign && r.foreign.length));

  // 要確認の理由（一覧・読み上げ用）
  function checkReasons(r) {
    const out = [];
    for (const ck of (r.checks || [])) if (!ck.done) out.push(ck.note ? `記号を確認：${ck.surface}（${ck.note}）` : `読みを確認：${ck.surface}（今は ${displayKana(ck.kana)}）`);
    const miss = [...new Set([...(r.unknown || []), ...(r.unresolved || [])])].filter(x => x !== '〓');
    if (miss.length) out.push('辞書にない語・点字にできない文字：' + miss.join(' '));
    if ((r.unresolved || []).includes('〓')) out.push('読めない点字');
    // 外国語の点字は言語ごとに違う（英語の点字とは別）。その言語の点字で書くか、点訳者が決める
    for (const f of (r.foreign || [])) out.push(`外国語「${f.text}」：${f.kind}。点字の書き方は言語ごとに違うので、書き方を確認してください`);
    return out;
  }

  // 表示用のマスあけ記号（書き出すデータには入らない）
  const SPACE_MARK = '□';
  const showSpaces = t => t.replace(/[ 　]/g, SPACE_MARK);
  const hideSpaces = t => t.replace(/□/g, ' ');

  const chipEl = (text, cls) => { const s = document.createElement('span'); s.className = 'chip' + (cls ? ' ' + cls : ''); s.textContent = text; return s; };

  function rowCellsForDisplay(row) {
    const opt = layoutOpt();
    if (E.DECOR_TYPES.has(row.type)) return row.fixed ? row.cells : (row._lines ? row._lines[0] : E.decorCells(row.type, opt.cols));
    return row.cells || '';
  }

  function fillMeta(meta, row, onChange) {
    meta.textContent = '';
    const opt = layoutOpt();
    // 行の種類（見出し・区切り線など）
    if (row.type !== 'genpon') {
      const sel = document.createElement('select');
      sel.className = 'type-sel';
      sel.setAttribute('aria-label', `${row._n || ''}行目の種類`);
      for (const [v, label] of E.ROW_TYPES) {
        const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o);
      }
      sel.value = row.type || 'body';
      sel.addEventListener('change', () => changeType(row, sel.value));
      meta.appendChild(sel);
    }
    const cells = rowCellsForDisplay(row);
    if (row._lines && !E.DECOR_TYPES.has(row.type)) {
      const n = Math.max(0, ...row._lines.map(cellLen));
      if (row._fit && row._fit.mode === 'list') meta.appendChild(chipEl(row._fit.head ? '表が1行に入らないため、列の名前の行' : `表が${opt.cols}マスに入らないため、項目ごとに${row._lines.length}行で書きます`, 'warn'));
      else meta.appendChild(chipEl(`${n}マス` + (row._lines.length > 1 ? `・${row._lines.length}行に折り返し` : '')));
    } else if (cells && row.type !== 'figure') {
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
      lab.append(cb, document.createTextNode(' 本文の点字の中に描く（外すと注記だけ書き、点図は別ファイルにする）'));
      meta.appendChild(lab);
    }
    if (row.type === 'figure' && (row.blob || row.tactile || (row.figure && row.figure.length))) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt ok-btn fig-edit-btn'; b.textContent = '点図の調整・手直し・書き出し…';
      b.title = '輪郭抽出・ノイズ除去などの調整、点を1つずつ・なぞって直す、点図ファイル（PDF / SVG / エーデル）に書き出す';
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
        // 切り替えボタンにしない（「選択されていません」と読まれないように）。今の読みは名前で知らせる
        b.setAttribute('aria-label', `${row._n || ''}行目の「${ck.surface}」を ${displayKana(opt2)} と読む` + (opt2 === ck.kana ? '（今の読み）' : ''));
        b.addEventListener('click', ev => {
          ev.stopPropagation();
          if (opt2 !== ck.kana && row.kana.includes(ck.kana)) {
            row.kana = row.kana.replace(ck.kana, opt2);
            const r = E.kanaToBraille(row.kana);
            row.cells = r.cells; row.bad = r.bad; row.unknown = r.unknown; row.edited = true;
          }
          ck.kana = opt2; ck.done = true;
          announce(`「${ck.surface}」を ${displayKana(opt2)} にしました`);
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
      ok.setAttribute('aria-label', `${row._n || ''}行目を確認済みにする`);
      ok.addEventListener('click', ev => { ev.stopPropagation(); row.reviewed = true; (row.checks || []).forEach(c => { c.done = true; }); onChange(); announce(`${row._n || ''}行目を確認済みにしました`); });
      meta.appendChild(ok);
    }
    if (row.edited) meta.appendChild(chipEl(row.cellsEdited ? '点字を手直し済み' : 'かなを手直し済み', 'edited'));
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
  // 行の点図（別ファイル）を作って描く。作った配置は行に覚えておく
  async function drawRowTactile(row, canvas, info) {
    try {
      const opt = tactileOpt();
      const key = JSON.stringify({ ...opt, titleCells: '', no: row.figNo, proc: row.proc || null, e: editsOf(row, 'file').length });
      if (!row._tact || row._tactKey !== key) {
        row._tact = await window.TenjiFigure.layoutTactile(tactileSrc(row),
          { ...opt, titleCells: E.kanaToBraille(`ズ${row.figNo || ''}`).cells });
        row._tactKey = key;
      }
      window.TenjiFigure.drawPreview(canvas, row._tact);
      const paper = (window.TenjiFigure.PAPERS[opt.paper] || {}).label || '';
      info.textContent = `点図（別ファイル）：${paper}・点 ${row._tact.dots.length.toLocaleString()} 個` + (row._tact.rects.length ? '・塗り' : '');
    } catch (e) {
      info.textContent = '点図を作れませんでした：' + (e.message || e);
    }
  }

  function paintAlign(el, row) {
    el.textContent = '';
    el.dataset.speak = '';
    el.classList.remove('plain', 'figure-view');
    const type = row.type || 'body';
    if (type === 'figure') {
      el.classList.add('figure-view');
      const cap = document.createElement('div');
      cap.className = 'fig-cap';
      const useFig = row.figure && !row.noFigure;
      const hasTactile = !!(row.blob || row.tactile);
      const name = `${row.alt || '図'}${row.figKind === 'photo' ? '（写真）' : ''}`;
      cap.textContent = useFig ? `${name}：本文に点字のマスで描きます（${row.figure.length}行）`
        : `${name}：本文には「${displayKana(row.kana || '')}」と書きます` + (hasTactile ? '。点図は別ファイル（下）' : '');
      el.appendChild(cap);
      if (!useFig && hasTactile) {
        // 点図（別ファイル）のプレビュー：用紙に打つ点の並びそのもの
        const wrap = document.createElement('div');
        wrap.className = 'fig-tactile';
        const cv = document.createElement('canvas');
        wrap.appendChild(cv);
        const info = document.createElement('div');
        info.className = 'fig-tactile-info';
        info.textContent = '点図を作っています…';
        wrap.appendChild(info);
        el.appendChild(wrap);
        drawRowTactile(row, cv, info);
        // 本文に書く注記の点字
        const ln = document.createElement('div');
        ln.className = 'fig-line note-line';
        Array.from(row.cells || '').forEach(c => ln.appendChild(cellBox(c, c === '⠀' ? 'blank' : '')));
        el.appendChild(ln);
        return;
      }
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
    const gap = n => { for (let i = 0; i < n; i++) el.appendChild(unitEl('', '⠀', { space: true, decor: true })); };
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
    no.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.className = 'row-body';

    row._n = idx + 1;
    const align = document.createElement('div');
    align.className = 'align';
    const editable = !E.DECOR_TYPES.has(type) && type !== 'figure' && type !== 'blank';
    // 行はすべて矢印キーで移れるようにする（Tab で入るのは1行だけ）
    align.tabIndex = -1;
    align.setAttribute('role', editable ? 'button' : 'img');
    if (editable) align.title = 'クリックでかな・点字を直す';
    else align.classList.add('static');
    const setLabel = () => {
      align.setAttribute('aria-label', speakRow(row, idx + 1) + (editable ? (row.type !== 'table' && state.mode === 'sumiji' ? '。Enterでかな、Shift+Enterで点字を直せます' : '。Enterでかなを直せます') : ''));
    };
    paintAlign(align, row);
    // 点字のマスや、かなを1文字ずつ読ませない（行の読み上げ文にまとめる）
    for (const ch of align.children) ch.setAttribute('aria-hidden', 'true');
    setLabel();

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
    insBtn.setAttribute('aria-label', '点訳者注の記号を入れる');
    editWrap.append(edit, insBtn);
    // 点字を直接直す欄（6点入力）。表の行は列をそろえるため、かなで直す
    const brWrap = document.createElement('div');
    brWrap.className = 'edit-wrap braille-edit-wrap';
    brWrap.hidden = true;
    const brEdit = document.createElement('input');
    brEdit.type = 'text';
    brEdit.className = 'kana-edit braille-edit';
    brEdit.id = 'cells-' + idx;
    brEdit.setAttribute('inputmode', 'none');
    brEdit.setAttribute('aria-label', `${idx + 1}行目の点字。F D S J K L を同時に押して1マス、スペースでマスあけ、BackSpaceで消す`);
    brEdit.spellcheck = false;
    brEdit.autocomplete = 'off';
    const pad = document.createElement('div');
    pad.className = 'dot-pad';
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', '点を選んで入れる');
    let padBits = 0;
    const padBtns = [1, 4, 2, 5, 3, 6].map(n => { // 点字のマスと同じ並び（左 1 2 3、右 4 5 6）
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dot-btn'; b.textContent = n; b.dataset.n = n;
      b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', n + 'の点');
      b.addEventListener('mousedown', ev => ev.preventDefault());
      b.addEventListener('click', () => { padBits ^= 1 << (n - 1); b.setAttribute('aria-pressed', String(!!(padBits & (1 << (n - 1))))); });
      return b;
    });
    const padBtn = (label, aria, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn small-btn'; b.textContent = label; b.setAttribute('aria-label', aria);
      b.addEventListener('mousedown', ev => ev.preventDefault());
      b.addEventListener('click', fn);
      return b;
    };
    const dots = document.createElement('div'); dots.className = 'dot-grid'; dots.append(...padBtns);
    const clearPad = () => { padBits = 0; padBtns.forEach(b => b.setAttribute('aria-pressed', 'false')); };
    pad.append(dots,
      padBtn('入れる', '選んだ点の1マスを入れる', () => { if (padBits) { putCell(padBits); clearPad(); } brEdit.focus(); }),
      padBtn('マスあけ', 'マスあけを入れる', () => { putCell(0); brEdit.focus(); }),
      padBtn('1マス消す', '前の1マスを消す', () => { delCell(); brEdit.focus(); }));
    brWrap.append(brEdit, pad);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const refresh = () => {
      E.fitBlocks(state.rows, layoutOpt());
      paintAlign(align, row);
      for (const ch of align.children) ch.setAttribute('aria-hidden', 'true');
      setLabel();
      fillMeta(meta, row, refresh);
      li.classList.toggle('needs-check', !!needsCheck(row));
      updateSumiji();
      updateStatus();
    };
    fillMeta(meta, row, refresh);

    const brEditable = editable && row.type !== 'table' && state.mode === 'sumiji';
    const openEdit = (toBraille) => {
      if (!editable) return;
      edit.value = showSpaces(displayKana(row.kana || ''));
      editWrap.hidden = false;
      if (brEditable) { brEdit.value = row.cells || ''; brWrap.hidden = false; }
      (toBraille === true && brEditable ? brEdit : edit).focus();
    };
    // 点字を直したら、かなは点字から読み直す（かなの欄も合わせる）
    const applyCells = (cells, caret) => {
      row.cells = cells;
      const k = E.brailleToKana(cells);
      row.kana = typeof k === 'string' ? k : k.kana;
      if (row.type === 'table') row.tkana = row.kana.split(/ {2,}/);
      row.unknown = []; row.bad = []; row.unresolved = []; row.edited = true; row.reviewed = true; row.cellsEdited = true;
      brEdit.value = cells;
      if (caret !== undefined) brEdit.setSelectionRange(caret, caret);
      edit.value = showSpaces(displayKana(row.kana || ''));
      refresh();
    };
    const putCell = bits => {
      const v = Array.from(brEdit.value);
      const pre = Array.from(brEdit.value.slice(0, brEdit.selectionStart || 0)).length;
      const post = Array.from(brEdit.value.slice(0, brEdit.selectionEnd || 0)).length;
      const c = E.bitsCell(bits);
      const next = v.slice(0, pre).join('') + c + v.slice(post).join('');
      applyCells(next, (v.slice(0, pre).join('') + c).length);
      announce(speakCell(bits));
    };
    const delCell = () => {
      const a = brEdit.selectionStart || 0, z = brEdit.selectionEnd || 0;
      if (a === z && a === 0) return;
      const from = a === z ? a - 1 : a;
      const gone = brEdit.value.slice(from, z);
      applyCells(brEdit.value.slice(0, from) + brEdit.value.slice(z), from);
      announce(gone.length === 1 ? cellDots(gone) + 'を消しました' : `${gone.length}マス消しました`);
    };
    attachSixKey(brEdit, putCell);
    brEdit.addEventListener('keydown', ev => {
      if (ev.key === 'Backspace') { ev.preventDefault(); delCell(); }
      else if (ev.key === 'Delete') {
        ev.preventDefault();
        const a = brEdit.selectionStart || 0, z = brEdit.selectionEnd || 0;
        if (a === z && a >= brEdit.value.length) return;
        applyCells(brEdit.value.slice(0, a) + brEdit.value.slice(a === z ? a + 1 : z), a);
      } else if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); editWrap.hidden = true; brWrap.hidden = true; align.focus(); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { // 動いた先のマスを読む
        setTimeout(() => { const c = brEdit.value[brEdit.selectionStart] || ''; if (c) announce(cellDots(c)); }, 0);
      }
    });
    // 点字（Unicode）の貼り付けはそのまま入れる
    brEdit.addEventListener('paste', ev => {
      const t = (ev.clipboardData && ev.clipboardData.getData('text')) || '';
      ev.preventDefault();
      const cells = Array.from(t.replace(/ /g, '⠀')).filter(ch => ch >= '⠀' && ch <= '⣿').join('');
      if (!cells) { toast('点字（⠿ のような文字）だけ貼り付けられます。', true); return; }
      const a = brEdit.selectionStart || 0, z = brEdit.selectionEnd || 0;
      applyCells(brEdit.value.slice(0, a) + cells + brEdit.value.slice(z), a + cells.length);
    });
    const applyEdit = () => {
      const pos = edit.selectionStart;
      const v = showSpaces(edit.value);
      if (v !== edit.value) { edit.value = v; edit.setSelectionRange(pos, pos); }
      row.kana = E.toKatakana(hideSpaces(v));
      if (row.type === 'table') row.tkana = row.kana.split(/ {2,}/);
      const b = E.kanaToBraille(row.kana);
      row.cells = b.cells; row.unknown = b.unknown; row.bad = b.bad; row.unresolved = []; row.edited = true; row.reviewed = true;
      refresh();
      clearTimeout(row._speakTimer);
      row._speakTimer = setTimeout(() => {
        announce(`点字 ${cellLen(row.cells)}マス` + (els.srmode.value === 'dots' ? '、' + cellsDots(row.cells) : '') +
          (b.unknown.length ? `、点字にできない文字があります：${b.unknown.join(' ')}` : ''));
      }, 700);
    };
    align.addEventListener('click', openEdit);
    // Enter：かなを直す、Shift+Enter：点字を直す（6点入力）
    align.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEdit(ev.shiftKey); } });
    edit.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); editWrap.hidden = true; brWrap.hidden = true; align.focus(); } });
    // 欄の外にフォーカスが出たら閉じる（かなの欄・点字の欄・ボタンのあいだは閉じない）
    const closeIfOutside = () => setTimeout(() => {
      if (!body.contains(document.activeElement) || document.activeElement === align) { editWrap.hidden = true; brWrap.hidden = true; }
    }, 0);
    edit.addEventListener('blur', closeIfOutside);
    brEdit.addEventListener('blur', closeIfOutside);
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

    body.append(align, editWrap, brWrap, meta);
    li.append(no, body);
    li.dataset.idx = String(state.rows.indexOf(row));
    return li;
  }

  // ---------- 表のカード ----------
  // 表全体を1枚に並べる。列は縦にそろい、列ごとに色を変え、見出しの行は太字。
  // 行を選んで Enter（またはクリック）で、その行のかなを直せる（欄の区切りは□□）。
  function tableCaption(T, cols) {
    const size = `表（${T.rows}行×${T.nc}列）`;
    if (T.mode === 'grid') return `${size}：列の頭をそろえて書きます`;
    if (T.mode === 'wrap') return `${size}：最後の列が長いので、その列の中で折り返します（続きも列の頭にそろえます）`;
    if (T.mode === 'split') return `${size}：${cols}マスに入らないので、1列目をくり返して${T.parts}つの表に分けて書きます`;
    return `${size}：${cols}マスに入らないので、「列の名前：値」の形で項目ごとに書きます`;
  }
  function speakTableLine(T, grp, l) {
    const r = grp[l.row];
    const ks = E.tableKana(r).map(k => displayKana(k.trim()));
    const heads = T.hasHead ? E.tableKana(grp[0]).map(k => displayKana(k.trim())) : null;
    const parts = [`${r._n}行目`, '表' + (T.parts > 1 ? `その${l.part + 1}` : ''), l.header ? '見出しの行' : `${l.row + (T.hasHead ? 0 : 1)}行目`];
    if (l.header || !heads) parts.push(ks.filter(Boolean).join('、'));
    else parts.push(ks.map((k, i) => (heads[i] ? heads[i] + ' ' : '') + (k || '空欄')).join('、'));
    parts.push(`点字 ${cellLen(l.cells)}マス`);
    if (needsCheck(r)) parts.push('要確認');
    return parts.join('、') + '。Enterでかなを直せます';
  }
  function buildTable(grp, fs, fe, n0) {
    const li = document.createElement('li');
    const no = document.createElement('div');
    no.className = 'row-no';
    no.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.className = 'row-body';
    let k = n0;
    if (fs) fs._n = ++k;
    grp.forEach(r => { r._n = ++k; });
    if (fe) fe._n = ++k;
    no.textContent = n0 + 1 === k ? String(k) : `${n0 + 1}〜${k}`;
    const cap = document.createElement('div');
    cap.className = 'tbl-cap';
    const box = document.createElement('div');
    box.className = 'tbl';
    const metaBox = document.createElement('div');
    metaBox.className = 'tbl-meta';

    // かなを直す欄（表の下に1つ）
    const editWrap = document.createElement('div');
    editWrap.className = 'edit-wrap tbl-edit';
    editWrap.hidden = true;
    const lab = document.createElement('label');
    lab.className = 'tbl-edit-label';
    const edit = document.createElement('input');
    edit.type = 'text';
    edit.className = 'kana-edit';
    edit.spellcheck = false;
    edit.id = 'tbl-edit-' + state.rows.indexOf(grp[0]);
    lab.htmlFor = edit.id;
    editWrap.append(lab, edit);
    let editing = null;

    const frameLine = r => {
      const el = document.createElement('div');
      el.className = 'align tbl-frame static';
      el.tabIndex = -1;
      el.setAttribute('role', 'img');
      paintAlign(el, r);
      for (const ch of el.children) ch.setAttribute('aria-hidden', 'true');
      el.setAttribute('aria-label', speakRow(r, r._n));
      el.dataset.rowidx = String(state.rows.indexOf(r));
      return el;
    };
    const paint = () => {
      const T = grp[0]._table;
      const opt = layoutOpt();
      li.className = 'row type-table-block' + (grp.some(needsCheck) ? ' needs-check' : '');
      cap.textContent = T ? tableCaption(T, opt.cols) : '表';
      box.textContent = '';
      if (fs) box.appendChild(frameLine(fs));
      let shade = 0;
      for (const l of (T ? T.lines : [])) {
        if (l.gap) { const g = document.createElement('div'); g.className = 'tbl-gap'; box.appendChild(g); continue; }
        const focusable = l.row >= 0 && !l.cont;
        const el = document.createElement('div');
        if (l.row >= 0 && !l.cont && !l.header) shade++;
        el.className = (focusable ? 'align ' : '') + 'tbl-line' + (l.header ? ' tbl-head' : '') + (l.note ? ' tbl-note' : '') +
          (l.cont ? ' tbl-cont' : '') + (l.row >= 0 && !l.header && shade % 2 === 0 ? ' tbl-even' : '');
        for (const pc of l.pieces) {
          const sp = !!pc.pad || /^[ 　]+$/.test(pc.k);
          const u = unitEl(pc.pad ? '' : sp ? SPACE_MARK : displayKana(pc.k), pc.c, { space: sp, decor: !!pc.pad });
          if (pc.col !== undefined) u.classList.add(pc.col % 2 ? 'col-b' : 'col-a');
          u.setAttribute('aria-hidden', 'true');
          el.appendChild(u);
        }
        if (l.row >= 0) {
          const r = grp[l.row];
          el.dataset.rowidx = String(state.rows.indexOf(r));
          if (needsCheck(r)) el.classList.add('needs-check');
          if (focusable) {
            el.tabIndex = -1;
            el.setAttribute('role', 'button');
            el.title = 'クリックでかなを直す';
            el.setAttribute('aria-label', speakTableLine(T, grp, l));
            el.addEventListener('click', () => openEdit(r));
            el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEdit(r); } });
          }
        } else if (l.note) {
          el.classList.add('align', 'static');
          el.tabIndex = -1;
          el.setAttribute('role', 'img');
          el.setAttribute('aria-label', `表その${l.part + 1}の始まり（点訳者注）`);
        }
        box.appendChild(el);
      }
      if (fe) box.appendChild(frameLine(fe));
      // 読みの確認が要る行は、表の下で候補を選べるようにする
      metaBox.textContent = '';
      grp.filter(needsCheck).forEach(r => {
        const m = document.createElement('div');
        m.className = 'meta';
        fillMeta(m, r, () => { E.fitBlocks(state.rows, layoutOpt()); paint(); updateSumiji(); updateStatus(); });
        const t = document.createElement('span');
        t.className = 'chip warn';
        t.textContent = `${r._n}行目`;
        m.prepend(t);
        metaBox.appendChild(m);
      });
    };
    const lineOf = r => box.querySelector(`.align[data-rowidx="${state.rows.indexOf(r)}"]`);
    const openEdit = r => {
      editing = r;
      lab.textContent = `${r._n}行目のかな（□はマスあけ。欄と欄の間は□□）`;
      edit.value = showSpaces(displayKana(E.tableKana(r).map(x => x.trim()).join('  ')));
      editWrap.hidden = false;
      edit.focus();
    };
    edit.addEventListener('input', () => {
      if (!editing) return;
      const r = editing;
      const pos = edit.selectionStart;
      const v = showSpaces(edit.value);
      if (v !== edit.value) { edit.value = v; edit.setSelectionRange(pos, pos); }
      r.kana = E.toKatakana(hideSpaces(v));
      r.tkana = r.kana.split(/ {2,}/);
      const b = E.kanaToBraille(r.kana);
      r.cells = b.cells; r.unknown = b.unknown; r.bad = b.bad; r.unresolved = []; r.edited = true; r.reviewed = true;
      E.fitBlocks(state.rows, layoutOpt());
      paint();
      updateSumiji(); updateStatus();
      clearTimeout(r._speakTimer);
      r._speakTimer = setTimeout(() => {
        const T = grp[0]._table;
        announce(T ? tableCaption(T, layoutOpt().cols) : '表');
      }, 900);
    });
    const close = () => {
      editWrap.hidden = true;
      const el = editing && lineOf(editing);
      if (el) { setCurrentRow(rowItems().indexOf(el), false); el.focus(); }
    };
    edit.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); close(); } });
    edit.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== edit) editWrap.hidden = true; }, 0); });

    paint();
    body.append(cap, box, editWrap, metaBox);
    li.append(no, body);
    li.dataset.idx = String(state.rows.indexOf(fs || grp[0]));
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
    E.fitBlocks(state.rows, layoutOpt()); // 枠の長さ・表の列をそろえてから表示する
    const frag = document.createDocumentFragment();
    let n = 0;
    const rs = state.rows;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      // 表（と、それを囲む枠）は1枚のカードにまとめて、列を縦にそろえて見せる
      const fs = r.type === 'frame-start' && !r.fixed && rs[i + 1] && rs[i + 1]._table ? r : null;
      const head = fs ? rs[i + 1] : r;
      if (head && head._table) {
        let k = rs.indexOf(head) + 1;
        while (k < rs.length && rs[k]._tableHead === head) k++;
        const grp = rs.slice(rs.indexOf(head), k);
        const fe = fs && rs[k] && rs[k].type === 'frame-end' && !rs[k].fixed ? rs[k++] : null;
        frag.appendChild(buildTable(grp, fs, fe, n));
        n += grp.length + (fs ? 1 : 0) + (fe ? 1 : 0);
        i = k - 1;
        continue;
      }
      frag.appendChild(buildRow(r, (r.pagebreak || r.type === 'genpon' || r.type === 'pageno') ? n : n++));
    }
    els.rows.textContent = '';
    els.rows.appendChild(frag);
    if (!state.rows.some(r => r.cells || r.figure || (r.type && r.type !== 'body' && r.type !== 'blank'))) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.textContent = state.mode === 'sumiji'
        ? 'まだ何もありません。左の欄に文章を入力・貼り付けるか、「ファイルを開く」でファイルを選んでください。ここに1行ずつ、かなと点字が並びます。'
        : 'まだ何もありません。「ファイルを開く」で点字ファイルを選ぶか、「6点入力」で点字を打ってください。';
      els.rows.appendChild(li);
    }
    setCurrentRow(Math.min(state.currentRow || 0, rowItems().length - 1), false);
    updateSumiji();
    updateStatus();
  }

  // ---------- 行の移動（矢印キー） ----------
  const rowItems = () => [...els.rows.querySelectorAll('.align')];
  function setCurrentRow(i, focus) {
    const items = rowItems();
    if (!items.length) return;
    i = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((el, k) => { el.tabIndex = k === i ? 0 : -1; });
    state.currentRow = i;
    if (focus) items[i].focus();
  }
  els.rows.addEventListener('focusin', ev => {
    const items = rowItems();
    const i = items.indexOf(ev.target);
    if (i >= 0) setCurrentRow(i, false);
  });
  els.rows.addEventListener('keydown', ev => {
    const items = rowItems();
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const go = j => { ev.preventDefault(); setCurrentRow(j, true); };
    if (ev.key === 'ArrowDown') go(i + 1);
    else if (ev.key === 'ArrowUp') go(i - 1);
    else if (ev.key === 'Home') go(0);
    else if (ev.key === 'End') go(items.length - 1);
    else if (ev.key === 'PageDown') go(i + 10);
    else if (ev.key === 'PageUp') go(i - 10);
  });
  els.rows.addEventListener('focus', () => setCurrentRow(state.currentRow || 0, true));

  function updateStatus() {
    // まとめて読み込んだファイルの一覧（要確認の数）も新しくする
    const doc = state.docs && state.docs[state.docIndex];
    if (doc && doc.snap) { doc.snap.rows = state.rows; updateDocNav(); }
    const textRows = state.rows.filter(r => !r.pagebreak && r.type !== 'genpon' && r.type !== 'pageno');
    const opt = layoutOpt();
    const pages = E.layoutPages(state.rows, opt);
    const lines = pages.reduce((a, p) => a + p.length, 0);
    els.stCount.textContent = `${textRows.length}行 → 点字 ${lines}行・${pages.length}ページ（${opt.cols}マス×${opt.lines}行${opt.pageNumbers ? '・ページ番号あり' : ''}）`;
    const warnRows = textRows.filter(needsCheck).length;
    els.stWarn.textContent = warnRows ? `要確認 ${warnRows}行` : '';
    const cb = $('btn-checklist');
    $('check-count').textContent = warnRows;
    cb.classList.toggle('has', warnRows > 0);
    cb.setAttribute('aria-label', `校正箇所の一覧、${warnRows ? warnRows + '件' : 'なし'}`);
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
    const al = li.querySelector('.align');
    const k = rowItems().indexOf(al);
    if (k >= 0) setCurrentRow(k, false);
    if (al) al.focus({ preventScroll: true });
    announce(`要確認 ${idx + 1}件目／${items.length}件`);
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
      else para += ((r.kana || '').startsWith('⟬↪') ? '' : ' ') + line; // アドレスの続きの行は詰めてつなぐ
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
      : '上段：かな（□＝マスあけ）／下段：6点　行を押すと、かなと点字（6点入力）を直せます';
  }

  // ---------- ファイル ----------
  async function openFile(file) {
    closeDocs(true);
    try {
      const buf = await file.arrayBuffer();
      if (/\.pdf$/i.test(file.name)) toast('PDFを読み込んでいます…');
      const res = await F.readFile(file.name, buf, layoutOpt());
      applyRead(file.name, res);
      convertAll();
      toast(`${file.name} を読み込みました`);
    } catch (e) {
      toast(e.message || 'ファイルを読み込めませんでした。', true);
    }
  }
  // 読み込んだ結果を画面（左の欄・設定）に入れる。変換はしない
  function applyRead(name, res) {
    {
      const file = { name };
      state.rows = [];
      state.fileBase = file.name.replace(/\.[^.]+$/, '') || '点訳';
      els.fileName.textContent = file.name;
      setNote(res.note || '');
      if (res.mode === 'sumiji') {
        state.typeMap = new Map(res.types || []);
        state.figures = new Map(res.figures || []);
        state.pageLines = false;
        setMode('sumiji');
        els.src.value = res.raw;
        if (!state.tokenizer) setNote('辞書の読み込みが終わると、漢字をかなに直して変換します。', true);
      } else {
        setMode(res.rawKind === 'nabcc' ? 'braille-nabcc' : 'braille-unicode');
        els.raw.value = res.raw;
        // BSE のヘッダにあるマス数・行数に合わせる。各ページの1行目はページ行として読む
        state.pageLines = !!res.layout;
        if (res.layout) {
          if (res.layout.cols) els.cols.value = res.layout.cols;
          if (res.layout.lines) els.lines.value = res.layout.lines;
        }
        els.hira.checked = true; // 墨字はひらがなで起こす（設定はいつでも切り替えられる）
      }
    }
  }

  // ---------- まとめて読み込む（ZIP・複数のファイル） ----------
  // 1つずつ変換して覚えておき、「前のファイル／次のファイル」でめくる。直したかなも、めくって戻っても残る
  const DOC = { nav: $('docnav'), prev: $('doc-prev'), next: $('doc-next'), select: $('doc-select'), pos: $('doc-pos'),
    exportAll: $('doc-export-all'), close: $('doc-close'), dlg: $('batch-dlg'), count: $('batch-count'), format: $('batch-format'),
    warn: $('batch-warn'), go: $('batch-go'), back: $('batch-back') };
  state.docs = [];
  state.docIndex = -1;
  const OPENABLE = /\.(txt|docx|xlsx|xlsm|csv|tsv|pdf|edl|png|jpe?g|gif|bmp|webp|hei[cf]|avif|bse|brl|brf|pef|bes|besx|brt|txn)$/i;
  // ZIP の中のファイル名：Windows で作った ZIP は Shift_JIS のことがある
  const zipName = bytes => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* UTF-8 でない */ }
    try { return new TextDecoder('shift_jis').decode(bytes); } catch (e) { return String.fromCharCode(...bytes); }
  };
  async function expandFiles(files) {
    const out = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        try {
          const zip = await window.JSZip.loadAsync(await f.arrayBuffer(), { decodeFileName: zipName });
          const ents = Object.values(zip.files)
            .filter(z => !z.dir && !/(^|\/)(__MACOSX|\.)/.test(z.name) && OPENABLE.test(z.name))
            .sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
          for (const z of ents) out.push({ name: z.name.split('/').pop(), path: z.name, from: f.name, load: () => z.async('arraybuffer') });
          const skipped = Object.values(zip.files).filter(z => !z.dir && !/(^|\/)(__MACOSX|\.)/.test(z.name) && !OPENABLE.test(z.name)).length;
          if (skipped) toast(`${f.name}：読み込めない形式のファイル ${skipped}件は飛ばしました`);
        } catch (e) { toast(`${f.name} を開けませんでした（ZIPが壊れているかもしれません）`, true); }
      } else out.push({ name: f.name, path: f.name, load: () => f.arrayBuffer() });
    }
    return out;
  }
  // 今の画面の中身を覚える
  function snapshot() {
    return { rows: state.rows, mode: state.mode, src: els.src.value, raw: els.raw.value, typeMap: state.typeMap, figures: state.figures,
      fileBase: state.fileBase, pageLines: state.pageLines, note: els.note.textContent, noteWarn: els.note.classList.contains('warn'),
      fileName: els.fileName.textContent, cols: els.cols.value, lines: els.lines.value, hira: els.hira.checked };
  }
  function restore(snap) {
    state.rows = snap.rows; state.typeMap = snap.typeMap; state.figures = snap.figures; state.fileBase = snap.fileBase; state.pageLines = snap.pageLines;
    setMode(snap.mode);
    els.src.value = snap.src; els.raw.value = snap.raw;
    els.fileName.textContent = snap.fileName;
    els.cols.value = snap.cols; els.lines.value = snap.lines; els.hira.checked = snap.hira;
    setNote(snap.note, snap.noteWarn);
  }
  const waitDict = () => new Promise(res => {
    if (state.tokenizer || !window.kuromoji) return res();
    const t = setInterval(() => { if (state.tokenizer || els.stDict.classList.contains('err')) { clearInterval(t); res(); } }, 200);
  });
  const docChecks = d => d.snap ? d.snap.rows.filter(needsCheck).length : 0;
  function docLabel(d, i) {
    const n = docChecks(d);
    return `${i + 1}. ${d.name}` + (d.error ? '（読み込めませんでした）' : !d.snap ? '（変換中）' : n ? `（要確認 ${n}）` : '');
  }
  function updateDocNav() {
    const docs = state.docs, i = state.docIndex;
    DOC.nav.hidden = docs.length < 2;
    if (docs.length < 2) return;
    DOC.select.textContent = '';
    docs.forEach((d, k) => { const o = document.createElement('option'); o.value = k; o.textContent = docLabel(d, k); DOC.select.appendChild(o); });
    DOC.select.value = String(i);
    DOC.pos.textContent = `${i + 1} / ${docs.length}`;
    DOC.prev.disabled = i <= 0; DOC.next.disabled = i >= docs.length - 1;
  }
  async function openFiles(files) {
    const list = await expandFiles(files);
    if (!list.length) { toast('読み込めるファイルがありませんでした。', true); return; }
    if (list.length === 1 && !/\.zip$/i.test(files[0].name)) { openFile(files[0]); return; }
    closeDocs(true);
    state.docs = list.map(x => ({ ...x, snap: null, error: null }));
    state.docIndex = 0;
    updateDocNav();
    toast(`${list.length}件のファイルを、まとめて変換しています…`);
    announce(`${list.length}件のファイルを変換しています`);
    await waitDict();
    // 1つずつ読み込んで変換し、覚えておく（画面には最後に1件目を出す）
    for (let k = 0; k < state.docs.length; k++) {
      const d = state.docs[k];
      DOC.pos.textContent = `変換中 ${k + 1} / ${state.docs.length}`;
      try {
        const buf = await d.load();
        const res = await F.readFile(d.name, buf, layoutOpt());
        applyRead(d.name, res);
        convertAll(true);
        d.snap = snapshot();
      } catch (e) { d.error = e.message || '読み込めませんでした'; }
      d.load = null; // 中身は覚えたので、元のデータは放す
    }
    const ok = state.docs.filter(d => d.snap).length, bad = state.docs.length - ok;
    const checks = state.docs.reduce((a, d) => a + docChecks(d), 0);
    showDoc(state.docs.findIndex(d => d.snap) >= 0 ? state.docs.findIndex(d => d.snap) : 0, true);
    const msg = `${ok}件を変換しました` + (bad ? `（${bad}件は読み込めませんでした）` : '') + (checks ? `。要確認は全部で${checks}か所です` : '');
    toast(msg); announce(msg + '。Alt＋PageDownで次のファイル、Alt＋PageUpで前のファイルへ移ります');
  }
  function showDoc(k, quiet) {
    const docs = state.docs;
    if (!docs.length || k < 0 || k >= docs.length) return;
    // 今のファイルの手直しを覚えてから切り替える
    const cur = docs[state.docIndex];
    if (cur && cur.snap && state.docIndex !== k) cur.snap = snapshot();
    state.docIndex = k;
    const d = docs[k];
    if (d.snap) { restore(d.snap); render(); }
    else {
      state.rows = []; state.fileBase = d.name.replace(/\.[^.]+$/, ''); els.fileName.textContent = d.name;
      setNote(d.error ? `${d.name}：${d.error}` : '変換中です…', true); render();
    }
    updateDocNav();
    if (!quiet) {
      const n = docChecks(d);
      announce(`${k + 1}件目／${docs.length}件、${d.name}` + (d.error ? '、読み込めませんでした' : n ? `、要確認 ${n}か所` : ''));
    }
  }
  function closeDocs(silent) {
    if (!state.docs.length) return;
    state.docs = []; state.docIndex = -1;
    updateDocNav();
    if (!silent) announce('まとめて読み込んだファイルを閉じました。今のファイルだけが残ります');
  }
  DOC.prev.addEventListener('click', () => showDoc(state.docIndex - 1));
  DOC.next.addEventListener('click', () => showDoc(state.docIndex + 1));
  DOC.select.addEventListener('change', () => showDoc(+DOC.select.value));
  DOC.close.addEventListener('click', () => closeDocs());
  document.addEventListener('keydown', ev => {
    if (!state.docs.length || !ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === 'PageDown') { ev.preventDefault(); showDoc(state.docIndex + 1); }
    if (ev.key === 'PageUp') { ev.preventDefault(); showDoc(state.docIndex - 1); }
  });
  // まとめて書き出す：同じ形式で全部書き出して、1つのZIPに
  for (const fmt of F.EXPORTS) {
    const o = document.createElement('option'); o.value = fmt.id; o.textContent = `${fmt.label}（.${fmt.ext}）`; DOC.format.appendChild(o);
  }
  try { const v = localStorage.getItem('tenji-editor-batchformat'); if (v) DOC.format.value = v; } catch (e) { /* 既定のまま */ }
  DOC.format.addEventListener('change', () => { try { localStorage.setItem('tenji-editor-batchformat', DOC.format.value); } catch (e) { /* 何もしない */ } });
  DOC.exportAll.addEventListener('click', () => {
    const cur = state.docs[state.docIndex];
    if (cur && cur.snap) cur.snap = snapshot();
    const ok = state.docs.filter(d => d.snap);
    DOC.count.textContent = `${ok.length}件のファイル`;
    const left = ok.filter(d => docChecks(d) > 0);
    DOC.warn.hidden = !left.length;
    DOC.warn.textContent = left.length ? `校正されていない箇所が残っているファイルが${left.length}件あります（${left.slice(0, 5).map(d => d.name).join('、')}${left.length > 5 ? ' ほか' : ''}）。` : '';
    DOC.dlg.showModal();
    DOC.format.focus();
  });
  DOC.back.addEventListener('click', () => DOC.dlg.close());
  DOC.dlg.addEventListener('close', () => DOC.exportAll.focus());
  DOC.dlg.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName !== 'SELECT') { ev.preventDefault(); DOC.go.click(); } });
  DOC.go.addEventListener('click', async () => {
    const fmt = F.EXPORTS.find(f => f.id === DOC.format.value);
    DOC.dlg.close();
    if (!fmt) return;
    const here = snapshot();
    const zip = new window.JSZip();
    const used = new Set();
    let n = 0;
    toast('まとめて書き出しています…');
    try {
      for (const d of state.docs) {
        if (!d.snap) continue;
        restore(d.snap);
        E.fitBlocks(state.rows, layoutOpt());
        if (!state.rows.some(r => r.cells || r.figure || E.DECOR_TYPES.has(r.type))) continue;
        const rows = state.rows.map(r => ({ ...r, kana: r.kana ? displayKana(r.kana) : r.kana }));
        const data = await F.exportFile(fmt.id, rows, layoutOpt());
        const suffix = fmt.id.startsWith('txt-') || fmt.id.startsWith('docx-') ? '_' + fmt.id.split('-')[1] : '';
        let name = `${d.snap.fileBase}${suffix}.${fmt.ext}`;
        for (let k = 2; used.has(name); k++) name = `${d.snap.fileBase}_${k}${suffix}.${fmt.ext}`; // 同じ名前は番号を付ける
        used.add(name);
        zip.file(name, data); n++;
      }
    } catch (e) { toast(e.message || '書き出しに失敗しました。', true); }
    restore(here); render();
    if (!n) { toast('書き出す内容がありません。', true); return; }
    const first = state.docs[0];
    const base = (first && first.from ? first.from.replace(/\.zip$/i, '') : 'まとめ') + `_${fmt.ext}`;
    const zdata = await zip.generateAsync({ type: 'uint8array' });
    if (await saveFile(`${base}.zip`, zdata)) toast(`${base}.zip を保存しました（${n}ファイル）`);
  });

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

  // ---------- 校正箇所の一覧 ----------
  const CK = { dlg: $('check-dlg'), list: $('check-list'), desc: $('check-desc') };
  let checkOpener = null;
  function openCheckList(opener) {
    checkOpener = opener || document.activeElement;
    const items = state.rows.filter(needsCheck);
    CK.list.textContent = '';
    CK.desc.textContent = items.length
      ? `${items.length}件あります。項目を選ぶとその行へ移動します（上下の矢印キーで移動、Enterで決定）。`
      : '校正が必要な箇所はありません。';
    items.forEach(r => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'check-item';
      const no = document.createElement('span'); no.className = 'ci-no'; no.textContent = `${r._n}行目`;
      const why = document.createElement('span'); why.className = 'ci-why'; why.textContent = checkReasons(r).join('／');
      const text = document.createElement('span'); text.className = 'ci-text';
      text.textContent = (r.src && r.src !== r.cells ? '原文：' + r.src + '　' : '') + 'かな：' + displayKana(r.kana || '');
      b.append(no, why, text);
      b.setAttribute('aria-label', `${r._n}行目、${checkReasons(r).join('、')}、かな：${displayKana(r.kana || '')}`);
      b.addEventListener('click', () => {
        CK.dlg.close();
        const want = String(state.rows.indexOf(r));
        const al = rowItems().find(el => el.dataset.rowidx === want) || rowItems().find(el => el.closest('.row') && el.closest('.row').dataset.idx === want);
        if (al) {
          setCurrentRow(rowItems().indexOf(al), false);
          al.scrollIntoView({ block: 'center' });
          al.focus({ preventScroll: true });
          const li2 = al.closest('.row'); li2.classList.add('flash'); setTimeout(() => li2.classList.remove('flash'), 1200);
        }
      });
      li.appendChild(b);
      CK.list.appendChild(li);
    });
    if (!items.length) { const p = document.createElement('li'); p.className = 'check-empty'; p.textContent = 'ありません。'; CK.list.appendChild(p); }
    CK.dlg.showModal();
    const first = CK.list.querySelector('.check-item');
    (first || $('check-close')).focus();
  }
  CK.list.addEventListener('keydown', ev => {
    const items = [...CK.list.querySelectorAll('.check-item')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); items[Math.max(0, i - 1)].focus(); }
    if (ev.key === 'Home') { ev.preventDefault(); items[0].focus(); }
    if (ev.key === 'End') { ev.preventDefault(); items[items.length - 1].focus(); }
  });
  $('check-close').addEventListener('click', () => CK.dlg.close());
  CK.dlg.addEventListener('close', () => {
    // 行へ移動したとき以外は、開いたボタンに戻る
    if (!els.rows.contains(document.activeElement) && checkOpener && checkOpener.focus) checkOpener.focus();
  });
  $('btn-checklist').addEventListener('click', ev => openCheckList(ev.currentTarget));

  // ---------- 書き出す前の確認（校正されていない箇所が残っているとき） ----------
  const CF = { dlg: $('confirm-dlg'), count: $('confirm-count') };
  function confirmBeforeExport(opener) {
    const n = state.rows.filter(needsCheck).length;
    if (!n) return Promise.resolve('go');
    CF.count.textContent = `${n}件`;
    return new Promise(resolve => {
      let done = false;
      const finish = v => {
        if (done) return; done = true;
        CF.dlg.removeEventListener('keydown', onKey, true);
        CF.dlg.removeEventListener('cancel', onCancel);
        CF.dlg.close();
        resolve(v);
      };
      const onKey = ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); finish('go'); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish('back'); }
        else if (ev.key === ' ' || ev.code === 'Space') { ev.preventDefault(); ev.stopPropagation(); finish('list'); }
      };
      const onCancel = ev => { ev.preventDefault(); finish('back'); };
      CF.dlg.addEventListener('keydown', onKey, true);
      CF.dlg.addEventListener('cancel', onCancel);
      $('confirm-go').onclick = () => finish('go');
      $('confirm-back').onclick = () => finish('back');
      $('confirm-list').onclick = () => finish('list');
      CF.dlg.showModal();
      // ダイアログ自体にフォーカスを置いて、見出しと説明文から読み上げさせる
      CF.dlg.tabIndex = -1;
      CF.dlg.focus();
    }).then(v => {
      if (v === 'back') { if (opener && opener.focus) opener.focus(); announce('書き出しをやめて戻りました'); }
      if (v === 'list') openCheckList(opener);
      return v;
    });
  }

  // ---------- 点図が含まれるときの確認と、まとめての書き出し ----------
  const figureRows = () => state.rows.filter(r => r.type === 'figure' && (r.blob || r.tactile || (r.figure && r.figure.length)));
  const FG = { dlg: $('fig-dlg'), count: $('fig-count'), format: $('fig-format') };
  try { const v = localStorage.getItem('tenji-editor-figformat'); if (v) FG.format.value = v; } catch (e) { /* 既定のまま */ }
  FG.format.addEventListener('change', () => { try { localStorage.setItem('tenji-editor-figformat', FG.format.value); } catch (e) { /* 何もしない */ } });
  function askFigures(opener) {
    const figs = figureRows();
    if (!figs.length) return Promise.resolve('body');
    const photos = figs.filter(r => r.figKind === 'photo').length;
    FG.count.textContent = `${figs.length}点` + (photos ? `（写真${photos}点・図${figs.length - photos}点）` : '');
    return new Promise(resolve => {
      let done = false;
      const finish = v => {
        if (done) return; done = true;
        FG.dlg.removeEventListener('keydown', onKey, true);
        FG.dlg.removeEventListener('cancel', onCancel);
        FG.dlg.close();
        resolve(v);
      };
      const onKey = ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); finish('with'); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish('back'); }
        else if ((ev.key === ' ' || ev.code === 'Space') && ev.target.tagName !== 'SELECT') { ev.preventDefault(); ev.stopPropagation(); finish('body'); }
      };
      const onCancel = ev => { ev.preventDefault(); finish('back'); };
      FG.dlg.addEventListener('keydown', onKey, true);
      FG.dlg.addEventListener('cancel', onCancel);
      $('fig-go').onclick = () => finish('with');
      $('fig-body').onclick = () => finish('body');
      $('fig-back').onclick = () => finish('back');
      FG.dlg.showModal();
      FG.dlg.tabIndex = -1;
      FG.dlg.focus();
    }).then(v => {
      if (v === 'back') { if (opener && opener.focus) opener.focus(); announce('書き出しをやめて戻りました'); }
      return v;
    });
  }
  // 点図のファイルを作る → [{ name, data }]
  async function buildTactileFiles(figs, kind) {
    const base = state.fileBase;
    const files = [];
    const opt0 = tactileOpt();
    const layouts = [];
    for (const r of figs) {
      const opt = { ...opt0, titleCells: E.kanaToBraille(`ズ${r.figNo || ''}`).cells };
      if (kind === 'pdf-solid') opt.style = 'solid';
      if (kind === 'pdf-dots') opt.style = 'dots';
      if (kind === 'edl') { opt.edel = true; opt.style = 'dots'; }
      layouts.push({ r, lay: await window.TenjiFigure.layoutTactile(tactileSrc(r), opt) });
    }
    if (kind === 'pdf-dots' || kind === 'pdf-solid') {
      files.push({ name: `${base}_${kind === 'pdf-solid' ? '立体コピー' : '点図'}.pdf`, data: window.TenjiFigure.toPDF(layouts.map(x => x.lay)) });
    } else {
      for (const { r, lay } of layouts) {
        const n = r.figNo || (r.alt || '').replace(/\D/g, '');
        if (kind === 'edl') files.push({ name: `${base}_図${n}.edl`, data: F.toEDL(lay.dots) });
        else files.push({ name: `${base}_図${n}.svg`, data: new TextEncoder().encode(window.TenjiFigure.toSVG(lay)) });
      }
    }
    // どの図が何か、の一覧（墨字）
    const pdfPage = kind.startsWith('pdf');
    const list = ['点図の一覧', '', ...layouts.map(({ r }, i) =>
      `図${r.figNo || i + 1}：${r.figKind === 'photo' ? '写真' : '図'}${r.srcAlt ? '（' + r.srcAlt + '）' : ''}` +
      (pdfPage ? `　点図PDFの${i + 1}ページ目` : '') + `　本文では「${displayKana(r.kana || '')}」`)];
    files.push({ name: `${base}_点図の一覧.txt`, data: F.textFile(list.join('\n')) });
    return files;
  }

  async function doExport(fmt, opener) {
    closeMenu();
    opener = opener || els.exportBtn;
    if ((await confirmBeforeExport(opener)) !== 'go') return;
    if (!state.rows.some(r => r.cells || r.figure || E.DECOR_TYPES.has(r.type))) { toast('書き出す内容がありません。', true); return; }
    // 点字の形式で書き出すとき、点図があれば一緒に出すか聞く
    let withFigures = false;
    if (fmt.group === '点字') {
      const ans = await askFigures(opener);
      if (ans === 'back') return;
      withFigures = ans === 'with';
    }
    try {
      const rows = state.rows.map(r => ({ ...r, kana: r.kana ? displayKana(r.kana) : r.kana }));
      const data = await F.exportFile(fmt.id, rows, layoutOpt());
      const suffix = fmt.id.startsWith('txt-') || fmt.id.startsWith('docx-') ? '_' + fmt.id.split('-')[1] : '';
      const name = `${state.fileBase}${suffix}.${fmt.ext}`;
      if (!withFigures) {
        if (await saveFile(name, data)) toast(`${name} を保存しました`);
        return;
      }
      toast('点図を作っています…');
      const files = [{ name, data }, ...await buildTactileFiles(figureRows(), FG.format.value)];
      const zip = new window.JSZip();
      for (const f of files) zip.file(f.name, f.data);
      const zipName = `${state.fileBase}_点字と点図.zip`;
      const zdata = await zip.generateAsync({ type: 'uint8array' });
      if (await saveFile(zipName, zdata)) toast(`${zipName} を保存しました（本文と点図 ${files.length}ファイル）`);
    } catch (e) {
      toast(e.message || '書き出しに失敗しました。', true);
    }
  }

  // ---------- 書き出しメニュー ----------
  function buildMenu() {
    els.exportPop.textContent = '';
    // スマホで下から出したときに閉じるボタン
    const closeRow = document.createElement('div');
    closeRow.className = 'menu-close-row';
    const ttl = document.createElement('strong'); ttl.textContent = '書き出す形式を選ぶ';
    const cb = document.createElement('button');
    cb.type = 'button'; cb.className = 'btn small-btn'; cb.textContent = '閉じる';
    cb.addEventListener('click', () => closeMenu(true));
    closeRow.append(ttl, cb);
    els.exportPop.appendChild(closeRow);
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
      b.setAttribute('aria-describedby', 'exp-' + fmt.id);
      b.innerHTML = `<span class="label"></span><span class="ext"></span><span class="desc"></span>`;
      b.querySelector('.label').textContent = fmt.label;
      b.querySelector('.ext').textContent = '.' + fmt.ext;
      b.querySelector('.desc').textContent = fmt.note;
      b.querySelector('.desc').id = 'exp-' + fmt.id;
      b.querySelector('.ext').setAttribute('aria-hidden', 'true');
      b.addEventListener('click', () => doExport(fmt, els.exportBtn));
      els.exportPop.appendChild(b);
    }
  }
  function closeMenu(returnFocus) {
    const wasOpen = !els.exportPop.hidden;
    els.exportPop.hidden = true; els.exportBtn.setAttribute('aria-expanded', 'false');
    if (wasOpen && returnFocus) els.exportBtn.focus();
  }
  els.exportPop.addEventListener('keydown', ev => {
    const items = [...els.exportPop.querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); closeMenu(true); }
  });
  els.exportBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    const open = els.exportPop.hidden;
    els.exportPop.hidden = !open;
    els.exportBtn.setAttribute('aria-expanded', String(open));
    if (open) { const first = els.exportPop.querySelector('.menu-item'); if (first) first.focus(); }
  });
  document.addEventListener('click', ev => { if (!$('export-menu').contains(ev.target)) closeMenu(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !els.exportPop.hidden) closeMenu(true);
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'o') { ev.preventDefault(); $('file-input').click(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); if (!document.querySelector('dialog[open]')) doExport(F.EXPORTS[0], document.activeElement); }
    if (ev.key === 'F7') { ev.preventDefault(); if (!document.querySelector('dialog[open]')) openCheckList(document.activeElement); }
    if (ev.key === 'F8' && !document.querySelector('dialog[open]')) { ev.preventDefault(); goToCheck(ev.shiftKey ? -1 : 1); }
  });

  // ---------- 点図ファイル（マス目に縛られない点図） ----------
  const T = {
    dlg: $('tactile-dlg'), canvas: $('t-preview'), paper: $('t-paper'), landscape: $('t-landscape'),
    pitch: $('t-pitch'), size: $('t-size'), title: $('t-title'), info: $('t-info'), styleDots: $('t-style-dots'), styleSolid: $('t-style-solid'),
    adjust: $('t-adjust'), mode: $('t-mode'), denoise: $('t-denoise'), colors: $('t-colors'), cueColor: $('t-cue-color'), cueSil: $('t-cue-sil'), cueInk: $('t-cue-ink'), cueEdges: $('t-cue-edges'), palette: $('t-palette'), paletteList: $('t-palette-list'), cues: $('t-cues'), contrast: $('t-contrast'), level: $('t-level'), edge: $('t-edge'),
    line: $('t-line'), fill: $('t-fill'), invert: $('t-invert'), width: $('t-width'), reset: $('t-reset'), inline: $('t-inline'),
    targetFile: $('t-target-file'), targetCells: $('t-target-cells'), brush: $('t-brush'), undo: $('t-undo'), clearEdits: $('t-clear-edits')
  };
  const TF = window.TenjiFigure;
  let tactileRow = null, tactileTimer = null;
  for (const [k, v] of Object.entries(TF ? TF.PAPERS : {})) {
    const o = document.createElement('option'); o.value = k; o.textContent = v.label; T.paper.appendChild(o);
  }
  for (const [k, v] of Object.entries(TF ? TF.DOT_SIZES : {})) {
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
  // 図ごとの調整・手直しは、行と読み込んだ図の両方に覚えておく（変換し直しても消えない）
  const figOf = row => (row && row.alt && state.figures) ? state.figures.get(row.alt) : null;
  const procFor = row => TF.procOf(row.proc || (row.figKind === 'photo' ? { denoise: 2 } : {}));
  const editsOf = (row, target) => (row.dotEdits && row.dotEdits[target]) || [];
  function setFigData(row, key, val) {
    row[key] = val;
    const f = figOf(row);
    if (f) f[key] = val;
  }
  const tactileSrc = row => {
    const edits = editsOf(row, 'file');
    if (row.tactile) return { dots: row.tactile, edits };
    if (row.blob) return { blob: row.blob, proc: procFor(row), kind: row.figKind, edits };
    return { cells: (row.figure || []).map(l => l.replace(/^⠀⠀/, '')), edits };
  };
  // 本文に描く点図の格子（調整と手直しを当てはめたもの）
  async function figureGrid(row) {
    const opt = layoutOpt();
    let g = null;
    if (row.blob) g = await TF.imageToGrid(row.blob, { maxCols: opt.cols - 4, maxLines: opt.lines - 3, proc: procFor(row), kind: row.figKind });
    else {
      const f = figOf(row);
      const base = row.baseFigure || (f && f.baseLines) || row.figure;
      if (!base || !base.length) return null;
      if (!row.baseFigure) setFigData(row, 'baseFigure', base.slice());
      if (f && !f.baseLines) f.baseLines = base.slice();
      g = TF.cellsToGrid(base.map(l => l.replace(/^⠀⠀/, '')));
    }
    return TF.applyGridEdits(g, editsOf(row, 'cells'));
  }
  async function updateRowFigure(row) {
    const g = await figureGrid(row);
    if (!g) return;
    const lines = TF.dotsToCells(g.bits, g.w, g.h).map(l => '⠀⠀' + l);
    setFigData(row, 'figure', lines);
    const f = figOf(row);
    if (f) f.lines = lines;
  }
  // 本文の点図（マス）を、手直し用に用紙の上の点として表す（1目盛り 2.5mm の仮の用紙）
  const GP = 2.5;
  function gridLayout(g) {
    const dots = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.bits[y * g.w + x]) dots.push({ x: GP + x * GP, y: GP + y * GP, d: GP * 0.55 });
    return { pageW: g.w * GP + 2 * GP, pageH: g.h * GP + 2 * GP, dots, rects: [], grid: { ox: GP, oy: GP, p: GP, cols: g.w, rows: g.h },
      box: { x0: GP / 2, y0: GP / 2, w: g.w * GP, h: g.h * GP } };
  }

  // ---------- 調整のつまみ ----------
  const DENOISE = ['なし', '弱', '中', '強'];
  function showProc(P) {
    const opt = layoutOpt();
    T.mode.value = P.mode; T.denoise.value = P.denoise; T.colors.value = P.colors;
    const cu = { color: true, silhouette: true, ink: true, edges: false, ...(P.cues || {}) };
    T.cueColor.checked = cu.color; T.cueSil.checked = cu.silhouette; T.cueInk.checked = cu.ink; T.cueEdges.checked = cu.edges;
    colorModes = (P.colorModes || []).slice(); T.contrast.value = P.contrast; T.level.value = P.level; T.edge.value = P.edge;
    T.line.value = String(P.line); T.fill.value = P.fill; T.invert.checked = !!P.invert;
    T.width.max = String(opt.cols - 4);
    T.width.value = String(P.width > 0 ? Math.min(P.width, opt.cols - 4) : opt.cols - 4);
    outputs();
  }
  function outputs() {
    const set = (id, t) => { const o = $(id); o.textContent = t; };
    set('t-denoise-v', DENOISE[+T.denoise.value]);
    set('t-contrast-v', (+T.contrast.value > 0 ? '＋' : '') + T.contrast.value);
    set('t-level-v', (+T.level.value > 0 ? '＋' : '') + T.level.value);
    set('t-edge-v', T.edge.value);
    set('t-colors-v', T.colors.value + '色');
    set('t-width-v', T.width.value + 'マス');
    set('t-pitch-v', (+T.pitch.value).toFixed(1) + 'mm');
    T.edge.disabled = !['edges'].includes(T.mode.value);
    T.fill.disabled = !['fill', 'both', 'auto'].includes(T.mode.value);
    T.colors.disabled = !['regions', 'auto'].includes(T.mode.value);
    T.cues.disabled = !['regions', 'auto'].includes(T.mode.value);
    T.level.disabled = T.mode.value === 'regions';
    [T.denoise, T.contrast, T.level, T.edge, T.colors, T.width, T.pitch].forEach(r => r.setAttribute('aria-valuetext', $(r.id + '-v').textContent));
  }
  let colorModes = []; // 色ごとの扱い（色の一覧で選んだもの）
  const readProc = () => {
    const opt = layoutOpt();
    return { mode: T.mode.value, denoise: +T.denoise.value, colors: +T.colors.value, contrast: +T.contrast.value, level: +T.level.value, edge: +T.edge.value,
      line: +T.line.value, fill: T.fill.value, invert: T.invert.checked, width: +T.width.value >= opt.cols - 4 ? 0 : +T.width.value,
      cues: { color: T.cueColor.checked, silhouette: T.cueSil.checked, ink: T.cueInk.checked, edges: T.cueEdges.checked }, colorModes: colorModes.slice() };
  };

  // ---------- 表示と手直し ----------
  const ed = { tool: 'toggle', undo: [], drawing: false, last: null, cursor: null, changed: false, view: null };
  const curTarget = () => (T.targetCells.checked ? 'cells' : 'file');
  function drawView() {
    const v = ed.view;
    if (!v) return;
    if (v.target === 'cells') v.lay = gridLayout(v.grid); // 格子を直したら点の並びも作り直す
    const cur = ed.cursor && v.lay.grid ? { x: v.lay.grid.ox + ed.cursor.x * v.lay.grid.p, y: v.lay.grid.oy + ed.cursor.y * v.lay.grid.p } : null;
    v.scale = TF.drawPreview(T.canvas, v.lay, { ghost: true, cellLines: v.target === 'cells', cursor: document.activeElement === T.canvas ? cur : null });
  }
  function infoText() {
    const v = ed.view, row = tactileRow;
    if (!v || !row) return '';
    const nEd = editsOf(row, v.target).length;
    const edTxt = nEd ? `・手直し ${nEd}か所` : '';
    if (v.target === 'cells') {
      const lines = TF.dotsToCells(v.grid.bits, v.grid.w, v.grid.h);
      return `本文の点図：${Math.max(0, ...lines.map(l => Array.from(l).length))}マス×${lines.length}行・点 ${v.lay.dots.length.toLocaleString()} 個${edTxt}` +
        (row.noFigure ? '（いまは本文に描かない設定です）' : '');
    }
    const opt = tactileOpt();
    if (v.lay.rects.length) return '立体コピー（カプセルペーパー）用：黒い部分が浮き上がります。手直しは「点図プリンタ用」で使えます。';
    return `点図プリンタ用：点 ${v.lay.dots.length.toLocaleString()} 個・間隔 ${opt.pitch.toFixed(1)}mm${edTxt}` +
      (v.lay.dots.length > 2000 ? '（2,000点を超えるので、ソフトによっては読み込めないことがあります）' : '');
  }
  // 見つけた色の一覧：色ごとに「線だけ／塗る／省く」を選ぶ
  const COLOR_MODES = [['line', '線だけ（境目）'], ['fill-sparse', 'まばらに塗る'], ['fill-half', '半分塗る（市松）'], ['fill-all', '全部塗る'], ['omit', '省く（線も描かない）']];
  function renderPalette() {
    const row = tactileRow;
    const pal = row && row.blob ? TF.lastPalette(row.blob) : null;
    T.palette.hidden = !pal || !pal.length;
    if (!pal) return;
    const sig = pal.map(p => p.name + (p.background ? 'b' : '')).join('|');
    if (T.paletteList.dataset.sig === sig) return; // 変わっていなければ作り直さない（選んでいる途中のフォーカスを保つ）
    T.paletteList.dataset.sig = sig;
    T.paletteList.textContent = '';
    pal.forEach((p, i) => {
      const line = document.createElement('div');
      line.className = 't-pal-row';
      const sw = document.createElement('span');
      sw.className = 't-swatch';
      sw.setAttribute('aria-hidden', 'true');
      sw.style.background = `rgb(${p.rgb.map(v => Math.round(v)).join(',')})`;
      const id = 't-pal-' + i;
      const lab = document.createElement('label');
      lab.htmlFor = id;
      lab.textContent = `色${i + 1}　${p.name}（${Math.max(1, Math.round(p.share * 100))}%）${p.background ? '・背景' : ''}`;
      const sel = document.createElement('select');
      sel.id = id;
      for (const [v, t] of COLOR_MODES) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
      sel.value = p.mode || 'line';
      if (p.background) { sel.disabled = true; sel.title = '背景の色は描きません'; }
      sel.addEventListener('change', () => {
        colorModes = colorModes.filter(m => (m.lab[0] - p.lab[0]) ** 2 + (m.lab[1] - p.lab[1]) ** 2 + (m.lab[2] - p.lab[2]) ** 2 > 100);
        if (sel.value !== 'line') colorModes.push({ lab: p.lab.slice(), mode: sel.value });
        later(procChanged, 50);
        announce(`${p.name}：${sel.options[sel.selectedIndex].text}`);
      });
      line.append(sw, lab, sel);
      T.paletteList.appendChild(line);
    });
  }
  async function refreshTactile() {
    if (!tactileRow) return;
    const row = tactileRow, opt = tactileOpt();
    T.pitch.disabled = opt.style === 'solid' && !!row.blob;
    const target = curTarget();
    try {
      if (target === 'cells') {
        const g = await figureGrid(row);
        if (!g) { T.info.textContent = 'この図には、本文に描く点図がありません。'; return; }
        ed.view = { target, grid: g, lay: gridLayout(g) };
      } else {
        ed.view = { target, lay: await TF.layoutTactile(tactileSrc(row), opt) };
      }
      drawView();
      renderPalette();
      T.info.textContent = infoText();
      T.canvas.setAttribute('aria-label', (target === 'cells' ? '本文の点図（マス）の手直し。' : '点図ファイルの手直し。') + T.info.textContent +
        '。矢印で移動、スペースで点を打つ・消す');
      T.undo.disabled = !ed.undo.length;
      T.clearEdits.disabled = !editsOf(row, 'file').length && !editsOf(row, 'cells').length;
    } catch (e) { T.info.textContent = '図を作れませんでした：' + (e.message || e); }
  }
  const later = (fn, ms) => { clearTimeout(tactileTimer); tactileTimer = setTimeout(fn, ms || 200); };

  let tactileOpener = null;
  function openTactile(row) {
    tactileRow = row;
    tactileOpener = document.activeElement;
    ed.undo = []; ed.changed = false; ed.cursor = null;
    // エーデルなどの点図はもとから見出しを含むので、見出しは空にしておく
    T.title.value = row.tactile ? '' : (row.alt ? 'ズ' + row.alt.replace(/^図/, '').replace(/\.[^.]+$/, '') : 'ズ');
    T.adjust.hidden = !row.blob;
    showProc(procFor(row));
    T.inline.checked = !row.noFigure;
    T.inline.parentElement.hidden = !(row.blob || (row.figure && row.figure.length));
    T.targetCells.disabled = !(row.blob || (row.figure && row.figure.length));
    if (T.targetCells.disabled) T.targetFile.checked = true;
    else if (!row.noFigure && !row.tactile) T.targetCells.checked = true; else T.targetFile.checked = true; // エーデルなどの点図は、点図ファイルを直す
    if (T.dlg.showModal) T.dlg.showModal(); else T.dlg.hidden = false;
    $('t-head').focus(); // 見出しから読み始める（スマホでは図が上に見える）
    refreshTactile();
  }
  // 調整を変えたら、点図ファイルと本文の点図の両方を作り直す
  async function procChanged() {
    if (!tactileRow) return;
    setFigData(tactileRow, 'proc', readProc());
    ed.changed = true;
    await updateRowFigure(tactileRow);
    await refreshTactile();
  }
  [T.mode, T.denoise, T.colors, T.cueColor, T.cueSil, T.cueInk, T.cueEdges, T.contrast, T.level, T.edge, T.line, T.fill, T.invert, T.width].forEach(el =>
    el.addEventListener('input', () => { outputs(); later(procChanged); }));
  T.reset.addEventListener('click', () => { colorModes = []; showProc(TF.procOf(tactileRow && tactileRow.figKind === 'photo' ? { denoise: 2 } : {})); later(procChanged, 0); announce('調整を元に戻しました'); });
  T.inline.addEventListener('change', () => { if (!tactileRow) return; tactileRow.noFigure = !T.inline.checked; ed.changed = true; refreshTactile(); });
  [T.paper, T.landscape, T.pitch, T.size, T.title, T.styleDots, T.styleSolid].forEach(el =>
    el.addEventListener('input', () => { outputs(); later(refreshTactile); }));
  [T.targetFile, T.targetCells].forEach(el => el.addEventListener('change', () => { ed.cursor = null; refreshTactile(); }));
  document.querySelectorAll('input[name="t-tool"]').forEach(el => el.addEventListener('change', () => { ed.tool = el.value; }));

  // 画面の位置（CSSピクセル）→ 格子の位置
  function gridAt(clientX, clientY) {
    const v = ed.view;
    if (!v || !v.scale || !v.lay.grid) return null;
    const r = T.canvas.getBoundingClientRect();
    const x = (clientX - r.left) / v.scale, y = (clientY - r.top) / v.scale;
    const g = v.lay.grid;
    return { x: Math.round((x - g.ox) / g.p), y: Math.round((y - g.oy) / g.p) };
  }
  const gridCols = () => { const g = ed.view.lay.grid, b = ed.view.lay.box; return g.cols || Math.max(1, Math.round(b.w / g.p) + 1); };
  const gridRows = () => { const g = ed.view.lay.grid, b = ed.view.lay.box; return g.rows || Math.max(1, Math.round(b.h / g.p) + 1); };
  function hasDot(gx, gy) {
    const v = ed.view;
    if (v.target === 'cells') return !!v.grid.bits[gy * v.grid.w + gx];
    const g = v.lay.grid, x = g.ox + gx * g.p, y = g.oy + gy * g.p;
    return v.lay.dots.some(d => Math.abs(d.x - x) < g.p * 0.5 && Math.abs(d.y - y) < g.p * 0.5);
  }
  // 1つの格子の位置に点を打つ・消す（手直しの記録にも足す）
  function putDot(gx, gy, on) {
    const v = ed.view, row = tactileRow;
    if (gx < 0 || gy < 0 || gx >= gridCols() || gy >= gridRows()) return;
    const g = v.lay.grid, b = v.lay.box;
    let op;
    if (v.target === 'cells') {
      const i = gy * v.grid.w + gx;
      if (v.grid.bits[i] === !!on) return;
      v.grid.bits[i] = !!on;
      op = [(gx + 0.5) / v.grid.w, (gy + 0.5) / v.grid.h, on ? 1 : 0];
    } else {
      const x = g.ox + gx * g.p, y = g.oy + gy * g.p;
      op = [(x - b.x0) / b.w, (y - b.y0) / b.h, on ? 1 : 0];
      TF.applyDotEdits(v.lay, [op]);
    }
    const all = (row.dotEdits && row.dotEdits[v.target]) ? row.dotEdits[v.target] : [];
    all.push(op);
    setFigData(row, 'dotEdits', { ...(row.dotEdits || {}), [v.target]: all });
  }
  function brushAt(gx, gy, on) {
    const r = +T.brush.value;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) putDot(gx + dx, gy + dy, on);
  }
  function pushUndo() {
    const row = tactileRow;
    ed.undo.push(JSON.stringify(row.dotEdits || {}));
    if (ed.undo.length > 100) ed.undo.shift();
    T.undo.disabled = false;
  }
  async function strokeDone() {
    if (ed.view && ed.view.target === 'cells') {
      const g = ed.view.grid;
      const lines = TF.dotsToCells(g.bits, g.w, g.h).map(l => '⠀⠀' + l);
      setFigData(tactileRow, 'figure', lines);
      const f = figOf(tactileRow);
      if (f) f.lines = lines;
    }
    ed.changed = true;
    T.info.textContent = infoText();
    T.clearEdits.disabled = false;
  }
  if (T.canvas) {
    T.canvas.style.touchAction = 'none'; // 指でなぞっても画面がスクロールしないように
    T.canvas.addEventListener('pointerdown', ev => {
      if (!ed.view || ed.view.lay.rects.length) return;
      const p = gridAt(ev.clientX, ev.clientY);
      if (!p) return;
      ev.preventDefault();
      T.canvas.setPointerCapture(ev.pointerId);
      pushUndo();
      const on = ed.tool === 'pen' ? true : ed.tool === 'erase' ? false : !hasDot(p.x, p.y);
      ed.drawing = { on, last: p };
      brushAt(p.x, p.y, on);
      drawView();
      if (ed.tool === 'toggle') { ed.drawing = false; strokeDone(); }
    });
    T.canvas.addEventListener('pointermove', ev => {
      if (!ed.drawing) return;
      const p = gridAt(ev.clientX, ev.clientY);
      if (!p) return;
      // 速くなぞっても点が途切れないよう、前の位置からの間を埋める
      const l = ed.drawing.last, n = Math.max(Math.abs(p.x - l.x), Math.abs(p.y - l.y));
      for (let i = 1; i <= n; i++) brushAt(Math.round(l.x + (p.x - l.x) * i / n), Math.round(l.y + (p.y - l.y) * i / n), ed.drawing.on);
      ed.drawing.last = p;
      drawView();
    });
    const end = () => { if (ed.drawing) { ed.drawing = false; strokeDone(); } };
    T.canvas.addEventListener('pointerup', end);
    T.canvas.addEventListener('pointercancel', end);
    // キーボード：矢印で移動、スペース・Enterで点を打つ・消す
    const sayCursor = () => {
      const c = ed.cursor, has = hasDot(c.x, c.y);
      let where = `横${c.x + 1}、縦${c.y + 1}`;
      if (ed.view.target === 'cells') {
        const dot = [[1, 4], [2, 5], [3, 6]][c.y % 3][c.x % 2];
        where = `${Math.floor(c.y / 3) + 1}行目 ${Math.floor(c.x / 2) + 1}マス目の${dot}の点`;
      }
      announce(`${where}、${has ? '点あり' : '点なし'}`);
    };
    T.canvas.addEventListener('focus', () => {
      if (!ed.view || !ed.view.lay.grid) return;
      if (!ed.cursor) ed.cursor = { x: 0, y: 0 };
      drawView();
    });
    T.canvas.addEventListener('blur', () => drawView());
    T.canvas.addEventListener('keydown', ev => {
      if (!ed.view || !ed.view.lay.grid || ed.view.lay.rects.length) return;
      const c = ed.cursor || (ed.cursor = { x: 0, y: 0 });
      const step = ev.shiftKey ? 5 : 1;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
      if (mv) {
        ev.preventDefault();
        c.x = Math.max(0, Math.min(gridCols() - 1, c.x + mv[0]));
        c.y = Math.max(0, Math.min(gridRows() - 1, c.y + mv[1]));
        // ペン・消しゴムのときは、動いた先にも打つ・消す
        if (ed.tool !== 'toggle' && ev.ctrlKey) { pushUndo(); brushAt(c.x, c.y, ed.tool === 'pen'); strokeDone(); }
        drawView(); sayCursor();
        return;
      }
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        pushUndo();
        const on = ed.tool === 'pen' ? true : ed.tool === 'erase' ? false : !hasDot(c.x, c.y);
        brushAt(c.x, c.y, on);
        drawView(); strokeDone();
        announce(on ? '点を打ちました' : '点を消しました');
      }
    });
  }
  async function undoEdit() {
    if (!ed.undo.length || !tactileRow) return;
    setFigData(tactileRow, 'dotEdits', JSON.parse(ed.undo.pop()));
    await updateRowFigure(tactileRow);
    ed.changed = true;
    await refreshTactile();
    announce('元に戻しました');
  }
  T.undo.addEventListener('click', undoEdit);
  T.dlg.addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && ev.target.tagName !== 'INPUT') { ev.preventDefault(); undoEdit(); } });
  T.clearEdits.addEventListener('click', async () => {
    if (!tactileRow) return;
    pushUndo();
    setFigData(tactileRow, 'dotEdits', {});
    await updateRowFigure(tactileRow);
    ed.changed = true;
    await refreshTactile();
    announce('手直しを全部消しました');
  });
  window.addEventListener('resize', () => { if (T.dlg.open) drawView(); });
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
  T.dlg.addEventListener('close', () => {
    const row = tactileRow;
    if (row && ed.changed) {
      row._tact = null; row._tactKey = null;
      const idx = state.rows.indexOf(row);
      render();
      updateSumiji(); updateStatus();
      const li = els.rows.querySelector(`.row[data-idx="${idx}"]`);
      const btn = li && li.querySelector('.fig-edit-btn');
      if (btn) { btn.focus(); return; }
    }
    if (tactileOpener && tactileOpener.isConnected && tactileOpener.focus) tactileOpener.focus();
  });

  // ---------- 6点入力（F D S J K L ＝ 1 2 3 4 5 6 の点） ----------
  function insertAtCaret(ta, text) {
    const a = ta.selectionStart, z = ta.selectionEnd;
    ta.value = ta.value.slice(0, a) + text + ta.value.slice(z);
    ta.setSelectionRange(a + text.length, a + text.length);
    ta.dispatchEvent(new Event('input'));
  }
  const cellFor = bits => state.mode === 'braille-nabcc' ? E.cellsToAscii(E.bitsCell(bits), true) : E.bitsCell(bits);
  attachSixKey(els.raw, bits => { insertAtCaret(els.raw, cellFor(bits)); announce(speakCell(bits)); }, () => els.sixdot.checked);
  els.sixdot.addEventListener('change', () => {
    if (els.sixdot.checked) {
      els.raw.hidden = false; els.btnRaw.setAttribute('aria-expanded', 'true'); els.raw.focus();
      toast('6点入力：F D S J K L を同時に押して離すと1マス入ります（1の点＝F … 6の点＝L、スペースでマスあけ）');
    }
  });

  // ---------- イベント ----------
  $('btn-open').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', ev => {
    const fs = ev.target.files ? [...ev.target.files] : [];
    if (fs.length) openFiles(fs);
    ev.target.value = '';
  });
  $('btn-new').addEventListener('click', () => {
    closeDocs(true);
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
  $('btn-save-txt').addEventListener('click', async ev => {
    if ((await confirmBeforeExport(ev.currentTarget)) !== 'go') return;
    const text = els.sumiji.value;
    if (!text.trim()) { toast('保存する内容がありません。', true); return; }
    const name = `${state.fileBase}_墨字.txt`;
    if (await saveFile(name, F.textFile(text))) toast(`${name} を保存しました`);
  });
  $('btn-save-docx').addEventListener('click', async ev => {
    if ((await confirmBeforeExport(ev.currentTarget)) !== 'go') return;
    const text = els.sumiji.value;
    if (!text.trim()) { toast('保存する内容がありません。', true); return; }
    try {
      const name = `${state.fileBase}_墨字.docx`;
      if (await saveFile(name, await F.docxFromText(text))) toast(`${name} を保存しました`);
    } catch (e) { toast(e.message || '保存に失敗しました。', true); }
  });
  [els.cols, els.lines, els.indent, els.hira, els.pagenum, els.genpon, els.framefit, els.srmode].forEach(el => el.addEventListener('change', () => { savePrefs(); render(); }));

  // ドラッグ＆ドロップ
  let dragDepth = 0;
  window.addEventListener('dragenter', ev => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) { dragDepth++; els.dropHint.hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) els.dropHint.hidden = true; });
  window.addEventListener('dragover', ev => ev.preventDefault());
  window.addEventListener('drop', ev => {
    ev.preventDefault(); dragDepth = 0; els.dropHint.hidden = true;
    const fs = ev.dataTransfer && ev.dataTransfer.files ? [...ev.dataTransfer.files] : [];
    if (fs.length) openFiles(fs);
  });

  // ---------- 自動誘導（案内） ----------
  // 開くと最初に「自動誘導を使うか」を聞き、使うときは1画面ずつ案内して、点字ファイルを作るところまで進める。
  // キー：1つめの選択肢は Enter、2つめは Space（最初の画面だけ1回で決定、そのあとは1回で選択・2回で決定）。Esc で途中までをエディタに入れて終わる
  const G = { el: $('guide'), box: $('guide-box'), preview: $('guide-preview'), msg: $('guide-msg'), sub: $('guide-sub'), step: $('guide-step'), btns: $('guide-btns'), memo: $('guide-memo'),
    field: $('guide-field'), input: $('guide-input'), inputLabel: $('guide-input-label'), opts: $('guide-opts'), file: $('guide-file'), esc: $('guide-esc') };
  const hasKeys = !window.matchMedia || matchMedia('(hover: hover) and (pointer: fine)').matches; // キーボードのあるパソコンか
  if (!hasKeys) document.documentElement.classList.add('no-keys');
  const guide = { on: false, screen: null, sel: -1, timer: null, shiftEnter: 0, armed: false, items: [], k: 0, picking: false, listArmed: -1 };
  const KEY_NAME = { Enter: 'エンター', Space: 'スペース' };
  const appParts = () => [...document.body.children].filter(el => el !== G.el && el.tagName !== 'SCRIPT' && !/^sr-/.test(el.id));
  // ボタンの操作の案内（読み上げソフト用）。スマホは「ダブルタップで決定」、パソコンの一覧は「エンター2回で決定」
  const hintEl = (id, text) => { const e = document.createElement('span'); e.id = id; e.className = 'sr-only'; e.textContent = text; G.el.appendChild(e); return id; };
  const HINT_TAP = hintEl('gh-tap', 'ダブルタップで決定します');
  const HINT_LIST = hintEl('gh-list', 'エンター2回で決定します');
  const HINT_PRESS = hintEl('gh-press', 'エンターで決定します');
  const tapHint = b => b.setAttribute('aria-describedby', hasKeys ? HINT_PRESS : HINT_TAP);
  // 案内の画面でも使える「終わる」ボタン（スマホなど Esc のない端末用）
  const quitBtn = document.createElement('button');
  quitBtn.type = 'button'; quitBtn.className = 'btn small-btn guide-quit'; quitBtn.textContent = '案内を終わってエディタへ';
  quitBtn.addEventListener('click', () => finishGuide('esc'));
  tapHint(quitBtn);
  // 1つ前に戻る（ファイルか文章かを選ぶ画面より後の、すべての画面。パソコンは Alt＋← でも戻る）
  const backBtn = document.createElement('button');
  backBtn.type = 'button'; backBtn.className = 'btn guide-back';
  backBtn.innerHTML = '<span aria-hidden="true">← </span>1つ前に戻る<span class="key pc-only">（Alt＋←）</span>';
  backBtn.addEventListener('click', () => guideBack());
  tapHint(backBtn);
  G.esc.before(backBtn);
  // 案内だけの画面を飛ばす：1.5秒のうちに2回（キーか、画面のタップ）
  function guideSkipTap() {
    const sc = guide.screen;
    if (!sc || !sc.auto) return;
    const now = Date.now();
    if (guide.skipAt && now - guide.skipAt < 1500) { guide.skipAt = 0; clearTimeout(guide.timer); announce('次へ進みます'); sc.next(); }
    else guide.skipAt = now;
  }
  G.el.addEventListener('click', ev => { if (guide.screen && guide.screen.auto && !ev.target.closest('button')) guideSkipTap(); });
  function guideBack() {
    const sc = guide.screen;
    if (!sc || !sc.back) return;
    if (G.input === document.activeElement) G.input.blur();
    announce('1つ前に戻ります');
    sc.back();
  }
  G.esc.after(quitBtn);

  function guideShow(sc) {
    clearTimeout(guide.timer);
    clearTimeout(guide.pvTimer);
    if (guide.screen && guide.screen.preview && !sc.preview) ttsStop(); // プレビューを抜けたら声も止める
    G.preview.hidden = !sc.preview;
    guide.screen = sc; guide.sel = -1; guide.shiftEnter = 0; guide.armed = false; guide.skipAt = 0;
    if (sc.auto) sc.sub = [sc.sub, hasKeys ? 'エンターを2回押すと、待たずに次へ進みます。' : '画面を2回タップすると、待たずに次へ進みます。'].filter(Boolean).join('\n');
    G.step.textContent = sc.step || '';
    G.msg.textContent = sc.msg;
    G.msg.classList.toggle('guide-busy', !!sc.busy);
    G.sub.textContent = sc.sub || '';
    // 読み上げソフト用：見出しと説明をつなげて1行に（なぞったときに1回で読まれる）
    $('guide-say').textContent = [sc.msg, sc.sub].filter(Boolean).map(t => t.replace(/\n/g, ' ')).join(' ');
    G.memo.hidden = !sc.memo;
    G.field.hidden = !sc.input;
    G.btns.textContent = '';
    G.btns.classList.toggle('guide-list', !!sc.list);
    G.btns.setAttribute('role', 'group');
    // 一覧の名前に質問文を入れて、一覧に入ったときに質問から読まれるようにする
    G.btns.setAttribute('aria-label', sc.list ? [sc.msg, sc.sub].filter(Boolean).map(t => t.replace(/[。？?]$/, m => m === '。' ? '' : m)).join('。').replace(/([？?])。/g, '$1') : '選択肢');
    guide.listArmed = -1;
    // 一覧（形式など）：矢印で動いて、フォーカスのある項目でエンター2回で決定
    (sc.list || []).forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'guide-item';
      b.setAttribute('aria-describedby', hasKeys ? HINT_LIST : HINT_TAP); // 「選択されていません」とは読ませず、決定のしかたを案内する
      const t = document.createElement('span'); t.className = 'gi-label'; t.textContent = c.label;
      b.appendChild(t);
      if (c.note) { const n = document.createElement('span'); n.className = 'gi-note'; n.textContent = c.note; b.appendChild(n); }
      b.addEventListener('click', () => c.run()); // マウス・指は押したら決定
      b.addEventListener('focus', () => { guide.listArmed = -1; [...G.btns.children].forEach(x => x.classList.toggle('cur', x === b)); });
      G.btns.appendChild(b);
    });
    (sc.choices || []).forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.append(c.label);
      if (c.key) {
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = sc.single ? KEY_NAME[c.key] : `${KEY_NAME[c.key]}（1回で選択、2回で決定）`;
        b.appendChild(k);
      }
      // 切り替えボタンにはしない（「選択されていません」「設定を変更」と読まれるため）。スマホでは「ダブルタップで決定」と案内する
      if (!hasKeys || !c.key) tapHint(b);
      b.addEventListener('click', () => guideChoose(i)); // マウス・指は押したら決定
      G.btns.appendChild(b);
    });
    quitBtn.hidden = !!sc.first;
    backBtn.hidden = !sc.back;
    G.esc.hidden = !!sc.first;
    if (sc.input) {
      // キーの案内はパソコンのときだけ
      G.inputLabel.textContent = (sc.input.label || (hasKeys ? '読み方（かな。シフトを押しながら F D S J K L で6点入力もできます）' : '読み方（かな）'))
        .replace(hasKeys ? /$^/ : /。?6点入力もできます/, '');
      G.input.value = sc.input.value || '';
      G.input.setAttribute('aria-describedby', 'guide-msg' + (sc.sub ? ' guide-sub' : ''));
      G.opts.textContent = '';
      for (const o of sc.input.options || []) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = o;
        b.setAttribute('aria-label', `候補「${o}」を入れる`);
        b.setAttribute('aria-describedby', hasKeys ? HINT_PRESS : HINT_TAP);
        b.addEventListener('click', () => { G.input.value = o; G.input.focus(); guide.armed = false; guideEcho(); });
        G.opts.appendChild(b);
      }
      guideEcho();
      // スマホなどエンターを2回押しにくい端末のための決定ボタン
      const ok = document.createElement('button');
      ok.type = 'button'; ok.textContent = '決定';
      ok.addEventListener('click', () => sc.input.done(G.input.value));
      tapHint(ok);
      G.btns.appendChild(ok);
      // 入力欄に入ると、質問文（説明）から読まれる
      G.input.setAttribute('aria-describedby', 'guide-msg' + (sc.sub ? ' guide-sub' : ''));
      G.input.focus(); G.input.select();
    } else if (sc.list) {
      G.btns.firstChild.focus(); // 一覧の名前（質問文）と、最初の項目が読まれる
    } else if (sc.memo) {
      G.memo.setAttribute('aria-label', hasKeys ? '文章（Shift＋Enterを3回で点訳、Escでエディタへ）' : '文章');
      G.memo.removeAttribute('aria-describedby'); // 質問文は上の1行で読むので、ここでは繰り返さない
      G.memo.focus();
    } else {
      // 案内の枠の名前は「案内」のまま変えない（名前が変わると、読み上げソフトがその名前と知らせの両方を読んで2回になる）。
      // 画面の文は、知らせとして1回だけ渡す
      if (document.activeElement !== G.box) G.box.focus();
      announce([sc.msg, sc.sub].filter(Boolean).map(t => t.replace(/[。？?]$/, m => m === '。' ? '' : m)).join('。').replace(/([？?])。/g, '$1'));
    }
    if (sc.auto) guide.timer = setTimeout(sc.next, sc.auto);
  }
  function guideChoose(i) {
    const sc = guide.screen;
    const c = sc && sc.choices && sc.choices[i];
    if (c) c.run();
  }
  function guideSelect(i) {
    guide.sel = i;
    [...G.btns.children].forEach((b, k) => b.classList.toggle('selected', k === i)); // 見た目だけ（読み上げは announce で）
    const c = guide.screen.choices[i];
    // フォーカスは動かさず（読み上げが途切れないように）、選んだことだけを知らせる
    announce(`${c.label}を選びました。もう一度${KEY_NAME[c.key]}を押すと決定します`);
  }
  document.addEventListener('keydown', ev => {
    if (!guide.on || !guide.screen) return;
    const sc = guide.screen;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); if (!guide.finishing) finishGuide('esc'); return; }
    if (ev.altKey && ev.key === 'ArrowLeft') { ev.preventDefault(); ev.stopPropagation(); guideBack(); return; }
    // 案内だけの画面：エンターかスペースを続けて押すと、待たずに次へ
    if (sc.auto && (ev.key === 'Enter' || ev.key === ' ' || ev.code === 'Space')) {
      ev.preventDefault(); ev.stopPropagation();
      if (!ev.repeat) guideSkipTap();
      return;
    }
    if (ev.isComposing || ev.keyCode === 229) return; // 日本語入力の変換中
    if (sc.memo) {
      if (ev.key === 'Enter' && ev.shiftKey) {
        ev.preventDefault();
        guide.shiftEnter++;
        if (guide.shiftEnter >= 3) { guide.shiftEnter = 0; guideTranslate(G.memo.value); }
        else announce(`あと${3 - guide.shiftEnter}回で点訳します`);
      } else if (ev.key !== 'Shift') guide.shiftEnter = 0;
      return;
    }
    if (sc.preview) {
      // スペース2回：1回目を押したときに読んでいた語で止めて、そこを直す
      if (ev.key === ' ' || ev.code === 'Space') {
        ev.preventDefault(); ev.stopPropagation();
        if (ev.repeat) return;
        const now = Date.now();
        if (guide.pvArm && now - guide.pvArm.at < 3000) { const w = guide.pvArm.w; guide.pvArm = null; guidePreviewStop(w); }
        else guide.pvArm = { at: now, w: guide.pvPos };
      } else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); }
      return;
    }
    if (sc.list) {
      const items = [...G.btns.querySelectorAll('.guide-item')];
      const i = items.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const j = i < 0 ? 0 : (i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        items[j].focus();
        return;
      }
      if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); items[ev.key === 'Home' ? 0 : items.length - 1].focus(); return; }
      if (ev.key === 'Enter' || ev.key === ' ' || ev.code === 'Space') {
        ev.preventDefault(); ev.stopPropagation();
        if (ev.repeat) return;
        if (ev.key !== 'Enter') return;
        if (i < 0) { items[0].focus(); return; }
        if (guide.listArmed === i) { guide.listArmed = -1; sc.list[i].run(); }
        else { guide.listArmed = i; announce(`${sc.list[i].label}を選びました。もう一度エンターを押すと決定します`); }
      }
      return;
    }
    if (sc.input) {
      if (ev.target !== G.input) return;
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        if (ev.repeat) return;
        if (guide.armed) { guide.armed = false; sc.input.done(G.input.value); }
        else { guide.armed = true; announce('もう一度エンターを押すと決定します'); }
      } else if (ev.key !== 'Shift') guide.armed = false;
      return;
    }
    const i = ev.key === 'Enter' ? 0 : (ev.key === ' ' || ev.code === 'Space') ? 1 : -1;
    if (i < 0) return;
    ev.preventDefault(); ev.stopPropagation();
    if (ev.repeat || !sc.choices || !sc.choices[i] || sc.choices[i].key !== (i ? 'Space' : 'Enter')) return;
    if (sc.single || guide.sel === i) guideChoose(i);
    else guideSelect(i);
  }, true);
  // Space の keyup でボタンが押されないようにする（決定は自分で数える）
  document.addEventListener('keyup', ev => {
    if (guide.on && guide.screen && !guide.screen.memo && !guide.screen.input && (ev.key === ' ' || ev.code === 'Space')) ev.preventDefault();
  }, true);
  // 入力欄の6点入力：シフトを押しながら F D S J K L を同時に押して離すと1マス（シフトは先に離してもよい）
  {
    const held = new Set(); let chord = 0;
    G.input.addEventListener('keydown', ev => {
      if (!SIX_KEYS[ev.code] || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (!ev.shiftKey && !held.size) return; // シフトなしはふつうの文字入力
      ev.preventDefault(); ev.stopPropagation();
      guide.armed = false;
      if (!ev.repeat) { held.add(ev.code); chord |= SIX_KEYS[ev.code]; }
    }, true);
    G.input.addEventListener('keyup', ev => {
      if (!SIX_KEYS[ev.code] || !held.has(ev.code)) return;
      ev.preventDefault();
      held.delete(ev.code);
      if (!held.size && chord) {
        const c = E.bitsCell(chord); const bits = chord; chord = 0;
        const a = G.input.selectionStart, z = G.input.selectionEnd;
        G.input.value = G.input.value.slice(0, a) + c + G.input.value.slice(z);
        G.input.setSelectionRange(a + c.length, a + c.length);
        announce(speakCell(bits));
      }
    });
    G.input.addEventListener('blur', () => { held.clear(); chord = 0; });
  }
  // 入力した答えが点字でどうなるかを、入力欄の下に出す（目で見て確かめる用。読み上げはしない）
  const echo = document.createElement('p');
  echo.className = 'guide-echo'; echo.setAttribute('aria-hidden', 'true');
  G.input.after(echo);
  let echoTimer = null;
  function guideEcho() {
    clearTimeout(echoTimer);
    echoTimer = setTimeout(() => {
      const k = guideAnswerKana(G.input.value);
      echo.textContent = k ? `点字：${E.kanaToBraille(k).cells}　（${k}）` : '';
    }, 120);
  }
  G.input.addEventListener('input', guideEcho);
  G.input.addEventListener('keyup', guideEcho);
  // 入力された答え（かな・漢字・6点の点字が混ざってもよい）を、点字の読み（カタカナ）にする
  function guideAnswerKana(v) {
    v = String(v || '').trim();
    if (!v) return '';
    return v.split(/([⠀-⣿]+)/).map((part, k) => {
      if (!part) return '';
      if (k % 2) { const z = E.brailleToKana(part); return (typeof z === 'string' ? z : z.kana).replace(/〓/g, ''); }
      if (/^[ぁ-ゖァ-ヺー・ 　]+$/.test(part)) return E.toKatakana(part);
      if (!state.tokenizer) return E.toKatakana(part);
      return E.sumijiToKana(part, t => state.tokenizer.tokenize(t), { fallback: readByChar }).kana;
    }).join('').replace(/[ 　]+/g, ' ');
  }

  function startGuide() {
    guide.on = true;
    G.el.hidden = false;
    for (const el of appParts()) el.inert = true;
    guideShow({
      first: true, single: true,
      msg: '自動誘導機能を利用しますか？',
      sub: hasKeys ? '利用する場合はエンター、利用しない場合はスペースを押してください。' : '',
      choices: [{ label: '利用する', key: 'Enter', run: guideIntro }, { label: '利用しない', key: 'Space', run: () => finishGuide('skip') }],
    });
  }
  function guideIntro() {
    const sub = hasKeys
      ? 'エスケープを押すと、現在の進捗をエディタに反映して、案内を終了します。\n今後は、一つ目の選択肢はエンター1回で選択、2回で決定、二つ目の選択肢はスペース1回で選択、2回で決定できます。'
      : '画面のボタンを押して進みます。途中でやめるときは「案内を終わってエディタへ」を押してください。';
    guideShow({ msg: '案内を開始します。', sub, auto: hasKeys ? 14000 : 6000, next: guideSource });
  }
  function guideSource() {
    guideShow({
      step: '1. 点訳するもの',
      msg: 'ファイルをインポートしますか？　文章を入力しますか？',
      sub: hasKeys ? 'ファイルをインポートするならエンター、文章を入力するならスペースです。' : '',
      choices: [{ label: 'ファイルをインポートする', key: 'Enter', run: guidePickFile }, { label: '文章を入力する', key: 'Space', run: guideMemoNotice }],
    });
  }
  function guidePickFile() {
    G.file.value = '';
    guide.picking = true;
    G.file.click();
    announce('ファイルを選んでください');
  }
  G.file.addEventListener('cancel', () => { guide.picking = false; announce('ファイルが選ばれませんでした。もう一度選んでください'); guideSource(); });
  G.file.addEventListener('change', async () => {
    guide.picking = false;
    const fs = G.file.files ? [...G.file.files] : [];
    if (!fs.length) { guideSource(); return; }
    guideTranslateFile(fs);
  });
  async function guideTranslateFile(fs) {
    // 先に辞書を待つ（墨字のファイルは辞書がないと漢字が読めない）
    if (!guide.noDict && !(await guideEnsureDict(() => guideTranslateFile(fs), guideSource))) return;
    guideShow({ step: '2. 点訳', msg: 'ファイルを読み込んで、点訳を行っています。', busy: true });
    try {
      if (fs.length === 1 && !/\.zip$/i.test(fs[0].name)) await openFile(fs[0]);
      else await openFiles(fs);
      if (state.mode === 'sumiji') convertAll(true);
    } catch (e) { /* 読めなかったときは下で知らせる */ }
    if (!state.rows.some(r => r.cells || r.figure)) {
      toast('ファイルを読み込めませんでした。', true);
      guideShow({ msg: 'ファイルを読み込めませんでした。', sub: hasKeys ? '別のファイルを選ぶならエンター、文章を入力するならスペースです。' : '', back: guideSource,
        choices: [{ label: '別のファイルを選ぶ', key: 'Enter', run: guidePickFile }, { label: '文章を入力する', key: 'Space', run: guideMemoNotice }] });
      return;
    }
    guide.from = 'file';
    guideAfterTranslate();
  }
  function guideMemoNotice() {
    guideShow({
      msg: hasKeys ? 'シフトを押しながらエンターを3回押すと、自動点訳を行います。' : '文章を入力したら「点訳する」を押してください。',
      auto: hasKeys ? 7000 : 4000, next: guideMemo, back: guideSource,
    });
  }
  function guideMemo() {
    if (!G.memo.value && els.src.value) G.memo.value = els.src.value; // エディタに途中の文章があれば続きから
    guideShow({
      step: '1. 文章の入力',
      msg: '文章を入力してください。',
      sub: hasKeys ? 'Shift＋Enterを3回で点訳、Escでエディタに移ります。' : '',
      memo: true, back: guideSource,
      choices: [{ label: '点訳する', run: () => guideTranslate(G.memo.value) }],
    });
  }
  // 点訳の前に辞書を待つ。読み込めなかったら、読み込み直すか、辞書なしで進むかを選ぶ
  async function guideEnsureDict(retry, back) {
    if (state.tokenizer) return true;
    if (!window.kuromoji) return true;
    guideShow({ step: '2. 点訳', msg: '辞書を読み込んでいます。少しお待ちください。', sub: '漢字を正しく読むための辞書です。初めて開いたときや、通信が遅いときは時間がかかります。', busy: true });
    const ok = state.dictLoading ? await state.dictLoading : state.tokenizer ? true : await loadDict();
    if (ok || state.tokenizer) return true;
    guideShow({ step: '2. 点訳', msg: '辞書を読み込めませんでした。', back,
      sub: (hasKeys ? 'もう一度読み込むならエンター、辞書なしで点訳するならスペースです。\n' : '') + '辞書なしで点訳すると、漢字が読めず、校正箇所がとても多くなります。通信のよいところで、もう一度読み込むのがおすすめです。',
      choices: [{ label: 'もう一度読み込む', key: 'Enter', run: () => { loadDict(); retry(); } },
        { label: '辞書なしで点訳する', key: 'Space', run: () => { guide.noDict = true; retry(); } }] });
    return false;
  }
  async function guideTranslate(text) {
    if (!String(text).trim()) { announce('文章が入っていません'); G.memo.focus(); return; }
    G.memo.value = text;
    if (!guide.noDict && !(await guideEnsureDict(() => guideTranslate(text), guideMemo))) return;
    guideShow({ step: '2. 点訳', msg: '点訳を行っています。', busy: true });
    closeDocs(true);
    if (state.mode !== 'sumiji') setMode('sumiji');
    els.src.value = text;
    G.memo.value = '';
    state.rows = [];
    state.fileBase = '点訳';
    els.fileName.textContent = '新規';
    await waitDict();
    await new Promise(r => setTimeout(r, 50)); // 「点訳を行っています」を見せてから
    convertAll(true);
    guide.from = 'text';
    guideAfterTranslate();
  }
  // 校正箇所を1つずつの項目にする（読みが複数・点訳できない語・点字にできない文字・外国語・記号）
  function guideItems() {
    const items = [];
    state.rows.forEach((r, i) => {
      if (!needsCheck(r)) return;
      for (const ck of r.checks || []) if (!ck.done) items.push({ kind: ck.note ? 'note' : 'reading', r, i, ck });
      const seen = new Set();
      for (const w of r.unresolved || []) if (w !== '〓' && !seen.has(w)) { seen.add(w); items.push({ kind: 'fail', r, i, surface: w }); }
      for (const w of r.unknown || []) if (w !== '〓' && !seen.has(w)) { seen.add(w); items.push({ kind: 'fail', r, i, surface: w, isChar: true }); }
      for (const f of r.foreign || []) items.push({ kind: 'foreign', r, i, f });
    });
    return items;
  }
  // 点訳した直後の画面に戻るとき（文章なら文章の画面、ファイルならファイルか文章かを選ぶ画面）
  const backToSource = () => (guide.from === 'text' ? guideMemo() : guideSource());
  function guideAfterTranslate() {
    render();
    guide.items = guideItems();
    guideCount();
  }
  function guideCount() {
    const n = guide.items.length;
    const braille = state.mode !== 'sumiji';
    const target = braille ? '墨字のファイル' : '点字ファイル';
    if (!n) {
      guidePreviewAsk('点訳が終わりました。校正箇所はありません。');
      return;
    }
    guideShow({ back: backToSource,
      step: '3. 校正',
      msg: `校正箇所が${n}件あります。一つずつ確認しますか？`,
      sub: hasKeys ? `エンターを2回押すと、一つずつ確認します。スペースを2回押すと、手動校正をスキップして${target}を作成します。` : '',
      choices: [{ label: '一つずつ確認する', key: 'Enter', run: () => { guide.k = 0; guideItem(); } },
        { label: `確認せずに${target}を作成する`, key: 'Space', run: () => guideMakeFile(guideCount) }],
    });
  }
  const rowSrc = r => String(r.src || '').replace(/\t/g, ' ');
  function guideItem() {
    const items = guide.items;
    if (guide.k >= items.length) {
      render();
      guidePreviewAsk('すべての校正箇所を確認しました。');
      return;
    }
    const it = items[guide.k];
    const step = `校正 ${guide.k + 1} / ${items.length}`;
    const line = `${it.i + 1}行目：${rowSrc(it.r).slice(0, 80)}`;
    const done = v => { guideApply(it, v); guide.k++; guideItem(); };
    const back = () => { if (guide.k > 0) { guide.k--; guideItem(); } else guideCount(); };
    if (it.kind === 'reading') {
      guideShow({ step, back, msg: `「${it.ck.surface.length > 1 ? it.ck.surface.replace(/^の/, '') : it.ck.surface}」には読み方が複数あります。読み方を入力してください。`,
        sub: (hasKeys ? 'シフトを押しながら S D F J K L の入力で6点入力、エンター2回で決定します。\n' : '') + `${line}\n候補：${it.ck.options.map(displayKana).join('、')}　／　今の読み：${displayKana(it.ck.kana)}`,
        input: { value: displayKana(it.ck.kana), options: it.ck.options.map(displayKana), done } });
    } else if (it.kind === 'fail') {
      const pos = rowSrc(it.r).indexOf(it.surface);
      const len = Array.from(it.surface).length;
      const where = pos < 0 ? `${it.i + 1}行目の文字は点訳できませんでした。`
        : len > 1 ? `${it.i + 1}行${pos + 1}番目から${pos + len}番目の文字は点訳できませんでした。` : `${it.i + 1}行${pos + 1}番目の文字は点訳できませんでした。`;
      guideShow({ step, back, msg: `「${it.surface}」は点訳できませんでした。${where}確認して適切な文字を入力してください。`,
        sub: (hasKeys ? 'シフトを押しながら S D F J K L の入力で6点入力、エンター2回で決定します。\n' : '') + `${line}\n分からないときは、空のまま決定すると、そのままにします。`,
        input: { label: '適切な文字（かな・漢字。6点入力もできます）', value: '', done } });
    } else if (it.kind === 'foreign') {
      guideShow({ step, back, msg: `「${it.f.text}」は外国語（${it.f.kind}）です。点字の書き方は言語ごとに違います。読み方を入力してください。（エンター2回で決定）`,
        sub: `${line}\nそのままでよいときは、空のままエンターを2回押します。`, input: { value: '', done } });
    } else {
      guideShow({ step, back, msg: `「${it.ck.surface}」の記号の点字を確認してください。`, sub: `${line}\n${it.ck.note}`,
        choices: [{ label: 'このままにする', key: 'Enter', run: () => { it.ck.done = true; guideRowChecked(it.r); guide.k++; guideItem(); } }] });
    }
  }
  function guideRowChecked(r) {
    if (!(r.checks || []).some(c => !c.done) && !(r.unknown || []).length && !(r.unresolved || []).filter(x => x !== '〓').length && !(r.foreign || []).length) r.reviewed = true;
  }
  function guideApply(it, value) {
    const r = it.r;
    const kana = guideAnswerKana(value);
    const replaceKana = (from, to) => { if (from && to && from !== to && r.kana.includes(from)) { r.kana = r.kana.replace(from, to); return true; } return false; };
    if (it.kind === 'reading') {
      if (kana) replaceKana(it.ck.kana, kana);
      if (kana) it.ck.kana = kana;
      it.ck.done = true;
    } else if (it.kind === 'fail') {
      if (kana) {
        const old = it.applied || (it.isChar ? it.surface : (readByChar(it.surface) || it.surface));
        if (replaceKana(old, kana) || replaceKana(it.surface, kana)) it.applied = kana; // 戻ってやり直すときは、前に入れたものを差し替える
      }
      r.unresolved = (r.unresolved || []).filter(w => w !== it.surface);
    } else if (it.kind === 'foreign') {
      if (kana && (replaceKana(it.applied || it.f.text, kana))) it.applied = kana;
      r.foreign = (r.foreign || []).filter(f => f !== it.f);
    }
    const b = E.kanaToBraille(r.kana);
    r.cells = b.cells; r.bad = b.bad;
    r.unknown = it.kind === 'fail' && it.isChar ? b.unknown.filter(c => c !== it.surface) : b.unknown;
    if (r.type === 'table') r.tkana = r.kana.split(/ {2,}/);
    r.edited = true;
    guideRowChecked(r);
    E.fitBlocks(state.rows, layoutOpt());
    announce(kana ? `「${it.surface || (it.ck && it.ck.surface) || it.f.text}」を ${kana} にしました` : 'そのままにしました');
  }
  // ---------- プレビューの読み上げ：ブラウザ（端末）の日本語の声で読む ----------
  // 自動で語を送るところは読み上げソフトが追いつかないことがあるので、ここだけブラウザの声で読む。
  // 読み上げソフトの声と重なっても止めない（止めるのは、スペース2回で止めたときとプレビューを抜けたときだけ）
  const TTS = { ok: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window, voice: null, seq: 0 };
  function ttsPickVoice() {
    if (!TTS.ok) return;
    const vs = speechSynthesis.getVoices().filter(v => /^ja([-_]|$)/i.test(v.lang));
    TTS.voice = vs.find(v => v.localService) || vs[0] || null;
  }
  if (TTS.ok) { ttsPickVoice(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', ttsPickVoice); }
  // text を読み、読み終えたら（または読めなかったら目安の時間で）done を呼ぶ
  function ttsSay(text, done) {
    const my = ++TTS.seq;
    let fired = false;
    const finish = () => { if (fired || my !== TTS.seq) return; fired = true; clearTimeout(t); done && done(); };
    const mora = E.moraCount ? E.moraCount(text) : Array.from(text).length;
    // 声が使えないときや、終わりの知らせが来ないときのための目安
    const t = setTimeout(finish, TTS.ok ? 1500 + mora * 400 : 700 + mora * 170);
    if (!TTS.ok) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (TTS.voice) u.voice = TTS.voice;
      u.rate = 1;
      // 声がない端末では、すぐに「終わり」が来ることがある。語の長さに合わせた最低限の時間は待つ
      const start = Date.now(), least = 450 + mora * 150;
      const after = () => setTimeout(finish, Math.max(150, least - (Date.now() - start)));
      u.onend = after;
      u.onerror = after;
      speechSynthesis.speak(u);
    } catch (e) { /* 目安の時間で進む */ }
  }
  function ttsStop() {
    TTS.seq++;
    if (TTS.ok) { try { speechSynthesis.cancel(); } catch (e) { /* 何もしない */ } }
  }

  // ---------- プレビュー：点字と文を出して、分かち書きごとに自動で送りながら読む ----------
  function guidePreviewAsk(head) {
    if (head) guide.pvHead = head; else head = guide.pvHead || '';
    const target = state.mode !== 'sumiji' ? '墨字のファイル' : '点字ファイル';
    // 戻る：校正したなら最後の項目、校正がなければ点訳した直後の画面
    const back = () => { if (guide.items.length) { guide.k = guide.items.length - 1; guideItem(); } else backToSource(); };
    guideShow({ step: '4. プレビュー', back, msg: `${head}プレビューを確認しますか？`,
      sub: hasKeys ? `確認するならエンター、確認せずに${target}を作成するならスペースです。\nプレビューでは、先頭から分かち書きごとに自動で読み進めます。スペースを2回押すと、今読んでいるところで止めて修正できます。` : 'プレビューでは、語を押すとそこを修正できます。',
      choices: [{ label: 'プレビューを確認する', key: 'Enter', run: () => guidePreview(0) }, { label: `確認せずに${target}を作成する`, key: 'Space', run: () => guideMakeFile(() => guidePreviewAsk()) }] });
  }
  // 語の一覧：[{ r: 行, n: 行の中の何語目, kana }]
  function guideWords() {
    const ws = [];
    state.rows.forEach(r => {
      if (!r.kana || E.DECOR_TYPES.has(r.type) || r.type === 'figure' || r.pagebreak) return;
      displayKana(r.kana).split(/ +/).forEach((k, n) => { if (k) ws.push({ r, n, kana: k }); });
    });
    return ws;
  }
  function guidePreview(from) {
    const ws = guide.pvWords = guideWords();
    if (!ws.length) { guideMakeFile(); return; }
    // 画面：行ごとに、語の上にかな、下に点字。「押すと修正」の案内は枠に1回だけ
    G.preview.textContent = '';
    G.preview.setAttribute('role', 'group');
    G.preview.setAttribute('aria-label', hasKeys ? 'プレビュー。語をクリックすると、そこで止めて修正します' : 'プレビュー。語をダブルタップすると、そこで止めて修正します');
    let line = null, lastRow = null;
    ws.forEach((w, i) => {
      if (w.r !== lastRow) {
        lastRow = w.r;
        line = document.createElement('div'); line.className = 'pv-line';
        const no = document.createElement('span'); no.className = 'pv-no'; no.textContent = (state.rows.indexOf(w.r) + 1) + '行';
        line.appendChild(no);
        G.preview.appendChild(line);
      }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pv-word'; b.dataset.i = i; b.tabIndex = -1;
      const k = document.createElement('span'); k.className = 'pv-k'; k.textContent = w.kana;
      const c = document.createElement('span'); c.className = 'pv-c'; c.textContent = E.kanaToBraille(w.kana).cells;
      b.append(k, c);
      b.setAttribute('aria-label', w.kana);
      b.addEventListener('click', () => guidePreviewStop(i)); // 指・マウスはその語を押すと止めて修正
      line.appendChild(b);
    });
    const target = state.mode !== 'sumiji' ? '墨字のファイル' : '点字ファイル';
    guideShow({ step: '4. プレビュー', preview: true, back: () => guidePreviewAsk(),
      msg: from ? '続きから読みます。' : 'プレビューを読みます。',
      sub: hasKeys ? 'スペースを2回押すと、今読んでいるところで止めて修正できます。Escで案内を終わります。' : '語を押すと、そこを修正できます。',
      choices: [{ label: '今のところで止めて修正する', run: () => guidePreviewStop(guide.pvPos || 0) },
        { label: `プレビューを終えて${target}を作成する`, run: () => guideMakeFile(() => guidePreviewAsk()) }] });
    guide.pvArm = null;
    guide.pvPos = from;
    // 決定した操作の中ですぐ声を出す（iPhone などは、操作の中で一度声を出すと、そのあとも読める）。読み終えたら語へ
    ttsStop();
    ttsSay(from ? '続きから読みます' : 'プレビューを読みます', () => guidePreviewStep(from, 200));
  }
  function guidePreviewStep(i, wait) {
    clearTimeout(guide.pvTimer);
    guide.pvTimer = setTimeout(() => {
      if (!guide.screen || !guide.screen.preview) return;
      const ws = guide.pvWords;
      if (i >= ws.length) {
        const target = state.mode !== 'sumiji' ? '墨字のファイル' : '点字ファイル';
        guideShow({ step: '4. プレビュー', msg: 'プレビューを最後まで読みました。', back: () => guidePreviewAsk(),
          sub: hasKeys ? `${target}を作成するならエンター、もう一度最初から読むならスペースです。` : '',
          choices: [{ label: `${target}を作成する`, key: 'Enter', run: () => guideMakeFile(() => guidePreviewAsk()) }, { label: 'もう一度最初から読む', key: 'Space', run: () => guidePreview(0) }] });
        return;
      }
      guide.pvPos = i;
      const prev = G.preview.querySelector('.pv-word.now');
      if (prev) prev.classList.remove('now');
      const el = G.preview.querySelector(`.pv-word[data-i="${i}"]`);
      if (el) { el.classList.add('now'); el.scrollIntoView({ block: 'nearest' }); }
      const w = ws[i];
      // 行が変わったら行番号も読む
      const say = (i === 0 || ws[i - 1].r !== w.r ? `${state.rows.indexOf(w.r) + 1}行目、` : '') + w.kana;
      // 読み上げソフトには渡さない（ブラウザの声と2回になるため）
      // ブラウザの声で読み、読み終えたら次の語へ（行が変わるところは少し間をあける）
      ttsSay(say, () => guidePreviewStep(i + 1, i + 1 < ws.length && ws[i + 1].r !== w.r ? 400 : 0));
    }, wait);
  }
  // 止めて、その語を直す
  function guidePreviewStop(i) {
    clearTimeout(guide.pvTimer);
    ttsStop();
    const w = guide.pvWords[i];
    if (!w) return;
    const lineNo = state.rows.indexOf(w.r) + 1;
    // 語の後ろの句読点（。、？！）は直す欄に入れず、そのまま残す
    const pm = /[。、？！?!…]+$/.exec(w.kana);
    const tail = pm ? pm[0] : '', body = tail ? w.kana.slice(0, -tail.length) : w.kana;
    guideShow({ step: '4. プレビュー（修正）', back: () => guidePreview(i), msg: `「${w.kana}」（${lineNo}行目）で止めました。修正してください。`,
      sub: (hasKeys ? 'シフトを押しながら S D F J K L の入力で6点入力、エンター2回で決定します。\n' : '') + `${lineNo}行目：${displayKana(w.r.kana)}\nそのままでよいときは、変えずに決定すると続きを読みます。`,
      input: { label: '読み（かな。6点入力もできます）', value: body, done: v => {
        let k = guideAnswerKana(v);
        if (k && tail && !/[。、？！?!…]$/.test(k)) k += tail;
        if (k && k !== w.kana) {
          const parts = displayKana(w.r.kana).split(/( +)/);
          parts[w.n * 2] = k;
          const r = w.r;
          r.kana = E.toKatakana(parts.join(''));
          if (r.type === 'table') r.tkana = r.kana.split(/ {2,}/);
          const b = E.kanaToBraille(r.kana);
          r.cells = b.cells; r.bad = b.bad; r.unknown = b.unknown; r.edited = true;
          E.fitBlocks(state.rows, layoutOpt());
          announce(`${k}に直しました`);
        }
        guidePreview(i + 1);
      } } });
  }

  // 出力するファイル形式を選ぶ → 点図があれば出し方を選ぶ → 保存場所を選んで保存
  function guideMakeFile(back) {
    if (typeof back === 'function') guide.formatBack = back;
    const braille = state.mode !== 'sumiji';
    const list = [];
    if (braille) {
      list.push({ label: '墨字のテキスト（.txt）', note: '点字を墨字に起こした文章', run: () => guideBuild({ kind: 'sumiji-txt' }) });
      list.push({ label: '墨字のWord（.docx）', note: '点字を墨字に起こした文章', run: () => guideBuild({ kind: 'sumiji-docx' }) });
    }
    for (const fmt of F.EXPORTS) list.push({ label: `${fmt.label}（.${fmt.ext}）`, note: fmt.note, run: () => guideFigures(fmt) });
    guideShow({ step: '4. ファイルの作成', msg: '出力するファイル形式を選択してください。', back: guide.formatBack || (() => guidePreviewAsk()),
      sub: hasKeys ? '上下の矢印キーで選び、エンターを2回押すと決定します。' : '形式を押すと決定します。',
      list, listLabel: '出力するファイル形式' });
  }
  // 点字の形式で点図があるときは、ZIP（本文と点図）・本文の点字だけ・点図だけ から選ぶ
  function guideFigures(fmt) {
    const figs = figureRows();
    if (fmt.group !== '点字' || !figs.length) { guideBuild({ kind: 'body', fmt }); return; }
    const back = () => guideMakeFile();
    const fk = FG.format.value;
    const figName = { edl: 'エーデル（EDL）', svg: 'SVG', 'pdf-dots': '点図のPDF', 'pdf-solid': '立体コピー用のPDF' }[fk] || fk;
    guideShow({ step: '4. ファイルの作成', back, msg: `点図が${figs.length}点あります。どの形で出力しますか？`,
      sub: (hasKeys ? '上下の矢印キーで選び、エンターを2回押すと決定します。\n' : '') + `点図の形式（${figName}）は、エディタの点図の画面で変えられます。`,
      listLabel: '出力のしかた',
      list: [
        { label: 'ZIPでまとめて出力', note: `本文の点字（${fmt.label}）と点図（${figName}）を1つのZIPに入れる`, run: () => guideBuild({ kind: 'zip', fmt, viaFig: true }) },
        { label: `文字（本文の点字）だけ出力`, note: `${fmt.label} のファイル1つ`, run: () => guideBuild({ kind: 'body', fmt, viaFig: true }) },
        { label: `点図（${figName}）だけ出力`, note: figs.length > 1 && fk !== 'pdf-dots' && fk !== 'pdf-solid' ? `${figs.length}点の点図を1つのZIPに入れる` : '点図のファイル', run: () => guideBuild({ kind: 'figs', fmt, viaFig: true }) },
      ] });
  }
  async function guideBuild(o) {
    const userGesture = !navigator.userActivation || navigator.userActivation.isActive;
    const back = () => (o.viaFig ? guideFigures(o.fmt) : guideMakeFile());
    let name, data;
    try {
      const base = state.fileBase || (state.mode === 'sumiji' ? '点訳' : '墨字');
      if (o.kind === 'sumiji-txt' || o.kind === 'sumiji-docx') {
        updateSumiji();
        name = `${base}_墨字.${o.kind === 'sumiji-txt' ? 'txt' : 'docx'}`;
        data = o.kind === 'sumiji-txt' ? F.textFile(els.sumiji.value) : await F.docxFromText(els.sumiji.value);
      } else {
        const rows = state.rows.map(r => ({ ...r, kana: r.kana ? displayKana(r.kana) : r.kana }));
        const suffix = o.fmt.id.startsWith('txt-') || o.fmt.id.startsWith('docx-') ? '_' + o.fmt.id.split('-')[1] : '';
        const bodyName = `${base}${suffix}.${o.fmt.ext}`;
        const body = o.kind === 'figs' ? null : await F.exportFile(o.fmt.id, rows, layoutOpt());
        const figFiles = o.kind === 'body' ? [] : await buildTactileFiles(figureRows(), FG.format.value);
        const files = [...(body ? [{ name: bodyName, data: body }] : []), ...figFiles.filter(f => o.kind === 'zip' || !/_点図の一覧\.txt$/.test(f.name))];
        if (files.length === 1) { name = files[0].name; data = files[0].data; }
        else {
          const zip = new window.JSZip();
          for (const f of files) zip.file(f.name, f.data);
          name = o.kind === 'figs' ? `${base}_点図.zip` : `${base}_点字と点図.zip`;
          data = await zip.generateAsync({ type: 'uint8array' });
        }
      }
    } catch (e) {
      guideShow({ msg: 'ファイルを作成できませんでした。', sub: e.message || '', back, choices: [{ label: 'エディタに移る', key: 'Enter', run: () => finishGuide('done') }] });
      return;
    }
    guide.pending = { name, data };
    // 保存場所を選ぶ画面（ブラウザが保存場所を聞けるときはすぐ開く。聞けないブラウザはダウンロードに保存）
    const canPick = !!window.showSaveFilePicker;
    const pick = async () => {
      const ok = await saveFile(name, data);
      if (!ok) {
        guideShow({ step: '4. ファイルの作成', msg: '保存をやめました。', back, sub: hasKeys ? 'もう一度保存場所を選ぶならエンター、形式を選び直すならスペースです。' : '',
          choices: [{ label: 'もう一度保存場所を選ぶ', key: 'Enter', run: pick }, { label: '形式を選び直す', key: 'Space', run: () => guideMakeFile() }] });
        return;
      }
      toast(`${name} を保存しました`);
      guideShow({ step: '4. ファイルの作成', msg: canPick ? `「${name}」を保存しました。` : `「${name}」をダウンロードに保存しました。`,
        sub: 'エディタに切り替えます。', auto: 6000, next: () => finishGuide('done') });
    };
    guideShow({ step: '4. ファイルの作成', back, msg: canPick ? 'ファイルの保存場所を選んでください。' : 'ファイルを保存します。',
      sub: canPick ? `ファイル名：${name}` : `このブラウザでは保存場所を選べないため、ダウンロードのフォルダに「${name}」を保存します。` + (hasKeys ? 'エンターを2回押すと保存します。' : ''),
      choices: [{ label: canPick ? '保存場所を選ぶ' : '保存する', key: 'Enter', run: pick }] });
    if (canPick && userGesture && navigator.userActivation && navigator.userActivation.isActive) pick(); // 決定のキー操作のうちに、すぐ保存場所の画面を開く
  }
  // 案内を終えてエディタへ。「利用しない」や途中でやめたときも、辞書を読み込んでから移る
  async function finishGuide(how, scr) {
    if (!guide.on || guide.finishing) return;
    clearTimeout(guide.timer);
    clearTimeout(guide.pvTimer);
    ttsStop();
    const sc = scr || guide.screen || {};
    if (!state.tokenizer && window.kuromoji && !guide.leaveNoDict) {
      guide.finishing = true;
      // 書きかけの文章は、待っているあいだも消えないように取っておく
      guideShow({ msg: '辞書を読み込んでいます。読み込みが終わったら、エディタに移ります。', sub: '漢字を正しく読むための辞書です。初めて開いたときや、通信が遅いときは時間がかかります。', busy: true });
      const ok = await (state.dictLoading || loadDict());
      guide.finishing = false;
      if (!ok && !state.tokenizer) {
        guideShow({ msg: '辞書を読み込めませんでした。',
          sub: (hasKeys ? 'もう一度読み込むならエンター、辞書なしでエディタに移るならスペースです。\n' : '') + '辞書なしでは漢字が読めません。あとで読み込めると、自動で変換し直します。',
          choices: [{ label: 'もう一度読み込む', key: 'Enter', run: () => finishGuide(how, sc) },
            { label: '辞書なしでエディタに移る', key: 'Space', run: () => { guide.leaveNoDict = true; finishGuide(how, sc); } }] });
        return;
      }
    }
    finishGuideNow(how, sc);
  }
  function finishGuideNow(how, sc) {
    if (!guide.on) return;
    // メモ帳の画面から抜けるときは、途中まで書いた文章をエディタに入れる
    if (sc.memo && G.memo.value.trim()) {
      closeDocs(true);
      if (state.mode !== 'sumiji') setMode('sumiji');
      els.src.value = G.memo.value;
      G.memo.value = '';
      convertAll(true);
    }
    // 辞書なしで点訳していたら、辞書が使えるようになった今、変換し直す
    if (state.tokenizer && guide.noDict && state.mode === 'sumiji') { state.rows = state.rows.filter(r => r.edited); convertAll(true); }
    guide.on = false;
    guide.screen = null;
    G.el.hidden = true;
    for (const el of appParts()) el.inert = false;
    render();
    if (how !== 'skip') {
      announce('案内を終了しました。エディタに切り替えました');
      (state.mode === 'sumiji' && !state.rows.length ? els.src : els.rows).focus();
    } else els.src.focus();
  }

  // ---------- 起動 ----------
  loadPrefs();
  buildMenu();
  setMode('sumiji');
  els.src.value = '';
  convertAll();
  if (!/[?&]guide=0\b/.test(location.search)) startGuide();

  // ---------- 辞書の読み込み（失敗したら読み込み直せる） ----------
  // 案内の途中で読み終わったときは、案内が自分で点訳するので、ここでは変換し直さず、読み上げもしない
  function loadDict() {
    if (!window.kuromoji) {
      els.stDict.textContent = '辞書ライブラリがありません';
      els.stDict.className = 'pill err';
      return Promise.resolve(false);
    }
    if (state.dictLoading) return state.dictLoading;
    els.stDict.textContent = '辞書を読み込み中…';
    els.stDict.className = 'pill';
    state.dictLoading = new Promise(resolve => {
      window.kuromoji.builder({ dicPath: 'dict/' }).build((err, tokenizer) => {
        state.dictLoading = null;
        if (err || !tokenizer) {
          els.stDict.textContent = '辞書を読み込めませんでした（漢字は変換されません）';
          els.stDict.className = 'pill err';
          resolve(false);
          return;
        }
        state.tokenizer = tokenizer;
        els.stDict.textContent = '辞書 準備完了';
        els.stDict.className = 'pill ok';
        if (!guide.on) {
          announce('辞書の準備ができました');
          if (state.mode === 'sumiji') {
            state.rows = state.rows.filter(r => r.edited);
            convertAll();
            if (els.note.classList.contains('warn')) setNote('');
          }
        }
        resolve(true);
      });
    });
    return state.dictLoading;
  }

  loadDict();
})();
