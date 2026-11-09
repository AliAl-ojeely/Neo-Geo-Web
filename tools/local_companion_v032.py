"""Optional single-machine static preview + approved local ROM/PREVIEW/BIOS reader.

Runs on 127.0.0.1 only. Does not upload, copy, rename, or change game files.
Configuration is outside this source repository. Never expose to the Internet.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

PREFIX = "/Neo-Geo-Web/"
STATIC = Path(__file__).resolve().parents[1] / "dist" / "github-pages"
DEFAULT_CONFIG = (
    Path(os.environ.get("LOCALAPPDATA", "")) / "NeoGeoWebEmu" / "library.json"
    if os.environ.get("LOCALAPPDATA")
    else Path.home() / ".neogeo-web-emu" / "library.json"
)
ROLES = ("roms", "previews", "bios")
VALID_NAME = re.compile(r"^[^\\/\x00-\x1f]{1,199}$")


# Resolve an existing role path and enforce directory or neogeo.zip requirements.
def normalize(role: str, value: str) -> Path:
    path = Path(value).expanduser().resolve(strict=True)
    if role != "bios" and not path.is_dir():
        raise ValueError(f"{role} must be a directory: {path}")
    if role == "bios":
        if path.is_dir():
            if not (path / "neogeo.zip").is_file():
                raise ValueError("BIOS directory must contain neogeo.zip")
        elif not (path.is_file() and path.name.lower() == "neogeo.zip"):
            raise ValueError("BIOS must be the neogeo.zip file or its directory")
    return path


# Merge validated role paths and atomically replace the private external configuration file.
def configure(config: Path, values: dict[str, str]):
    previous = (
        json.loads(config.read_text(encoding="utf-8")) if config.is_file() else {}
    )
    values = {**previous, **{k: str(normalize(k, v)) for k, v in values.items() if v}}
    if not values:
        raise ValueError("Specify --roms, --previews and/or --bios")
    config.parent.mkdir(parents=True, exist_ok=True)
    tmp = config.with_suffix(".tmp")
    tmp.write_text(json.dumps(values, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, config)
    print(
        json.dumps(
            {
                "status": "SAVED",
                "roles": list(values),
                "config": str(config),
                "note": "Private local configuration; do not publish.",
            },
            ensure_ascii=False,
            indent=2,
        )
    )


# Restore configured roles, excluding paths that no longer meet validation requirements.
def read_roots(config: Path) -> dict[str, Path]:
    data = json.loads(config.read_text(encoding="utf-8")) if config.exists() else {}
    result = {}
    for role in ROLES:
        if data.get(role):
            try:
                result[role] = normalize(role, data[role])
            except (ValueError, OSError, FileNotFoundError):
                pass
    return result


# List supported local filenames and sizes without following directory-entry symlinks.
def listing(roots: dict[str, Path], role: str):
    if role not in roots:
        return []
    folder = roots[role]
    if folder.is_file():
        paths = [folder]
    else:
        paths = (p for p in folder.iterdir() if p.is_file() and not p.is_symlink())
    extensions = (
        (".bmp", ".png", ".jpg", ".jpeg", ".webp") if role == "previews" else (".zip",)
    )
    items = []
    for path in paths:
        if path.suffix.lower() in extensions and VALID_NAME.fullmatch(path.name):
            if role == "bios" and path.name.lower() != "neogeo.zip":
                continue
            items.append({"name": path.name, "size": path.stat().st_size})
        if len(items) > 2500:
            raise ValueError("Too many files")
    return sorted(items, key=lambda item: item["name"].casefold())


# Bind static and read-only library routes to the exact expected loopback Host and Origin.
def make_handler(roots: dict[str, Path], port: int):
    expected_host = f"127.0.0.1:{port}"

    class Handler(SimpleHTTPRequestHandler):
        # Serve static requests from the generated distribution directory.
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(STATIC), **kwargs)

        # Add MIME-sniffing and same-origin resource protections to every response.
        def end_headers(self):
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            super().end_headers()

        # Enforce exact Host and Origin checks; allow cross-site navigation only to listed public documents.
        def valid_host(self):
            if self.headers.get("Host") != expected_host:
                self.send_error(403, "Invalid Host")
                return False
            if self.headers.get("Origin") not in (None, "http://" + expected_host):
                self.send_error(403, "Invalid Origin")
                return False
            # NAVIGATION_403_FIX_V0321: permit only top-level public HTML navigation.
            # Do not relax cross-origin protection for local ROM/BIOS endpoints.
            fetch_site = self.headers.get("Sec-Fetch-Site")
            if fetch_site in ("cross-site", "same-site"):
                public_pages = {
                    "/",
                    PREFIX,
                    PREFIX + "index.html",
                    PREFIX + "player.html",
                    PREFIX + "settings.html",
                }
                top_level_document = (
                    self.command == "GET"
                    and self.headers.get("Sec-Fetch-Mode") == "navigate"
                    and self.headers.get("Sec-Fetch-Dest") == "document"
                    and urlsplit(self.path).path in public_pages
                )
                if not top_level_document:
                    self.send_error(403, "Cross-site request not allowed")
                    return False
            return True

        # Send uncached JSON metadata and suppress its body for HEAD requests.
        def json_response(self, body):
            b = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(b)

        # Validate the role, filename, extension, and resolved boundary before streaming an approved file.
        def read_file(self, role: str, name: str):
            if (
                role not in roots
                or not VALID_NAME.fullmatch(name)
                or name in (".", "..")
            ):
                self.send_error(404, "Not found")
                return
            folder = roots[role]
            if role == "bios" and name.lower() != "neogeo.zip":
                self.send_error(404, "Not found")
                return
            path = folder if folder.is_file() else folder / name
            if (
                not path.is_file()
                or path.is_symlink()
                or (folder.is_dir() and path.resolve().parent != folder.resolve())
            ):
                self.send_error(404, "Not found")
                return
            if path.suffix.lower() not in (
                (".bmp", ".png", ".jpg", ".jpeg", ".webp")
                if role == "previews"
                else (".zip",)
            ):
                self.send_error(404, "Not found")
                return
            size = path.stat().st_size
            self.send_response(200)
            self.send_header(
                "Content-Type",
                mimetypes.guess_type(name)[0] or "application/octet-stream",
            )
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(size))
            self.end_headers()
            if self.command == "HEAD":
                return
            with path.open("rb") as src:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except (ConnectionResetError, BrokenPipeError):
                        return

        # Map only the deployment prefix into the static directory without changing the request path.
        def translate_path(self, path):
            url_path = urlsplit(path).path
            if url_path.startswith(PREFIX):
                url_path = "/" + url_path[len(PREFIX) :]
            else:
                url_path = "/__nonexistent__"
            return super().translate_path(url_path)

        # Route HEAD through the same security checks and endpoint handling as GET.
        def do_HEAD(self):
            self.handle_request()

        # Route GET through the shared security checks and endpoint handling.
        def do_GET(self):
            self.handle_request()

        # Validate the request before serving public pages or read-only configured-role endpoints.
        def handle_request(self):
            if not self.valid_host():
                return
            path = urlsplit(self.path).path
            if path == "/":
                self.send_response(302)
                self.send_header("Location", PREFIX)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if path.startswith(PREFIX + "__ng_local__/"):
                path = path[len(PREFIX + "__ng_local__/") :]
                if path == "status":
                    return self.json_response(
                        {
                            "service": "neogeo-local-companion",
                            "schema": 1,
                            "roles": {
                                r: {
                                    "configured": r in roots,
                                    "label": roots[r].name if r in roots else "",
                                }
                                for r in ROLES
                            },
                        }
                    )
                if path.startswith("list/") and path[5:] in ROLES:
                    return self.json_response({"files": listing(roots, path[5:])})
                if path.startswith("file/"):
                    parts = path.split("/", 2)
                    if len(parts) == 3 and parts[1] in ROLES:
                        return self.read_file(parts[1], unquote(parts[2]))
                return self.send_error(404, "Unknown companion endpoint")
            if not path.startswith(PREFIX):
                return self.send_error(404, "Open /Neo-Geo-Web/")
            return super().do_HEAD() if self.command == "HEAD" else super().do_GET()

    return Handler


# Configure or inspect private paths, or start the validated companion on loopback only.
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("configure", "serve", "status"))
    parser.add_argument("--roms")
    parser.add_argument("--previews")
    parser.add_argument("--bios")
    parser.add_argument("--port", type=int, default=8777)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    args = parser.parse_args()
    if args.action == "configure":
        return configure(args.config, {r: getattr(args, r) for r in ROLES})
    if args.action == "status":
        print(json.dumps({"roles": list(read_roots(args.config))}, ensure_ascii=False))
        return
    if not STATIC.joinpath("index.html").is_file():
        raise SystemExit("Run: py -3 manage.py web build first")
    roots = read_roots(args.config)
    if not roots:
        raise SystemExit(
            "No configured paths. First run: configure --roms ... --previews ... --bios ..."
        )
    if not (1024 <= args.port <= 65535):
        raise SystemExit("Invalid port")
    print(f"LOCAL COMPANION active at http://127.0.0.1:{args.port}{PREFIX}", flush=True)
    print("Configured roles: " + ", ".join(roots), flush=True)
    print(
        "Keep this terminal open. Files are never uploaded to a remote server.",
        flush=True,
    )
    with ThreadingHTTPServer(
        ("127.0.0.1", args.port), make_handler(roots, args.port)
    ) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
