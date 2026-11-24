"""Validate the private cartridge and prepare an isolated, non-published acceptance site."""

import hashlib
import os
import json
from pathlib import Path
import re
import shutil
import subprocess
from zipfile import ZipFile
import zlib

ROOT = Path(__file__).resolve().parents[2]
LAB = ROOT / "work/recovery/kof2003-acceptance"
SOURCE = Path(os.environ.get("NG_FBNEO_SOURCE", ROOT / "work/recovery-build/FBNeo")).resolve()


# Hash bytes without interpreting ROM contents or changing source archives.
def digest(data):
    return hashlib.sha256(data).hexdigest()


# Read all cartridge definitions, including the shared decrypted-component macros.
def validate():
    signatures = json.loads((ROOT / "tools/compatibility_lab/priority_import_signatures.json").read_text("utf8"))
    core = ROOT / "vendor/fbneo-selected-bios/fbneo-legacy-wasm.data"
    assert digest(core.read_bytes()) == signatures["core_sha256"], "Core hash changed"
    revision = subprocess.check_output(["git", "-C", str(SOURCE), "rev-parse", "HEAD"], text=True).strip()
    assert revision == signatures["fbneo_revision"], "FBNeo source revision differs"
    source = SOURCE / "src/burn/drv/neogeo/d_neogeo.cpp"
    text = source.read_text("utf8")
    section = text[text.index("#define\tKOF2003_DECRYPTED_TEXT"):text.index("STDROMPICKEXT(kof2k3fd")]
    definitions = {
        name: (int(size, 16), crc.lower(), flags.strip())
        for name, size, crc, flags in re.findall(r'\{\s*"([^"]+)"\s*,\s*0x([0-9a-fA-F]+),\s*0x([0-9a-fA-F]+),\s*([^}]+)\}', section)
    }
    requirements = signatures["games"]["kof2003"]["kof2k3fd"]
    assert set(definitions) == {row["name"] for row in requirements}, "Incomplete component expansion"
    reference = ROOT / "work/recovery/neogeo_reference.xml"
    assert digest(reference.read_bytes()) == signatures["reference_xml_sha256"]
    hbmame = ROOT / "work/recovery/final-five-resume/reference-source/hbmame/src/hbmame/drivers/kof2003.cpp"
    reference_info = signatures["additional_reference_sources"][0]
    assert digest(hbmame.read_bytes()) == reference_info["sha256"]
    strong = {}
    for size, crc, sha1 in re.findall(r'0x([0-9a-fA-F]+),\s*CRC\(([0-9a-f]+)\) SHA1\(([0-9a-f]+)\)', hbmame.read_text("utf8")):
        strong.setdefault((int(size, 16), crc), set()).add(sha1)
    # The 512 KiB audio macro states its size in the macro name instead of an argument.
    for crc, sha1 in re.findall(r'NEO_BIOS_AUDIO_512K\([^\n]*CRC\(([0-9a-f]+)\) SHA1\(([0-9a-f]+)\)', hbmame.read_text("utf8")):
        strong.setdefault((0x80000, crc), set()).add(sha1)
    imported = json.loads((ROOT / "reports/FINAL_FIVE_KOF2003_RESUME_IMPORT.json").read_text("utf8"))["games"]["kof2003"][0]
    archive = Path(imported["archive"])
    assert digest(archive.read_bytes()) == imported["archive_sha256"]
    members = []
    with ZipFile(archive) as z:
        names = z.namelist()
        assert len(names) == len(set(names)), "Duplicate archive members"
        assert set(names) == set(definitions), "Unexpected or missing cartridge members"
        assert z.testzip() is None, "ZIP integrity failed"
        for row in requirements:
            name = row["name"]
            data = z.read(name)
            size, crc, flags = definitions[name]
            actual_crc = f"{zlib.crc32(data):08x}"
            actual_sha1 = hashlib.sha1(data).hexdigest()
            assert (size, crc) == (row["size"], row["crc32"])
            assert len(data) == size and actual_crc == crc, name
            expected_sha1 = strong.get((size, crc), set()) | set(row["sha1"])
            assert expected_sha1 and actual_sha1 in expected_sha1, "Independent SHA1 mismatch: " + name
            members.append(dict(name=name, size=size, crc32=actual_crc, sha1=actual_sha1,
                                sha256=digest(data), flags=flags, status="PASS"))
    return archive, dict(status="PASS", member_count=len(members), members=members,
                         archive_sha256=digest(archive.read_bytes()), core_sha256=digest(core.read_bytes()),
                         fbneo_revision=revision, fbneo_source_sha256=digest(source.read_bytes()),
                         source_scope="Cartridge members plus separately validated BIOS archive; no parent cartridge required",
                         independent_sha1_source=reference_info["url"], browser_status="NOT VERIFIED")


# Copy only the candidate, approved BIOS and existing software distribution into a private lab.
def main():
    archive, report = validate()
    LAB.mkdir(parents=True, exist_ok=True)
    site = LAB / "site"
    if site.exists():
        raise FileExistsError("Lab exists; preserve its evidence and use it without rebuilding: " + str(LAB))
    catalog_path = ROOT / "web/data/catalog.json"
    before = digest(catalog_path.read_bytes())
    shutil.copytree(ROOT / "dist/github-pages", site)
    fixture = LAB / "fixture"
    for folder in ("ROMs", "PREVIEWS", "BIOS"):
        (fixture / folder).mkdir(parents=True, exist_ok=True)
    shutil.copy2(archive, fixture / "ROMs" / archive.name)
    from app.catalog import pick_bios
    bios = pick_bios()
    if bios is None:
        raise FileNotFoundError("Configure a local BIOS that matches the static catalog")
    p = site / "data/catalog.json"
    catalog = json.loads(p.read_text("utf8"))
    assert digest(bios.read_bytes()) == catalog["bios"]["sha256"]
    assert bios.stat().st_size == catalog["bios"]["size"]
    shutil.copy2(bios, fixture / "BIOS/neogeo.zip")
    config = json.loads((ROOT / "config.json").read_text("utf8"))
    image = Path(config["screenshots"]) / "208af.bmp"
    shutil.copy2(image, fixture / "PREVIEWS" / image.name)
    catalog["games"] = [g for g in catalog["games"] if g["id"] != "kof2003"]
    catalog["games"].append(dict(id="kof2003", filename="kof2003.zip", title="The King of Fighters 2003",
        category="fighting", selected_filename=archive.name, driver="kof2k3fd", size=archive.stat().st_size,
        sha256=report["archive_sha256"], screenshot="208af.bmp", original_preview_id="208af", parent=None, dependencies=[],
        self_contained_verified=True, boot_status="NOT VERIFIED", game_compatibility="NOT VERIFIED"))
    p.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf8")
    from app.offline_manifest import write_bundle
    write_bundle(site, ROOT / "tools/offline-sw.template.js")
    assert digest(catalog_path.read_bytes()) == before, "Active catalog changed"
    report.update(active_catalog_sha256=before, active_catalog_unchanged=True,
                  bios_sha256=digest(bios.read_bytes()), lab=str(LAB), site_url="http://127.0.0.1:8793/Neo-Geo-Web/")
    (ROOT / "reports/KOF2003_ACCEPTANCE_PACKAGE_AUDIT.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    print(json.dumps({"status": report["status"], "members": len(report["members"]), "lab": str(LAB)}))


if __name__ == "__main__":
    main()
