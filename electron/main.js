// デスクトップ版（Electron）。中身はブラウザ版と同じファイルを app:// で読み込む。
const { app, BrowserWindow, protocol, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 520,
    title: '点訳エディタ',
    backgroundColor: '#eef1f3',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadURL('app://local/index.html');
  // 外部リンクは既定のブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (ev, url) => {
    if (!url.startsWith('app://')) { ev.preventDefault(); shell.openExternal(url); }
  });
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url);
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    // .mjs（pdf.js）を JavaScript として読ませるため、種類を明示して返す
    const ext = path.extname(file).toLowerCase();
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
      '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }[ext] || 'application/octet-stream';
    return fs.promises.readFile(file)
      .then(data => new Response(data, { headers: { 'content-type': type } }))
      .catch(() => new Response('Not found', { status: 404 }));
  });

  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
