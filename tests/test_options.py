import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import _env
from _env import beryl


class PluginOptionsTest(unittest.TestCase):
    """Where the plugin options come from: Claude Code's settings first, then options.json."""

    def setUp(self):
        _env.clean_data()
        self.home = Path(tempfile.mkdtemp())          # stands for ~/.claude
        self.config = _env.write_config(notes=None, claude_export=None, claude_code=False)

    def settings(self, options):
        (self.home / "settings.json").write_text(json.dumps({"pluginConfigs": {"beryl@beryl": {"options": options}}}))

    def load(self, as_plugin=True):
        env = {"CLAUDE_CONFIG_DIR": str(self.home)}
        if as_plugin:
            env["CLAUDE_PLUGIN_DATA"] = str(_env.DATA)
        with mock.patch.dict(beryl.os.environ, env):
            return beryl.load_config(str(self.config))

    def test_claude_code_settings_apply_at_once(self):
        (_env.DATA / "options.json").write_text(json.dumps({"notes_dir": str(_env.DEMO / "notes")}))
        self.settings({"claude_export": str(_env.DEMO / "claude-export.zip"), "notes_dir": "", "claude_code": True})
        cfg = self.load()
        self.assertIsNone(cfg["notes"])                               # erased in /config: the old copy doesn't win
        self.assertEqual(cfg["claude_export"], _env.DEMO / "claude-export.zip")
        self.assertIsNotNone(cfg["claude_code"])

    def test_falls_back_to_the_copy_from_session_start(self):
        (_env.DATA / "options.json").write_text(json.dumps({"notes_dir": str(_env.DEMO / "notes")}))
        (self.home / "settings.json").write_text(json.dumps({"pluginConfigs": {}}))
        self.assertEqual(self.load()["notes"], (_env.DEMO / "notes").resolve())

    def test_ignored_outside_the_plugin(self):
        self.settings({"notes_dir": str(_env.DEMO / "notes")})
        self.assertIsNone(self.load(as_plugin=False)["notes"])

    def test_a_change_in_settings_reloads_the_dashboard(self):
        self.settings({"notes_dir": ""})
        with mock.patch.dict(beryl.os.environ, {"CLAUDE_CONFIG_DIR": str(self.home)}):
            before = beryl.config_stamp(str(self.config))
            self.settings({"notes_dir": str(_env.DEMO / "notes")})
            later = time.time() + 5
            beryl.os.utime(self.home / "settings.json", (later, later))
            self.assertNotEqual(beryl.config_stamp(str(self.config)), before)


if __name__ == "__main__":
    unittest.main()
