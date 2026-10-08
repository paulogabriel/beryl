import http.client
import json
import threading
import unittest

import _env
from _env import beryl


ORIGINAL_LOG = beryl.Handler.log_message   # the tests below silence the real one


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _env.clean_data()
        cls.config_path = _env.write_config(claude_export=None)
        beryl.Handler.cfg = beryl.load_config(str(cls.config_path))
        beryl.Handler.args = {"config": str(cls.config_path)}
        beryl.Handler.stamp = beryl.config_stamp(str(cls.config_path))
        beryl.Handler.log_message = lambda *a: None
        cls.server = beryl.http.server.ThreadingHTTPServer(("127.0.0.1", 0), beryl.Handler)
        cls.port = cls.server.server_address[1]
        beryl.Handler.token, beryl.Handler.port = "s3cret", cls.port
        beryl.Handler.launch = beryl.new_launch_key(cls.port)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        beryl.Handler.token = None

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        h = {"Host": f"127.0.0.1:{self.port}", "Cookie": f"beryl_{self.port}=s3cret"}
        h.update(headers or {})
        conn.request(method, path, body=body, headers=h)
        r = conn.getresponse()
        try:
            return r.status, dict(r.getheaders()), r.read()
        finally:
            conn.close()

    def post(self, path, data, **headers):
        h = {"Origin": f"http://127.0.0.1:{self.port}", "Content-Type": "application/json"}
        h.update(headers)
        return self.request("POST", path, json.dumps(data), h)

    def test_data(self):
        status, _, body = self.request("GET", "/api/data")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["sources"]["notes"], True)

    def test_page_and_security_headers(self):
        status, headers, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"<title>", body)
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        # "nothing leaves your machine": no outside address in the page or in the policy
        self.assertNotIn(b"https://", body)
        self.assertNotIn("http", headers["Content-Security-Policy"])

    def test_bad_requests_get_an_answer(self):
        self.assertEqual(self.request("GET", "/nope.txt")[0], 404)
        self.assertEqual(self.request("GET", "/index.html%00.png")[0], 404)
        self.assertEqual(self.request("GET", "/fonts/")[0], 404)              # no folder listing
        self.assertEqual(self.request("GET", "/%2e%2e/beryl.py")[0], 404)
        h = {"Origin": f"http://127.0.0.1:{self.port}", "Content-Type": "application/json"}
        for body in ("[1,2]", "{{{"):
            self.assertEqual(self.request("POST", "/api/status", body, h)[0], 400)
        self.assertEqual(self.request("POST", "/api/status", "{}", {**h, "Content-Length": "-1"})[0], 413)

    def test_log_message_takes_a_status_code(self):
        import contextlib, http, io
        with contextlib.redirect_stderr(io.StringIO()):
            ORIGINAL_LOG(None, "code %s, message %s", http.HTTPStatus.NOT_FOUND, "x")   # error pages pass a status, not text

    def test_data_needs_the_key(self):
        self.assertEqual(self.request("GET", "/api/data", headers={"Cookie": ""})[0], 401)
        self.assertEqual(self.request("GET", "/api/data", headers={"Cookie": f"beryl_{self.port}=wrong"})[0], 401)
        self.assertEqual(self.post("/api/status", {}, Cookie="")[0], 401)
        self.assertEqual(self.request("GET", "/", headers={"Cookie": ""})[0], 200)     # the page itself is public code

    def test_launch_key_works_once(self):
        key = beryl.Handler.launch
        status, headers, _ = self.request("GET", f"/?k={key}", headers={"Cookie": ""})
        self.assertEqual((status, headers["Location"]), (303, "/"))
        self.assertIn(f"beryl_{self.port}=s3cret", headers["Set-Cookie"])
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertNotIn("Set-Cookie", self.request("GET", f"/?k={key}", headers={"Cookie": ""})[1])   # used: from history it opens nothing
        self.assertEqual(beryl.token_file(self.port).read_text(), beryl.Handler.launch)               # the next `open` gets a fresh one
        status, headers, _ = self.request("GET", "/?k=wrong", headers={"Cookie": ""})
        self.assertEqual(status, 303)
        self.assertNotIn("Set-Cookie", headers)

    def test_stop_needs_key_and_origin(self):
        self.assertEqual(self.post("/api/stop", {}, Cookie="")[0], 401)
        self.assertEqual(self.post("/api/stop", {}, Origin="http://evil.example")[0], 403)

    def test_dns_rebinding_is_blocked(self):
        status, _, _ = self.request("GET", "/api/data", headers={"Host": "evil.example:80"})
        self.assertEqual(status, 403)

    def test_writes_need_origin_json_and_small_bodies(self):
        self.assertEqual(self.request("POST", "/api/status", "{}", {"Content-Type": "application/json"})[0], 403)
        self.assertEqual(self.post("/api/status", {}, Origin="http://evil.example")[0], 403)
        self.assertEqual(self.post("/api/status", {}, **{"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.post("/api/status", {}, **{"Content-Length": "999999"})[0], 413)
        self.assertEqual(self.post("/api/status", {"id": "Bakery app", "status": "paused"})[0], 403)   # notes are read-only

    def test_settings_reload_without_restart(self):
        self.assertFalse(json.loads(self.request("GET", "/api/data")[2])["sources"]["claude_export"])
        v1 = json.loads(self.request("GET", "/api/version")[2])["version"]
        _env.write_config()                                   # now with the export
        import os, time
        os.utime(self.config_path, (time.time() + 5, time.time() + 5))
        self.assertTrue(json.loads(self.request("GET", "/api/data")[2])["sources"]["claude_export"])
        self.assertNotEqual(json.loads(self.request("GET", "/api/version")[2])["version"], v1)
        _env.write_config(claude_export=None)
        os.utime(self.config_path, (time.time() + 10, time.time() + 10))


class PrivateDataTest(unittest.TestCase):
    def test_folder_and_key_are_owner_only(self):
        import os, stat
        token = beryl.new_launch_key(1)
        self.assertEqual(stat.S_IMODE(os.stat(beryl.DATA).st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(os.stat(beryl.token_file(1)).st_mode), 0o600)
        self.assertEqual(beryl.token_file(1).read_text(), token)
        self.assertNotEqual(beryl.new_launch_key(1), token)


class ExportTest(unittest.TestCase):
    def test_folder_takes_only_real_exports(self):
        import tempfile, zipfile
        from pathlib import Path
        d = Path(tempfile.mkdtemp())
        with zipfile.ZipFile(d / "real.zip", "w") as z:
            z.writestr("conversations.json", "[]"); z.writestr("users.json", "[]")
        with zipfile.ZipFile(d / "dropped.zip", "w") as z:          # newer, but only conversations.json
            z.writestr("conversations.json", "[]")
        self.assertEqual(beryl.export_file(d).name, "real.zip")
        self.assertEqual(beryl.export_file(d / "dropped.zip").name, "dropped.zip")   # a file chosen by name is read as is

    def test_oversized_export_is_not_read(self):
        import tempfile, zipfile
        from pathlib import Path
        f = Path(tempfile.mkdtemp()) / "big.zip"
        with zipfile.ZipFile(f, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("conversations.json", "[]")
        old, beryl.MAX_EXPORT = beryl.MAX_EXPORT, 1
        try:
            with self.assertRaises(ValueError):
                beryl.read_export(f)
        finally:
            beryl.MAX_EXPORT = old


if __name__ == "__main__":
    unittest.main()
