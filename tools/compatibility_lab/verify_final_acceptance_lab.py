"""Check the isolated site's bytes and deployment routes without opening a browser."""

from http.server import ThreadingHTTPServer
import json
import re
from threading import Thread
from urllib.error import HTTPError
from urllib.request import urlopen

from tools import static_preview_v015 as preview
from tools.compatibility_lab.prepare_kof2003_acceptance import ROOT, LAB, digest


# Verify the complete offline manifest and candidate identity mappings before manual browser tests.
def main():
    site = LAB / "site"
    manifest = json.loads((site / "offline-manifest.json").read_text("utf8"))
    worker = (site / "offline-sw.js").read_text("utf8")
    assert re.search(r"const BUILD_ID = '([^']+)'", worker)[1] == manifest["id"]
    assert manifest["totalBytes"] == sum(entry["bytes"] for entry in manifest["files"])
    for entry in manifest["files"]:
        data = (site / entry["path"]).read_bytes()
        assert len(data) == entry["bytes"] and digest(data) == entry["sha256"], entry["path"]
    catalog = json.loads((site / "data/catalog.json").read_text("utf8"))
    for game, driver, fixture in [("kof2003", "kof2k3fd", "fixture"), ("mslug5", "mslug5fd", "fixture-mslug5")]:
        row = next(g for g in catalog["games"] if g["id"] == game)
        assert row["filename"] == game + ".zip" and row["driver"] == driver
        assert row["selected_filename"] == driver + ".zip" and row["boot_status"] == "NOT VERIFIED"
        data = (LAB / fixture / "ROMs" / row["selected_filename"]).read_bytes()
        assert len(data) == row["size"] and digest(data) == row["sha256"]
        assert digest((LAB / fixture / "BIOS/neogeo.zip").read_bytes()) == catalog["bios"]["sha256"]
    expected_core = json.loads((ROOT / "tools/compatibility_lab/priority_import_signatures.json").read_text("utf8"))["core_sha256"]
    assert digest((site / "vendor/fbneo-selected-bios/fbneo-legacy-wasm.data").read_bytes()) == expected_core
    preview.ROOT = site
    checks = {}
    with ThreadingHTTPServer(("127.0.0.1", 0), preview.Handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            for route in ["/Neo-Geo-Web/", "/Neo-Geo-Web/player.html", "/Neo-Geo-Web/data/catalog.json", "/Neo-Geo-Web/assets/languages.js"]:
                with urlopen(base + route) as response:
                    assert response.status == 200 and response.read()
                    checks[route] = response.status
            try:
                urlopen(base + "/data/catalog.json")
                raise AssertionError("Invalid deployment prefix accepted")
            except HTTPError as error:
                assert error.code == 404
                checks["outside_prefix"] = 404
        finally:
            server.shutdown()
            thread.join()
    old = json.loads((ROOT / "reports/KOF2003_ACCEPTANCE_PACKAGE_AUDIT.json").read_text("utf8"))
    baseline_matches = digest((ROOT / "web/data/catalog.json").read_bytes()) == old["active_catalog_sha256"]
    report = dict(status="PASS", offline_manifest_assets=len(manifest["files"]), http=checks,
                  candidate_count=2, active_catalog_matches_original_baseline=baseline_matches, core_sha256=expected_core,
                  browser_tests="NOT VERIFIED", note="Local HTTP and file integrity checks do not prove game boot")
    (ROOT / "reports/FINAL_ACCEPTANCE_LAB_PREFLIGHT.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
