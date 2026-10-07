import json
import re
import unittest

import _env

FILES = sorted((_env.ROOT / "i18n").glob("*.json"))
EN = json.loads((_env.ROOT / "i18n" / "en.json").read_text())
GROUPS = {"ativo", "pausado", "continuo", "ideia", "encerrado"}


def placeholders(v):
    texts = v.values() if isinstance(v, dict) else v if isinstance(v, list) else [v]
    return {p for s in texts for p in re.findall(r"\{(\w+)\}", s)}


class LanguageFilesTest(unittest.TestCase):
    """Every language file has every text of en.json, with the same placeholders."""

    def test_every_language_is_complete(self):
        for f in FILES:
            d = json.loads(f.read_text())
            with self.subTest(language=f.stem):
                self.assertTrue(d.get("name"))
                self.assertTrue(d.get("statuses"))
                self.assertLessEqual(set(d.get("status_words", {})), GROUPS)
                for part in ("web", "beryl"):
                    missing = set(EN[part]) - set(d[part])
                    self.assertFalse(missing, f"{f.name} {part}: missing {sorted(missing)}")
                    for k, v in d[part].items():
                        self.assertIn(k, EN[part], f"{f.name} {part}: unknown key {k}")
                        if isinstance(EN[part][k], dict):
                            self.assertIn("other", v, f"{f.name} {part}.{k}: plural forms need 'other'")
                        self.assertEqual(placeholders(v), placeholders(EN[part][k]), f"{f.name} {part}.{k}: placeholders")
                self.assertEqual(len(d["web"]["months"]), 12)

    def test_every_page_text_exists(self):
        html = (_env.ROOT / "web" / "index.html").read_text()
        js = "".join((_env.ROOT / "web" / f).read_text() for f in ("app.js", "common.js"))
        used = set(re.findall(r'data-i(?:-ph|-aria|-title)?="(\w+)"', html)) | set(re.findall(r"\bt\(\"(\w+)\"[,)]", js))
        self.assertFalse(used - set(EN["web"]), "texts used by the page but missing in en.json")


class PickLanguageTest(unittest.TestCase):
    def test_configured_auto_and_fallback(self):
        from unittest import mock
        beryl = _env.beryl
        self.assertEqual(beryl.pick_language("pt"), "pt")
        with mock.patch.object(beryl, "system_languages", return_value=["ru_RU.UTF-8", "pt-BR"]):
            self.assertEqual(beryl.pick_language("auto"), "pt")      # no ru.json yet: the next language Beryl has
        with mock.patch.object(beryl, "system_languages", return_value=["ru_RU.UTF-8"]):
            self.assertEqual(beryl.pick_language("auto"), "en")
            self.assertEqual(beryl.pick_language("xx"), "en")


if __name__ == "__main__":
    unittest.main()
