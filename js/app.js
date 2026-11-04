/* 点訳エディタ 画面の動き */
(function () {
  'use strict';
  const E = window.TenjiEngine;
  const F = window.TenjiFormats;
  const $ = id => document.getElementById(id);

  const SAMPLE = [
    '点字は、フランスのルイ・ブライユが考案した文字です。',
    'ブライユが生まれたのは、１８０９年１月４日です。',
    '「おいしい？」「うん」',
    '列車が遅れたため駅はひどく混み合っていた。',
    'ＮＨＫの番組で、10円玉とＡ型の話を聞いた。'
  ].join('\n');

  const state = {
    tokenizer: null,
    mode: 'sumiji',
    rows: [],
    fileBase: '点訳',
    fileLabel: '例文'
  };

  const els = {
    src: $('src'), rows: $('rows'), mode: $('mode'), cols: $('cols'), lines: $('lines'),
    indent: $('indent'), hira: $('hira'), fileName: $('file-name'), note: $('file-note'),
    stDict: $('st-dict'), stCount: $('st-count'), stWarn: $('st-warn'),
    exportBtn: $('btn-export'), exportPop: $('export-pop'), toast: $('toast'), dropHint: $('drop-hint'),
    sumiji: $('sumiji'), raw: $('raw'), btnRaw: $('btn-raw'), sumijiActions: $('sumiji-actions'), join: $('join'),
    srcTitle: $('src-title'), outTitle: $('out-title'), outLegend: $('out-legend')
  };

  // ---------- 設定の保存（このブラウザだけ） ----------
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('tenji-editor-prefs') || '{}');
      if (p.cols) els.cols.value = p.cols;
      if (p.lines) els.lines.value = p.lines;
      if (typeof p.indent === 'boolean') els.indent.checked = p.indent;
      if (typeof p.hira === 'boolean') els.hira.checked = p.hira;
    } catch (e) { /* 保存できない環境では既定値のまま */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem('tenji-editor-prefs', JSON.stringify({
        cols: +els.cols.value, lines: +els.lines.value, indent: els.indent.checked, hira: els.hira.checked
      }));
    } catch (e) { /* 何もしない */ }
  }
  const layoutOpt = () => ({
    cols: Math.max(10, Math.min(60, +els.cols.value || 32)),
    lines: Math.max(5, Math.min(40, +els.lines.value || 18)),
    indent: els.indent.checked,
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
  function sumijiToRows(text, oldRows) {
    const old = new Map();
    (oldRows || []).forEach(r => { if (r.edited && r.src !== undefined) old.set(r.src, r); });
    return text.replace(/\r/g, '').split('\n').map(src => {
      const keep = old.get(src);
      if (keep) return keep; // かなを手で直した行は、原文が同じなら残す
      if (!src.trim()) return { src, kana: '', cells: '', para: false, unknown: [], unresolved: [], bad: [] };
      let kana = src, unresolved = [];
      if (state.tokenizer) {
        const r = E.tokensToKana(state.tokenizer.tokenize(E.normalizeInput(src)));
        kana = r.kana; unresolved = r.unresolved;
      }
      const b = E.kanaToBraille(kana);
      return { src, kana, cells: b.cells, unknown: b.unknown, bad: b.bad, unresolved, para: true };
    });
  }
  function brailleToRows(rows) {
    return rows.map(r => {
      if (r.pagebreak) return { pagebreak: true };
      const kana = E.brailleToKana(r.cells);
      return { src: r.cells, kana, cells: r.cells, unknown: [], bad: [], unresolved: kana.includes('〓') ? ['〓'] : [], para: false };
    });
  }

  function convertAll() {
    const raw = state.mode === 'sumiji' ? els.src.value : els.raw.value;
    if (state.mode === 'sumiji') {
      state.rows = sumijiToRows(raw, state.rows);
    } else {
      const parsed = F.parseRaw(raw, state.mode === 'braille-nabcc' ? 'nabcc' : 'unicode') || [];
      const edited = new Map();
      state.rows.forEach(r => { if (r.edited && r.src) edited.set(r.src, r); });
      state.rows = brailleToRows(parsed).map(r => (!r.pagebreak && edited.has(r.src)) ? edited.get(r.src) : r);
    }
    render();
  }

  // ---------- 描画 ----------
  const displayKana = k => els.hira.checked ? E.toHiragana(k) : k;
  const cellLen = s => Array.from(s || '').length;

  function fillMeta(meta, row) {
    meta.textContent = '';
    const opt = layoutOpt();
    const n = cellLen(row.cells) + (row.para && opt.indent ? 2 : 0);
    const chip = (text, cls) => { const s = document.createElement('span'); s.className = 'chip' + (cls ? ' ' + cls : ''); s.textContent = text; meta.appendChild(s); };
    if (row.cells) {
      const wrapped = E.wrapCells((row.para && opt.indent ? '⠀⠀' : '') + row.cells, opt.cols).length;
      chip(`${n}マス` + (wrapped > 1 ? `・${wrapped}行に折り返し` : ''));
    }
    const miss = [...new Set([...(row.unknown || []), ...(row.unresolved || [])])].filter(x => x !== '〓');
    if (miss.length) chip('未変換：' + miss.join(' '), 'warn');
    if (row.unresolved && row.unresolved.includes('〓')) chip('読めない点字があります', 'warn');
    if (row.edited) chip('かなを手直し済み', 'edited');
  }

  // 表示用のマスあけ記号（書き出すデータには入らない）
  const SPACE_MARK = '□';
  const showSpaces = t => t.replace(/[ \u3000]/g, SPACE_MARK);
  const hideSpaces = t => t.replace(/□/g, ' ');

  // かなの1単位と点字のマスを縦にそろえて描く
  function paintAlign(el, row) {
    el.textContent = '';
    el.classList.remove('plain');
    const b = row.kana ? E.kanaToBraille(row.kana) : null;
    const bad = new Set(row.bad || []);
    if (b && b.cells === row.cells) {
      let pos = 0;
      for (const u of b.units) {
        const unit = document.createElement('span');
        const isSp = /^[ \u3000]+$/.test(u.text);
        const n = u.cells.length;
        unit.className = 'u' + (isSp ? ' sp' : '') + (n > 1 ? ' multi' : '');
        unit.style.setProperty('--n', n);
        const k = document.createElement('span');
        const label = isSp ? SPACE_MARK : displayKana(u.text);
        // マスの幅に収まらないときは文字を小さくする（1マスに2文字など）
        k.className = 'u-k' + (Array.from(label).length > n ? ' tight' : '');
        k.textContent = label;
        const c = document.createElement('span');
        c.className = 'u-c';
        for (const cell of u.cells) {
          const d = document.createElement('span');
          d.className = 'c' + (bad.has(pos) ? ' bad' : '');
          d.textContent = cell;
          c.appendChild(d);
          pos++;
        }
        unit.append(k, c);
        el.appendChild(unit);
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
    li.className = 'row' + (row.cells ? '' : ' empty');
    const no = document.createElement('div');
    no.className = 'row-no';
    no.textContent = idx + 1;
    const body = document.createElement('div');
    body.className = 'row-body';

    const align = document.createElement('div');
    align.className = 'align';
    align.tabIndex = 0;
    align.setAttribute('role', 'button');
    align.setAttribute('aria-label', `${idx + 1}行目：${row.kana || '空行'}。押すとかなを直せます`);
    align.title = 'クリックでかなを直す';
    paintAlign(align, row);

    const edit = document.createElement('input');
    edit.type = 'text';
    edit.className = 'kana-edit';
    edit.id = 'kana-' + idx;
    edit.hidden = true;
    edit.setAttribute('aria-label', `${idx + 1}行目のかな（□はマスあけ）`);
    edit.spellcheck = false;

    const meta = document.createElement('div');
    meta.className = 'meta';
    fillMeta(meta, row);

    const openEdit = () => {
      edit.value = showSpaces(displayKana(row.kana || ''));
      edit.hidden = false;
      edit.focus();
    };
    align.addEventListener('click', openEdit);
    align.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEdit(); } });
    edit.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); edit.blur(); } });
    edit.addEventListener('blur', () => { edit.hidden = true; });
    edit.addEventListener('input', () => {
      // 入力したスペースはその場で□にする（カーソル位置は保つ）
      const pos = edit.selectionStart;
      const v = showSpaces(edit.value);
      if (v !== edit.value) { edit.value = v; edit.setSelectionRange(pos, pos); }
      row.kana = E.toKatakana(hideSpaces(v));
      const b = E.kanaToBraille(row.kana);
      row.cells = b.cells; row.unknown = b.unknown; row.bad = b.bad; row.unresolved = []; row.edited = true;
      paintAlign(align, row);
      fillMeta(meta, row);
      updateSumiji();
      updateStatus();
    });

    body.append(align, edit, meta);
    li.append(no, body);
    return li;
  }

  function render() {
    const frag = document.createDocumentFragment();
    let n = 0;
    state.rows.forEach(r => { frag.appendChild(buildRow(r, r.pagebreak ? n : n++)); });
    els.rows.textContent = '';
    els.rows.appendChild(frag);
    updateSumiji();
    updateStatus();
  }

  function updateStatus() {
    const textRows = state.rows.filter(r => !r.pagebreak);
    const pages = E.layoutPages(state.rows, layoutOpt());
    const lines = pages.reduce((a, p) => a + p.length, 0);
    els.stCount.textContent = `${textRows.length}行 → 点字 ${lines}行・${pages.length}ページ（${layoutOpt().cols}マス×${layoutOpt().lines}行）`;
    const warnRows = textRows.filter(r => (r.unknown && r.unknown.length) || (r.unresolved && r.unresolved.length)).length;
    els.stWarn.textContent = warnRows ? `要確認 ${warnRows}行` : '';
  }

  // ---------- ファイル ----------
  // 墨字に起こした文章（点字ファイルを読み込んだとき、右側に出す）
  function buildSumijiText() {
    const out = [];
    let para = null;
    const flush = () => { if (para !== null) { out.push(para); para = null; } };
    for (const r of state.rows) {
      if (r.pagebreak) { if (!els.join.checked) out.push(''); continue; }
      const line = displayKana(r.kana || '').replace(/〓/g, '？');
      if (!els.join.checked) { out.push(line.replace(/^[ \u3000]+/, '')); continue; }
      if (!line.trim()) { flush(); out.push(''); continue; }
      // 行頭にマスあけがある行は新しい段落。それ以外は前の行に続ける（点字の改行は語の切れ目）
      if (para === null || /^[ \u3000]/.test(line)) { flush(); para = line.replace(/^[ \u3000]+/, ''); }
      else para += ' ' + line;
    }
    flush();
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function updateSumiji() {
    if (state.mode === 'sumiji') return;
    els.sumiji.value = buildSumijiText();
  }

  function setMode(mode) {
    state.mode = mode;
    els.mode.value = mode;
    const braille = mode !== 'sumiji';
    document.body.classList.toggle('braille', braille);
    els.src.hidden = braille;
    els.sumiji.hidden = !braille;
    els.sumijiActions.hidden = !braille;
    els.btnRaw.hidden = !braille;
    if (!braille) { els.raw.hidden = true; els.btnRaw.setAttribute('aria-expanded', 'false'); }
    els.raw.classList.toggle('braille', mode === 'braille-unicode');
    els.srcTitle.textContent = braille ? '墨字に起こしたもの' : '読み込んだファイル';
    els.outTitle.textContent = braille ? '点字' : '変換データ';
    els.outLegend.textContent = braille
      ? '上段：読み（□＝マスあけ）／下段：6点　行を押すと読みを直せます'
      : '上段：かな（□＝マスあけ）／下段：6点　行を押すとかなを直せます';
  }

  async function openFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const res = await F.readFile(file.name, buf);
      state.rows = [];
      state.fileBase = file.name.replace(/\.[^.]+$/, '') || '点訳';
      state.fileLabel = file.name;
      els.fileName.textContent = file.name;
      setNote(res.note || '');
      if (res.mode === 'sumiji') {
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
    if (!state.rows.some(r => r.cells)) { toast('書き出す内容がありません。', true); return; }
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
  });

  // ---------- イベント ----------
  $('btn-open').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0];
    if (f) openFile(f);
    ev.target.value = '';
  });
  $('btn-new').addEventListener('click', () => {
    els.src.value = '';
    state.rows = [];
    state.fileBase = '点訳';
    els.fileName.textContent = '新規';
    setNote('');
    setMode('sumiji');
    convertAll();
    els.src.focus();
  });
  let timer = null;
  els.src.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(convertAll, 350); });
  els.mode.addEventListener('change', () => {
    const wasSumiji = state.mode === 'sumiji';
    setMode(els.mode.value);
    // 墨字の欄に貼り付けた点字データを、そのまま点字として読み直す
    if (wasSumiji && state.mode !== 'sumiji') { els.raw.value = els.src.value; els.raw.hidden = false; els.btnRaw.setAttribute('aria-expanded', 'true'); }
    state.rows = [];
    convertAll();
  });
  els.btnRaw.addEventListener('click', () => {
    els.raw.hidden = !els.raw.hidden;
    els.btnRaw.setAttribute('aria-expanded', String(!els.raw.hidden));
    if (!els.raw.hidden) els.raw.focus();
  });
  els.raw.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(convertAll, 350); });
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
  [els.cols, els.lines, els.indent].forEach(el => el.addEventListener('change', () => { savePrefs(); render(); }));
  els.hira.addEventListener('change', () => { savePrefs(); render(); });

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
      if (state.mode === 'sumiji') { state.rows = state.rows.filter(r => r.edited); convertAll(); if (!els.note.classList.contains('warn')) {} else setNote(''); }
    });
  } else {
    els.stDict.textContent = '辞書ライブラリがありません';
    els.stDict.className = 'pill err';
  }
})();
