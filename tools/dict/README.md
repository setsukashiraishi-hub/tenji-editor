# 辞書・言語パックの作り方

できあがったパックは `dict-packs` ブランチの `packs/` に置きます（公開するときに GitHub Pages の `packs/` に入ります）。
作業用のフォルダ（環境変数 `TENJI_WORK`、なければ `./work/`）に大きな辞書をダウンロードして使います。辞書や点字データそのものは、このリポジトリには入れません。

## 日本語の読みの辞書

1. 大きな辞書をダウンロードして `work/bigdict/` に置く
   - UniDic cwj（国立国語研究所 https://clrd.ninjal.ac.jp/unidic/ ）：`node mecabdump.js sys.dic unidic_entries.tsv`（MeCab のシステム辞書から見出しと素性を取り出す）
   - SudachiDict の raw 辞書（small・core・notcore の CSV）
   - mecab-ipadic-NEologd の seed
   - 日本郵便 郵便番号データ（utf_ken_all.zip・jigyosyo.zip）
2. `python3 extract.py`：漢字を含む語と読みを共通の形（cands.tsv）にする。`sort` して cands.sorted.tsv も作る
3. `node compare.js`：kuromoji（エディタの IPA 辞書）の読みと比べ、どの大きな辞書の読みとも合わない語だけを残す（kept.tsv）
4. `node corpus2.js`：公式の点字データ（仮名に読み戻した allkana.txt）に、それぞれの読みが何回出てくるかを数える
5. `node homo2.js`：よく使う語と同じ読み（同音語）があるかを調べる（数があてにならない読みを除くため）
6. `node mkpack2.js 出力.tsv [除く発行元]`：辞書どうしの点数と点字での出現数から、読みを決めて辞書を作る。
   発行元を除いて作ると、その発行元の点字での確かめ（held-out）に使える
7. 品詞ごとに分けて gzip し（ja-words・ja-people・ja-places・ja-names）、`node mkmanifest.js 版` で manifest.json を作る

## 外国語の点字

`tools/build-liblouis.sh liblouisのソース 出力フォルダ` で、louis.js・louis.wasm・tables.zip・catalog.json ができます（Emscripten が必要）。
