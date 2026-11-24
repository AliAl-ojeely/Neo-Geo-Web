import hashlib
import unittest
import zlib

from tools.compatibility_lab.import_mslug4_gog import verify_member


class CommercialMemberTests(unittest.TestCase):
    def test_requires_size_crc_and_independent_sha1(self):
        data = b"synthetic cartridge fixture"
        spec = dict(size=len(data), crc32=f"{zlib.crc32(data):08x}",
                    sha1=[hashlib.sha1(data).hexdigest()])
        self.assertTrue(verify_member(data, spec))
        self.assertFalse(verify_member(data, {**spec, "size": 0}))
        self.assertFalse(verify_member(data, {**spec, "crc32": "00000000"}))
        self.assertFalse(verify_member(data, {**spec, "sha1": ["0" * 40]}))
        self.assertFalse(verify_member(data, {**spec, "sha1": []}))
