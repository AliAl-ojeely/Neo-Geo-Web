"""Build the small source hotfix, excluding vendor, ROM, BIOS and browser data."""

from pathlib import Path
import hashlib, json, shutil, zipfile, datetime

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "manage.py",
    "README.md",
    "upgrade_v0151.py",
    "app/server.py",
    "app/web_distribution.py",
    "web/index.html",
    "web/player.html",
    "web/settings.html",
    "web/player.js",
    "web/runtime-diagnostics.js",
    "web/data/catalog.json",
    "web/library/filesystem-access.js",
    "web/library/indexeddb-store.js",
    "web/library/library-manager.js",
    "web/library/library-ui.js",
    "web/library/rom-provider.js",
    "web/library/session-navigation.js",
    "web/library/player-recovery.js",
    "docs/V0151_BRAVE_HOTFIX_AR.md",
    "tests/local_library.test.cjs",
    "tests/test_hotfix_v0151.py",
]


# Build the allowlisted source hotfix with a hash manifest, verify the ZIP, and write its local report.
def main():
    stage = (
        ROOT
        / "work/v0151"
        / ("patch-" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S"))
    )
    stage.mkdir(parents=True)
    manifest = {
        "version": "0.1.5.1",
        "core_sha256": "2d2c70daffbc70448dec0516abec37a96486adaf8a2af090de5326b59bce24f9",
        "files": {},
    }
    for name in FILES:
        source = ROOT / name
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        manifest["files"][name] = hashlib.sha256(source.read_bytes()).hexdigest()
    (stage / "hotfix_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    (stage / "INSTALL_AR.txt").write_text(
        'أوقف خادم الاختبار، وفك الحزمة خارج المشروع. نفذ py -3 upgrade_v0151.py --project "D:/dev/Neo-Geo-Web-Port" --check ثم الأمر نفسه دون --check. بعدها افتح Terminal في المشروع ونفذ py -3 manage.py web build ثم py -3 manage.py web verify، وشغل py -3 tools/static_preview_v015.py. حدّث صفحة المكتبة مرة واحدة لاستقبال الشيفرة الجديدة؛ لا تمسح بيانات الموقع. الإصلاح لا يحتوي ROM أو BIOS أو Core ولا يمس حفظ المتصفح. اقرأ docs/V0151_BRAVE_HOTFIX_AR.md.',
        encoding="utf-8",
    )
    archive = ROOT / "dist/NeoGeo_Web_Emu_v0.1.5.1_Hotfix.zip"
    archive.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in stage.rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(stage).as_posix())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert set(z.namelist()) == set(FILES) | {
            "hotfix_manifest.json",
            "INSTALL_AR.txt",
        }
    report = {
        "status": "PASS",
        "archive": str(archive),
        "bytes": archive.stat().st_size,
        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "payload_files": len(FILES),
        "rom_bios_core_or_browser_data_included": False,
        "stage": str(stage),
    }
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports/hotfix_package_v0151.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(report)


if __name__ == "__main__":
    main()
