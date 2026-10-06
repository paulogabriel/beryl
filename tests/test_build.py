import re
import tempfile
import unittest
from pathlib import Path

import _env
from _env import beryl


class BuildTest(unittest.TestCase):
    def test_single_file_is_self_contained(self):
        out = Path(tempfile.mkdtemp()) / "beryl.html"
        beryl.build(_env.config(), out)
        html = out.read_text()
        self.assertIn("window.BERYL_DATA=", html)
        self.assertIn("data:font/woff2;base64,", html)
        self.assertNotRegex(html, r'<(script|link)[^>]*(src|href)="(?!data:)')   # every script, style and icon inline
        data = html[html.index("window.BERYL_DATA="):]
        data = data[:data.index("</script>")]
        self.assertNotIn("<", data)                                 # no title can break the page


if __name__ == "__main__":
    unittest.main()
