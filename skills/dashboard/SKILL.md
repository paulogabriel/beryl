---
name: dashboard
description: Open the Beryl dashboard (projects, Claude Code sessions, claude.ai conversations and notes) in the browser. Use when the user asks to open, show or see Beryl or their Claude dashboard.
---

Run this command and tell the user the address it prints:

```bash
BERYL_DATA="${CLAUDE_PLUGIN_DATA}" python3 "${CLAUDE_PLUGIN_ROOT}/beryl.py" open
```

The server keeps running in the background and the page updates by itself. If the command fails because Python 3 is missing, tell the user that Beryl needs Python 3.9 or later (on macOS, `xcode-select --install` provides it). Answer in the user's language.
