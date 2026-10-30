#!/bin/sh
# 网站发布的 woff2 由同目录的 TTF 裁剪而来：只留拉丁、希腊、标点、上下标、货币、箭头、数学与几何符号，
# 保留可变字重和全部 OpenType 特性。中文走思源宋体子集，这里不管。
# IBM Plex Mono 带保留字体名 "Plex"，改过的版本不能再叫 Plex，所以不在这里裁剪，直接用 IBM 官方发布的 woff2。
# 需要 fonttools 与 brotli：python3 -m pip install fonttools brotli
set -eu
cd "$(dirname "$0")/../vendor/fonts"
RANGES='U+0020-007E,U+00A0-024F,U+02B0-02FF,U+0300-036F,U+0370-03FF,U+1E00-1EFF,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2200-22FF,U+25A0-25FF,U+FEFF,U+FFFD'
for name in cormorant-garamond manrope pinyon-script; do
  python3 -m fontTools.subset "$name.ttf" --unicodes="$RANGES" --layout-features='*' --flavor=woff2 --output-file="$name.woff2"
  echo "$name.woff2: $(wc -c < "$name.woff2") bytes (from $(wc -c < "$name.ttf"))"
done
