#!/bin/bash
# 外国語の点字パック（liblouis の WebAssembly 版）の作り方
# liblouis 3.39.0（https://github.com/liblouis/liblouis コミット 011cfb3b5868f9e0a63092d5cfa39b0caf57fe21、LGPL-2.1 以降）を
# Emscripten（emsdk、emcc 7.0.0 で確認）でビルドする。ソースは dict-packs ブランチの packs/src/liblouis-3.39.0-src.tar.gz にもある。
# 使い方: tools/build-liblouis.sh liblouis のソースのフォルダ 出力フォルダ
set -e
SRC=$(cd "$1" && pwd); OUT=$(mkdir -p "$2" && cd "$2" && pwd)
cd "$SRC"
[ -f configure ] || ./autogen.sh
emconfigure ./configure --disable-shared --enable-static --enable-ucs4 --without-yaml --host=wasm32
emmake make -C gnulib
emmake make -C liblouis
emcc -O2 liblouis/.libs/liblouis.a -o "$OUT/louis.js" \
  -sMODULARIZE=1 -sEXPORT_NAME=createLouis -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker,node \
  -sSTACK_SIZE=8388608 -sINITIAL_MEMORY=33554432 \
  -sINCOMING_MODULE_JS_API=wasmBinary,print,printErr,locateFile,instantiateWasm,noExitRuntime \
  -sEXPORTED_FUNCTIONS=_lou_translateString,_lou_backTranslateString,_lou_version,_lou_setDataPath,_lou_getTable,_lou_free,_lou_charSize,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=FS,ccall,cwrap,UTF32ToString,stringToUTF32,UTF8ToString,getValue,setValue
# 点字の表の一覧（catalog.json）と表のファイル（tables.zip）
LOUIS_JS="$OUT/louis.js" node "$(dirname "$0")/dict/louis-pack.js" "$SRC/tables" "$OUT"
