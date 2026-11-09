"""Localhost-only, stdlib HTTP server for fully offline game sessions."""

import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit, parse_qs
from . import catalog, engine

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
MIMES = {
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".wasm": "application/wasm",
    ".data": "application/octet-stream",
    ".json": "application/json; charset=utf-8",
    ".bmp": "image/bmp",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "NeoGeoWebEmu/0.1.5.1"

    # Send shared response headers with the supplied status, content length, type, and cache policy.
    def _headers(self, code, length, content_type, cache="no-store"):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()

    # Encode a JSON response while omitting its body for HEAD requests.
    def json_reply(self, data, code=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self._headers(code, len(raw), "application/json; charset=utf-8")
        if self.command != "HEAD":
            self.wfile.write(raw)

    # Stream a local file with its MIME type, returning JSON for missing files and tolerating disconnects.
    def serve_file(self, path):
        try:
            if not path.is_file():
                raise FileNotFoundError()
            length = path.stat().st_size
            content_type = MIMES.get(
                path.suffix.lower(),
                mimetypes.guess_type(path.name)[0] or "application/octet-stream",
            )
            self._headers(
                200,
                length,
                content_type,
                "private, max-age=3600" if "/vendor/" in str(path) else "no-store",
            )
            if self.command != "HEAD":
                with path.open("rb") as file:
                    while True:
                        buffer = file.read(1024 * 1024)
                        if not buffer:
                            break
                        self.wfile.write(buffer)
        except FileNotFoundError:
            self.json_reply({"error": "File not found"}, 404)
        except (OSError, BrokenPipeError, ConnectionResetError):
            pass

    # Route library, diagnostics, prepared-ROM, and static requests to their existing providers.
    def dispatch(self):
        url = urlsplit(self.path)
        path = unquote(url.path)
        if path in ("/", "/index.html"):
            return self.serve_file(WEB / "index.html")
        if path in ("/lab/original/index.html", "/lab/repacked/index.html"):
            return self.serve_file(ROOT / "tools" / "runtime_lab" / "index.html")
        if path == "/lab/repacked/neogeo.zip":
            return self.serve_file(ROOT / "work" / "bios" / "neogeo.zip")
        if path == "/lab/original/neogeo.zip":
            f = catalog.pick_bios()
            return (
                self.serve_file(f)
                if f
                else self.json_reply({"error": "BIOS missing"}, 404)
            )
        if path.startswith("/lab/"):
            return self.secure_static(
                ROOT / "tools" / "runtime_lab", path[len("/lab/") :]
            )
        if path == "/diagnostics/compatibility":
            from .reporting import dashboard

            return self.serve_file(dashboard())
        if path.startswith("/diagnostics/evidence/"):
            return self.secure_static(
                ROOT / "reports/game_boot_evidence",
                path[len("/diagnostics/evidence/") :],
            )
        if path == "/player.html":
            return self.serve_file(WEB / "player.html")
        if path == "/settings.html":
            return self.serve_file(WEB / "settings.html")
        if path == "/api/games":
            games = catalog.scan()
            return self.json_reply(
                {
                    "games": games,
                    "summary": catalog.summary(games),
                    "engine": engine.status(),
                }
            )
        if path == "/api/status":
            return self.json_reply(
                {"summary": catalog.summary(), "engine": engine.status()}
            )
        if path == "/neogeo.zip":
            f = catalog.pick_bios()
            return (
                self.serve_file(f)
                if f
                else self.json_reply({"error": "BIOS neogeo.zip missing"}, 404)
            )
        if path == "/api/bios/neogeo.zip":
            f = catalog.pick_bios()
            return (
                self.serve_file(f)
                if f
                else self.json_reply({"error": "BIOS neogeo.zip missing"}, 404)
            )
        if path == "/api/compatibility-plan":
            from .compatibility import launch_plan

            try:
                plan = launch_plan(parse_qs(url.query).get("rom", [""])[0])
                plan.pop("path", None)
                return self.json_reply(plan)
            except ValueError as error:
                return self.json_reply({"error": str(error)}, 409)
        if path.startswith("/api/compatible-rom/"):
            from .compatibility import launch_plan

            try:
                source, separator, driver_file = path[
                    len("/api/compatible-rom/") :
                ].partition("/")
                plan = launch_plan(source)
                if not separator or driver_file != plan["driver"] + ".zip":
                    raise ValueError("Prepared driver filename mismatch")
                return (
                    self.serve_file(plan["path"])
                    if plan["prepared"]
                    else self.json_reply({"error": "No prepared ROM"}, 404)
                )
            except ValueError as error:
                return self.json_reply({"error": str(error)}, 409)
        if path.startswith("/api/rom/"):
            f = catalog.pick_rom(path[len("/api/rom/") :])
            return (
                self.serve_file(f)
                if f
                else self.json_reply({"error": "ROM not found"}, 404)
            )
        if path.startswith("/api/shot/"):
            f = catalog.pick_shot(path[len("/api/shot/") :])
            return (
                self.serve_file(f)
                if f
                else self.json_reply({"error": "Screenshot not found"}, 404)
            )
        if path.startswith("/assets/"):
            rel = path[len("/assets/") :]
            return self.secure_static(WEB, rel)
        if path.startswith("/vendor/fbneo-selected-bios/"):
            return self.secure_static(
                ROOT / "vendor" / "fbneo-selected-bios",
                path[len("/vendor/fbneo-selected-bios/") :],
            )
        if path.startswith("/vendor/emulatorjs/data/"):
            rel = path[len("/vendor/emulatorjs/data/") :]
            return self.secure_static(engine.DATA, rel)
        return self.json_reply({"error": "Not found"}, 404)

    # Reject unsafe relative paths and serve only resolved files inside the requested root.
    def secure_static(self, root, rel):
        root = root.resolve()
        if (
            not rel
            or "\\" in rel
            or rel.startswith("/")
            or any(part in {".", ".."} for part in Path(rel).parts)
        ):
            return self.json_reply({"error": "Invalid path"}, 404)
        p = (root / rel).resolve()
        if not p.is_relative_to(root) or not p.is_file():
            return self.json_reply({"error": "File not found"}, 404)
        return self.serve_file(p)

    # Dispatch a GET request through the shared routing implementation.
    def do_GET(self):
        self.dispatch()

    # Use the same routing as GET while response helpers suppress file and JSON bodies.
    def do_HEAD(self):
        self.dispatch()

    # Print the client address and formatted HTTP request log entry.
    def log_message(self, fmt, *args):
        print("[HTTP] {} {}".format(self.address_string(), fmt % args))


# Construct the threaded HTTP server with the default loopback binding.
def make_server(host="127.0.0.1", port=8765):
    return ThreadingHTTPServer((host, port), Handler)


# Run the loopback server, optionally open its URL, and close it on interruption.
def serve(port=8765, open_browser=False):
    import webbrowser

    with make_server(port=port) as server:
        url = "http://127.0.0.1:{}/".format(server.server_port)
        print("[LOCAL SERVER] " + url, flush=True)
        print(
            "[OFFLINE RUNTIME] No CDN or external network required after engine install.",
            flush=True,
        )
        print("Stop: Ctrl+C", flush=True)
        if open_browser:
            webbrowser.open(url)
        try:
            server.serve_forever(poll_interval=0.3)
        except KeyboardInterrupt:
            print("\n[STOPPED]")
