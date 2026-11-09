import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from tools.local_companion_v032 import configure, read_roots, make_handler


class CompanionTests(unittest.TestCase):
    # Use temporary role files and a loopback server to check metadata, reads, traversal, Host, and cross-site rejection.
    def test_config_and_isolated_http(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            for name in ("roms", "previews", "bios"):
                (root / name).mkdir()
            (root / "roms" / "breakers.zip").write_bytes(b"game")
            (root / "previews" / "breakers.bmp").write_bytes(b"preview")
            (root / "bios" / "neogeo.zip").write_bytes(b"bios")
            config = root / "private" / "cfg.json"
            configure(
                config,
                {
                    "roms": str(root / "roms"),
                    "previews": str(root / "previews"),
                    "bios": str(root / "bios"),
                },
            )
            roots = read_roots(config)
            server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(roots, 0))
            port = server.server_port
            # Handler Host validation expects exact port. Rebuild on a known port.
            server.server_close()
            server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(roots, port))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                # Issue one local GET, consume and close the response, and return its status and bytes.
                def req(path, headers=None):
                    c = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
                    c.request("GET", path, headers=headers or {})
                    r = c.getresponse()
                    b = r.read()
                    s = r.status
                    c.close()
                    return s, b

                code, b = req("/Neo-Geo-Web/__ng_local__/status")
                self.assertEqual(code, 200)
                data = json.loads(b)
                self.assertEqual(data["service"], "neogeo-local-companion")
                code, b = req("/Neo-Geo-Web/__ng_local__/list/roms")
                self.assertEqual(code, 200)
                self.assertEqual(json.loads(b)["files"][0]["name"], "breakers.zip")
                code, b = req("/Neo-Geo-Web/__ng_local__/file/roms/breakers.zip")
                self.assertEqual((code, b), (200, b"game"))
                for path in (
                    "/Neo-Geo-Web/__ng_local__/file/roms/%2e%2e%2fsecret",
                    "/Neo-Geo-Web/__ng_local__/file/roms/%2e%2e",
                ):
                    self.assertNotEqual(req(path)[0], 200)
                self.assertEqual(
                    req("/Neo-Geo-Web/__ng_local__/status", {"Host": "evil.example"})[
                        0
                    ],
                    403,
                )
                self.assertEqual(
                    req(
                        "/Neo-Geo-Web/__ng_local__/status",
                        {"Sec-Fetch-Site": "cross-site"},
                    )[0],
                    403,
                )
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
