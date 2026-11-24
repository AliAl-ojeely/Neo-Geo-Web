"""Serve the prepared private acceptance site at the production deployment prefix."""

from http.server import ThreadingHTTPServer
from pathlib import Path

from tools import static_preview_v015 as preview


if __name__ == "__main__":
    preview.ROOT = Path(__file__).resolve().parents[2] / "work/recovery/kof2003-acceptance/site"
    if not (preview.ROOT / "data/catalog.json").is_file():
        raise SystemExit("Prepare the acceptance site first")
    print("Private acceptance site: http://127.0.0.1:8793/Neo-Geo-Web/", flush=True)
    with ThreadingHTTPServer(("127.0.0.1", 8793), preview.Handler) as server:
        server.serve_forever()
