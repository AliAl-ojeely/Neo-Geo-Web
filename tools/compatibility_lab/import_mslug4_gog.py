"""Build an isolated mslug4h candidate from an authorized Code Mystics GOG install."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zlib

from import_priority_games import CORE, REFERENCE, assemble

ROOT = Path(__file__).resolve().parents[2]
REVISION = "d4f93671ae168ffff68d212b1e38932061335777"
UPSTREAM = ROOT / "work/recovery/final-priority/mslug4-recomp-source"
LAB = ROOT / "work/commercial-import"


def verify_member(data, spec):
    return (len(data) == spec["size"]
            and f"{zlib.crc32(data):08x}" == spec["crc32"]
            and hashlib.sha1(data).hexdigest() in spec["sha1"])


def check_program(gog, specs):
    for name, size in {"p1.bin": 5 * 1024**2, "c1.bin": 48 * 1024**2,
                       "m1.bin": 576 * 1024, "v1.bin": 16 * 1024**2}.items():
        if (gog / name).stat().st_size != size:
            raise ValueError(f"Unexpected Code Mystics region size: {name}")
    program = (gog / "p1.bin").read_bytes()
    if len(program) != 5 * 1024**2 or not all(
        verify_member(data, specs[name]) for name, data in
        [("263-ph1.p1", program[:1024**2]), ("263-ph2.sp2", program[1024**2:])]
    ):
        raise ValueError("GOG program does not match the documented AES release")


def build(gog, maps):
    reference = json.loads(REFERENCE.read_text("utf8"))
    with CORE.open("rb") as core:
        if hashlib.file_digest(core, "sha256").hexdigest() != reference["core_sha256"]:
            raise ValueError("Core differs from the signature manifest")
    specs = {m["name"]: m for m in reference["games"]["mslug4"]["mslug4h"]}
    check_program(gog, specs)
    for key, region in {"program":"maincpu", "graphics":"sprites", "audio":"audiocpu", "adpcm":"adpcma"}.items():
        if not (maps / key / f"{region}_map.npz").is_file():
            raise ValueError(f"Missing MAME probe map: {key}/{region}_map.npz")
    LAB.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=LAB) as scratch:
        sandbox = Path(scratch)
        for name in ("rebuild_set.py", "probe_decryption.py"):
            data = subprocess.check_output(["git", "-C", str(UPSTREAM), "show", f"{REVISION}:tools/{name}"])
            (sandbox / name).write_bytes(data)
        output = sandbox / "chips"
        subprocess.run([sys.executable, str(sandbox / "rebuild_set.py"), "--gog", str(gog),
                        "--maps", str(maps), "--out", str(output)],
                       check=True, cwd=sandbox, timeout=900)
        if {p.name for p in output.iterdir()} != specs.keys():
            raise ValueError("Unexpected rebuilt member set")
        matches = {}
        for name, spec in specs.items():
            data = (output / name).read_bytes()
            if not verify_member(data, spec):
                raise ValueError(f"Reference size/CRC32/SHA-1 mismatch: {name}")
            matches[name] = data, {"sha256": hashlib.sha256(data).hexdigest()}
        archive = assemble(LAB, "mslug4h", matches)
        return {"status": "READY_FOR_BROWSER_TEST", "archive": archive, "revision": REVISION,
                "archive_sha256": hashlib.sha256(Path(archive).read_bytes()).hexdigest(),
                "members": {name: {**specs[name], **proof} for name, (_, proof) in matches.items()}}


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--gog", type=Path, required=True)
    cli.add_argument("--maps", type=Path)
    args = cli.parse_args()
    specs = {m["name"]: m for m in json.loads(REFERENCE.read_text("utf8"))["games"]["mslug4"]["mslug4h"]}
    if args.maps:
        report = build(args.gog.resolve(), args.maps.resolve())
        (LAB / "mslug4h-import.json").write_text(json.dumps(report, indent=2), encoding="utf8")
        print(json.dumps(report, indent=2))
    else:
        check_program(args.gog, specs)
        print("AES program size, CRC32 and SHA-1 match. Supply trusted probe maps to rebuild the full set.")
