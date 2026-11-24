import hashlib
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile
import zlib

from import_priority_games import run


class PriorityImporterTests(unittest.TestCase):
    def requirements(self, payload, sha1=None):
        return {
            "core_sha256": "test fixture",
            "games": {"test": {"testdriver": [{
                "name": "required.bin",
                "size": len(payload),
                "crc32": f"{zlib.crc32(payload):08x}",
                "sha1": [sha1 or hashlib.sha1(payload).hexdigest()],
            }]}},
        }

    def test_nested_zip_uses_signature_and_existing_output_is_preserved(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            payload = b"importer test content"
            nested = BytesIO()
            with ZipFile(nested, "w") as archive:
                archive.writestr("arbitrary-member-name", payload)
            source = root / "package.zip"
            with ZipFile(source, "w") as archive:
                archive.writestr("nested.zip", nested.getvalue())
            original = source.read_bytes()
            output = root / "derived"
            report = run([source], self.requirements(payload), ["test"], output)
            result = report["games"]["test"][0]
            self.assertEqual(result["status"], "READY_FOR_BROWSER_TEST")
            with ZipFile(result["archive"]) as archive:
                self.assertEqual(archive.read("required.bin"), payload)
            self.assertTrue(result["matches"]["required.bin"]["reference_sha1_verified"])
            target = Path(result["archive"])
            first = target.read_bytes()
            again = run([source], self.requirements(payload), ["test"], output)
            self.assertEqual(again["games"]["test"][0]["archive_status"], "EXISTING_FILE_PRESERVED")
            self.assertEqual(target.read_bytes(), first)
            self.assertEqual(source.read_bytes(), original)

    def test_crc_candidate_with_wrong_reference_sha1_is_rejected(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            data = b"test content"
            source = root / "payload.bin"
            source.write_bytes(data)
            result = run([root], self.requirements(data, "0" * 40), ["test"], root / "out")
            self.assertEqual(result["games"]["test"][0]["status"], "MISSING_MEMBERS")
            self.assertEqual(len(result["rejected_sha1"]), 1)
            self.assertFalse((root / "out").exists())

    def test_retail_program_requires_both_reference_chips(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "p1.bin"
            first, second = b"abcd", b"efghijkl"
            source.write_bytes(b"badcfehgjilk")
            rows = []
            for name, payload in zip(("263-ph1.p1", "263-ph2.sp2"), (first, second)):
                rows.append({
                    "name": name, "size": len(payload),
                    "crc32": f"{zlib.crc32(payload):08x}",
                    "sha1": [hashlib.sha1(payload).hexdigest()],
                })
            reference = {"core_sha256": "fixture", "games": {"mslug4": {"mslug4h": rows}}}
            result = run([source], reference, ["mslug4"])["games"]["mslug4"][0]
            self.assertEqual(result["status"], "READY_FOR_BROWSER_TEST")
            self.assertIn("word-swap", result["matches"]["263-ph1.p1"]["source"])
            source.write_bytes(b"badcfehgjill")
            result = run([source], reference, ["mslug4"])["games"]["mslug4"][0]
            self.assertEqual(len(result["missing"]), 2)
