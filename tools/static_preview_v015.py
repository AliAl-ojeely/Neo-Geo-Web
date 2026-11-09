"""Local static GitHub Pages preview; intentionally no game APIs."""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1] / "dist" / "github-pages"
PREFIX = "/Neo-Geo-Web/"


class Handler(SimpleHTTPRequestHandler):
    # Use the generated static site as the preview server document root.
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # Map the deployment prefix to the document root while preserving the original request path.
    def translate_path(self, path):
        # Don't mutate self.path as older preview handlers did.
        parsed = urlsplit(path).path
        if parsed.startswith(PREFIX):
            parsed = "/" + parsed[len(PREFIX) :]
        else:
            parsed = "/__invalid_preview_path__"
        return super().translate_path(parsed)

    # Redirect the root to the deployment prefix and reject requests outside that prefix.
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/":
            self.send_response(302)
            self.send_header("Location", PREFIX)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if not path.startswith(PREFIX):
            self.send_error(404, "Use /Neo-Geo-Web/")
            return
        return super().do_GET()

    # Reject requests outside the deployment prefix before serving static headers.
    def do_HEAD(self):
        path = urlsplit(self.path).path
        if not path.startswith(PREFIX):
            self.send_error(404, "Use /Neo-Geo-Web/")
            return
        return super().do_HEAD()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8776)
    args = parser.parse_args()
    print(f"NEO-GEO static preview: http://127.0.0.1:{args.port}{PREFIX}", flush=True)
    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        server.serve_forever()
