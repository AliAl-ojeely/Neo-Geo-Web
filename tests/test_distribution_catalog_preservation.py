from contextlib import ExitStack
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from app import web_distribution as distribution


class DistributionCatalogPreservationTests(unittest.TestCase):
    # Selective test matrices must not remove established entries or rewrite their metadata.
    def test_subset_matrix_preserves_library_and_rejects_changed_accepted_source(self):
        c = distribution.c
        with TemporaryDirectory() as directory, ExitStack() as stack:
            root = Path(directory)
            reports = root / 'reports'
            private = root / 'private'
            reports.mkdir()
            private.mkdir()
            (root / 'web/data').mkdir(parents=True)
            for name in ['a', 'b', 'c', 'neogeo']:
                (private / (name + '.zip')).write_bytes(name.encode())
            core = root / 'core'
            core.write_bytes(b'core fixture')

            def entry(name):
                data = (private / (name + '.zip')).read_bytes()
                return dict(id=name, filename=name + '.zip', selected_filename=name + '.zip',
                            driver=name, title='Keep ' + name, category='test', size=len(data),
                            sha256=hashlib.sha256(data).hexdigest(), screenshot=None)

            def write(path, value):
                path.write_text(json.dumps(value), encoding='utf8')

            old = [entry('a'), entry('b')]
            write(root / 'web/data/catalog.json', {'games': old})
            write(reports / 'game_boot_matrix_v014.json', {'games': [dict(filename='a.zip', boot_status='PASS', game_compatibility='NOT VERIFIED')]})
            write(reports / 'compatibility_resolver_v014.json', {'games': {'a.zip': dict(derived_file='private/a.zip', driver='a')}})
            write(reports / 'fbneo_driver_database_v014.json', {'drivers': [dict(short_name='a')]})
            write(reports / 'USER_ACCEPTED_GAME_PACKAGES.json', {'games': [dict(acceptance='PASS_USER_REPORTED', source=str(private / 'c.zip'), catalog_entry=entry('c'))]})
            for attribute, value in [('ROOT', root), ('REPORTS', reports), ('CORE', core)]:
                stack.enter_context(patch.object(c, attribute, value))
            stack.enter_context(patch.object(c.catalog, 'scan', return_value=[dict(filename='a.zip', id='a', title='Changed title', category='test', screenshot=None)]))
            stack.enter_context(patch.object(c.catalog, 'pick_rom', side_effect=lambda filename: private / filename))
            stack.enter_context(patch.object(c.catalog, 'folder', return_value=private))
            result = distribution.catalog()['games']
            self.assertEqual(len(result), 3)
            self.assertEqual([{k: v for k, v in row.items() if k != '_source'} for row in result[:2]], old)
            (private / 'c.zip').write_bytes(b'tampered')
            with self.assertRaisesRegex(RuntimeError, 'Accepted package changed'):
                distribution.catalog()


    def test_resolves_exact_preview_name_from_approved_rom_library(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / "historical"
            previews = root / "library" / "PREVIEWS"
            original.mkdir()
            previews.mkdir(parents=True)
            (original / "photo.bmp").write_bytes(b"historical fixture")
            (previews / "photo.png").write_bytes(b"replacement fixture")
            data = {"games": [{"screenshot": "photo.png",
                               "_source": str(root / "library" / "ROMs" / "game.zip")}]}
            with patch.object(distribution.c.catalog, "folder", return_value=original):
                self.assertEqual(list(distribution.preview_files(data)), [
                    ("photo.png", previews / "photo.png")
                ])
                data["games"][0]["screenshot"] = "../photo.bmp"
                with self.assertRaisesRegex(ValueError, "Invalid preview filename"):
                    list(distribution.preview_files(data))


if __name__ == '__main__':
    unittest.main()
