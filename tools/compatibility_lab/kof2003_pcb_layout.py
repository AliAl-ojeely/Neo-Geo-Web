"""Recover KOF 2003 cart text/graphics from the authorized decrypted PCB layout.

The extra PCB text XOR/bit permutation follows pinned FBNeo neo_run.cpp.
Outputs must match independent HBMAME size, CRC32 and SHA-1 definitions.
"""
from pathlib import Path
import hashlib
from zipfile import ZipFile
import zlib

REFERENCES = {
    '271-s1d.s1': (0x80000, '3230e10f', 'a7aa4c11be7de5969e00338c7f424811174a8ad6'),
    '271-c7d.c7': (0x800000, '8ee6b43c', 'c78b749c7c8e1d8ab8335b96da03764cc8e9eb21'),
    '271-c8d.c8': (0x800000, '6d8d2d60', '841698eead0f7d422937ce2f2329e17c383d90a6'),
}

def sha(data):
    return hashlib.sha256(data).hexdigest()


def decode_table():
    order = (4, 0, 7, 2, 5, 1, 6, 3)
    return bytes(sum((((value ^ 0xd2) >> source) & 1) << (7 - bit)
                     for bit, source in enumerate(order)) for value in range(256))


def derive(path):
    import numpy as np

    with ZipFile(path) as archive:
        sources = {number: archive.read(f'271d-c{number}.rom') for number in (3, 4, 5, 6)}
    if any(len(data) != 0x1000000 for data in sources.values()):
        raise ValueError('KOF 2003 PCB source must contain complete 16 MiB C chips')
    before = {f'271d-c{number}.rom': sha(data) for number, data in sources.items()}
    # First PCB S domain ends 16 MiB before the graphics domain end.
    encoded = np.empty(0x80000, np.uint8)
    for lane, number in enumerate((5, 6)):
        encoded[lane::2] = np.frombuffer(sources[number][0x7c0000:0x800000], np.uint8)
    index = np.arange(0x80000, dtype=np.uint32)
    address = ((index & np.uint32(0xffffffe0)) | ((index & 7) << 2)
               | ((~index & 8) >> 2) | ((index & 16) >> 4))
    table = decode_table()
    reverse = bytes(table.index(value) for value in range(256))
    fixed = encoded[address].tobytes().translate(table)
    recovered = np.empty_like(encoded)
    recovered[address] = np.frombuffer(fixed.translate(reverse), np.uint8)
    if recovered.tobytes() != encoded.tobytes():
        raise ValueError('KOF 2003 PCB text inverse failed')
    image = np.empty(0x1000000, np.uint8)
    for lane, number in enumerate((3, 4)):
        image[lane::2] = np.frombuffer(sources[number][0x800000:], np.uint8)
    destination = 0x1000000 - 0x80000 + address
    overwritten = image[destination].copy()
    image[destination] = np.frombuffer(fixed, np.uint8)
    output = {'271-s1d.s1': fixed, '271-c7d.c7': image[::2].tobytes(),
              '271-c8d.c8': image[1::2].tobytes()}
    for name, data in output.items():
        size, crc, digest = REFERENCES[name]
        if len(data) != size or f'{zlib.crc32(data):08x}' != crc or hashlib.sha1(data).hexdigest() != digest:
            raise ValueError('KOF 2003 reference mismatch: ' + name)
    # Restore overwritten graphics and verify both complete original C3/C4 members.
    image[destination] = overwritten
    for lane, number in enumerate((3, 4)):
        restored = sources[number][:0x800000] + image[lane::2].tobytes()
        if sha(restored) != before[f'271d-c{number}.rom']:
            raise ValueError('KOF 2003 graphics inverse failed')
    proof = {'source_archive': Path(path).name, 'source_members_sha256': before,
             'text_inverse_pass': True, 'graphics_inverse_pass': True,
             'reference_commit': 'fa040eced0dea161bb4e5d55bdbcb85aaf8de632',
             'reference_path': 'src/hbmame/drivers/kof2003.cpp',
             'members': {name: {'size': len(data), 'crc32': f'{zlib.crc32(data):08x}',
                                'sha1': hashlib.sha1(data).hexdigest(), 'sha256': sha(data)}
                         for name, data in output.items()}}
    return output, proof
