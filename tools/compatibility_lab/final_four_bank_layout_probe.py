"""Test previously untested complete bank permutations without synthesizing ROM bytes."""

import hashlib
from itertools import permutations
import json
from pathlib import Path
from zipfile import ZipFile
import zlib

from app.rom_layouts import combine

ROOT = Path(__file__).resolve().parents[2]


# Evaluate permutations through precomputed CRC contributions; hash every hit independently.
def probe(label, payload, crc, sha1):
    result = dict(source=label, bytes=len(payload), source_sha256=hashlib.sha256(payload).hexdigest(),
                  trials=0, crc_hits=[], matches=[])
    forms = {"identity": payload,
             "word-swap": b"".join(payload[i:i + 2][::-1] for i in range(0, len(payload), 2))}
    for operation, data in forms.items():
        for count in (4, 8):
            size = len(data) // count
            chunks = [data[i:i + size] for i in range(0, len(data), size)]
            contributions = [[combine(zlib.crc32(chunk), 0, size * (count - position - 1))
                              for chunk in chunks] for position in range(count)]
            for order in permutations(range(count)):
                result["trials"] += 1
                candidate_crc = 0
                for position, index in enumerate(order):
                    candidate_crc ^= contributions[position][index]
                if candidate_crc != int(crc, 16):
                    continue
                candidate = b"".join(chunks[index] for index in order)
                assert zlib.crc32(candidate) == int(crc, 16)
                actual_sha1 = hashlib.sha1(candidate).hexdigest()
                row = dict(operation=operation, bank_size=size, order=order, sha1=actual_sha1,
                           reference_sha1=sha1, exact=actual_sha1 == sha1)
                result["crc_hits"].append(row)
                if row["exact"]:
                    inverse = [order.index(index) for index in range(count)]
                    restored = b"".join(candidate[index * size:(index + 1) * size] for index in inverse)
                    assert restored == data
                    result["matches"].append(row)
    return result


# Read only the unresolved program chips; retain all candidate bytes in memory.
def main():
    roms = Path(json.loads((ROOT / "config.json").read_text("utf8"))["roms"])
    cases = []
    for archive, member, crc, sha1 in [
        ("kof2000.zip", "257d-p1.rom", "5f809dbe", "2bc233dcff5622de86d01e3b74b840c7caf12982"),
        ("mslug4.zip", "263d-p1.rom", "27e4def3", "a08785e8145981bb6b5332a3b2df7eb321253cca"),
        ("mslug4-5a.zip", "263d-p1.rom", "27e4def3", "a08785e8145981bb6b5332a3b2df7eb321253cca"),
    ]:
        with ZipFile(roms / archive) as z:
            cases.append((archive + "!" + member, z.read(member), crc, sha1))
    target = ("768ee64a", "76a65a69aee749758a2101aabdd44f3404838b54")
    with ZipFile(roms / "mslug5.zip") as z:
        joined = z.read("268d-p1.rom") + z.read("268d-p2.rom")
        cases.append(("mslug5.zip!joined-program[1MiB:5MiB]", joined[0x100000:0x500000], *target))
    with ZipFile(roms / "mslug5-5a.zip") as z:
        cases.append(("mslug5-5a.zip!P2+P3", z.read("268d-p2.rom") + z.read("268d-p3.rom"), *target))
    rows = []
    for args in cases:
        row = probe(*args)
        rows.append(row)
        print(row["source"], row["trials"], "trials", len(row["matches"]), "exact hits", flush=True)
    report = dict(hypothesis="Complete 4/8-bank reordering of local program chips, with optional word swap",
                  distinction="Earlier P2 donor replacement and 16 PVC cases did not enumerate these complete bank permutations",
                  verdict="SUPPORTED" if any(row["matches"] for row in rows) else "REFUTED_FOR_TESTED_LAYOUTS",
                  rows=rows, rom_output_written=False,
                  kof99="Not repeated: prior 121038 Z80 bank trials already cover this hypothesis; CMC42 has no CMC50 M1 encryption")
    (ROOT / "reports/FINAL_FOUR_BANK_LAYOUT_PROBE.json").write_text(json.dumps(report, indent=2), encoding="utf8")


if __name__ == "__main__":
    main()
