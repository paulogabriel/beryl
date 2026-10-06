import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import _env


def run(script, stdin, cwd=None, **env):
    if "BERYL_CONFIG" not in env:
        env["BERYL_CONFIG"] = str(_env.write_config())
    e = dict(os.environ, **env)
    return subprocess.run([sys.executable, str(_env.ROOT / script)], input=stdin, capture_output=True, text=True, env=e, timeout=60, cwd=cwd)


def mcp(*messages, **env):
    out = run("beryl_mcp.py", "".join(json.dumps(m) + "\n" for m in messages), **env).stdout
    return [json.loads(line) for line in out.splitlines()]


def call(i, name, args=None):
    return {"jsonrpc": "2.0", "id": i, "method": "tools/call", "params": {"name": name, "arguments": args or {}}}


def project_dir(tmp, **over):
    """A copy of the demo whose Portfolio site project lives in a real folder, tmp/portfolio; returns (config, folder)."""
    tmp = Path(tmp)
    notes, organize = _env.copy_demo(tmp)
    folder = tmp / "portfolio"
    (folder / "src").mkdir(parents=True)
    note = notes / "Projects" / "Portfolio site.md"
    note.write_text(note.read_text().replace("/home/demo/code/portfolio", str(folder.resolve())))
    return str(_env.write_config(notes=str(notes), organize_file=str(organize), **over)), folder


class McpTest(unittest.TestCase):
    def setUp(self):
        _env.clean_data()

    def test_initialize_and_tools(self):
        r = mcp({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
                {"jsonrpc": "2.0", "method": "notifications/initialized"},
                {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        self.assertEqual(len(r), 2)                                     # notifications get no reply
        self.assertIn("beryl_context", r[0]["result"]["instructions"])
        names = {t["name"] for t in r[1]["result"]["tools"]}
        self.assertEqual(names, {"beryl_context", "beryl_search", "beryl_projects", "beryl_save_session"})

    def test_only_in_project_folders(self):
        tmp = tempfile.mkdtemp()
        cfg, folder = project_dir(tmp, mcp_only_projects=True)
        cloned = Path(tmp) / "cloned-repo"
        cloned.mkdir()
        ask = [{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, call(2, "beryl_search", {"term": "bakery"})]
        r = mcp(*ask, BERYL_CONFIG=cfg, cwd=cloned)
        self.assertEqual(r[0]["result"]["tools"], [])
        self.assertTrue(r[1]["result"]["isError"])
        # a repository can't pass itself off as a project by setting CLAUDE_PROJECT_DIR in its settings
        r = mcp(*ask, BERYL_CONFIG=cfg, cwd=cloned, CLAUDE_PROJECT_DIR=str(folder))
        self.assertEqual(r[0]["result"]["tools"], [])
        r = mcp(*ask, BERYL_CONFIG=cfg, cwd=folder / "src")
        self.assertEqual(len(r[0]["result"]["tools"]), 4)
        self.assertFalse(r[1]["result"].get("isError"))

    def test_context_by_folder_and_by_name(self):
        r = mcp(call(1, "beryl_context", {"folder": "/home/demo/code/portfolio"}),
                call(2, "beryl_context", {"project": "Learn Rust"}))
        self.assertIn("# Project context: Portfolio site", r[0]["result"]["content"][0]["text"])
        self.assertIn("# Project context: Learn Rust", r[1]["result"]["content"][0]["text"])

    def test_save_only_in_the_session_folder_project(self):
        tmp = tempfile.mkdtemp()
        cfg, folder = project_dir(tmp)
        r = mcp(call(1, "beryl_save_session", {"summary": "x", "project": "Learn Rust"}), BERYL_CONFIG=cfg, cwd=tmp)
        self.assertTrue(r[0]["result"]["isError"])
        r = mcp(call(1, "beryl_save_session", {"summary": "Fixed the menu."}), BERYL_CONFIG=cfg, cwd=folder)
        self.assertIn("Saved to Portfolio site", r[0]["result"]["content"][0]["text"])
        self.assertIn("Fixed the menu.", (_env.DATA / "sessoes.json").read_text())

    def test_unsorted_and_personal_conversations_stay_out(self):
        r = mcp(call(1, "beryl_search", {"term": "birthday"}))
        self.assertEqual(r[0]["result"]["content"][0]["text"], "Nothing found.")


class HookTest(unittest.TestCase):
    def setUp(self):
        _env.clean_data()

    def transcript(self, prompts):
        f = Path(tempfile.mkdtemp()) / "t.jsonl"
        f.write_text("".join(json.dumps({"type": "user", "timestamp": "2026-10-01T10:00:00Z", "message": {"content": p}}) + "\n" for p in prompts))
        return str(f)

    def test_session_start_saves_plugin_options(self):
        run("beryl_hook.py", json.dumps({"hook_event_name": "SessionStart"}),
            CLAUDE_PLUGIN_DATA=str(_env.DATA), CLAUDE_PLUGIN_OPTION_CLAUDE_EXPORT="/x.zip")
        self.assertEqual(json.loads((_env.DATA / "options.json").read_text())["claude_export"], "/x.zip")

    def test_compact_writes_one_automatic_entry(self):
        event = json.dumps({"hook_event_name": "PreCompact", "session_id": "s1", "cwd": "/home/demo/code/portfolio",
                            "transcript_path": self.transcript(["one", "two", "three"])})
        self.assertEqual(run("beryl_hook.py", event).returncode, 0)
        self.assertEqual(run("beryl_hook.py", event).returncode, 0)    # same stretch again: no duplicate
        entries = json.loads((_env.DATA / "sessoes.json").read_text())["Portfolio site"]
        self.assertEqual(len(entries), 1)
        self.assertIn("3 requests (automatic entry, before /compact)", entries[0])

    def test_hook_never_fails_but_logs_the_error(self):
        self.assertEqual(run("beryl_hook.py", "not json").returncode, 0)
        log = (_env.DATA / "hook.log").read_text()
        self.assertIn("JSONDecodeError", log)


if __name__ == "__main__":
    unittest.main()
