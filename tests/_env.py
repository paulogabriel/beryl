"""Test setup, imported first by every test module: Beryl's data folder in a temporary directory,
no plugin options or settings file from the machine running the tests."""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "demo"
DATA = Path(tempfile.mkdtemp(prefix="beryl-test-"))
for k in list(os.environ):
    if k.startswith(("BERYL_", "CLAUDE_PLUGIN_OPTION_", "CLAUDE_PLUGIN_DATA")):
        del os.environ[k]
os.environ["BERYL_DATA"] = str(DATA)
os.environ["BERYL_CONFIG"] = str(DATA / "no-such-config.json")
sys.path.insert(0, str(ROOT))

import beryl  # noqa: E402

EN_STATUSES = ["active", "in progress", "paused", "ongoing", "idea", "done", "dropped"]


def write_config(**over):
    """Writes a settings file based on the demo and returns its path."""
    base = {"notes": str(DEMO / "notes"), "claude_code": str(DEMO / "claude-code"),
            "claude_export": str(DEMO / "claude-export.zip"), "organize_file": str(DEMO / "organize.json"),
            "language": "en", "statuses": EN_STATUSES}
    base.update(over)
    path = DATA / "test-config.json"
    path.write_text(json.dumps(base))
    return path


def config(**over):
    return beryl.load_config(str(write_config(**over)))


def clean_data():
    """Removes the state files a previous test left in the data folder."""
    for p in DATA.iterdir():
        if p.is_file():
            p.unlink()


def copy_demo(tmp):
    """A writable copy of the demo notes and organize file, inside tmp."""
    shutil.copytree(DEMO / "notes", tmp / "notes")
    shutil.copy(DEMO / "organize.json", tmp / "organize.json")
    return tmp / "notes", tmp / "organize.json"
