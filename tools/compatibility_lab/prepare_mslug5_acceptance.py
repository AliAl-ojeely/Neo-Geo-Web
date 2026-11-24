"""Audit all Metal Slug 5 cartridge members and add only to the private acceptance site."""

import json
from pathlib import Path
import re
import shutil
from zipfile import ZipFile
import zlib
import hashlib

from tools.compatibility_lab.prepare_kof2003_acceptance import ROOT, LAB, SOURCE, digest, validate


# Resolve the descriptor's shared macros without including adjacent drivers' alternate ROMs.
def definitions(text, driver):
    lines = iter(text.splitlines())
    macros = {}
    for line in lines:
        if not re.match(r"#define\s+MSLUG5_DECRYPTED_", line):
            continue
        while line.rstrip().endswith("\\"):
            line = line.rstrip()[:-1] + " " + next(lines)
        name, value = re.match(r"#define\s+(\w+)\s+(.*)", line).groups()
        macros[name] = value
    body = re.search(r"static struct BurnRomInfo " + re.escape(driver) + r"RomDesc\[\] = \{(.*?)\n\};", text, re.S).group(1)
    for _ in range(10):
        expanded = re.sub(r"\bMSLUG5_DECRYPTED_\w+\b", lambda m: macros[m[0]], body)
        if expanded == body:
            break
        body = expanded
    return {name: (int(size, 16), crc.lower(), flags.strip())
            for name, size, crc, flags in re.findall(r'\{\s*"([^"]+)"\s*,\s*0x([0-9a-fA-F]+),\s*0x([0-9a-fA-F]+),\s*([^}]+)\}', body)}


# Reuse the validated engine/BIOS boundary and check every Metal Slug 5 member independently.
def main():
    validate()
    signatures = json.loads((ROOT / "tools/compatibility_lab/priority_import_signatures.json").read_text("utf8"))
    source = SOURCE / "src/burn/drv/neogeo/d_neogeo.cpp"
    expected = definitions(source.read_text("utf8"), "mslug5fd")
    requirements = signatures["games"]["mslug5"]["mslug5fd"]
    assert set(expected) == {row["name"] for row in requirements}
    hbmame = ROOT / "work/recovery/final-five-resume/reference-source/hbmame/src/hbmame/drivers/mslug5.cpp"
    reference = next(row for row in signatures["additional_reference_sources"] if row["url"].endswith("mslug5.cpp"))
    assert digest(hbmame.read_bytes()) == reference["sha256"]
    strong = {}
    text = hbmame.read_text("utf8").lower()
    for size, crc, sha1 in re.findall(r'0x([0-9a-f]+),\s*crc\(([0-9a-f]+)\) sha1\(([0-9a-f]+)\)', text):
        strong.setdefault((int(size, 16), crc), set()).add(sha1)
    for macro, size in [("neo_sfix_128k", 0x20000), ("neo_bios_audio_128k", 0x20000), ("neo_bios_audio_512k", 0x80000)]:
        for crc, sha1 in re.findall(macro + r'\([^\n]*crc\(([0-9a-f]+)\) sha1\(([0-9a-f]+)\)', text):
            strong.setdefault((size, crc), set()).add(sha1)
    imported = json.loads((ROOT / "reports/MSLUG5_ACCEPTANCE_IMPORT.json").read_text("utf8"))["games"]["mslug5"][0]
    archive = Path(imported["archive"])
    assert digest(archive.read_bytes()) == imported["archive_sha256"]
    members = []
    with ZipFile(archive) as z:
        assert len(z.namelist()) == len(set(z.namelist())) and set(z.namelist()) == set(expected)
        assert z.testzip() is None
        for row in requirements:
            name = row["name"]
            data = z.read(name)
            size, crc, flags = expected[name]
            assert (size, crc) == (row["size"], row["crc32"])
            assert len(data) == size and f"{zlib.crc32(data):08x}" == crc, name
            sha1 = hashlib.sha1(data).hexdigest()
            reference_sha1 = strong.get((size, crc), set()) | set(row["sha1"])
            if reference_sha1:
                assert sha1 in reference_sha1, name
            members.append(dict(name=name, size=size, crc32=crc, sha1=sha1, sha256=digest(data), flags=flags,
                                status="PASS_SIZE_CRC", independent_sha1="PASS" if reference_sha1 else "NOT AVAILABLE"))
    site = LAB / "site"
    p = site / "data/catalog.json"
    catalog = json.loads(p.read_text("utf8"))
    catalog["games"] = [g for g in catalog["games"] if g["id"] != "mslug5"]
    active_before = digest((ROOT / "web/data/catalog.json").read_bytes())
    fixture = LAB / "fixture-mslug5"
    (fixture / "ROMs").mkdir(parents=True, exist_ok=True)
    shutil.copy2(archive, fixture / "ROMs" / archive.name)
    for name in ("BIOS",):
        shutil.copytree(LAB / "fixture" / name, fixture / name)
    (fixture / "PREVIEWS").mkdir()
    config = json.loads((ROOT / "config.json").read_text("utf8"))
    image = Path(config["screenshots"]) / "9de5.bmp"
    shutil.copy2(image, fixture / "PREVIEWS" / image.name)
    catalog["games"].append(dict(id="mslug5", filename="mslug5.zip", title="Metal Slug 5", category="action",
        selected_filename=archive.name, driver="mslug5fd", size=archive.stat().st_size, sha256=digest(archive.read_bytes()),
        screenshot="9de5.bmp", original_preview_id="9de5", parent=None, dependencies=[], self_contained_verified=True,
        boot_status="NOT VERIFIED", game_compatibility="NOT VERIFIED"))
    p.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf8")
    from app.offline_manifest import write_bundle
    write_bundle(site, ROOT / "tools/offline-sw.template.js")
    assert active_before == digest((ROOT / "web/data/catalog.json").read_bytes())
    report = dict(status="PASS_SIZE_CRC", members=members, member_count=len(members),
                  archive_sha256=digest(archive.read_bytes()), archive=str(archive),
                  independent_sha1_pass=sum(m["independent_sha1"] == "PASS" for m in members),
                  browser_status="NOT VERIFIED", active_catalog_unchanged=True,
                  core_sha256=signatures["core_sha256"], fbneo_revision=signatures["fbneo_revision"],
                  reference_source=reference, fixture=str(fixture))
    (ROOT / "reports/MSLUG5_ACCEPTANCE_PACKAGE_AUDIT.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    print(json.dumps({key: report[key] for key in ("status", "member_count", "independent_sha1_pass")}))


if __name__ == "__main__":
    main()
