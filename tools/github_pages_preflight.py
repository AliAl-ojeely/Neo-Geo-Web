"""Read-only GitHub Pages release preflight for Neo-Geo Web Port.

Runs first-party tests and builds the existing sanitized static output. Does not
initialize Git, upload files, or claim third-party redistribution clearance.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

FORBIDDEN_PARTS = {
    "backups", "roms", "screenshots", "__pycache__", "node_modules",
    "work", "saves", "private", ".env", "credentials.json", "config.json",
}
FORBIDDEN_SUFFIXES = {".rom", ".sp1", ".sav", ".state", ".bmp", ".7z"}
ALLOWED_ZIP = "vendor/emulatorjs/data/emulator.min.zip"


def run(args, root):
    print("[RUN]", " ".join(args), flush=True)
    process = subprocess.run(args, cwd=root, text=True, capture_output=True, errors="replace")
    if process.returncode:
        print(process.stdout[-3500:])
        print(process.stderr[-3500:])
        raise RuntimeError("Command failed: " + " ".join(args))
    print("[PASS]", " ".join(args), flush=True)


def safe_member(rel):
    parts = [x.lower() for x in rel.parts]
    path = rel.as_posix().lower()
    if any(x in FORBIDDEN_PARTS for x in parts):
        return False
    if any(x.startswith(".env") for x in parts):
        return False
    if rel.suffix.lower() in FORBIDDEN_SUFFIXES:
        return False
    if rel.suffix.lower() == ".zip" and path != ALLOWED_ZIP:
        return False
    if path.endswith((".pem", ".pfx", ".key", ".p12")):
        return False
    if path == "source_collection_manifest.json":
        return False
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--skip-tests", action="store_true", help="For repeat artifact inspection only")
    args = parser.parse_args()
    root = args.project.resolve()
    if not (root / "manage.py").is_file():
        parser.error("Not a Neo-Geo Web Port source checkout: manage.py missing")
    if not (root / "web" / "index.html").is_file():
        parser.error("Not a Neo-Geo Web Port source checkout: web/index.html missing")
    try:
        if not args.skip_tests:
            if not shutil.which("node"):
                raise RuntimeError("Node is not in PATH")
            js_tests = sorted(str(x.relative_to(root)) for x in (root / "tests").glob("*.test.cjs"))
            if not js_tests:
                raise RuntimeError("Missing JavaScript test files")
            run(["node", "--test", *js_tests], root)
            run([sys.executable, "manage.py", "test"], root)
            run([sys.executable, "manage.py", "web", "build"], root)
        run([sys.executable, "manage.py", "web", "verify"], root)
        run([sys.executable, "manage.py", "github", "audit"], root)
        public = root / "dist" / "github-pages"
        if not (public / "index.html").is_file() or not (public / ".nojekyll").is_file():
            raise RuntimeError("Pages artifact must have index.html and .nojekyll in its root")
        items = sorted(p for p in public.rglob("*") if p.is_file())
        illegal = []
        for p in items:
            if p.is_symlink():
                illegal.append("symlink: " + str(p))
                continue
            rel = p.relative_to(public)
            if not safe_member(rel):
                illegal.append(rel.as_posix())
            if p.stat().st_size >= 100_000_000:
                illegal.append("oversized: " + rel.as_posix())
            if p.suffix.lower() in {".html", ".json", ".js", ".md"} and p.stat().st_size < 20_000_000:
                data = p.read_text(encoding="utf-8", errors="replace")
                if re.search(r"[A-Za-z]:(?:\\\\|/)(?:Users|dev|Mods)(?:\\\\|/)", data):
                    illegal.append("machine path: " + rel.as_posix())
        if illegal:
            raise RuntimeError("Public artifact contains prohibited candidates: " + ", ".join(illegal[:30]))
        if (root / ".git").exists():
            tracked = subprocess.run(
                ["git", "ls-files", "-z"], cwd=root, capture_output=True, check=True
            ).stdout.decode("utf-8", errors="replace").split("\0")
            unsafe_tracked = [
                name for name in tracked if name and not safe_member(Path(name))
                and name not in ("vendor/fbneo-selected-bios/fbneo-legacy-wasm.data",)
            ]
            if unsafe_tracked:
                raise RuntimeError(
                    "Unsafe tracked/staged files (inspect before first push): "
                    + ", ".join(unsafe_tracked[:30])
                )
        report = {
            "technical_checks": "PASS",
            "public_file_count": len(items),
            "static_artifact": str(public),
            "published": False,
            "license_redistribution_clearance": "NOT_VERIFIED_BY_THIS_TOOL",
            "note": "Manual license and corresponding-source review required before publishing vendor binaries.",
        }
        reportdir = root / "dist" / "reports"
        reportdir.mkdir(parents=True, exist_ok=True)
        (reportdir / "github_pages_preflight.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("[PASS] TECHNICAL_PREFLIGHT; files:", len(items))
        print("[REPORT]", reportdir / "github_pages_preflight.json")
        print("[HOLD] PUBLICATION REQUIRES MANUAL BINARY-LICENSE / CORRESPONDING-SOURCE REVIEW")
    except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
        print("[FAIL]", exc, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
