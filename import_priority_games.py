"""Audit authorized Neo Geo files and assemble complete, verified FBNeo cartridge ZIPs."""

import argparse
from collections import defaultdict
from contextlib import contextmanager
import hashlib
from itertools import chain
import json
import os
from pathlib import Path
import shutil
import tempfile
from zipfile import BadZipFile, ZipFile, ZIP_DEFLATED
import zlib


ROOT = Path(__file__).resolve().parent
REFERENCE = ROOT / "tools/compatibility_lab/priority_import_signatures.json"
GAMES = ("kof99", "kof2000", "mslug4", "mslug5", "kof2003")
CORE = ROOT / 'vendor/fbneo-selected-bios/fbneo-legacy-wasm.data'
NESTED_LIMIT = 256 * 1024 * 1024


@contextmanager
def archive_members(archive, label, sizes, warnings, nested=True):
    """Yield relevant members without extracting filenames from an archive."""
    def entries():
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            name = f"{label}!{entry.filename}"
            try:
                if entry.file_size in sizes and entry.CRC in sizes[entry.file_size]:
                    yield name, archive.read(entry)
                if nested and entry.filename.lower().endswith(".zip"):
                    if entry.file_size > NESTED_LIMIT:
                        warnings.append(f"{name}: nested ZIP exceeds size limit")
                        continue
                    with tempfile.TemporaryFile() as spool, archive.open(entry) as member:
                        shutil.copyfileobj(member, spool)
                        spool.seek(0)
                        with ZipFile(spool) as child, archive_members(
                            child, name, sizes, warnings, nested=False
                        ) as candidates:
                            yield from candidates
            except (BadZipFile, OSError, RuntimeError, NotImplementedError, EOFError, zlib.error) as exc:
                warnings.append(f"{name}: {exc}")
    yield entries()


def candidate_files(paths):
    """Skip symlinked files and avoid scanning the same canonical file twice."""
    seen = set()
    for path in paths:
        candidates = sorted(path.rglob("*")) if path.is_dir() else [path]
        for file in candidates:
            if file.is_symlink() or not file.is_file():
                continue
            canonical = file.resolve()
            if canonical not in seen:
                seen.add(canonical)
                yield canonical


def scan(files, requirements, warnings):
    sizes = defaultdict(set)
    for member in requirements:
        size = member["size"]
        sizes[size].add(int(member["crc32"], 16))
    for path in files:
        try:
            if path.suffix.lower() == ".zip":
                with ZipFile(path) as archive, archive_members(
                    archive, str(path), sizes, warnings
                ) as members:
                    yield from members
            elif path.stat().st_size in sizes:
                with path.open("rb") as source:
                    yield str(path), source.read(max(sizes) + 1)
        except (BadZipFile, OSError, RuntimeError, NotImplementedError, EOFError, zlib.error) as exc:
            warnings.append(f"{path}: {exc}")


def collect(candidates, requirements):
    by_signature = defaultdict(list)
    for row in requirements:
        by_signature[(row["size"], f'{int(row["crc32"], 16):08x}')].append(row)

    found = {}
    rejected = []
    for source, payload in candidates:
        signature = (len(payload), f"{zlib.crc32(payload):08x}")
        matches = by_signature.get(signature, ())
        if not matches:
            continue
        sha1 = hashlib.sha1(payload).hexdigest()
        for row in matches:
            key = (row["driver"], row["name"])
            if row["sha1"] and sha1 not in row["sha1"]:
                rejected.append({"source": source, "member": row["name"], "sha1": sha1})
            elif key not in found:
                found[key] = (payload, {
                    "source": source, "sha1": sha1,
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "reference_sha1_verified": bool(row["sha1"]),
                })
    return found, rejected


def assemble(directory, driver, matches):
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{driver}.zip"
    with tempfile.NamedTemporaryFile(dir=directory, suffix=".tmp", delete=False) as file:
        temporary = Path(file.name)
    try:
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED, compresslevel=4) as archive:
            for member, (payload, _) in matches.items():
                archive.writestr(member, payload)
        with ZipFile(temporary) as archive:
            if set(archive.namelist()) != matches.keys() or archive.testzip() is not None:
                raise ValueError(f"Archive integrity check failed: {driver}")
            for member, (_, proof) in matches.items():
                if hashlib.sha256(archive.read(member)).hexdigest() != proof["sha256"]:
                    raise ValueError(f"Archive member hash mismatch: {member}")
        # A hard link publishes the verified file atomically and cannot replace an existing ZIP.
        os.link(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return str(target)


def project_layout_candidates(files, requirements, found, warnings):
    from app import compatibility as c, rom_layouts

    authorized = set(files)
    manifest = c.load(c.REPORTS / "rom_library_manifest_v014.json", {})
    archives = []
    for entry in manifest.get("archives", []):
        path = c.catalog.pick_rom(entry["filename"])
        if path and path.resolve() in authorized and c.sha(path) == entry["sha256"]:
            archives.append(entry)
    names = {entry["filename"] for entry in archives}
    wanted = {(row["crc32"], row["size"]) for row in requirements
              if (row["driver"], row["name"]) not in found}
    index = c.member_index(archives)
    seen = set()
    for signature in sorted(wanted):
        for member in index[signature]:
            transform = member.get("transform")
            if not transform or member["sha256"] in seen:
                continue
            dependencies = {member["archive"]}
            dependencies.update(part.get("archive", member["archive"])
                                for part in transform.get("segments", []))
            if not dependencies <= names:
                continue
            seen.add(member["sha256"])
            try:
                payload = rom_layouts.materialize(member)
                yield f"layout:{member['archive']}!{member['name']}", payload
            except (ValueError, OSError, BadZipFile, KeyError, ImportError) as exc:
                warnings.append(f"{member['archive']} layout: {exc}")
    if any(size == 0x80000 and crc == "3230e10f" for crc, size in wanted):
        source = next((a for a in archives if a["filename"] == "kof2003.zip"), None)
        if source:
            from tools.compatibility_lab.kof2003_pcb_layout import derive
            try:
                payloads, proof = derive(c.catalog.pick_rom(source["filename"]))
                for member, payload in payloads.items():
                    yield f"layout:kof2003.zip!PCB text recovery/{member}", payload
            except (ValueError, OSError, BadZipFile, KeyError) as exc:
                warnings.append(f"kof2003 PCB layout: {exc}")
    if ("768ee64a", 0x400000) in wanted and "mslug5.zip" in names:
        from tools.compatibility_lab.mslug5_program_layout import derive as derive_ms5
        try:
            payloads, proof = derive_ms5(c.catalog.pick_rom("mslug5.zip"))
            for member, payload in payloads.items():
                yield f"layout:mslug5.zip!joined program recovery/{member}", payload
        except (ValueError, OSError, BadZipFile, KeyError) as exc:
            warnings.append(f"mslug5 joined program: {exc}")
    try:
        yield from mslug5_fixed_layer_candidates(archives, wanted)
    except (ValueError, OSError, BadZipFile, KeyError) as exc:
        warnings.append(f"mslug5 fixed layer: {exc}")
    for driver in ("mslug5", "mslug5h"):
        program = [row for row in requirements if row["driver"] == driver
                   and "-p" in row["name"]]
        if program and all((driver, row["name"]) in found for row in program):
            try:
                yield from mslug5_official_layout_candidates(archives)
            except (ValueError, OSError, BadZipFile, KeyError, ImportError) as exc:
                warnings.append(f"mslug5 official layout: {exc}")
            break


def mslug5_fixed_layer_candidates(archives, wanted):
    """Restore the two proved mslug5fd graphics members from the audited local dump."""
    from app import catalog

    variants = {(0x800000, "c9f8c357"), (0x800000, "fafc3eb9")}
    if not variants & {(size, crc) for crc, size in wanted}:
        return
    entry = next((item for item in archives if item["filename"] == "mslug5.zip"), None)
    if not entry:
        return
    with ZipFile(catalog.pick_rom(entry["filename"])) as archive:
        fixed = archive.read("268d-s1.rom")
        if len(fixed) != 0x20000:
            raise ValueError("Unexpected Metal Slug 5 fixed-layer size")
        lanes = [bytearray(archive.read(f"268d-c{i}.rom")[0x800000:]) for i in (3, 4)]
    if any(len(lane) != 0x800000 for lane in lanes):
        raise ValueError("Unexpected Metal Slug 5 graphics layout")
    # The final 128 KiB of the interleaved pair embeds the independently dumped fixed layer.
    tail = 0x1000000 - len(fixed)
    for source, value in enumerate(fixed):
        offset = tail + ((source & ~31) | ((source & 7) << 2)
                         | ((~source & 8) >> 2) | ((source & 16) >> 4))
        lanes[offset & 1][offset // 2] = value
    for chip, lane in zip((7, 8), lanes):
        yield f"layout:mslug5.zip!C{chip} with fixed layer", bytes(lane)


def mslug5_official_layout_candidates(archives):
    """Materialize previously verified CMC50 and PCM2 layouts once program ROMs are present."""
    from app import catalog
    from tools.compatibility_lab.cmc_inverse_lab import transform
    import numpy as np

    entry = next((item for item in archives if item["filename"] == "mslug5.zip"), None)
    if not entry:
        return
    with ZipFile(catalog.pick_rom(entry["filename"])) as archive:
        chips = [archive.read(f"268d-c{i}.rom") for i in range(1, 5)]
        audio = b"".join(archive.read(name) for name in sorted(archive.namelist())
                         if "-v" in name.lower())
    repaired = [data for _, data in mslug5_fixed_layer_candidates(
        archives, {("c9f8c357", 0x800000), ("fafc3eb9", 0x800000)}
    )]
    if any(len(chip) != 0x1000000 for chip in chips) or len(audio) != 0x1000000:
        raise ValueError("Unexpected Metal Slug 5 graphics or audio size")
    if tuple(f"{zlib.crc32(data):08x}" for data in repaired) != ("c9f8c357", "fafc3eb9"):
        raise ValueError("Metal Slug 5 fixed layer did not match its reference")
    chips[2] = chips[2][:0x800000] + repaired[0]
    chips[3] = chips[3][:0x800000] + repaired[1]
    graphics = np.empty(0x4000000, dtype=np.uint8)
    for index, chip in enumerate(chips):
        start = (index // 2) * 0x2000000 + index % 2
        graphics[start:start + 0x2000000:2] = np.frombuffer(chip, dtype=np.uint8)
    encrypted = transform(graphics, 50, 0x45, True)
    if transform(encrypted, 50, 0x45, False) != graphics.tobytes():
        raise ValueError("Metal Slug 5 CMC50 roundtrip failed")
    for index in range(8):
        start = (index // 2) * 0x1000000 + index % 2
        yield f"layout:mslug5.zip!CMC50 C{index + 1}", encrypted[start:start + 0x1000000:2]

    plain = np.frombuffer(audio, dtype=np.uint8)
    address = np.arange(len(audio), dtype=np.uint32)
    dst = ((address & 0xFEFFFE) | ((address & 0x10000) >> 16)
           | ((address & 1) << 16)) ^ 0x4E001
    src = (address + 0xFE2CF6) & 0xFFFFFF
    key = np.array((0xC3, 0xFD, 0x81, 0xAC, 0x6D, 0xE7, 0xBF, 0x9E), dtype=np.uint8)[dst & 7]
    output = np.empty_like(plain)
    output[src] = plain[dst] ^ key
    recovered = np.empty_like(plain)
    recovered[dst] = output[src] ^ key
    if not np.array_equal(plain, recovered):
        raise ValueError("Metal Slug 5 PCM2 roundtrip failed")
    for index, part in enumerate(np.split(output, 2), 1):
        yield f"layout:mslug5.zip!PCM2 V{index}", part.tobytes()


def retail_program_candidates(files, requirements, warnings):
    """Split the documented GOG AES program region and require both reference hashes."""
    chips = [row for row in requirements
             if row["driver"] == "mslug4h" and row["name"] in {"263-ph1.p1", "263-ph2.sp2"}]
    if len(chips) != 2:
        return
    chips.sort(key=lambda row: row["size"])
    length = sum(row["size"] for row in chips)
    for path in files:
        if path.name.lower() != "p1.bin":
            continue
        try:
            if path.stat().st_size != length:
                continue
            with path.open("rb") as source:
                data = source.read(length + 1)
            if len(data) != length:
                continue
            split = chips[0]["size"]
            swapped = bytearray(data)
            swapped[::2], swapped[1::2] = data[1::2], data[::2]
            for order, program in (("stored", data), ("word-swap", bytes(swapped))):
                parts = (program[:split], program[split:])
                if not all(f"{zlib.crc32(part):08x}" == row["crc32"]
                           and hashlib.sha1(part).hexdigest() in row["sha1"]
                           for row, part in zip(chips, parts)):
                    continue
                for part, offset in zip(parts, (0, split)):
                    yield f"{path} [{order}, offset {offset}]", part
                break
        except OSError as exc:
            warnings.append(f"{path}: {exc}")


def run(paths, reference, games, output=None, use_layouts=False):
    requirements = [
        dict(member, driver=driver)
        for game in games
        for driver, members in reference["games"][game].items()
        for member in members
    ]
    warnings = []
    files = list(candidate_files(paths))
    candidates = chain(scan(files, requirements, warnings),
                       retail_program_candidates(files, requirements, warnings))
    found, rejected = collect(candidates, requirements)
    if use_layouts:
        derived, rejected_derived = collect(
            project_layout_candidates(files, requirements, found, warnings), requirements
        )
        for key, value in derived.items():
            found.setdefault(key, value)
        rejected.extend(rejected_derived)
    builds = {}
    for game in games:
        builds[game] = []
        for driver, members in reference["games"][game].items():
            matches = {
                row["name"]: found[driver, row["name"]]
                for row in members if (driver, row["name"]) in found
            }
            missing = [row for row in members if row["name"] not in matches]
            builds[game].append({
                "driver": driver,
                "status": "MISSING_MEMBERS" if missing else "READY_FOR_BROWSER_TEST",
                "missing": missing,
                "matches": {name: proof for name, (_, proof) in matches.items()},
                "archive": None,
            })
            if not missing and output is not None:
                try:
                    target = assemble(output, driver, matches)
                    builds[game][-1]["archive"] = target
                    with open(target, "rb") as archive:
                        builds[game][-1]["archive_sha256"] = hashlib.file_digest(archive, "sha256").hexdigest()
                except FileExistsError:
                    builds[game][-1]["archive_status"] = "EXISTING_FILE_PRESERVED"
        builds[game].sort(key=lambda item: len(item["missing"]))
    return {"core_sha256": reference["core_sha256"], "games": builds,
            "rejected_sha1": rejected, "warnings": warnings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", nargs="+", type=Path, help="Authorized folders, ZIPs, or loose members")
    parser.add_argument("--game", action="append", choices=GAMES, help="Restrict to a named game")
    parser.add_argument("--output", type=Path, help="Private destination; omit for read-only audit")
    parser.add_argument("--project-layouts", action="store_true",
                        help="Reuse audited local recipes only for authorized source paths")
    args = parser.parse_args()
    for path in args.sources:
        if not path.is_file() and not path.is_dir():
            parser.error(f"Source does not exist: {path}")
    reference = json.loads(REFERENCE.read_text(encoding="utf-8"))
    with CORE.open("rb") as core:
        if hashlib.file_digest(core, "sha256").hexdigest() != reference["core_sha256"]:
            parser.error("Signature manifest does not match the installed FBNeo core")
    games = [game for game in GAMES if not args.game or game in args.game]
    if args.output:
        args.output = args.output.resolve()
        if any(args.output.is_relative_to(ROOT / folder)
               for folder in ("web", "dist/github-pages")):
            parser.error("Use a private output directory outside the public site")
    report = run(args.sources, reference, games, args.output, args.project_layouts)
    print(json.dumps(report, indent=2, ensure_ascii=True))
    return 0 if all(any(d["status"] == "READY_FOR_BROWSER_TEST" for d in variants)
                    for variants in report["games"].values()) else 2


if __name__ == "__main__":
    raise SystemExit(main())
