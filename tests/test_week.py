import unittest

import _env
from _env import beryl


class WeekTest(unittest.TestCase):
    def test_activity_by_project(self):
        _env.clean_data()
        out = beryl.activity(_env.config(), days=100000)
        self.assertTrue(out["projects"])
        for p in out["projects"]:
            self.assertTrue(p["sessions"] or p["conversations"])          # notes alone don't bring a project in
        self.assertEqual(beryl.activity(_env.config(), days=0)["projects"], [])


if __name__ == "__main__":
    unittest.main()
