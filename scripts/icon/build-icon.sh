#!/bin/zsh
# Builds scripts/icon/Beryl.icns from scripts/icon/beryl-icon.svg.
set -e
DIR="${0:A:h}"
TMP="$(mktemp -d)"; SET="$TMP/Beryl.iconset"; mkdir -p "$SET"
swift "$DIR/render.swift" "$DIR/beryl-icon.svg" "$TMP/1024.png" 1024
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/1024.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); sips -z $d $d "$TMP/1024.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$DIR/Beryl.icns"
cp "$TMP/1024.png" "$DIR/beryl-icon-1024.png"
rm -rf "$TMP"
echo "Gerado $DIR/Beryl.icns"
