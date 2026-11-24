"""Restore approved package members without overwriting local files."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sync(package_directory, library_directory):
    catalog = json.loads((ROOT / "web/data/catalog.json").read_text("utf8"))["games"]
    expected = {
        "ROMs": {g["selected_filename"]: (g["size"], g["sha256"]) for g in catalog},
        "PREVIEWS": {g["screenshot"]: None for g in catalog if g["screenshot"]},
    }
    packages = json.loads((ROOT / "dist/reports/package_hashes.json").read_text("utf8"))["packages"]
    report = {}
    for role, files in expected.items():
        package = next(row for row in packages if row["package"] == role)
        archive = package_directory / Path(package["path"]).name
        folder = library_directory / role
        if archive.stat().st_size != package["bytes"] or digest(archive) != package["sha256"]:
            raise ValueError(f"Unapproved package: {archive}")
        rows = {m["name"]: m for m in package["members"]}
        results = report[role] = {}
        with ZipFile(archive) as source:
            if len(source.namelist()) != len(set(source.namelist())):
                raise ValueError("Duplicate archive members")
            for name, pin in files.items():
                if Path(name).name != name or any(c in name for c in "/\\:"):
                    raise ValueError(f"Invalid catalog filename: {name}")
                member = f"{role}/{name}"
                record = rows[member]
                signature = record["size"], record["sha256"]
                if (pin is not None and signature != pin) or source.getinfo(member).file_size != signature[0]:
                    raise ValueError(f"Catalog/package mismatch: {member}")
                target = folder / name
                if target.exists() or target.is_symlink():
                    results[name] = ("MATCH" if not target.is_symlink() and target.is_file()
                                     and (target.stat().st_size, digest(target)) == signature else "CONFLICT")
                    continue
                with tempfile.TemporaryDirectory(dir=folder) as scratch:
                    staged = Path(scratch) / "member"
                    with source.open(member) as data, staged.open("wb") as output:
                        shutil.copyfileobj(data, output)
                    if (staged.stat().st_size, digest(staged)) != signature:
                        raise ValueError(f"Bad member: {member}")
                    try:
                        os.link(staged, target)
                    except FileExistsError:
                        results[name] = "CONFLICT"
                    else:
                        results[name] = "IMPORTED"
    (ROOT / "reports/APPROVED_LIBRARY_SYNC.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    for role, results in report.items():
        print(role, {status: list(results.values()).count(status) for status in set(results.values())})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packages", required=True, type=Path)
    parser.add_argument("--library", required=True, type=Path)
    args = parser.parse_args()
    sync(args.packages.resolve(), args.library.resolve())
