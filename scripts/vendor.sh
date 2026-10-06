#!/bin/zsh
# Rebuilds web/vendor from the official npm releases (via jsDelivr) and refreshes the checksums.
# Usage: scripts/vendor.sh   (then run the tests; to update a library, change its version here)
set -e
D3=7.9.0
THREE=0.147.0                # the last release with examples/js (UMD); newer ones only ship ES modules
DIR="${0:A:h:h}/web/vendor"
CDN=https://cdn.jsdelivr.net/npm
curl -sfL "$CDN/d3@$D3/dist/d3.min.js" -o "$DIR/d3.min.js"
{
  echo "/* three.js $THREE with the add-ons the 3D views use; built by scripts/vendor.sh */"
  for f in build/three.min.js examples/js/postprocessing/Pass.js examples/js/shaders/CopyShader.js \
           examples/js/shaders/LuminosityHighPassShader.js examples/js/postprocessing/EffectComposer.js \
           examples/js/postprocessing/RenderPass.js examples/js/postprocessing/ShaderPass.js \
           examples/js/postprocessing/UnrealBloomPass.js examples/js/controls/OrbitControls.js; do
    echo "/* three@$THREE/$f */"
    curl -sfL "$CDN/three@$THREE/$f"
    echo
  done
} > "$DIR/three-bundle.js"
cd "${DIR:h}"
python3 - "$D3" "$THREE" <<'PY'
import hashlib, json, sys
from pathlib import Path
d3, three = sys.argv[1:]
files = {"vendor/d3.min.js": {"package": f"d3@{d3}"}, "vendor/three-bundle.js": {"package": f"three@{three}"}}
files.update({f"fonts/{p.name}": {"package": "Google Fonts (OFL)"} for p in sorted(Path("fonts").glob("*.woff2"))})
for path, info in files.items():
    info["sha256"] = hashlib.sha256(Path(path).read_bytes()).hexdigest()
Path("vendor/CHECKSUMS.json").write_text(json.dumps(files, indent=1) + "\n")
print("\n".join(f"{v['sha256'][:12]}  {k}  ({v['package']})" for k, v in files.items()))
PY
