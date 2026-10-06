import collections
import unittest

import _env
from _env import beryl


def kinds(items):
    return dict(collections.Counter(x["kind"] for x in items))


class SourcesTest(unittest.TestCase):
    def setUp(self):
        _env.clean_data()

    def test_demo_has_all_three_sources(self):
        cfg = _env.config()
        self.assertEqual(beryl.sources(cfg), {"notes": True, "claude_code": True, "claude_export": True})
        k = kinds(beryl.collect(cfg))
        self.assertEqual((k["project"], k["chat"], k["code"], k["projeto-auto"]), (6, 30, 10, 2))

    def test_no_sources(self):
        cfg = _env.config(notes=None, claude_code=False, claude_export=None)
        self.assertEqual(beryl.collect(cfg), [])
        self.assertFalse(any(beryl.sources(cfg).values()))

    def test_export_folder_uses_the_zip_inside(self):
        cfg = _env.config(notes=None, claude_code=False, claude_export=str(_env.DEMO))
        self.assertEqual(kinds(beryl.collect(cfg)), {"chat": 30})

    def test_sessions_link_to_the_note_of_their_folder(self):
        items = {x["id"]: x for x in beryl.collect(_env.config())}
        portfolio = [x for x in items.values() if x["kind"] == "code" and x.get("cwd") == "/home/demo/code/portfolio"]
        self.assertTrue(portfolio)
        self.assertTrue(all(s["links"] == ["Portfolio site"] and s["area"] == "work" for s in portfolio))

    def test_auto_projects(self):
        autos = {x["title"] for x in beryl.collect(_env.config()) if x["kind"] == "projeto-auto"}
        self.assertEqual(autos, {"dotfiles", "invoice-script"})
        off = beryl.collect(_env.config(auto_projects=False))
        self.assertFalse(any(x["kind"] == "projeto-auto" for x in off))

    def test_organize_file_links_chats(self):
        chats = [x for x in beryl.collect(_env.config()) if x["kind"] == "chat"]
        linked = [c for c in chats if c["links"] == ["Bakery app"]]
        self.assertTrue(linked)
        self.assertTrue(all(c["area"] == "work" for c in linked))

    def test_repo_root_skips_temporary_and_home_folders(self):
        self.assertIsNone(beryl.repo_root("/tmp/scratch"))
        self.assertIsNone(beryl.repo_root(str(beryl.Path.home())))
        self.assertEqual(beryl.repo_root("/home/demo/code/portfolio"), "/home/demo/code/portfolio")

    def test_redact(self):
        key = "sk-ant-api03-" + "a1B2" * 10
        self.assertEqual(beryl.redact(f"key {key} end"), "key [secret removed] end")
        path = "/Users/someone/Documents/a/very/long/path/to/some/project/folder/file.md"
        self.assertEqual(beryl.redact(path), path)


if __name__ == "__main__":
    unittest.main()
