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
    bmt: 'ブレイルメモ', nab: 'コータクン', bet: 'ないーぶネット旧形式', doc: '旧Word（.doc）', xls: '旧Excel（.xls）。Excelで .xlsx か .csv に保存し直してから'
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
    if (ext === 'xls' || ext === 'doc') throw new Error(`${ext === 'xls' ? '古いExcel' : '古いWord'}の形式（.${ext}）は読み込めません。${ext === 'xls' ? 'Excelで「名前を付けて保存」から .xlsx か .csv' : 'Wordで「名前を付けて保存」から .docx'} にしてから開いてください。`);
    if (UNSUPPORTED[ext]) throw new Error(`${UNSUPPORTED[ext]}の形式（.${ext}）は仕様が公開されていないため読み込めません。元のソフトでBSEやBRLに書き出してから読み込んでください。`);
    if (ext === 'bes' || ext === 'besx') return readBES(u8, ext);
    if (ext === 'pef') return readPEF(decodeText(buf));
    if (ext === 'bse' || ext === 'brl' || ext === 'brf' || ext === 'brt' || ext === 'txn') return readNABCC(u8, ext);
    if (ext === 'docx') return readDocxStructured(buf, opt || {});
    if (ext === 'xlsx' || ext === 'xlsm') return readXlsx(buf, opt || {});
    if (ext === 'csv' || ext === 'tsv') return readCSV(name, buf);
    if (ext === 'pdf') return readPDF(buf, opt || {});
    if (ext === 'edl') return readEDL(name, buf, opt || {});
    if (/^(png|jpe?g|gif|bmp|webp)$/.test(ext)) return readImage(name, buf, opt || {});
    return fromPlainText(decodeText(buf), 'txt');
  }

  // ---------- 図（画像）とグラフの共通処理 ----------
  // 画像1つを図にする：線画は本文の点字の中に描き、写真は点図（別ファイル）にする
  async function makeFigure(blob, no, alt, opt) {
    const info = { lines: null, alt: alt || '', blob, kind: 'drawing', no };
    if (!root.TenjiFigure || typeof Blob === 'undefined' || !blob) return info;
    try {
      info.kind = await root.TenjiFigure.classifyImage(blob);
      const cells = await root.TenjiFigure.imageToCells(blob, { maxCols: (opt.cols || 32) - 4, maxLines: (opt.lines || 18) - 3 });
      info.lines = cells.map(l => '⠀⠀' + l);
    } catch (e) { /* 読めない画像（EMF など）は点図にしない */ }
    return info;
  }

  // グラフ（Office の chart XML）→ { 種類, 題, 項目, 系列 }
  const CHART_KINDS = [
    ['barChart', '棒グラフ'], ['bar3DChart', '棒グラフ'], ['lineChart', '折れ線グラフ'], ['line3DChart', '折れ線グラフ'],
    ['pieChart', '円グラフ'], ['pie3DChart', '円グラフ'], ['doughnutChart', 'ドーナツグラフ'], ['areaChart', '面グラフ'],
    ['area3DChart', '面グラフ'], ['scatterChart', '散布図'], ['radarChart', 'レーダーチャート'], ['bubbleChart', 'バブルチャート']
  ];
  const tagTexts = (xml, tag) => [...xml.matchAll(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'g'))].map(m => xmlUnescape(m[1]));
  function cachePoints(xml) {
    const pts = [];
    for (const m of xml.matchAll(/<pt\b[^>]*idx="(\d+)"[^>]*>[\s\S]*?<v>([\s\S]*?)<\/v>/g)) pts[+m[1]] = xmlUnescape(m[2]);
    return pts;
  }
  // タグの接頭辞（c: a: xdr: など）を外す。ファイルを作ったソフトによって付け方が違うため
  const stripPrefixes = xml => xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1');
  function parseChartXml(xml) {
    xml = stripPrefixes(xml);
    let kind = 'グラフ';
    for (const [tag, label] of CHART_KINDS) {
      const m = new RegExp('<' + tag + '\\b[\\s\\S]*?</' + tag + '>').exec(xml);
      if (!m) continue;
      kind = label;
      if (/^bar/.test(tag) && /<barDir val="bar"/.test(m[0])) kind = '横棒グラフ';
      break;
    }
    const titleM = /<title>([\s\S]*?)<\/title>/.exec(xml);
    const title = titleM ? (tagTexts(titleM[1], 't').join('') || tagTexts(titleM[1], 'v').join('')).trim() : '';
    const series = [];
    let cats = [];
    for (const ser of xml.match(/<ser>[\s\S]*?<\/ser>/g) || []) {
      const txM = /<tx>([\s\S]*?)<\/tx>/.exec(ser);
      const name = txM ? (tagTexts(txM[1], 'v')[0] || tagTexts(txM[1], 't').join('')) : '';
      const catM = /<(?:cat|xVal)>([\s\S]*?)<\/(?:cat|xVal)>/.exec(ser);
      const valM = /<(?:val|yVal)>([\s\S]*?)<\/(?:val|yVal)>/.exec(ser);
      const c = catM ? cachePoints(catM[1]) : [];
      if (c.length > cats.length) cats = c;
      const fOf = mm => mm ? xmlUnescape(((/<f>([\s\S]*?)<\/f>/.exec(mm[1])) || [])[1] || '') : '';
      series.push({ name: name.trim() || '', nameRef: txM ? fOf(txM) : '', catRef: fOf(catM), valRef: fOf(valM),
        vals: valM ? cachePoints(valM[1]) : [] });
    }
    return { kind, title, cats, series };
  }
  // グラフの中に数値の控えがないとき、参照しているセル（例：Sheet1!$B$2:$B$5）から読む
  function fillChartFromCells(ch, lookup) {
    if (!lookup) return ch;
    for (const s of ch.series) {
      if (!s.vals.length && s.valRef) s.vals = lookup(s.valRef);
      if (!ch.cats.length && s.catRef) ch.cats = lookup(s.catRef);
      if (!s.name && s.nameRef) s.name = (lookup(s.nameRef)[0] || '');
    }
    ch.series.forEach((s, i) => { if (!s.name) s.name = `系列${i + 1}`; });
    return ch;
  }
  const fmtNum = v => {
    if (v === undefined || v === '') return '';
    const n = Number(v);
    if (!isFinite(n) || /[^0-9.eE+\-]/.test(String(v))) return String(v);
    return String(Math.round(n * 100) / 100);
  };
  // グラフを、点字で読める表（枠つき）の行にする
  function chartLines(ch, push, label) {
    const head = `${label}　${ch.kind}${ch.title ? '：' + ch.title : ''}`;
    push(head, 'h3');
    ch.series.forEach((s, i) => { if (!s.name) s.name = `系列${i + 1}`; });
    const n = Math.max(ch.cats.length, ...ch.series.map(s => s.vals.length), 0);
    if (!n) { push('（グラフのデータを取り出せませんでした）'); return; }
    push(FRAME_TOP);
    const pie = /円|ドーナツ/.test(ch.kind) && ch.series.length === 1;
    const total = pie ? ch.series[0].vals.reduce((a, v) => a + (Number(v) || 0), 0) : 0;
    push(['項目', ...ch.series.map(s => s.name), ...(pie && total ? ['割合'] : [])].join('\t'));
    for (let i = 0; i < n; i++) {
      const cells = [ch.cats[i] !== undefined ? ch.cats[i] : String(i + 1), ...ch.series.map(s => fmtNum(s.vals[i]))];
      if (pie && total) cells.push(Math.round((Number(ch.series[0].vals[i]) || 0) / total * 1000) / 10 + '%');
      push(cells.join('\t'));
    }
    push(FRAME_BOTTOM);
  }
  const zipPath = (base, target) => {
    if (target.startsWith('/')) return target.slice(1);
    const parts = base.split('/'); parts.pop();
    for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
    return parts.join('/');
  };
  async function relsOf(zip, partPath) {
    const dir = partPath.split('/'); const file = dir.pop();
    const f = zip.file([...dir, '_rels', file + '.rels'].join('/'));
    const map = {};
    if (!f) return map;
    const x = await f.async('string');
    for (const m of x.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = /Id="([^"]+)"/.exec(m[1]), tg = /Target="([^"]+)"/.exec(m[1]);
      if (id && tg) map[id[1]] = zipPath(partPath, tg[1]);
    }
    return map;
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
    let figNo = 0, inBox = false, chartCount = 0, photoCount = 0;
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
      // グラフ：データを取り出して、点字の表にする
      for (const cm of blk.matchAll(/<(?:\w+:)?chart\b[^>]*r:id="([^"]+)"/g)) {
        const target = rels[cm[1]];
        const f = target && (zip.file('word/' + target.replace(/^\.?\//, '')) || zip.file(target.replace(/^\//, '')));
        if (!f) continue;
        figNo++; chartCount++;
        chartLines(parseChartXml(await f.async('string')), push, `図${figNo}`);
      }
      for (const im of imgs) {
        const target = rels[im[1] || im[2]];
        if (!target) continue;
        figNo++;
        const label = `図${figNo}`;
        push(`［図：${label}］`);
        const f = zip.file('word/' + target.replace(/^\.?\//, '')) || zip.file(target.replace(/^\//, ''));
        const blob = f && typeof Blob !== 'undefined' ? new Blob([await f.async('uint8array')]) : null;
        const info = await makeFigure(blob, figNo, target.split('/').pop(), opt);
        if (info.kind === 'photo') photoCount++;
        figures.push([label, info]);
      }
    }
    closeBox();
    return { kind: 'docx', mode: 'sumiji', raw: lines.join('\n'), rawKind: 'text', types, figures, note: figureNote(figures, chartCount) };
  }

  function figureNote(figures, chartCount) {
    const photos = figures.filter(f => f[1].kind === 'photo').length, drawings = figures.length - photos;
    const parts = [];
    if (chartCount) parts.push(`グラフ${chartCount}点はデータの表にして点字にしました`);
    if (drawings) parts.push(`図${drawings}点は点字のマスで描いた点図にしました`);
    if (photos) parts.push(`写真${photos}点は点図（別ファイル）にして右側に表示しています`);
    return parts.length ? parts.join('。') + '。書き出すときに、点図データも一緒に出力できます。' : '';
  }

  // ---------- 画像（1枚の図として読み込む） ----------
  async function readImage(name, buf, opt) {
    if (!root.TenjiFigure || typeof Blob === 'undefined') throw new Error('画像はブラウザ版・デスクトップ版でだけ読み込めます。');
    const info = await makeFigure(new Blob([buf]), 1, name, opt);
    return { kind: 'image', mode: 'sumiji', raw: '［図：図1］', rawKind: 'text', types: [],
      figures: [['図1', info]], note: figureNote([['図1', info]], 0) };
  }

  // ---------- Excel（シートごとに見出し＋表） ----------
  // セルの表示形式（日付・パーセント）
  const DATE_FMT_IDS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  function excelDate(serial, withTime) {
    const ms = Math.round((Number(serial) - 25569) * 86400000);
    const d = new Date(ms);
    if (isNaN(d)) return String(serial);
    let s = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
    if (withTime && (d.getUTCHours() || d.getUTCMinutes())) s += ` ${d.getUTCHours()}時${String(d.getUTCMinutes()).padStart(2, '0')}分`;
    return s;
  }

  async function readXlsx(buf, opt) {
    opt = opt || {};
    const JSZip = getJSZip();
    const zip = await JSZip.loadAsync(buf);
    const wb = zip.file('xl/workbook.xml');
    if (!wb) throw new Error('Excelファイルの中身が見つかりません。');
    const wbx = await wb.async('string');
    const rels = await relsOf(zip, 'xl/workbook.xml');
    const shared = [];
    const ss = zip.file('xl/sharedStrings.xml');
    if (ss) {
      const sx = await ss.async('string');
      for (const si of sx.match(/<si>[\s\S]*?<\/si>/g) || []) {
        shared.push((si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => xmlUnescape(t.replace(/<[^>]+>/g, ''))).join(''));
      }
    }
    // 書式番号 → 日付／パーセントかどうか
    const styleKind = [];
    const st = zip.file('xl/styles.xml');
    if (st) {
      const sx = await st.async('string');
      const custom = {};
      for (const m of sx.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom[+m[1]] = xmlUnescape(m[2]);
      const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(sx);
      for (const m of (xfs ? xfs[1] : '').matchAll(/<xf\b[^>]*?numFmtId="(\d+)"/g)) {
        const id = +m[1], code = (custom[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
        if (DATE_FMT_IDS.has(id) || /[yd]|m{3,}|ge|e{2}/i.test(code)) styleKind.push(/[hs]/i.test(code) || id === 22 ? 'datetime' : 'date');
        else if (id === 9 || id === 10 || /%/.test(code)) styleKind.push('percent');
        else styleKind.push('');
      }
    }
    const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
    const lines = [], types = [], figures = [];
    let figNo = 0, chartCount = 0;
    const push = (text, type) => { lines.push(text); if (type) types.push([text, type]); };
    const sheets = [];
    const grids = {};
    for (const m of wbx.matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const name = xmlUnescape((/name="([^"]*)"/.exec(m[1]) || [])[1] || 'シート');
      const rid = (/r:id="([^"]+)"/.exec(m[1]) || [])[1];
      const target = rels[rid];
      const f = target && zip.file(target);
      if (!f) continue;
      const sx = await f.async('string');
      const rows = [];
      const grid = grids[name] = {};
      for (const r of sx.match(/<row\b[\s\S]*?<\/row>/g) || []) {
        const cells = [];
        for (const c of r.match(/<c\b[^>]*\/>|<c\b[\s\S]*?<\/c>/g) || []) {
          const ref = (/r="([A-Z]+\d+)"/.exec(c) || [])[1];
          const t = (/\bt="([^"]+)"/.exec(c) || [])[1];
          const sIdx = (/\bs="(\d+)"/.exec(c) || [])[1];
          const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
          let val = '';
          if (t === 's' && v !== undefined) val = shared[+v] || '';
          else if (t === 'inlineStr') val = xmlUnescape(((/<t\b[^>]*>([\s\S]*?)<\/t>/.exec(c)) || [])[1] || '');
          else if (v !== undefined) {
            val = xmlUnescape(v);
            const kind = sIdx !== undefined ? styleKind[+sIdx] : '';
            if ((kind === 'date' || kind === 'datetime') && t !== 'str' && isFinite(Number(val))) val = excelDate(val, kind === 'datetime');
            else if (kind === 'percent' && isFinite(Number(val))) val = Math.round(Number(val) * 1000) / 10 + '%';
            else if (t !== 'str' && t !== 'b' && /^-?\d+\.\d{6,}$/.test(val)) val = String(Math.round(Number(val) * 10000) / 10000);
          }
          const idx = ref ? colIndex(ref) : cells.length;
          cells[idx] = val;
          if (ref) grid[ref] = val;
        }
        const arr = Array.from(cells, x => x || '');
        if (arr.some(x => x.trim())) rows.push(arr);
      }
      // シートの上に置かれたグラフと画像
      const drawings = [];
      const srels = await relsOf(zip, target);
      for (const dm of sx.matchAll(/<drawing\b[^>]*r:id="([^"]+)"/g)) {
        const dpath = srels[dm[1]];
        const df = dpath && zip.file(dpath);
        if (!df) continue;
        const dx = stripPrefixes(await df.async('string'));
        const drels = await relsOf(zip, dpath);
        for (const anc of dx.match(/<(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/\1>/g) || []) {
          const chart = /<chart\b[^>]*r:id="([^"]+)"/.exec(anc);
          const pic = /<blip\b[^>]*r:embed="([^"]+)"/.exec(anc);
          const descr = (/<cNvPr\b[^>]*descr="([^"]*)"/.exec(anc) || /<cNvPr\b[^>]*name="([^"]*)"/.exec(anc) || [])[1] || '';
          if (chart && drels[chart[1]]) drawings.push({ chart: drels[chart[1]] });
          else if (pic && drels[pic[1]]) drawings.push({ image: drels[pic[1]], descr: xmlUnescape(descr) });
        }
      }
      sheets.push({ name, rows, drawings });
    }
    // 参照（'シート名'!$B$2:$B$5）→ 値の並び
    const colName = n => { let s = ''; n++; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
    const lookup = ref => {
      const m = /^(?:'?((?:[^']|'')+?)'?!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(ref.trim());
      if (!m) return [];
      const g = grids[(m[1] || sheets[0] && sheets[0].name || '').replace(/''/g, "'")] || {};
      const c1 = colIndex(m[2] + '1'), r1 = +m[3], c2 = m[4] ? colIndex(m[4] + '1') : c1, r2 = m[5] ? +m[5] : r1;
      const out = [];
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(g[colName(c) + r] || '');
      return out;
    };
    for (const { name, rows, drawings } of sheets) {
      if (!rows.length && !drawings.length) continue;
      if (lines.length) push('');
      push(name, 'h2');
      if (rows.length) {
        push(FRAME_TOP);
        for (const r of rows) push(r.join('\t').replace(/\t+$/, ''));
        push(FRAME_BOTTOM);
      }
      for (const d of drawings) {
        figNo++;
        if (d.chart) {
          const cf = zip.file(d.chart);
          if (!cf) continue;
          chartCount++;
          chartLines(fillChartFromCells(parseChartXml(await cf.async('string')), lookup), push, `図${figNo}`);
        } else {
          const imf = zip.file(d.image);
          const blob = imf && typeof Blob !== 'undefined' ? new Blob([await imf.async('uint8array')]) : null;
          const label = `図${figNo}`;
          push(`［図：${label}］`);
          figures.push([label, await makeFigure(blob, figNo, d.descr || d.image.split('/').pop(), opt)]);
        }
      }
    }
    if (!lines.length) throw new Error('Excelファイルに文字の入ったセルがありません。');
    const extra = figureNote(figures, chartCount);
    return { kind: 'xlsx', mode: 'sumiji', raw: lines.join('\n'), rawKind: 'text', types, figures,
      note: '各シートを中見出しにして、表を枠で囲みました。セルの間は点字で2マスあけます。' + (extra ? ' ' + extra : '') };
  }

  // ---------- CSV（表として読み込む） ----------
  function readCSV(name, buf) {
    const text = decodeText(buf).replace(/\r\n?/g, '\n');
    const sep = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const body = rows.filter(r => r.some(c => c.trim())).map(r => r.map(c => c.replace(/\s+/g, ' ').trim()).join('\t').replace(/\t+$/, ''));
    if (!body.length) throw new Error('CSVファイルに中身がありません。');
    const title = name.replace(/\.[^.]+$/, '');
    return { kind: 'csv', mode: 'sumiji', raw: [title, FRAME_TOP, ...body, FRAME_BOTTOM].join('\n'), rawKind: 'text',
      types: [[title, 'h2']], figures: [], note: '表を枠で囲みました。セルの間は点字で2マスあけます。' };
  }

  // ---------- PDF（文字・画像・スキャンしたページ。原本のページ番号つき） ----------
  // 変換行列の掛け算（pdf.js と同じ並び [a b c d e f]）
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  // ページの中で画像が描かれる位置（PDF の座標）を、描画命令から調べる
  function pdfImageBoxes(ops, OPS) {
    const boxes = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args && args[0]) ctm = mul(ctm, args[0]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        boxes.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
      }
    }
    return boxes;
  }
  async function renderPdfPage(page, scale) {
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { canvas, vp };
  }
  const canvasBlob = c => new Promise(res => c.toBlob(res, 'image/png'));
  async function cropBlob(canvas, vp, box) {
    const r = vp.convertToViewportRectangle([box.x0, box.y0, box.x1, box.y1]);
    const x = Math.max(0, Math.floor(Math.min(r[0], r[2]))), y = Math.max(0, Math.floor(Math.min(r[1], r[3])));
    const w = Math.min(canvas.width - x, Math.ceil(Math.abs(r[2] - r[0]))), h = Math.min(canvas.height - y, Math.ceil(Math.abs(r[3] - r[1])));
    if (w < 8 || h < 8) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return canvasBlob(c);
  }

  // PDF の文字を、行（同じ高さ）と、その中の段（大きくあいたところで区切る）にまとめる
  function pdfTextRows(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4], h = Math.abs(it.transform[3]) || it.height || 10;
      let row = rows.find(r => Math.abs(r.y - y) < Math.min(r.h, h) * 0.5);
      if (!row) { row = { y, h, parts: [] }; rows.push(row); }
      row.parts.push({ x, str: it.str, w: it.width || 0, h });
      row.h = Math.max(row.h, h);
    }
    const out = [];
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      const segs = [];
      let cur = null;
      for (const pt of r.parts) {
        const gap = cur ? pt.x - cur.x1 : 0;
        if (cur && gap > Math.max(cur.h, pt.h) * 2 && pt.str.trim()) { segs.push(cur); cur = null; }
        if (!cur) { cur = { x0: pt.x, x1: pt.x + pt.w, text: pt.str, h: pt.h }; continue; }
        if (gap > Math.max(cur.h, pt.h) * 0.25 && /[A-Za-z0-9.,:;!?)]$/.test(cur.text) && /^[A-Za-z0-9(]/.test(pt.str)) cur.text += ' ';
        cur.text += pt.str; cur.x1 = Math.max(cur.x1, pt.x + pt.w); cur.h = Math.max(cur.h, pt.h);
      }
      if (cur) segs.push(cur);
      segs.forEach(g => { g.text = g.text.replace(/\s+/g, ' ').trim(); });
      const live = segs.filter(g => g.text);
      if (!live.length) continue;
      // 大きさの違う文字が横に並んでいるとき（見出しと小さなラベルなど）は別の行にする
      const hs = live.map(g => g.h);
      if (live.length >= 2 && Math.max(...hs) > Math.min(...hs) * 1.3) {
        for (const g of live) out.push({ y: r.y, h: g.h, segs: [g] });
      } else out.push({ y: r.y, h: r.h, segs: live });
    }
    return out;
  }
  // 2つの行が、同じ位置の段で並んでいるか（表やカードの続き）
  function sameColumns(a, b) {
    if (a.segs.length !== b.segs.length || a.segs.length < 2) return false;
    if (a.y - b.y > Math.max(a.h, b.h) * 6) return false;
    const pitch = Math.min(...a.segs.slice(1).map((g, i) => g.x0 - a.segs[i].x0));
    return a.segs.every((g, i) => {
      const h = b.segs[i];
      const overlap = Math.min(g.x1, h.x1) - Math.max(g.x0, h.x0) > 0;
      return overlap || Math.abs(g.x0 - h.x0) < pitch * 0.4;
    });
  }
  // 段組みの行のまとまりを、表・カードの並び・2段組みの文章・1行のどれかにする
  function layoutBlock(grp) {
    const cols = grp[0].segs.length, n = grp.length;
    const cells = grp.map(r => r.segs.map(g => g.text));
    const avg = cells.flat().reduce((a, t) => a + t.length, 0) / (n * cols);
    const stripArrow = t => t.replace(/^[>＞→⇒▶►]\s*/, '');
    if (n === 1) return { kind: 'line', lines: [{ text: cells[0].join('　'), type: 'body' }] };
    // 2段組みの文章（長い文が左右に並ぶ）：左の段を読んでから右の段
    if (cols === 2 && n >= 4 && avg > 14) {
      return { kind: 'columns', lines: [0, 1].map(c => ({ text: cells.map(r => r[c]).join(''), type: 'body' })) };
    }
    // カードの並び（番号や短いラベルが横に並び、その下に説明）：縦の列ごとに1行
    const labelRow = cells[0].every(t => /^(?:[0-9０-９]{1,3}[.)．]?|(?:STEP|Step|step|No\.?|Ｎｏ．?)\s*[0-9０-９]+|[A-ZＡ-Ｚ]|[①-⑳])$/.test(t));
    if (labelRow || (n < cols && n <= 3 && cols >= 3)) {
      return { kind: 'cards', lines: cells[0].map((_, c) => ({ text: cells.map(r => stripArrow(r[c])).filter(Boolean).join('　'), type: 'body' })) };
    }
    return { kind: 'table', lines: [{ text: FRAME_TOP, type: 'frame' }, ...cells.map(r => ({ text: r.join('\t'), type: 'table' })), { text: FRAME_BOTTOM, type: 'frame' }] };
  }

  async function readPDF(buf, opt) {
    opt = opt || {};
    if (!SCRIPT_BASE || typeof document === 'undefined') throw new Error('PDFはブラウザ版・デスクトップ版でだけ読み込めます。');
    const pdfjs = await import(new URL('../vendor/pdfjs/pdf.mjs', SCRIPT_BASE).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.mjs', SCRIPT_BASE).href;
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      cMapUrl: new URL('../vendor/pdfjs/cmaps/', SCRIPT_BASE).href,
      cMapPacked: true
    }).promise;
    const lines = [], types = [], figures = [];
    let figNo = 0, scannedPages = 0, textChars = 0, droppedHF = 0, tableCount = 0, cardCount = 0;
    const MAX_FIGURES = 200;
    const pages = [];
    // 1回目：ページごとに、文字の行（段組みの区切りつき）と画像を取り出す
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const view = page.view; // [x0, y0, x1, y1]
      const pageH = view[3] - view[1], pageArea = (view[2] - view[0]) * pageH;
      const rows = pdfTextRows(tc.items.filter(it => it.str !== undefined));
      const chars = rows.reduce((a, r) => a + r.segs.reduce((n, g) => n + g.text.length, 0), 0);
      textChars += chars;
      const figs = [];
      if (figNo < MAX_FIGURES) {
        const ops = await page.getOperatorList();
        let boxes = pdfImageBoxes(ops, pdfjs.OPS)
          .filter(b => (b.x1 - b.x0) >= 36 && (b.y1 - b.y0) >= 36) // 小さいアイコンや飾りは除く
          .filter(b => !(chars > 40 && (b.x1 - b.x0) * (b.y1 - b.y0) > pageArea * 0.8)); // 文字の下に敷いた背景・文字情報つきスキャンの画像は除く
        const scanned = chars < 20;
        if (scanned) { boxes = [{ x0: view[0], y0: view[1], x1: view[2], y1: view[3] }]; scannedPages++; }
        if (boxes.length) {
          const { canvas, vp } = await renderPdfPage(page, 2);
          for (const b of boxes) {
            if (figNo >= MAX_FIGURES) break;
            const blob = await cropBlob(canvas, vp, b);
            if (!blob) continue;
            figNo++;
            const info = await makeFigure(blob, figNo, scanned ? `${p}ページ全体` : `${p}ページの画像`, opt);
            if (scanned) info.kind = info.kind === 'drawing' ? 'drawing' : 'photo';
            figures.push([`図${figNo}`, info]);
            figs.push({ kind: 'figure', y: b.y1, label: `図${figNo}` }); // 図の上端の位置に入れる（段落の途中で切らない）
          }
        }
      }
      pages.push({ p, rows, figs, top: view[3], bottom: view[1], pageH });
    }
    // くり返し出てくるヘッダー・フッター（柱・ノンブル）を見つける
    const hfKey = t => t.replace(/[0-9０-９]+/g, '#').replace(/\s+/g, '');
    const edge = (pg, r) => r.y > pg.top - pg.pageH * 0.1 || r.y < pg.bottom + pg.pageH * 0.1;
    const keyPages = new Map();
    for (const pg of pages) for (const r of pg.rows) if (edge(pg, r)) {
      const k = hfKey(r.segs.map(g => g.text).join(' '));
      if (!keyPages.has(k)) keyPages.set(k, new Set());
      keyPages.get(k).add(pg.p);
    }
    const isPageNo = t => /^[-–—‐\s(（]*(?:p\.?\s*)?[0-9０-９]+(?:\s*[\/／]\s*[0-9０-９]+)?[-–—‐\s)）]*$/i.test(t) || /^[0-9０-９]+\s*ページ$/.test(t);
    const allH = pages.flatMap(pg => pg.rows.flatMap(r => r.segs.map(g => g.h))).sort((a, b) => a - b);
    const median = allH.length ? allH[Math.floor(allH.length / 2)] : 10;

    // 2回目：ページごとに、表・カードの並び・段落・見出しにまとめる
    for (const pg of pages) {
      lines.push(`［原本 ${pg.p}］`);
      const rows = pg.rows.filter(r => {
        if (!edge(pg, r)) return true;
        const t = r.segs.map(g => g.text).join(' ');
        const n = keyPages.get(hfKey(t));
        if (isPageNo(t) || (pages.length >= 2 && n && n.size >= 2)) { droppedHF++; return false; }
        return true;
      });
      const entries = [...rows.map(r => ({ ...r, kind: 'row' })), ...pg.figs].sort((a, b) => b.y - a.y);
      const out = []; // {text, type, h, y}
      const pushOut = (text, type, r) => out.push({ text, type, h: r ? r.h : 0, y: r ? r.y : 0 });
      let para = null;
      const flush = () => { if (para) { pushOut(para.text, 'body', para); para = null; } };
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.kind === 'figure') { flush(); pushOut(`［図：${e.label}］`, 'figure'); continue; }
        if (e.segs.length >= 2) {
          // 段組みの行が続くところを集めて、表・カードの並び・2段組みのどれかにする
          flush();
          const grp = [e];
          while (i + 1 < entries.length && entries[i + 1].kind === 'row' && sameColumns(grp[grp.length - 1], entries[i + 1])) grp.push(entries[++i]);
          const blk = layoutBlock(grp);
          if (blk.kind === 'table') tableCount++;
          if (blk.kind === 'cards') cardCount++;
          for (const l of blk.lines) pushOut(l.text, l.type, e);
          continue;
        }
        const text = e.segs[0].text;
        const lv = e.h > median * 1.6 ? 'h1' : e.h > median * 1.25 ? 'h2' : null;
        if (lv) {
          flush();
          const last = out[out.length - 1];
          // 2行に分かれた見出しは1つにつなぐ
          if (last && last.type === lv && Math.abs(last.h - e.h) < e.h * 0.15 && last.y - e.y < e.h * 2) { last.text += text; last.y = e.y; }
          else pushOut(text, lv, e);
          continue;
        }
        const prevRow = para;
        const gap = prevRow && ((prevRow.y - e.y) > Math.max(prevRow.h, e.h) * 2.4 || Math.abs(prevRow.h - e.h) > e.h * 0.2);
        if (gap) flush();
        if (para) { para.text += (/[A-Za-z0-9]$/.test(para.text) && /^[A-Za-z0-9]/.test(text) ? ' ' : '') + text; para.y = e.y; para.h = e.h; }
        else para = { text, y: e.y, h: e.h };
        if (/[。．！？!?」』]$/.test(text)) flush();
      }
      flush();
      for (const o of out) {
        lines.push(o.text);
        if (o.type === 'h1' || o.type === 'h2') types.push([o.text, o.type]);
      }
    }
    if (!textChars && !figures.length) throw new Error('このPDFからは文字も画像も取り出せませんでした。');
    const notes = ['原本のページの区切りを「［原本 ○］」として残しています。'];
    if (droppedHF) notes.push('各ページにくり返し出てくるヘッダー・フッター（柱・ページ番号）は省きました。');
    if (tableCount || cardCount) notes.push(`横に並んだ文字は、${[tableCount ? `表${tableCount}つ` : '', cardCount ? `項目の並び${cardCount}つ（縦の列ごとに1行）` : ''].filter(Boolean).join('と')}にまとめました。`);
    if (scannedPages) notes.push(`文字の情報がないページ（スキャンしたページなど）${scannedPages}ページは、ページ全体を図にしました。文字として読むには、OCR（文字認識）をかけたPDFを使ってください。`);
    const fn = figureNote(figures, 0);
    if (fn) notes.push(fn);
    notes.push('PDFの中で線で描かれたグラフ・図は取り込めません。必要なら図の説明を書き足してください。');
    if (figNo >= MAX_FIGURES) notes.push(`図が多いため、最初の${MAX_FIGURES}点だけ取り込みました。`);
    return { kind: 'pdf', mode: 'sumiji', raw: lines.join('\n'), rawKind: 'text', types, figures, note: notes.join(' ') };
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

  /*
   * BES（点字編集システム）の作り
   *  0〜1023    ヘッダ。"%BET400%" ＋ 日付 ＋ "E" 片面0/両面5 ＋ マス数+1 ＋ 行数 ＋ ページ数 …
   *  1024       0xFF
   *  そのあと   ページごとに [長さ(2バイト・下位が先)] 0xFD [本文]   長さは長さのバイトから次のページの前まで
   *  本文       1マス＝0xA0＋点のビット、0x0D 0xFE＝改行、0xFE＝行移し、0x0C＝改ページマーク
   *  最後       0xFF
   * 1行目はページ行（ページ番号の行）です。
   */
  function besLinesToRows(bytes, rows) {
    let cur = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b >= 0xa0 && b <= 0xdf) cur += E.bitsCell(b - 0xa0);
      else if (b === 0xfe) { rows.push({ cells: cur }); cur = ''; }
      // 0x0D（改行マーク）・0x0C（改ページマーク）・図形のデータなどは読み飛ばす
    }
    if (cur) rows.push({ cells: cur });
  }
  function readBES(u8, ext) {
    if (u8.length <= 1024) throw new Error('BESファイルの中身が空か、壊れています。');
    const head = latin1(u8.subarray(0, 8));
    let broken = 0;
    for (let i = 0; i + 2 < u8.length; i++) if (u8[i] === 0xef && u8[i + 1] === 0xbf && u8[i + 2] === 0xbd) broken++;
    if (broken > 20) {
      throw new Error('このBESファイルは、途中で文字コードを変換されて壊れています（点字のデータが「�」に置き換わっています）。元のファイルをもう一度用意してください。');
    }
    const rows = [];
    let p = 1025, pages = 0;
    const structured = head === '%BET400%' && u8[1024] === 0xff && u8[1027] === 0xfd;
    if (structured) {
      while (p + 2 < u8.length && u8[p + 2] === 0xfd) {
        const len = u8[p] | (u8[p + 1] << 8);
        if (len < 3) break;
        const end = Math.min(u8.length, p + len);
        if (pages) rows.push({ pagebreak: true });
        besLinesToRows(u8.subarray(p + 3, end), rows);
        pages++;
        p = end;
      }
    } else {
      // 作りが分からないファイル：ヘッダ1029バイトのあとを順に読む（以前の読み方）
      let cur = '';
      for (let i = 1029; i < u8.length; i++) {
        const b = u8[i];
        if (b >= 0xa0 && b <= 0xdf) cur += E.bitsCell(b - 0xa0);
        else if (b === 0xfe || b === 0x0c) { rows.push({ cells: cur }); cur = ''; }
        else if (b === 0xfd) { if (cur) rows.push({ cells: cur }); cur = ''; rows.push({ pagebreak: true }); }
      }
      if (cur) rows.push({ cells: cur });
    }
    const clean = trimTail(rows);
    const notes = [];
    if (ext === 'besx') notes.push('BESXの校正情報・下調べ情報は読み込まず、点字本文だけを表示しています。');
    if (structured) {
      const info = latin1(u8.subarray(20, 26));
      const m = /^E(\d)(\d\d)(\d\d)$/.exec(info);
      if (m) notes.push(`${+m[2] - 1}マス×${+m[3]}行・${m[1] === '0' ? '片面' : '両面'}のBESファイルです（${pages}ページ）。`);
    }
    return { kind: ext, mode: 'braille', raw: rowsToUnicodeText(clean), rawKind: 'unicode', rows: clean, note: notes.join(' ') };
  }

  // ---------- エーデル（.edl 点図） ----------
  /*
   * 1行目 "EDELB5,最小のy,最大のy"。2行目から「点の大きさ（1桁）＋点の座標の並び」。
   * 座標は x・y それぞれ2文字の26進法（@=0, A=1 … Z=26）。点は上から下・左から右の順で、
   * 点の大きさが変わるところで行を変えます。x は1目盛り約0.4mm、y は約0.34mm（点字の点の間隔から推定）。
   */
  const EDL_UNIT_X = 0.4, EDL_UNIT_Y = 2.4 / 7;
  const EDL_DOT_MM = { '1': 1.2, '2': 1.5, '3': 0.8, '4': 1.8 };
  const edlNum = t => (t.charCodeAt(0) - 64) * 26 + (t.charCodeAt(1) - 64);
  function parseEDL(text) {
    const lines = text.replace(/\x1a/g, '').split(/\r?\n/);
    const head = lines[0] || '';
    if (!/^EDEL/.test(head)) throw new Error('エーデルの点図ファイル（.edl）ではないようです。');
    const dots = [];
    for (const ln of lines.slice(1)) {
      if (!ln) continue;
      const size = ln[0], s = ln.slice(1);
      for (let i = 0; i + 3 < s.length; i += 4) {
        dots.push({ x: edlNum(s.slice(i, i + 2)) * EDL_UNIT_X, y: edlNum(s.slice(i + 2, i + 4)) * EDL_UNIT_Y, d: EDL_DOT_MM[size] || 1.2, kind: size });
      }
    }
    return { paper: head.slice(4).split(',')[0], dots };
  }
  // 点図をマス目に置き直す（本文の点字ファイルに入れるとき用）
  function dotsToInlineCells(dots, maxCols, maxLines) {
    if (!dots.length) return [];
    const minX = Math.min(...dots.map(p => p.x)), maxX = Math.max(...dots.map(p => p.x));
    const minY = Math.min(...dots.map(p => p.y)), maxY = Math.max(...dots.map(p => p.y));
    let w = maxCols * 2;
    let h = Math.max(3, Math.round((maxY - minY) / Math.max(1e-6, maxX - minX) * w));
    if (h > maxLines * 3) { h = maxLines * 3; w = Math.max(2, Math.round((maxX - minX) / Math.max(1e-6, maxY - minY) * h)); }
    const grid = new Array(w * h).fill(false);
    for (const p of dots) {
      const gx = Math.min(w - 1, Math.round((p.x - minX) / Math.max(1e-6, maxX - minX) * (w - 1)));
      const gy = Math.min(h - 1, Math.round((p.y - minY) / Math.max(1e-6, maxY - minY) * (h - 1)));
      grid[gy * w + gx] = true;
    }
    const BIT = [[1, 8], [2, 16], [4, 32]];
    const out = [];
    for (let y = 0; y < h; y += 3) {
      let line = '';
      for (let x = 0; x < w; x += 2) {
        let bits = 0;
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) if (y + dy < h && x + dx < w && grid[(y + dy) * w + x + dx]) bits |= BIT[dy][dx];
        line += E.bitsCell(bits);
      }
      out.push(line.replace(/⠀+$/, ''));
    }
    return out;
  }
  function readEDL(name, buf, opt) {
    const edl = parseEDL(latin1(new Uint8Array(buf)));
    const label = name.replace(/\.[^.]+$/, '');
    const lines = dotsToInlineCells(edl.dots, (opt.cols || 32) - 4, (opt.lines || 18) - 3).map(l => '⠀⠀' + l);
    return { kind: 'edl', mode: 'sumiji', raw: `［図：${label}］`, rawKind: 'text', types: [],
      figures: [[label, { lines, alt: name, tactile: edl.dots }]],
      note: `エーデルの点図（点 ${edl.dots.length} 個）を読み込みました。「点図ファイルに書き出す」で、エーデル形式・点図プリンタ用・立体コピー用に書き出せます。本文の点字ファイルに入れるときは、マス目に置き直した形になります。` };
  }
  // 点の座標（mm、用紙の左上が原点）→ エーデル形式の文字列
  function toEDL(dots, opt) {
    const enc2 = n => String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(64 + (n % 26));
    const ox = (opt && opt.originX) || 0, oy = (opt && opt.originY) || 0;
    const seen = new Set(), pts = [];
    for (const p of dots) {
      const x = Math.max(0, Math.min(701, Math.round((p.x - ox) / EDL_UNIT_X)));
      const y = Math.max(0, Math.min(701, Math.round((p.y - oy) / EDL_UNIT_Y)));
      const kind = p.kind || (p.d >= 1.45 ? '2' : p.d >= 1.0 ? '1' : '3');
      const key = x + ',' + y;
      if (seen.has(key)) continue;
      seen.add(key);
      pts.push({ x, y, kind });
    }
    if (!pts.length) throw new Error('点がありません。');
    pts.sort((a, b) => a.y - b.y || a.x - b.x);
    const out = [`EDEL${(opt && opt.paper) || 'B5'},${pts[0].y},${pts[pts.length - 1].y}`];
    let line = '', kind = null;
    for (const p of pts) {
      if (p.kind !== kind) { if (line) out.push(line); kind = p.kind; line = kind; }
      line += enc2(p.x) + enc2(p.y);
    }
    if (line) out.push(line);
    return enc(out.join('\r\n'));
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
  // BES：点字編集システムと同じ作りで書き出す（1行目はページ行）
  function besFile(pages, opt) {
    const pad = (v, n) => String(v).padEnd(n, ' ');
    const d = new Date();
    const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    const lines = opt.lines || 18, cols = opt.cols || 32;
    const duplex = opt.duplex !== false && lines !== 22 && lines !== 24;
    const header = new Uint8Array(1024).fill(0x20);
    const text = '%BET400%' + date + '  E' + (duplex ? '5' : '0') + String(cols + 1).padStart(2, '0') + String(lines).padStart(2, '0') + '     ' + pad(pages.length, 2);
    for (let i = 0; i < text.length; i++) header[i] = text.charCodeAt(i);
    header.set([0xff, 0xff, 0xff, 0x54], 512);
    const out = Array.from(header);
    out.push(0xff);
    pages.forEach(p => {
      const body = [];
      p.forEach(l => {
        for (const c of l) body.push(0xa0 + (E.cellBits(c) & 63));
        body.push(0x0d, 0xfe);
      });
      const len = body.length + 3;
      out.push(len & 0xff, (len >> 8) & 0xff, 0xfd, ...body);
    });
    out.push(0xff);
    return new Uint8Array(out);
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
    { id: 'bes', label: 'BES（点字編集システム）', ext: 'bes', group: '点字', note: '点字編集システムのファイルと同じ作りで書き出します（1行目はページ行）。実物のBESを解析して作りました' },
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
      case 'bes': {
        // BESは1行目が必ずページ行。ページ番号を付けない設定でも、空のページ行を入れる
        const p2 = E.layoutPages(rows, { ...opt, pageNumbers: true, noNumbers: !opt.pageNumbers });
        return besFile(p2, opt);
      }
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

  const api = { parseEDL, toEDL, readFile, parseRaw, exportFile, textFile, docxFromText, readXlsx, readDocxStructured, EXPORTS, KINDS, UNSUPPORTED, PAGE_MARK, extOf, decodeText, readDocxText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TenjiFormats = api;
})(typeof self !== 'undefined' ? self : this);
