import json
import tempfile
import unittest
from pathlib import Path

import _env
from _env import beryl
import beryl_bridge as bridge


class WritesTest(unittest.TestCase):
    def setUp(self):
        _env.clean_data()
        self.tmp = Path(tempfile.mkdtemp())
        self.notes, self.org = _env.copy_demo(self.tmp)

    def cfg(self, **over):
        return _env.config(notes=str(self.notes), organize_file=str(self.org), **over)

    def project(self, cfg, pid):
        return next(x for x in beryl.collect(cfg) if x["id"] == pid)

    def test_set_status(self):
        cfg = self.cfg(write_notes=True)
        r = beryl.set_status(cfg, "Bakery app", "paused")
        text = (self.notes / "Projects" / "Bakery app.md").read_text()
        self.assertIn("status: paused", text)
        self.assertIn(f"last_activity: {r['last']}", text)

    def test_set_status_refusals(self):
        cfg = self.cfg(write_notes=True)
        with self.assertRaises(ValueError):
            beryl.set_status(cfg, "Bakery app", "not-a-status")
        with self.assertRaises(PermissionError):
            beryl.set_status(cfg, "Ideas", "paused")
        with self.assertRaises(PermissionError):
            beryl.set_status(self.cfg(), "Bakery app", "paused")      # write_notes off

    def test_crlf_note_keeps_its_line_endings(self):
        note = self.notes / "Projects" / "Bakery app.md"
        note.write_bytes(note.read_bytes().replace(b"\n", b"\r\n"))
        beryl.set_status(self.cfg(write_notes=True), "Bakery app", "paused")
        data = note.read_bytes()
        self.assertIn(b"status: paused\r\n", data)
        self.assertNotIn(b"\n", data.replace(b"\r\n", b""))

    def test_session_summary_goes_to_beryl_when_the_note_is_read_only(self):
        cfg = self.cfg()
        line = bridge.register_session(cfg, self.project(cfg, "Bakery app"), "Added the pickup screen.")
        self.assertNotIn("pickup screen", (self.notes / "Projects" / "Bakery app.md").read_text())
        self.assertEqual(json.loads(beryl.SESSIONS_LOG.read_text())["Bakery app"], [line])
        self.assertIn(line, self.project(cfg, "Bakery app")["body"])

    def test_session_summary_goes_to_the_writable_note(self):
        cfg = self.cfg(write_notes=True)
        bridge.register_session(cfg, self.project(cfg, "Bakery app"), "Added the pickup screen.")
        text = (self.notes / "Projects" / "Bakery app.md").read_text()
        self.assertIn("## Claude Code sessions\n- ", text)
        self.assertIn("Added the pickup screen.", text)

    def test_clean_line(self):
        self.assertEqual(bridge.clean_line("# Do [this](https://x.y) <img src=a> %%hidden%%"), "Do this hidden")
        self.assertEqual(bridge.clean_line("line one\n\n## two"), "line one ## two")
        self.assertEqual(bridge.clean_line("see [[Ideas]]"), "see [[Ideas]]")
        with self.assertRaises(ValueError):
            bridge.clean_line("   ")

    def test_organize(self):
        cfg = self.cfg()
        unsorted = beryl.organize_list(cfg)
        self.assertGreater(unsorted["total_unsorted"], 0)
        first, second = unsorted["conversations"][:2]
        done = beryl.organize_set(cfg, {first["id"]: {"project": "Learn Rust"}, second["id"]: {"area": "music"},
                                        "chat:nope": {"project": "No such project"}})
        self.assertEqual(done, 2)
        items = {x["id"]: x for x in beryl.collect(cfg)}
        self.assertEqual(items[first["id"]]["links"], ["Learn Rust"])
        self.assertEqual(items[second["id"]]["area"], "music")
        self.assertEqual(beryl.organize_list(cfg)["total_unsorted"], unsorted["total_unsorted"] - 2)

    def test_delete_moves_a_writable_note_to_the_trash(self):
        from unittest import mock
        trash = self.tmp / "Trash"
        cfg = self.cfg(write_notes=True)
        with mock.patch.object(beryl.sys, "platform", "linux"), mock.patch.dict(beryl.os.environ, {"XDG_DATA_HOME": str(self.tmp)}):
            done = beryl.delete_item(cfg, "Newsletter")
        self.assertEqual(Path(done["path"]), trash / "files" / "Newsletter.md")
        self.assertFalse((self.notes / "Projects" / "Newsletter.md").exists())
        info = (trash / "info" / "Newsletter.md.trashinfo").read_text()
        self.assertIn("Path=", info)
        self.assertIn("Newsletter.md", info)
        with mock.patch.object(beryl.sys, "platform", "darwin"), mock.patch.object(beryl.Path, "home", lambda: self.tmp):
            done = beryl.delete_item(cfg, "Learn Rust")
        self.assertEqual(Path(done["path"]), self.tmp / ".Trash" / "Learn Rust.md")

    def test_delete_hides_a_conversation(self):
        cfg = self.cfg()
        chat = next(x for x in beryl.collect(cfg) if x["kind"] == "chat")
        self.assertEqual(beryl.delete_item(cfg, chat["id"])["done"], "hidden")
        self.assertNotIn(chat["id"], {x["id"] for x in beryl.collect(cfg)})


if __name__ == "__main__":
    unittest.main()
