/*
 * 点字データ形式の読み書き
 *  読み込み: TXT / Word(.docx) / Excel(.xlsx) / PDF / BSE / BRL / BRF / PEF / BES(.bes .besx)
 *  Word・Excel・PDF は、見出し・表・枠・区切り線・画像を「行の種類」として取り出す
 *  書き出し: BSE / BRL / BRF / PEF / BES(試験的) / TXT / Word(.docx)
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.TenjiEngine;
  // このファイルの場所（pdf.js などを相対で読み込むため）
  const SCRIPT_BASE = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src : '';
  const getJSZip = () => (typeof module !== 'undefined' && module.exports) ? require('../vendor/jszip.min.js') : root.JSZip;

  const PAGE_MARK = '［改ページ］';
  const BES_HEADER_SIZE = 1029;

  // ---------- 文字コード ----------
  function decodeText(buf) {
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder('utf-8').decode(u8.subarray(3));
    if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
    catch (e) { return new TextDecoder('shift_jis').decode(u8); }
  }
  function latin1(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }
  const isBrailleUnicode = s => {
    const chars = Array.from(s.replace(/[\s　]/g, ''));
    if (!chars.length) return false;
    const n = chars.filter(c => c >= '⠀' && c <= '⣿').length;
    return n / chars.length > 0.6;
  };

  // ---------- 形式の判定 ----------
  const KINDS = {
    txt: { label: 'テキスト', read: true },
    xlsx: { label: 'Excel', read: true },
    pdf: { label: 'PDF', read: true },
    docx: { label: 'Word', read: true },
    bse: { label: 'BSE（BASE形式）', read: true },
    brl: { label: 'BRL（NABCC）', read: true },
    brf: { label: 'BRF（Braille Ready）', read: true },
    pef: { label: 'PEF', read: true },
    bes: { label: 'BES（点字編集システム）', read: true },
    besx: { label: 'BESX（点字編集システム）', read: true }
  };
  const UNSUPPORTED = {
    bls: 'ブレイルスター（初期）', ble: 'ブレイルスターII', bs: 'ブレイルスターIII / for Windows',
    bmt: 'ブレイルメモ', nab: 'コータクン', bet: 'ないーぶネット旧形式', doc: '旧Word（.doc）', xls: '旧Excel（.xls）'
  };
  function extOf(name) { const m = /\.([^.]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; }

  // ---------- 点字行（rows）の表現 ----------
  // rows: [{cells}, {pagebreak:true}]
  function nabccTextToRows(text) {
    const rows = [];
    const lines = text.replace(/\r/g, '').split('\n');
    for (let line of lines) {
      if (line === PAGE_MARK) { rows.push({ pagebreak: true }); continue; }
      while (line.includes('\f')) {
        const k = line.indexOf('\f');
        const before = line.slice(0, k);
        if (before.trim()) rows.push({ cells: E.asciiToCells(before) });
        rows.push({ pagebreak: true });
        line = line.slice(k + 1);
      }
      rows.push({ cells: E.asciiToCells(line) });
    }
    return trimTail(rows);
  }
  function unicodeTextToRows(text) {
    const rows = [];
    for (const line of text.replace(/\r/g, '').split('\n')) {
      if (line === PAGE_MARK || line === '\f') { rows.push({ pagebreak: true }); continue; }
      rows.push({ cells: Array.from(line).map(c => (c === ' ' || c === '　') ? '⠀' : c).filter(c => c >= '⠀' && c <= '⣿').join('') });
    }
    return trimTail(rows);
  }
  function trimTail(rows) {
    while (rows.length && (rows[rows.length - 1].pagebreak || rows[rows.length - 1].cells === '')) rows.pop();
    return rows;
  }
  function rowsToUnicodeText(rows) {
    return rows.map(r => r.pagebreak ? PAGE_MARK : r.cells).join('\n');
  }

  // ---------- 読み込み ----------
  // 戻り値: { kind, mode:'sumiji'|'braille', raw, rawKind:'text'|'nabcc'|'unicode', rows?, note? }
  async function readFile(name, buf, opt) {
    const ext = extOf(name);
    const u8 = new Uint8Array(buf);
    if (UNSUPPORTED[ext]) throw new Error(`${UNSUPPORTED[ext]}の形式（.${ext}）は仕様が公開されていないため読み込めません。元のソフトでBSEやBRLに書き出してから読み込んでください。`);
    if (ext === 'bes' || ext === 'besx') return readBES(u8, ext);
    if (ext === 'pef') return readPEF(decodeText(buf));
    if (ext === 'bse' || ext === 'brl' || ext === 'brf' || ext === 'brt' || ext === 'txn') return readNABCC(u8, ext);
    if (ext === 'docx') return readDocxStructured(buf, opt || {});
    if (ext === 'xlsx' || ext === 'xlsm') return readXlsx(buf);
    if (ext === 'pdf') return readPDF(buf);
    if (/^(png|jpe?g|gif|bmp|webp)$/.test(ext)) return readImage(name, buf, opt || {});
    return fromPlainText(decodeText(buf), 'txt');
  }

  // ---------- Word（見出し・表・枠・区切り線・画像） ----------
  const FRAME_TOP = '┌────────────┐';
  const FRAME_BOTTOM = '└────────────┘';
  const RULE_LINE = '────────────';

  function paraText(p) {
    let t = '';
    const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/g;
    let m;
    while ((m = re.exec(p))) {
      if (m[1] !== undefined) t += xmlUnescape(m[1]);
      else if (m[0].startsWith('<w:tab')) t += ' ';
      else t += '\n';
    }
    return t;
  }

  async function readDocxStructured(buf, opt) {
    const JSZip = getJSZip();
    const zip = await JSZip.loadAsync(buf);
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('Wordファイルの本文が見つかりません。');
    const xml = (await docFile.async('string')).replace(/<w:del\b[\s\S]*?<\/w:del>/g, '');
    // スタイル名（見出し 1 など）と、画像のファイル名
    const styleName = {};
    const stylesFile = zip.file('word/styles.xml');
    if (stylesFile) {
      const sx = await stylesFile.async('string');
      for (const m of sx.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
        const n = /<w:name w:val="([^"]+)"/.exec(m[2]);
        const lvl = /<w:outlineLvl w:val="(\d)"/.exec(m[2]);
        styleName[m[1]] = { name: n ? n[1] : m[1], outline: lvl ? +lvl[1] : null };
      }
    }
    const rels = {};
    const relFile = zip.file('word/_rels/document.xml.rels');
    if (relFile) {
      const rx = await relFile.async('string');
      for (const m of rx.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels[m[1]] = m[2];
      for (const m of rx.matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) rels[m[2]] = m[1];
    }
    const headingLevel = p => {
      const st = /<w:pStyle w:val="([^"]+)"/.exec(p);
      const own = /<w:outlineLvl w:val="(\d)"/.exec(p);
      let lvl = own ? +own[1] : null;
      if (st) {
        const info = styleName[st[1]] || { name: st[1], outline: null };
        const n = info.name.toLowerCase();
        if (n === 'title' || n === '表題') return 1;
        const m = /(?:heading|見出し)\s*(\d)/.exec(n);
        if (m) return +m[1];
        if (lvl === null) lvl = info.outline;
      }
      return lvl !== null && lvl < 9 ? lvl + 1 : 0;
    };

    const lines = [], types = [], figures = [];
    let figNo = 0, inBox = false;
    const push = (text, type) => { lines.push(text); if (type) types.push([text, type]); };
    const closeBox = () => { if (inBox) { push(FRAME_BOTTOM); inBox = false; } };
    const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml);
    const blocks = (body ? body[1] : xml).match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) || [];
    for (const blk of blocks) {
      if (blk.startsWith('<w:tbl')) {
        // 表：枠で囲み、セルはタブで区切る（点字ではセルの間を2マスあける）
        closeBox();
        push(FRAME_TOP);
        for (const tr of blk.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || []) {
          const cells = (tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || []).map(tc =>
            (tc.match(/<w:p\b[\s\S]*?<\/w:p>/g) || []).map(paraText).join(' ').replace(/\s+/g, ' ').trim());
          push(cells.join('\t'));
        }
        push(FRAME_BOTTOM);
        continue;
      }
      const text = paraText(blk).replace(/\n+$/, '');
      // 画像
      const imgs = [...blk.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"|<v:imagedata\b[^>]*r:id="([^"]+)"/g)];
      // 段落の罫線：上下左右に線があれば枠、下（上）だけなら区切り線
      const bdr = /<w:pBdr>([\s\S]*?)<\/w:pBdr>/.exec(blk);
      const has = side => bdr && new RegExp('<w:' + side + '\\b(?![^>]*w:val="(?:nil|none)")').test(bdr[1]);
      const boxed = bdr && has('left') && has('right');
      if (boxed && !inBox) { push(FRAME_TOP); inBox = true; }
      if (!boxed) closeBox();
      if (bdr && !boxed && !text.trim() && (has('bottom') || has('top'))) { push(RULE_LINE); continue; }
      if (text.trim()) {
        const lvl = headingLevel(blk);
        for (const t of text.split('\n')) push(t, lvl ? 'h' + Math.min(3, lvl) : null);
      } else if (!imgs.length) push('');
      for (const im of imgs) {
        const target = rels[im[1] || im[2]];
        if (!target) continue;
        figNo++;
        const label = `図${figNo}`;
        push(`［図：${label}］`);
        const f = zip.file('word/' + target.replace(/^\.?\//, '')) || zip.file(target.replace(/^\//, ''));
        if (f && root.TenjiFigure && typeof Blob !== 'undefined') {
          try {
            const blob = new Blob([await f.async('uint8array')]);
            const linesOfDots = await root.TenjiFigure.imageToCells(blob, { maxCols: (opt.cols || 32) - 4, maxLines: (opt.lines || 18) - 3 });
            figures.push([label, { lines: linesOfDots.map(l => '⠀⠀' + l), alt: target.split('/').pop(), blob }]);
          } catch (e) { /* 読めない画像（EMF など）は点図にしない */ }
        }
      }
    }
    closeBox();
    const note = figNo ? `画像が${figNo}点ありました。右側で点図に変えています（線画向き。写真は形が崩れることがあります）。` : '';
    return { kind: 'docx', mode: 'sumiji', raw: lines.join('\n'), rawKind: 'text', types, figures, note };
  }

  // ---------- 画像（1枚の図として読み込む） ----------
  async function readImage(name, buf, opt) {
    if (!root.TenjiFigure || typeof Blob === 'undefined') throw new Error('画像はブラウザ版・デスクトップ版でだけ読み込めます。');
    const blob = new Blob([buf]);
    const lines = await root.TenjiFigure.imageToCells(blob, { maxCols: (opt.cols || 32) - 4, maxLines: (opt.lines || 18) - 3 });
    const label = name.replace(/\.[^.]+$/, '');
    return { kind: 'image', mode: 'sumiji', raw: `［図：${label}］`, rawKind: 'text', types: [],
      figures: [[label, { lines: lines.map(l => '⠀⠀' + l), alt: name, blob }]],
      note: '画像を1枚の図として読み込みました。図の行の「点図ファイルに書き出す」で、点図プリンタ用・立体コピー用のPDFにできます。' };
  }

  // ---------- Excel（シートごとに見出し＋表） ----------
  async function readXlsx(buf) {
    const JSZip = getJSZip();
    const zip = await JSZip.loadAsync(buf);
    const wb = zip.file('xl/workbook.xml');
    if (!wb) throw new Error('Excelファイルの中身が見つかりません。');
    const wbx = await wb.async('string');
    const relx = zip.file('xl/_rels/workbook.xml.rels') ? await zip.file('xl/_rels/workbook.xml.rels').async('string') : '';
    const rels = {};
    for (const m of relx.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = /Id="([^"]+)"/.exec(m[1]), tg = /Target="([^"]+)"/.exec(m[1]);
      if (id && tg) rels[id[1]] = tg[1];
    }
    const shared = [];
    const ss = zip.file('xl/sharedStrings.xml');
    if (ss) {
      const sx = await ss.async('string');
      for (const si of sx.match(/<si>[\s\S]*?<\/si>/g) || []) {
        shared.push((si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => xmlUnescape(t.replace(/<[^>]+>/g, ''))).join(''));
      }
    }
    const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
    const lines = [], types = [];
    for (const m of wbx.matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const name = xmlUnescape((/name="([^"]*)"/.exec(m[1]) || [])[1] || 'シート');
      const rid = (/r:id="([^"]+)"/.exec(m[1]) || [])[1];
      let target = rels[rid] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const f = zip.file(target);
      if (!f) continue;
      const sx = await f.async('string');
      const rows = [];
      for (const r of sx.match(/<row\b[\s\S]*?<\/row>/g) || []) {
        const cells = [];
        for (const c of r.match(/<c\b[^>]*\/>|<c\b[\s\S]*?<\/c>/g) || []) {
          const ref = (/r="([A-Z]+\d+)"/.exec(c) || [])[1];
          const t = (/\bt="([^"]+)"/.exec(c) || [])[1];
          const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
          let val = '';
          if (t === 's' && v !== undefined) val = shared[+v] || '';
          else if (t === 'inlineStr') val = xmlUnescape(((/<t\b[^>]*>([\s\S]*?)<\/t>/.exec(c)) || [])[1] || '');
          else if (v !== undefined) val = xmlUnescape(v);
          const idx = ref ? colIndex(ref) : cells.length;
          cells[idx] = val;
        }
        const arr = Array.from(cells, x => x || '');
        if (arr.some(x => x.trim())) rows.push(arr);
      }
      if (!rows.length) continue;
      if (lines.length) lines.push('');
      lines.push(name); types.push([name, 'h2']);
      lines.push(FRAME_TOP);
      for (const r of rows) lines.push(r.join('\t').replace(/\t+$/, ''));
      lines.push(FRAME_BOTTOM);
    }
    if (!lines.length) throw new Error('Excelファイルに文字の入ったセルがありません。');
    return { kind: 'xlsx', mode: 'sumiji', raw: lines.join('\n'), rawKind: 'text', types, figures: [],
      note: '各シートを中見出しにして、表を枠で囲みました。セルの間は点字で2マスあけます。' };
  }

  // ---------- PDF（文字を取り出す。原本のページ番号つき） ----------
  async function readPDF(buf) {
    if (!SCRIPT_BASE) throw new Error('PDFはブラウザ版・デスクトップ版でだけ読み込めます。');
    const pdfjs = await import(new URL('../vendor/pdfjs/pdf.mjs', SCRIPT_BASE).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.mjs', SCRIPT_BASE).href;
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      cMapUrl: new URL('../vendor/pdfjs/cmaps/', SCRIPT_BASE).href,
      cMapPacked: true
    }).promise;
    const lines = [], types = [];
    let imageCount = 0, textChars = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      // 同じ高さの文字を1行にまとめる
      const items = tc.items.filter(it => it.str !== undefined);
      const rowsOfPage = [];
      for (const it of items) {
        const y = it.transform[5], x = it.transform[4], h = Math.abs(it.transform[3]) || it.height || 10;
        let row = rowsOfPage.find(r => Math.abs(r.y - y) < h * 0.5);
        if (!row) { row = { y, h, parts: [] }; rowsOfPage.push(row); }
        row.parts.push({ x, str: it.str, w: it.width || 0 });
        row.h = Math.max(row.h, h);
      }
      rowsOfPage.sort((a, b) => b.y - a.y);
      const texts = rowsOfPage.map(r => {
        r.parts.sort((a, b) => a.x - b.x);
        let s = '', end = null;
        for (const pt of r.parts) {
          if (end !== null && pt.x - end > r.h * 0.6 && /[A-Za-z0-9]$/.test(s)) s += ' ';
          s += pt.str; end = pt.x + pt.w;
        }
        return { text: s.trim(), h: r.h, y: r.y };
      }).filter(r => r.text);
      textChars += texts.reduce((a, r) => a + r.text.length, 0);
      const ops = await page.getOperatorList();
      for (const fn of ops.fnArray) if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject) imageCount++;
      lines.push(`［原本 ${p}］`);
      const hs = texts.map(r => r.h).sort((a, b) => a - b);
      const median = hs.length ? hs[Math.floor(hs.length / 2)] : 10;
      // 見た目の改行はつなげて段落にする（文の終わり・大きい文字・行間があいたところで区切る）
      let para = '', prev = null;
      const flush = () => { if (para) { lines.push(para); para = ''; } };
      for (const r of texts) {
        const big = r.h > median * 1.25;
        const gap = prev && (prev.y - r.y) > Math.max(prev.h, r.h) * 1.8;
        if (big) { flush(); lines.push(r.text); types.push([r.text, r.h > median * 1.6 ? 'h1' : 'h2']); prev = r; continue; }
        if (gap || (prev && prev.big)) flush();
        para += (para && /[A-Za-z0-9]$/.test(para) && /^[A-Za-z0-9]/.test(r.text) ? ' ' : '') + r.text;
        if (/[。．！？!?」』]$/.test(r.text)) flush();
        prev = { ...r, big };
      }
      flush();
    }
    if (!textChars) throw new Error('このPDFには文字の情報がありません（画像だけのPDF・スキャンしたPDFは読み込めません）。');
    const note = '原本のページの区切りを「［原本 ○］」として残しています。' + (imageCount ? `PDFの中の画像（${imageCount}点）は読み込んでいません。必要ならWordから読み込むか、図の説明を書き足してください。` : '');
    return { kind: 'pdf', mode: 'sumiji', raw: lines.join('\n'), rawKind: 'text', types, figures: [], note };
  }

  function fromPlainText(text, kind) {
    text = text.replace(/\r\n?/g, '\n');
    if (isBrailleUnicode(text)) {
      const rows = unicodeTextToRows(text);
      return { kind, mode: 'braille', raw: rowsToUnicodeText(rows), rawKind: 'unicode', rows };
    }
    return { kind, mode: 'sumiji', raw: text, rawKind: 'text' };
  }

  function readNABCC(u8, ext) {
    // BASE形式などで先頭に書式情報（日本語の見出しなど）が付く場合は、点字として扱わずに別に取り出す
    let start = 0;
    let note = '';
    const lineEnd = i => { while (i < u8.length && u8[i] !== 0x0a) i++; return i; };
    for (let guard = 0; guard < 4 && start < u8.length; guard++) {
      const end = lineEnd(start);
      const line = u8.subarray(start, end);
      const bad = Array.from(line).some(b => b >= 0x80 || (b < 0x20 && b !== 0x0d && b !== 0x0c && b !== 0x09));
      if (!bad) break;
      note += decodeText(line.slice().buffer).replace(/\r/g, '') + '\n';
      start = end + 1;
    }
    const text = latin1(u8.subarray(start));
    const rows = nabccTextToRows(text);
    const raw = text.replace(/\r/g, '').replace(/\f/g, '\n' + PAGE_MARK + '\n').replace(/\n\n(?=［改ページ］)/g, '\n');
    return { kind: ext, mode: 'braille', raw, rawKind: 'nabcc', rows, note: note.trim() ? `先頭の書式情報：${note.trim()}` : '' };
  }

  function readBES(u8, ext) {
    if (u8.length <= BES_HEADER_SIZE) throw new Error('BESファイルの中身が空か、壊れています。');
    const rows = [];
    let cur = '';
    for (let i = BES_HEADER_SIZE; i < u8.length; i++) {
      const b = u8[i];
      if (b >= 0xa0 && b <= 0xdf) cur += E.bitsCell(b - 0xa0);
      else if (b === 0xfe || b === 0x0c) { rows.push({ cells: cur }); cur = ''; }
      else if (b === 0xfd) { if (cur) rows.push({ cells: cur }); cur = ''; rows.push({ pagebreak: true }); }
      else if (b === 0xf4) { rows.push({ cells: cur }); cur = ''; }
      // それ以外（0x0d や図形データなど）は読み飛ばす
    }
    if (cur) rows.push({ cells: cur });
    const clean = trimTail(rows);
    const note = ext === 'besx' ? 'BESXの校正情報・下調べ情報は読み込まず、点字本文だけを表示しています。' : '';
    return { kind: ext, mode: 'braille', raw: rowsToUnicodeText(clean), rawKind: 'unicode', rows: clean, note };
  }

  function readPEF(xml) {
    const rows = [];
    const pages = xml.match(/<page\b[\s\S]*?<\/page>|<page\b[^>]*\/>/g) || [];
    pages.forEach((p, idx) => {
      if (idx > 0) rows.push({ pagebreak: true });
      const rs = p.match(/<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) || [];
      for (const r of rs) {
        const m = /<row\b[^>]*>([\s\S]*?)<\/row>/.exec(r);
        rows.push({ cells: m ? Array.from(m[1]).filter(c => c >= '⠀' && c <= '⣿').join('') : '' });
      }
    });
    const clean = trimTail(rows);
    return { kind: 'pef', mode: 'braille', raw: rowsToUnicodeText(clean), rawKind: 'unicode', rows: clean };
  }

  const xmlUnescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
  const xmlEscape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  async function readDocxText(buf) {
    const JSZip = getJSZip();
    const zip = await JSZip.loadAsync(buf);
    const f = zip.file('word/document.xml');
    if (!f) throw new Error('Wordファイルの本文が見つかりません。');
    const xml = await f.async('string');
    const body = xml.replace(/<w:del\b[\s\S]*?<\/w:del>/g, ''); // 削除済みの変更履歴は除く
    const paras = body.match(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) || [];
    const lines = [];
    for (const p of paras) {
      let t = '';
      const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/g;
      let m;
      while ((m = re.exec(p))) {
        if (m[1] !== undefined) t += xmlUnescape(m[1]);
        else if (m[0].startsWith('<w:tab')) t += ' ';
        else t += '\n';
      }
      lines.push(t);
    }
    return lines.join('\n');
  }

  // 左ペインを編集したあとに読み直す
  function parseRaw(raw, rawKind) {
    if (rawKind === 'nabcc') return nabccTextToRows(raw);
    if (rawKind === 'unicode') return unicodeTextToRows(raw);
    return null;
  }

  // ---------- 書き出し ----------
  const enc = s => new TextEncoder().encode(s);
  const withBOM = s => '﻿' + s;

  function nabccFile(pages, lower) {
    return enc(pages.map(p => p.map(l => E.cellsToAscii(l, lower).replace(/ +$/, '')).join('\r\n')).join('\r\n\f') + '\r\n');
  }
  function besFile(pages) {
    const bytes = new Array(BES_HEADER_SIZE).fill(0);
    pages.forEach(p => {
      p.forEach(l => {
        for (const c of l) bytes.push(0xa0 + (E.cellBits(c) & 63));
        bytes.push(0xfe);
      });
      bytes.push(0xfd);
    });
    return new Uint8Array(bytes);
  }
  function pefFile(pages, opt) {
    const today = new Date().toISOString().slice(0, 10);
    const id = 'tenji-editor-' + Date.now();
    const rowXml = l => `<row>${l}</row>`;
    return enc(`<?xml version="1.0" encoding="UTF-8"?>
<pef version="2008-1" xmlns="http://www.daisy.org/ns/2008/pef">
  <head>
    <meta xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/x-pef+xml</dc:format>
      <dc:identifier>${id}</dc:identifier>
      <dc:title>${xmlEscape(opt.title || '点字文書')}</dc:title>
      <dc:language>ja</dc:language>
      <dc:date>${today}</dc:date>
    </meta>
  </head>
  <body>
    <volume cols="${opt.cols}" rows="${opt.lines}" rowgap="0" duplex="true">
      <section>
${pages.map(p => '        <page>\n' + p.map(l => '          ' + rowXml(l)).join('\n') + '\n        </page>').join('\n')}
      </section>
    </volume>
  </body>
</pef>
`);
  }

  async function docxFile(lines, font) {
    const JSZip = getJSZip();
    const zip = new JSZip();
    const rFont = font ? `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/></w:rPr>` : '';
    const paras = lines.map(l => {
      if (l === null) return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      return `<w:p><w:r>${rFont}<w:t xml:space="preserve">${xmlEscape(l)}</w:t></w:r></w:p>`;
    }).join('');
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return zip.generateAsync({ type: 'uint8array' });
  }

  // 書き出し形式の一覧
  const EXPORTS = [
    { id: 'bse', label: 'BSE（BASE形式）', ext: 'bse', group: '点字', note: 'T・エディタ、ういんびー、点字編集システム、点字ディスプレイ等で読めるテキスト型' },
    { id: 'brl', label: 'BRL（NABCC）', ext: 'brl', group: '点字', note: 'NABCCのテキスト。多くの点字ソフト・点字ディスプレイ・点字プリンタで読める' },
    { id: 'brf', label: 'BRF（Braille Ready）', ext: 'brf', group: '点字', note: '英語圏標準。Duxbury、BrailleBlaster、各種点字ディスプレイ向け' },
    { id: 'pef', label: 'PEF', ext: 'pef', group: '点字', note: 'XML形式の国際規格（ページ・行の情報つき）' },
    { id: 'bes', label: 'BES（試験的）', ext: 'bes', group: '点字', note: 'ヘッダの仕様が非公開のため試験的な出力です。点字編集システムで開けるかは保証できません' },
    { id: 'txt-braille', label: 'テキスト（点字Unicode）', ext: 'txt', group: '点字', note: '点字の形をUnicode点字文字で保存' },
    { id: 'docx-braille', label: 'Word（点字Unicode）', ext: 'docx', group: '点字', note: '点字の形をWordに貼った版' },
    { id: 'txt-kana', label: 'テキスト（かな分かち書き）', ext: 'txt', group: '墨字', note: '点字を墨字に起こしたもの' },
    { id: 'docx-kana', label: 'Word（かな分かち書き）', ext: 'docx', group: '墨字', note: '点字を墨字に起こしたもの' },
    { id: 'txt-table', label: 'テキスト（対照表）', ext: 'txt', group: '墨字', note: '原文・かな・点字を1行ずつ並べた確認用' }
  ];

  // 行を墨字（かな）にしたもの。飾りは ─ ┌ ┐ などの形、図は［図］にする
  function rowCells(r, opt) {
    if (E.DECOR_TYPES.has(r.type)) return r.fixed ? r.cells : E.decorCells(r.type, opt.cols);
    if (r.type === 'figure') return (r.figure || []).join('\r\n');
    return r.cells || '';
  }
  function rowText(r, opt) {
    if (E.DECOR_TYPES.has(r.type)) return E.decorText(r.type, rowCells(r, opt));
    if (r.type === 'figure') return '［図' + (r.alt ? '：' + r.alt : '') + '］';
    return (r.kana || '').replace(/⦅/g, '【点訳者注：').replace(/⦆/g, '】');
  }

  // rows: アプリの行モデル [{src, kana, cells, pagebreak, para, type}]
  async function exportFile(id, rows, opt) {
    const pages = E.layoutPages(rows, opt);
    switch (id) {
      case 'bse': return nabccFile(pages, true);
      case 'brl': return nabccFile(pages, true);
      case 'brf': return nabccFile(pages, false);
      case 'pef': return pefFile(pages, opt);
      case 'bes': return besFile(pages);
      case 'txt-braille': return enc(withBOM(pages.map(p => p.join('\r\n')).join('\r\n\f')) + '\r\n');
      case 'docx-braille': {
        const lines = [];
        pages.forEach((p, i) => { if (i) lines.push(null); lines.push(...p); });
        return docxFile(lines, 'Segoe UI Symbol');
      }
      case 'txt-kana': return enc(withBOM(rows.filter(r => r.type !== 'genpon' && r.type !== 'pageno').map(r => r.pagebreak ? '' : rowText(r, opt)).join('\r\n')) + '\r\n');
      case 'docx-kana': return docxFile(rows.filter(r => r.type !== 'genpon' && r.type !== 'pageno').map(r => r.pagebreak ? null : rowText(r, opt)));
      case 'txt-table': return enc(withBOM(rows.filter(r => !r.pagebreak).map((r, i) =>
        `[${i + 1}]\r\n原文：${r.src || ''}\r\nかな：${rowText(r, opt)}\r\n点字：${rowCells(r, opt)}\r\n`).join('\r\n')));
    }
    throw new Error('未対応の書き出し形式です: ' + id);
  }

  // 墨字の文章をそのまま保存する
  const textFile = text => enc(withBOM(text.replace(/\r?\n/g, '\r\n')) + '\r\n');
  const docxFromText = text => docxFile(text.replace(/\r/g, '').split('\n'));

  const api = { readFile, parseRaw, exportFile, textFile, docxFromText, readXlsx, readDocxStructured, EXPORTS, KINDS, UNSUPPORTED, PAGE_MARK, extOf, decodeText, readDocxText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TenjiFormats = api;
})(typeof self !== 'undefined' ? self : this);
