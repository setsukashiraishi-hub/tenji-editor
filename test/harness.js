// Node で kuromoji（ブラウザ版ビルド）と変換エンジンを動かすための補助
const fs = require('fs');
const path = require('path');

global.XMLHttpRequest = class {
  open(method, url) { this.url = url; }
  send() {
    try {
      const buf = fs.readFileSync(this.url);
      this.status = 200;
      this.response = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      this.onload && this.onload();
    } catch (e) {
      this.status = 404;
      this.onerror && this.onerror(e);
    }
  }
};
global.window = global;
const kuromoji = require(path.join(__dirname, '../vendor/kuromoji.js'));
const engine = require(path.join(__dirname, '../js/engine.js'));

function getTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: path.join(__dirname, '../dict') + '/' }).build((err, t) => err ? reject(err) : resolve(t));
  });
}

module.exports = { getTokenizer, engine };
