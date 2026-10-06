import unittest

import _env
from _env import beryl


class FrontmatterTest(unittest.TestCase):
    def parse(self, text):
        return beryl.parse_frontmatter(text)[0]

    def test_inline_values_and_lists(self):
        fm = self.parse("---\ntype: project\norigin: [claude-code, \"claude-chat\"]\n---\n# X\n")
        self.assertEqual(fm, {"type": "project", "origin": ["claude-code", "claude-chat"]})

    def test_multiline_list(self):
        fm = self.parse("---\ntype: project\norigin:\n  - claude-code\n  - claude-chat\nstatus: active\n---\n")
        self.assertEqual(fm["origin"], ["claude-code", "claude-chat"])
        self.assertEqual(fm["status"], "active")

    def test_quoted_values(self):
        fm = self.parse("---\ntype: \"project\"\nstatus: 'active'\n---\n")
        self.assertEqual((fm["type"], fm["status"]), ("project", "active"))

    def test_crlf(self):
        fm, body = beryl.parse_frontmatter("---\r\ntype: project\r\n---\r\n# X\r\n")
        self.assertEqual(fm, {"type": "project"})
        self.assertEqual(body, "# X\n")

    def test_no_frontmatter(self):
        self.assertEqual(beryl.parse_frontmatter("# Just a note\n"), ({}, "# Just a note\n"))


class ReadNotesTest(unittest.TestCase):
    def setUp(self):
        _env.clean_data()

    def test_demo_notes(self):
        notes = {n["id"]: n for n in beryl.read_notes(_env.config())}
        self.assertEqual(sum(n["project"] for n in notes.values()), 6)
        self.assertEqual(notes["Portfolio site"]["area"], "work")
        self.assertEqual(notes["Portfolio site"]["pasta"], "/home/demo/code/portfolio")
        self.assertIn("Garden planner", notes["Ideas"]["links"])
        self.assertEqual(notes["2026-09-30"]["kind"], "daily")

    def test_read_only_by_default(self):
        notes = beryl.read_notes(_env.config())
        self.assertFalse(any(n["writable"] for n in notes))

    def test_write_notes_makes_only_projects_writable(self):
        notes = {n["id"]: n for n in beryl.read_notes(_env.config(write_notes=True))}
        self.assertTrue(notes["Bakery app"]["writable"])
        self.assertFalse(notes["Ideas"]["writable"])

    def test_last_activity_key_follows_the_note(self):
        self.assertEqual(beryl.last_key(["type: project"]), "last_activity")
        self.assertEqual(beryl.last_key(["tipo: projeto"]), "ultima_atividade")
        self.assertEqual(beryl.last_key(["type: x", "ultima_atividade: 1"]), "ultima_atividade")


if __name__ == "__main__":
    unittest.main()
