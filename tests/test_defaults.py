import unittest

import _env
from _env import beryl


class DefaultsTest(unittest.TestCase):
    """The defaults in the code are generic; anyone's own conventions go in their settings."""

    def test_project_types(self):
        self.assertEqual(beryl.DEFAULTS["project_types"], ["projeto", "project"])

    def test_statuses_follow_the_language(self):
        self.assertEqual(_env.config(statuses=None, language="pt")["statuses"], beryl.STATUSES["pt"])
        self.assertEqual(_env.config(statuses=None, language="en")["statuses"], beryl.STATUSES["en"])
        self.assertEqual(len(beryl.STATUSES["pt"]), len(beryl.STATUSES["en"]))

    def test_own_conventions_come_from_the_settings(self):
        cfg = _env.config(project_types=["projeto-claude"], status_groups={"ativo": ["funcional"]})
        self.assertEqual(cfg["project_types"], ["projeto-claude"])
        self.assertEqual(beryl.payload(cfg, False)["status_groups"], {"ativo": ["funcional"]})

    def test_label_and_link_lines_are_not_summaries(self):
        self.assertTrue(beryl.link_line("Chat project: [Money Printer](https://claude.ai/project/x)"))
        self.assertTrue(beryl.link_line("Related: [[Ideas]]"))
        self.assertFalse(beryl.link_line("Personal portfolio at [pantunes.dev](https://pantunes.dev)."))
        self.assertFalse(beryl.link_line("See [[Ideas]] for more."))
        body = "# X\n\nChat project: [X](https://claude.ai/project/x)\n\nThe real summary.\n"
        title = beryl.re.search(r"^# (.+)$", body, beryl.re.M)
        self.assertEqual(beryl.summary_of(body, title), "The real summary.")


if __name__ == "__main__":
    unittest.main()
