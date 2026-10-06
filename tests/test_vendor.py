import hashlib
import json
import unittest

import _env

WEB = _env.ROOT / "web"


class VendorTest(unittest.TestCase):
    def test_third_party_files_match_their_checksums(self):
        """The libraries and fonts are the official releases (scripts/vendor.sh rebuilds them and the list)."""
        listed = json.loads((WEB / "vendor" / "CHECKSUMS.json").read_text())
        on_disk = {f"{p.parent.name}/{p.name}" for d in ("vendor", "fonts") for p in (WEB / d).glob("*.*") if p.suffix in (".js", ".woff2")}
        self.assertEqual(set(listed), on_disk)
        for path, info in listed.items():
            with self.subTest(path=path):
                self.assertEqual(hashlib.sha256((WEB / path).read_bytes()).hexdigest(), info["sha256"])


if __name__ == "__main__":
    unittest.main()
