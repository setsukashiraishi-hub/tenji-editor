// 辞書・言語パック：ダウンロードしてブラウザ（IndexedDB）に保存し、次からはネットにつながっていなくても使う
//  - 日本語の読みの辞書（一般の語・人名・地名・固有名詞）：TenjiEngine.loadLexicon で重ねて使う
//  - 外国語の点字（liblouis を WebAssembly にしたもの＋約180の点字の表）
// パックの一覧は packs/manifest.json（GitHub Pages では dict-packs ブランチの中身を packs/ に置く）
(function (root) {
  'use strict';
  const BASE = 'packs/';
  const DB = 'tenji-packs';
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        if (!root.indexedDB) { rej(new Error('このブラウザでは保存できません（IndexedDB がありません）')); return; }
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
          if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error || new Error('保存場所を開けませんでした'));
        r.onblocked = () => rej(new Error('ほかのタブが保存場所を使っています。ほかのタブを閉じてから、もう一度試してください'));
      });
      dbp.catch(() => { dbp = null; });
    }
    return dbp;
  }
  function run(store, mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      let out;
      const r = fn(t.objectStore(store));
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('保存できませんでした（容量が足りないかもしれません）'));
    }));
  }
  const getFile = key => run('files', 'readonly', s => s.get(key));
  const putFile = (key, blob) => run('files', 'readwrite', s => s.put(blob, key));
  const delFile = key => run('files', 'readwrite', s => s.delete(key));
  const installed = () => run('packs', 'readonly', s => s.getAll()).then(a => a || []).catch(() => []);
  const putPack = rec => run('packs', 'readwrite', s => s.put(rec));
  const delPack = id => run('packs', 'readwrite', s => s.delete(id));

  let manifestP = null;
  function manifest(force) {
    if (!manifestP || force) {
      manifestP = fetch(BASE + 'manifest.json', { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error('パックの一覧を読めませんでした（' + r.status + '）');
        return r.json();
      });
      manifestP.catch(() => { manifestP = null; });
    }
    return manifestP;
  }
  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');

  // ダウンロードして保存する。onProgress(読んだバイト数, 全部のバイト数)
  async function download(pack, onProgress, signal) {
    const total = pack.files.reduce((a, f) => a + f.size, 0);
    let got = 0;
    const blobs = [];
    for (const f of pack.files) {
      const r = await fetch(BASE + f.path, { signal, cache: 'no-cache' });
      if (!r.ok) throw new Error('ダウンロードできませんでした（' + f.path + '：' + r.status + '）');
      const chunks = [];
      if (r.body && r.body.getReader) {
        const reader = r.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          if (onProgress) onProgress(Math.min(got, total), total);
        }
      } else {
        const b = new Uint8Array(await r.arrayBuffer());
        chunks.push(b); got += b.length;
        if (onProgress) onProgress(Math.min(got, total), total);
      }
      const blob = new Blob(chunks, { type: f.type || 'application/octet-stream' });
      if (f.sha256 && root.crypto && crypto.subtle) {
        const h = hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
        if (h !== f.sha256) throw new Error('ダウンロードしたファイルが壊れています（' + f.name + '）。もう一度試してください');
      }
      blobs.push([f, blob]);
    }
    for (const [f, blob] of blobs) await putFile(pack.id + '/' + f.name, blob);
    await putPack({ id: pack.id, kind: pack.kind, version: pack.version, title: pack.title, bytes: total, files: pack.files.map(f => f.name), installed: Date.now() });
    // ブラウザが容量の整理で消さないように頼む（だめでも使える）
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { }
    if (pack.kind === 'louis') louisP = null;
    return true;
  }
  async function remove(id) {
    const rec = (await installed()).find(r => r.id === id);
    if (rec) for (const n of rec.files || []) await delFile(id + '/' + n);
    await delPack(id);
    if (id === 'louis') louisP = null;
  }
  // 保存したファイルを文字で読む（.gz は展開する）
  async function readText(id, name) {
    const b = await getFile(id + '/' + name);
    if (!b) return null;
    if (/\.gz$/.test(name)) {
      if (!root.DecompressionStream) throw new Error('このブラウザでは辞書を展開できません（DecompressionStream がありません）');
      return new Response(b.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }
    return b.text();
  }
  async function estimate() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { }
    return null;
  }
  async function persisted() {
    try { if (navigator.storage && navigator.storage.persisted) return await navigator.storage.persisted(); } catch (e) { }
    return false;
  }

  // ---------- 外国語の点字（liblouis）----------
  let louisP = null;
  function louis() {
    if (louisP) return louisP;
    louisP = (async () => {
      const [js, wasm, zipb, catb] = await Promise.all(['louis.js', 'louis.wasm', 'tables.zip', 'catalog.json'].map(n => getFile('louis/' + n)));
      if (!js || !wasm || !zipb || !catb) throw new Error('外国語の点字パックがダウンロードされていません');
      const catalog = JSON.parse(await catb.text());
      if (!root.createLouis) {
        const url = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
        try {
          await new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = () => rej(new Error('liblouis を読み込めませんでした')); document.head.appendChild(s); });
        } finally { URL.revokeObjectURL(url); }
      }
      const L = await root.createLouis({ wasmBinary: new Uint8Array(await wasm.arrayBuffer()), print: () => { }, printErr: () => { } });
      const zip = await root.JSZip.loadAsync(zipb);
      L.FS.mkdirTree('/liblouis/tables');
      for (const name of Object.keys(zip.files)) {
        const f = zip.files[name];
        if (!f.dir) L.FS.writeFile('/liblouis/tables/' + name.replace(/^.*\//, ''), await f.async('uint8array'));
      }
      L.ccall('lou_setDataPath', null, ['string'], ['/']);
      const cache = new Map();
      const tr = (table, text, back) => {
        text = String(text || '');
        if (!text) return '';
        const key = (back ? 'b' : 'f') + table + '\u0000' + text;
        if (cache.has(key)) return cache.get(key);
        const len = Array.from(text).length;
        const n = len * 8 + 128;
        const inP = L._malloc((len + 1) * 4), outP = L._malloc(n * 4), inLen = L._malloc(4), outLen = L._malloc(4);
        let out = null;
        try {
          L.stringToUTF32(text, inP, (len + 1) * 4);
          L.setValue(inLen, len, 'i32'); L.setValue(outLen, n, 'i32');
          const ok = L.ccall(back ? 'lou_backTranslateString' : 'lou_translateString', 'number',
            ['string', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
            ['unicode.dis,' + table, inP, inLen, outP, outLen, 0, 0, 0]);
          if (ok) out = L.UTF32ToString(outP, L.getValue(outLen, 'i32') * 4);
        } finally { [inP, outP, inLen, outLen].forEach(p => L._free(p)); }
        if (cache.size > 5000) cache.clear();
        cache.set(key, out);
        return out;
      };
      const byTable = new Map(catalog.tables.map(t => [t.table, t]));
      return {
        version: catalog.liblouis, catalog: catalog.tables,
        name: t => (byTable.get(t) || {}).name || t,
        canBack: t => !!(byTable.get(t) || {}).back,
        forward: (text, table) => tr(table, text, false),
        back: (cells, table) => tr(table, cells, true)
      };
    })();
    louisP.catch(() => { louisP = null; });
    return louisP;
  }

  root.TenjiPacks = { manifest, installed, download, remove, readText, getFile, estimate, persisted, louis };
})(typeof self !== 'undefined' ? self : this);
