#!/bin/zsh
# Opens Beryl: starts the server in the background, if it isn't running yet, and opens the browser.
# When the Claude Code plugin is installed, uses its data folder (settings and state), like the plugin does.
DIR="${0:A:h:h}"
PY="${BERYL_PYTHON:-$(command -v python3 || echo /usr/bin/python3)}"
PLUGIN_DATA="$HOME/.claude/plugins/data/beryl-beryl"
[[ -z "$BERYL_DATA" && -d "$PLUGIN_DATA" ]] && export BERYL_DATA="$PLUGIN_DATA"
exec "$PY" "$DIR/beryl.py" open
