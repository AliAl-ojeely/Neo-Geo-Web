import hashlib, importlib.util, json, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("upgrader", ROOT / "upgrade_v0151.py")
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class HotfixInstallerTests(unittest.TestCase):
    # Create an isolated patch and target project with preservation markers and a copy of the pinned core.
    def fixture(self, folder):
        package = Path(folder) / "package"
        project = Path(folder) / "project"
        package.mkdir()
        project.mkdir()
        for root in [package, project]:
            (root / "web").mkdir()
        (project / "manage.py").write_text("VERSION = '0.1.5'", encoding="utf-8")
        (project / "web/app.js").write_text("old", encoding="utf-8")
        (project / "config.json").write_text("user config", encoding="utf-8")
        (project / "work").mkdir()
        (project / "work/save-marker").write_bytes(b"user save")
        core = project / "vendor/fbneo-selected-bios/fbneo-legacy-wasm.data"
        core.parent.mkdir(parents=True)
        core.write_bytes(
            (ROOT / "vendor/fbneo-selected-bios/fbneo-legacy-wasm.data").read_bytes()
        )
        (package / "web/app.js").write_text("new", encoding="utf-8")
        manifest = {
            "version": "0.1.5.1",
            "files": {"web/app.js": hashlib.sha256(b"new").hexdigest()},
        }
        (package / "hotfix_manifest.json").write_text(
            json.dumps(manifest), encoding="utf-8"
        )
        return package, project

    # Verify dry-run isolation, patch installation, backup creation, and preservation of configuration, core, and saves.
    def test_dry_run_and_apply_preserve_configuration_core_and_save(self):
        with tempfile.TemporaryDirectory() as tmp:
            package, project = self.fixture(tmp)
            updater.apply(package, project, True)
            self.assertEqual((project / "web/app.js").read_text(), "old")
            self.assertFalse((project / "backups").exists())
            report = updater.apply(package, project)
            self.assertEqual((project / "web/app.js").read_text(), "new")
            self.assertEqual((project / "config.json").read_text(), "user config")
            self.assertEqual((project / "work/save-marker").read_bytes(), b"user save")
            self.assertEqual((Path(report["backup"]) / "web/app.js").read_text(), "old")
            self.assertEqual(
                updater.sha(
                    project / "vendor/fbneo-selected-bios/fbneo-legacy-wasm.data"
                ),
                updater.PIN,
            )

    # Reject a parent-traversal manifest while preserving the existing target source.
    def test_traversal_rejected_before_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            package, project = self.fixture(tmp)
            (package / "hotfix_manifest.json").write_text(
                json.dumps({"version": "0.1.5.1", "files": {"../outside": "bad"}})
            )
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                updater.apply(package, project)
            self.assertEqual((project / "web/app.js").read_text(), "old")

    # Reject protected configuration targets without changing user data.
    def test_vendor_or_user_data_targets_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            package, project = self.fixture(tmp)
            (package / "hotfix_manifest.json").write_text(
                json.dumps({"version": "0.1.5.1", "files": {"config.json": "bad"}})
            )
            with self.assertRaisesRegex(ValueError, "not allowed"):
                updater.apply(package, project)
            self.assertEqual((project / "config.json").read_text(), "user config")

    # Reject payload checksum tampering before any backup or source replacement occurs.
    def test_tampered_patch_rejected_before_backup_or_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            package, project = self.fixture(tmp)
            (package / "web/app.js").write_text("tampered")
            with self.assertRaisesRegex(ValueError, "checksum"):
                updater.apply(package, project)
            self.assertFalse((project / "backups").exists())
            self.assertEqual((project / "web/app.js").read_text(), "old")
