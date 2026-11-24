import hashlib
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
import unittest

from app.offline_manifest import write_bundle


class OfflineManifestGenerationTests(unittest.TestCase):
    # A catalog edit must update the worker ID, all hashes and the exact byte total together.
    def test_catalog_change_and_repeat_build_are_consistent(self):
        template = Path(__file__).resolve().parents[1] / 'tools/offline-sw.template.js'
        with TemporaryDirectory() as directory:
            site = Path(directory)
            (site / 'catalog.json').write_text('{}')
            ids = []
            for payload in ['{}', '{"games":[1]}', '{"games":[1]}']:
                (site / 'catalog.json').write_text(payload)
                write_bundle(site, template)
                m = json.loads((site / 'offline-manifest.json').read_text())
                ids.append(m['id'])
                worker_id = re.search(r"const BUILD_ID = '([^']+)'", (site / 'offline-sw.js').read_text()).group(1)
                self.assertEqual(worker_id, m['id'])
                self.assertEqual(m['totalBytes'], sum(row['bytes'] for row in m['files']))
                for row in m['files']:
                    data = (site / row['path']).read_bytes()
                    self.assertEqual(len(data), row['bytes'])
                    self.assertEqual(hashlib.sha256(data).hexdigest(), row['sha256'])
            self.assertNotEqual(ids[0], ids[1])
            self.assertEqual(ids[1], ids[2])


if __name__ == '__main__':
    unittest.main()
