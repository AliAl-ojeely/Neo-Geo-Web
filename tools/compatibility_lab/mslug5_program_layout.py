"""Recover the exact decrypted cartridge chips from the local joined program layout."""

import hashlib
from pathlib import Path
from zipfile import ZipFile
import zlib


# Split the meaningful 5 MiB region while preserving the original erased tail for inversion.
def derive(path):
    with ZipFile(path) as archive:
        sources = [archive.read(f"268d-p{i}.rom") for i in (1, 2)]
    if [len(data) for data in sources] != [0x400000, 0x400000]:
        raise ValueError("Expected two complete 4 MiB NeoRAGEx program members")
    joined = b"".join(sources)
    output = {"268-p1d.p1": joined[:0x100000], "268-p2d.sp2": joined[0x100000:0x500000]}
    references = {"268-p1d.p1": ("24ae2e4d", "65eb727731de208e64e155df743d8c1a581980f2"),
                  "268-p2d.sp2": ("768ee64a", "76a65a69aee749758a2101aabdd44f3404838b54")}
    for name, data in output.items():
        crc, sha1 = references[name]
        if f"{zlib.crc32(data):08x}" != crc or hashlib.sha1(data).hexdigest() != sha1:
            raise ValueError("Program signature mismatch: " + name)
    tail = joined[0x500000:]
    if tail != b"\xff" * 0x300000:
        raise ValueError("Program tail is not entirely erased; cannot omit it")
    restored = output["268-p1d.p1"] + output["268-p2d.sp2"] + tail
    before = [hashlib.sha256(data).hexdigest() for data in sources]
    after = [hashlib.sha256(restored[i:i + 0x400000]).hexdigest() for i in (0, 0x400000)]
    if before != after:
        raise ValueError("Joined program inverse failed")
    proof = dict(source_archive=Path(path).name, source_members_sha256=before,
                 restored_members_sha256=after, inverse_pass=True,
                 transformation="concatenate P1+P2; split [0,1MiB), [1MiB,5MiB); retain original 3MiB erased tail for inverse",
                 erased_tail_sha256=hashlib.sha256(tail).hexdigest(),
                 reference_commit="fa040eced0dea161bb4e5d55bdbcb85aaf8de632",
                 reference_path="src/hbmame/drivers/mslug5.cpp",
                 sha1_evidence={"268-p2d.sp2": "Independent HBMAME SHA1",
                                "268-p1d.p1": "Recorded local baseline SHA1; installed FBNeo size/CRC match"},
                 members={name: dict(size=len(data), crc32=f"{zlib.crc32(data):08x}",
                                    sha1=hashlib.sha1(data).hexdigest(), sha256=hashlib.sha256(data).hexdigest())
                          for name, data in output.items()})
    return output, proof
