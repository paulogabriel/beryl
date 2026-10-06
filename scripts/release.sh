#!/bin/zsh
# Publishes a version: scripts/release.sh X.Y.Z
# On main with a clean tree: runs the tests, validates the plugin, sets the version in plugin.json,
# turns "## Unreleased" in CHANGELOG.md into the version, then commits, tags and pushes.
set -euo pipefail
V="${1:?usage: scripts/release.sh X.Y.Z}"
cd "${0:A:h:h}"
[[ "$V" =~ '^[0-9]+\.[0-9]+\.[0-9]+$' ]] || { echo "Version must look like 1.2.3"; exit 1; }
[[ "$(git branch --show-current)" == main ]] || { echo "Run it on main."; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Commit or stash your changes first."; exit 1; }
grep -q "^## Unreleased" CHANGELOG.md || { echo "CHANGELOG.md needs a '## Unreleased' section."; exit 1; }
git pull --ff-only -q
python3 -m unittest discover -s tests
claude plugin validate . >/dev/null && claude plugin validate .claude-plugin/plugin.json >/dev/null
python3 - "$V" <<'PY'
import datetime, json, sys
from pathlib import Path
v = sys.argv[1]
p = Path(".claude-plugin/plugin.json")
d = json.loads(p.read_text())
d["version"] = v
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
c = Path("CHANGELOG.md")
# the released section gets the version; a new empty "## Unreleased" waits for the next changes
c.write_text(c.read_text().replace("## Unreleased", f"## Unreleased\n\n## {v} ({datetime.date.today()})", 1))
PY
git commit -q -am "Release $V"
git tag "v$V"
git push -q origin main "v$V"
echo "Released $V. Installed plugins get it with /plugin update (or: claude plugin update beryl@beryl)."
