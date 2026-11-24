"""Authorized, losslessly reversible layout repairs. Never edits source archives."""

import collections, ctypes, hashlib, itertools, json, re, zipfile, zlib
from pathlib import Path
from . import catalog, compatibility as c

R = c.REPORTS


# Official zlib shipped with Git; used only to combine known block CRCs, never to forge one.


# Multiply a CRC polynomial matrix by a bit vector over GF(2).
def _matrix_times(matrix, vector):
    result = 0
    i = 0
    while vector:
        if vector & 1:
            result ^= matrix[i]
        vector >>= 1
        i += 1
    return result


# Combine two block CRCs for concatenated bytes without reading or modifying their contents.
def _portable_combine(crc1, crc2, length):
    if length <= 0:
        return crc1
    odd = [0xEDB88320] + [1 << i for i in range(31)]
    square = lambda matrix: [_matrix_times(matrix, v) for v in matrix]
    even = square(odd)
    odd = square(even)
    while length:
        even = square(odd)
        if length & 1:
            crc1 = _matrix_times(even, crc1)
        length >>= 1
        if not length:
            break
        odd = square(even)
        if length & 1:
            crc1 = _matrix_times(odd, crc1)
        length >>= 1
    return (crc1 ^ crc2) & 0xFFFFFFFF


try:
    _zlib = ctypes.CDLL("C:/Program Files/Git/mingw64/bin/zlib1.dll")
    _combine = _zlib.crc32_combine
    _combine.argtypes = [ctypes.c_ulong, ctypes.c_ulong, ctypes.c_long]
    _combine.restype = ctypes.c_ulong

    # Use the available zlib function to combine CRCs and normalize the result to 32 bits.
    def combine(crc1, crc2, length2):
        return int(_combine(crc1, crc2, length2)) & 0xFFFFFFFF
except OSError:
    combine = _portable_combine
assert combine(zlib.crc32(b"abc"), zlib.crc32(b"def"), 3) == zlib.crc32(b"abcdef")


# Return the SHA-256 digest of an in-memory byte sequence.
def digest(b):
    return hashlib.sha256(b).hexdigest()


# Infer the program, graphics, sound, or sample role from a ROM member name.
def role(name):
    match = re.search(r"[-_]?([cpmsv])[0-9]+(?:[a-z]*)?(?:\.|$)", name.lower())
    return match[1] if match else None


# Apply a supported layout operation, rejecting invalid shapes and unproven padding or mirrors.
def apply(data, op):
    kind = op["kind"]
    if kind == "sequence":
        for step in op["steps"]:
            data = apply(data, step)
        return data
    if kind == "permute_blocks":
        n = op["block_size"]
        order = op["order"]
        if (
            n <= 0
            or len(data) != n * len(order)
            or sorted(order) != list(range(len(order)))
        ):
            raise ValueError("Invalid block permutation")
        return b"".join(data[i * n : (i + 1) * n] for i in order)
    if kind == "permute_bits":
        order = op["order"]
        if sorted(order) != list(range(8)):
            raise ValueError("Invalid byte bit permutation")
        table = bytes(
            sum(((value >> source) & 1) << target for target, source in enumerate(order))
            for value in range(256)
        )
        return data.translate(table)
    if kind == "byteswap":
        n = op["unit"]
        if n not in (2, 4) or len(data) % n:
            raise ValueError("Invalid byte-swap unit or length")
        out = bytearray(len(data))
        for i in range(n):
            out[i::n] = data[n - 1 - i :: n]
        return bytes(out)
    if kind == "deinterleave2":
        if len(data) % 2:
            raise ValueError("Odd interleave length")
        return data[::2] + data[1::2]
    if kind == "interleave2":
        if len(data) % 2:
            raise ValueError("Odd interleave length")
        mid = len(data) // 2
        out = bytearray(len(data))
        out[::2] = data[:mid]
        out[1::2] = data[mid:]
        return bytes(out)
    if kind == "padding_fold":
        keep = op["kept_size"]
        tail = data[keep:]
        if not tail or tail != bytes([op["fill_byte"]]) * op["removed_bytes"]:
            raise ValueError("Source padding is not exact")
        return data[:keep]
    if kind == "mirror_repeat":
        return data * op["factor"]
    if kind == "mirror_fold":
        n = len(data) // op["factor"]
        out = data[:n]
        if out * op["factor"] != data:
            raise ValueError("Input is not an exact mirror")
        return out
    raise ValueError("Unknown lossless layout operation")


# Reverse a recorded layout operation and validate repeated bytes where reconstruction requires it.
def inverse(data, op):
    kind = op["kind"]
    if kind == "sequence":
        for step in reversed(op["steps"]):
            data = inverse(data, step)
        return data
    if kind == "permute_blocks":
        order = op["order"]
        inv = [order.index(i) for i in range(len(order))]
        return apply(data, {"kind": kind, "block_size": op["block_size"], "order": inv})
    if kind == "permute_bits":
        order = op["order"]
        return apply(data, {"kind": kind, "order": [order.index(i) for i in range(8)]})
    if kind == "byteswap":
        return apply(data, op)
    if kind == "deinterleave2":
        return apply(data, {"kind": "interleave2"})
    if kind == "interleave2":
        return apply(data, {"kind": "deinterleave2"})
    if kind == "padding_fold":
        return data + bytes([op["fill_byte"]]) * op["removed_bytes"]
    if kind == "mirror_repeat":
        n = len(data) // op["factor"]
        out = data[:n]
        if out * op["factor"] != data:
            raise ValueError("Repeat inverse verification failed")
        return out
    if kind == "mirror_fold":
        return data * op["factor"]
    raise ValueError(kind)


def restore_short_text_rom(archive, z, missing, data):
    """Use an erased region already present in the dump for an exact S-ROM match."""
    block_size = 64 * 1024
    targets = {
        m["crc32"]: m["name"]
        for m in missing
        if m["type"] & 255 == 2 and m["size"] == 2 * block_size
    }
    short_text = {
        name: value for name, value in data.items()
        if role(name) == "s" and len(value) == block_size
    }
    if not targets or not short_text:
        return []
    members = {m["name"]: m for m in archive["members"] if m.get("sha256")}
    for name, info in members.items():
        if info["size"] < block_size:
            continue
        source = z.read(name)
        for offset in range(0, len(source) - block_size + 1, block_size):
            tail = source[offset : offset + block_size]
            if tail.count(255) != block_size:
                continue
            solutions = []
            for short_name, head in short_text.items():
                output = head + tail
                crc = f"{zlib.crc32(output):08x}"
                if crc not in targets:
                    continue
                segments = []
                for part_name, start, chunk in (
                    (short_name, 0, head), (name, offset, tail)
                ):
                    segments.append({
                        "name": part_name, "offset": start, "length": len(chunk),
                        "sha256": digest(chunk),
                        "source_sha256": members[part_name]["sha256"],
                        "source_size": members[part_name]["size"],
                    })
                solutions.append({
                    "archive": archive["filename"], "name": short_name,
                    "size": len(output), "crc32": crc, "sha256": digest(output),
                    "transform": {"kind": "segments", "segments": segments,
                                  "inverse_pass": "MUST_VERIFY_WHOLE_DERIVED_SET"},
                    "expected_example": targets[crc],
                })
            return solutions
    return []


def restore_reference_segments(archive, z, missing):
    """Rejoin local ROM segments and check the independent MAME SHA-1."""
    recipes = {
        "legendos.zip": (
            "029-m1.m1", "6f2843f0",
            "975fb1598b87a2798fff05e951fca2e2e0329e79",
            (("legendos.zip", "029-m1.rom", 0, 0x10000),
             ("legendos.zip", "029-v1.rom", 0x70000, 0x10000)),
        ),
        "crsword.zip": (
            "037-m1.m1", "9504b2c6",
            "9ce8e681b9df6eacd0d23a36bad836bd5074233d",
            (("crsword.zip", "037-m1.rom", 0, 0x10000),
             ("2020bb.zip", "030-c3.rom", 0x80000, 0x10000)),
        ),
        "mahretsu.zip": (
            "004-s1.s1", "2bd05a06",
            "876deadd4645373d82a503154eeddf18f440d743",
            (("mahretsu.zip", "004-s1.rom", 0, 0x10000),
             ("kf10thep.zip", "5008d-p3.rom", 0x92000, 0x10000)),
        ),
        "flipshot.zip": (
            "247-p1.p1", "95779094",
            "a985e033bc6f137fa65855d3eed245d66d5b244a",
            (("flipshot.zip", "247-p1.rom", 0, 0x80000),
             ("2020bb.zip", "030-c3.rom", 0x80000, 0x80000)),
        ),
        "strhoop.zip": (
            "079-v2.v2", "720774eb",
            "e4926f01322d0a15e700fb150b368152f2091146",
            (("strhoop.zip", "079-v2.rom", 0, 0x80000),
             ("2020bb.zip", "030-c3.rom", 0x80000, 0x80000)),
        ),
        "mslug3.zip": (
            "256-ph1.p1", "9c42ca85",
            "7a8f77a89867b889295ae9b9dfd4ba28f02d234d",
            (("mslug3.zip", "256d-p1.rom", 0, 0x2880),
             ("mslug3-5a.zip", "256d-p1.rom", 0x2880, 0x80),
             ("mslug3.zip", "256d-p1.rom", 0x2900, 0xFD700)),
        ),
        "neocup98.zip": (
            "244-c1.c1", "c7a62b23",
            "4534ecc9ade69c543188c66229dcad89dbc48668",
            (("neocup98.zip", "244-c1.rom", 0, 0x200000),
             ("ssideki3.zip", "081-c3.rom", 0, 0x80000),
             ("neocup98.zip", "244-c1.rom", 0x280000, 0x580000)),
        ),
    }
    name = archive["filename"]
    additional = {
        "neomrdo.zip": ((
            "207-p1.p1", "334ea51e", "0a642f8565ec6e9587ed767bcf177f4677547162",
            (("neomrdo.zip", "207-p1.rom", 0, 0x80000),
             ("2020bb.zip", "030-c3.rom", 0x80000, 0x80000)),
        ),),
        "miexchng.zip": (
            ("231-c3.c3", "4f6f7a63", "10935dbc1f52b95979a097b13a114cff18d4d446",
             (("miexchng.zip", "231-c3.rom", 0, 0x80000),
              ("2020bb.zip", "030-c3.rom", 0x80000, 0x80000))),
            ("231-c4.c4", "2e35e71b", "6f248191c2c60ca1b1b4f2ebf08756e036682144",
             (("miexchng.zip", "231-c4.rom", 0, 0x80000),
              ("2020bb.zip", "030-c3.rom", 0x80000, 0x80000))),
        ),
        "samsho3.zip": (
            ("087-c7.c7", "ae450e3d", "ec482632cc347ec3f9e68df0ebcaa16ebe41b9f9",
             (("samsho3.zip", "087-c7.rom", 0, 0x80000),
              ("2020bb.zip", "030-c3.rom", 0x80000, 0x80000))),
            ("087-c8.c8", "a9e82717", "e39ee15d5140dbe7f06eea945cce9984a5e8b06a",
             (("samsho3.zip", "087-c8.rom", 0, 0x80000),
              ("2020bb.zip", "030-c3.rom", 0x80000, 0x80000))),
        ),
    }
    candidates = (recipes[name],) if name in recipes else additional.get(name, ())
    solutions = []
    for expected, crc, reference_sha1, inputs in candidates:
        if name == "mslug3.zip" or any(m["name"] == expected and m["crc32"] == crc for m in missing):
            solutions.extend(join_reference_segments(name, z, expected, crc, reference_sha1, inputs))
    return solutions


def join_reference_segments(name, z, expected, crc, reference_sha1, inputs):
    segments = []
    pieces = []
    for archive_name, member_name, offset, length in inputs:
        try:
            if archive_name == name:
                member = z.read(member_name)
            else:
                source = catalog.pick_rom(archive_name)
                if source is None:
                    return []
                with zipfile.ZipFile(source) as secondary:
                    member = secondary.read(member_name)
        except (KeyError, zipfile.BadZipFile):
            return []
        chunk = member[offset : offset + length]
        if len(chunk) != length:
            return []
        pieces.append(chunk)
        segments.append({
            "archive": archive_name, "name": member_name, "offset": offset,
            "length": len(chunk), "sha256": digest(chunk),
            "source_size": len(member), "source_sha256": digest(member),
        })
    output = b"".join(pieces)
    if f"{zlib.crc32(output):08x}" != crc or hashlib.sha1(output).hexdigest() != reference_sha1:
        return []
    return [{
        "archive": name, "name": inputs[0][1], "size": len(output),
        "crc32": crc, "sha256": digest(output),
        "transform": {"kind": "segments", "segments": segments,
                      "inverse_pass": "MUST_VERIFY_WHOLE_DERIVED_SET"},
        "expected_example": expected,
    }]


def pcm2_solutions(archive, drivers):
    from .pcm2_layout import RECIPES, restore

    name = archive["filename"]
    if name not in RECIPES:
        return []
    driver_id = {"samsho5.zip": "samsho5h", "samsh5sp.zip": "samsh5sp", "mslug4.zip": "mslug4"}[name]
    targets = {(m["size"], m["crc32"]): m["name"] for m in drivers[driver_id]["members"]}
    prefix = RECIPES[name][0]
    audited = {m["name"]: m for m in archive["members"] if m.get("sha256")}
    solutions = []
    for role in (("v",) if name == "mslug4.zip" else ("p", "v")):
        names = [f"{prefix}-{role}{number}.rom" for number in (1, 2)]
        if any(member not in audited for member in names):
            continue
        hashes = tuple(audited[member]["sha256"] for member in names)
        for index, content in enumerate(restore(name, role, hashes)):
            crc = f"{zlib.crc32(content):08x}"
            target = targets.get((len(content), crc))
            if not target:
                continue
            solutions.append({
                "archive": name, "name": names[index], "size": len(content),
                "crc32": crc, "sha256": digest(content),
                "expected_example": target,
                "transform": {
                    "kind": "pcm2", "role": role, "part": index,
                    "sources": [{"name": member, "sha256": sha}
                                for member, sha in zip(names, hashes)],
                    "inverse_pass": True,
                },
            })
    return solutions


# Search bounded local layout transformations for exact reference signatures and save reversible plans.
def discover(force=False, only=None):
    manifest = c.load(R / "rom_library_manifest_v014.json")
    db = c.load(R / "fbneo_driver_database_v014.json")
    static = c.load(R / "rom_compatibility_static_v014.json")
    drivers = {d["short_name"]: d for d in db["drivers"]}
    targets = collections.defaultdict(dict)
    for d in drivers.values():
        if d.get("bios") != "neogeo":
            continue
        for m in d["members"]:
            if m["type"] & c.BIOS:
                continue
            key = (m["size"], m["crc32"])
            targets[role(m["name"])][key] = m
    previous = c.load(R / "rom_layout_repairs_v014.json", {"archives": {}})
    result = {
        "core_sha256": manifest["core_sha256"],
        "authorization": "User explicitly allowed reversible layout conversions on derived ZIPs on 2026-11-05; original archives remain untouched",
        "archives": {},
    }
    cache_root = R / "rom_layout_cache_v014"
    cache_root.mkdir(exist_ok=True)
    for index, a in enumerate(manifest["archives"], 1):
        if a["filename"].casefold() == "neogeo.zip" or a["integrity"] != "PASS":
            continue
        cache = cache_root / (a["filename"] + ".json")
        old = c.load(cache)
        if (
            only is not None
            and a["filename"] not in only
            and old
            and old["source_sha256"] == a["sha256"]
            and old["core_sha256"] == manifest["core_sha256"]
        ):
            result["archives"][a["filename"]] = old
            continue
        if (
            not force
            and old
            and old.get("schema") == 13
            and old["source_sha256"] == a["sha256"]
            and old["core_sha256"] == manifest["core_sha256"]
        ):
            result["archives"][a["filename"]] = old
            continue
        game = next(g for g in static["games"] if g["filename"] == a["filename"])
        declared = drivers.get(game["driver_declared"])
        wanted_roles = (
            {role(m["name"]) for m in game["static_original"]["missing"]}
            if declared
            else set(targets)
        )
        if not wanted_roles:
            wanted_roles = set()
        solutions = pcm2_solutions(a, drivers)
        seen = set()
        data = {}
        with zipfile.ZipFile(catalog.pick_rom(a["filename"])) as z:
            for m in a["members"]:
                typ = role(m["name"])
                if typ not in wanted_roles or typ not in targets or not m.get("sha256"):
                    continue
                b = z.read(m["name"])
                data[m["name"]] = b
                ops = (
                    [
                        {
                            "kind": "permute_blocks",
                            "block_size": len(b) // 2,
                            "order": [1, 0],
                        },
                        {"kind": "byteswap", "unit": 2},
                        {"kind": "byteswap", "unit": 4},
                        {"kind": "deinterleave2"},
                        {"kind": "interleave2"},
                    ]
                    if len(b) % 4 == 0
                    else []
                )
                if typ == "s":
                    # FBNeo's mslug3b6 text callback exchanges data lines D0 and D5.
                    ops.append({"kind": "permute_bits", "order": [5, 1, 2, 3, 4, 0, 6, 7]})
                if len(b) % 4 == 0:
                    for unit in (2, 4):
                        ops.append(
                            {
                                "kind": "sequence",
                                "steps": [
                                    {"kind": "byteswap", "unit": unit},
                                    {
                                        "kind": "permute_blocks",
                                        "block_size": len(b) // 2,
                                        "order": [1, 0],
                                    },
                                ],
                            }
                        )
                for factor in (2, 4, 8):
                    if any(size == len(b) * factor for size, _ in targets[typ]):
                        ops.append({"kind": "mirror_repeat", "factor": factor})
                    if (
                        len(b) % factor == 0
                        and any(size == len(b) // factor for size, _ in targets[typ])
                        and b[: len(b) // factor] * factor == b
                    ):
                        ops.append({"kind": "mirror_fold", "factor": factor})
                for kept in sorted(
                    {
                        size
                        for size, crc in targets[typ]
                        if 32768 <= size < len(b) and len(b) % size == 0
                    }
                ):
                    tail = b[kept:]
                    if tail[0] in (0, 255) and tail == bytes([tail[0]]) * len(tail):
                        ops.append(
                            {
                                "kind": "padding_fold",
                                "kept_size": kept,
                                "removed_bytes": len(tail),
                                "fill_byte": tail[0],
                            }
                        )
                # Split joined chips only at reference-sized boundaries; whole-source inverse
                # coverage is enforced when the complete derived set is constructed.
                for size in sorted(
                    {
                        size
                        for size, crc in targets[typ]
                        if 32768 <= size < len(b) and len(b) % size == 0
                    }
                ):
                    for offset in range(0, len(b), size):
                        chunk = b[offset : offset + size]
                        key = (size, f"{zlib.crc32(chunk):08x}")
                        if key not in targets[typ]:
                            continue
                        token = (key, m["name"])
                        if token in seen:
                            continue
                        seen.add(token)
                        part = {
                            "name": m["name"],
                            "offset": offset,
                            "length": size,
                            "sha256": digest(chunk),
                            "source_sha256": m["sha256"],
                            "source_size": len(b),
                        }
                        solutions.append(
                            {
                                "archive": a["filename"],
                                "name": m["name"],
                                "size": size,
                                "crc32": key[1],
                                "sha256": digest(chunk),
                                "transform": {
                                    "kind": "segments",
                                    "segments": [part],
                                    "inverse_pass": "MUST_VERIFY_WHOLE_DERIVED_SET",
                                },
                                "expected_example": targets[typ][key]["name"],
                            }
                        )
                for op in ops:
                    converted = apply(b, op)
                    key = (len(converted), f"{zlib.crc32(converted):08x}")
                    if key not in targets[typ] or key == (len(b), m["crc32"]):
                        continue
                    if inverse(converted, op) != b:
                        raise ValueError("Lossless inverse check failed")
                    token = (key, m["name"])
                    if token in seen:
                        if op["kind"] != "padding_fold":
                            continue
                        solutions = [
                            v
                            for v in solutions
                            if not (
                                (v["size"], v["crc32"]) == key
                                and v["name"] == m["name"]
                            )
                        ]
                    seen.add(token)
                    solutions.append(
                        {
                            "archive": a["filename"],
                            "name": m["name"],
                            "size": key[0],
                            "crc32": key[1],
                            "sha256": digest(converted),
                            "transform": {
                                "kind": "single",
                                "operation": op,
                                "source_member": m["name"],
                                "source_sha256": m["sha256"],
                                "source_size": m["size"],
                                "inverse_sha256": digest(inverse(converted, op)),
                                "inverse_pass": True,
                            },
                            "expected_example": targets[typ][key]["name"],
                        }
                    )
            solutions.extend(
                restore_short_text_rom(a, z, game["static_original"]["missing"], data)
            )
            solutions.extend(restore_reference_segments(a, z, game["static_original"]["missing"]))
        # NeoRAGEx C layouts commonly transpose 1/2-ROM blocks between C1/C3 and C2/C4.
        # Bounded pair combinations are accepted only at exact reference CRC and size.
        if "c" in wanted_roles and data:
            needed = (
                [
                    m
                    for m in declared["members"]
                    if role(m["name"]) == "c" and m in required_without_bios(declared)
                ]
                if declared
                else list(targets["c"].values())
            )
            for size in sorted({m["size"] for m in needed}):
                if size < 262144 or size % 2:
                    continue
                half = size // 2
                blocks = []
                for name, b in data.items():
                    if role(name) != "c" or len(b) % half:
                        continue
                    for offset in range(0, len(b), half):
                        chunk = b[offset : offset + half]
                        blocks.append(
                            {
                                "name": name,
                                "offset": offset,
                                "length": half,
                                "crc": zlib.crc32(chunk),
                                "sha256": digest(chunk),
                            }
                        )
                if len(blocks) > 64:
                    continue
                wanted = {int(m["crc32"], 16): m for m in needed if m["size"] == size}
                for first in blocks:
                    for second in blocks:
                        if (first["name"], first["offset"]) == (
                            second["name"],
                            second["offset"],
                        ):
                            continue
                        crc = combine(first["crc"], second["crc"], half)
                        if crc not in wanted:
                            continue
                        key = (size, f"{crc:08x}")
                        token = (key, first["name"])
                        if token in seen:
                            continue
                        b = (
                            data[first["name"]][
                                first["offset"] : first["offset"] + half
                            ]
                            + data[second["name"]][
                                second["offset"] : second["offset"] + half
                            ]
                        )
                        assert f"{zlib.crc32(b):08x}" == key[1]
                        seen.add(token)
                        sources = []
                        for block in [first, second]:
                            sources.append(
                                {
                                    **{
                                        k: block[k]
                                        for k in ["name", "offset", "length", "sha256"]
                                    },
                                    "source_sha256": digest(data[block["name"]]),
                                    "source_size": len(data[block["name"]]),
                                }
                            )
                        solutions.append(
                            {
                                "archive": a["filename"],
                                "name": first["name"],
                                "size": size,
                                "crc32": key[1],
                                "sha256": digest(b),
                                "transform": {
                                    "kind": "segments",
                                    "segments": sources,
                                    "inverse_pass": "MUST_VERIFY_WHOLE_DERIVED_SET",
                                },
                                "expected_example": wanted[crc]["name"],
                            }
                        )
        # Whole-chip concatenation supports unequal chip sizes without inventing data.
        for first_name, first_bytes in data.items():
            typ = role(first_name)
            for second_name, second_bytes in data.items():
                if first_name == second_name or role(second_name) != typ:
                    continue
                size = len(first_bytes) + len(second_bytes)
                if not any(n == size for n, _ in targets[typ]):
                    continue
                crc = f"{combine(zlib.crc32(first_bytes), zlib.crc32(second_bytes), len(second_bytes)):08x}"
                key = (size, crc)
                token = (key, first_name)
                if key not in targets[typ] or token in seen:
                    continue
                seen.add(token)
                sources = []
                for name, chunk in [
                    (first_name, first_bytes),
                    (second_name, second_bytes),
                ]:
                    sources.append(
                        {
                            "name": name,
                            "offset": 0,
                            "length": len(chunk),
                            "sha256": digest(chunk),
                            "source_sha256": digest(chunk),
                            "source_size": len(chunk),
                        }
                    )
                solutions.append(
                    {
                        "archive": a["filename"],
                        "name": first_name,
                        "size": size,
                        "crc32": crc,
                        "sha256": digest(first_bytes + second_bytes),
                        "transform": {
                            "kind": "segments",
                            "segments": sources,
                            "inverse_pass": "MUST_VERIFY_WHOLE_DERIVED_SET",
                        },
                        "expected_example": targets[typ][key]["name"],
                    }
                )
        record = {
            "schema": 13,
            "source_sha256": a["sha256"],
            "core_sha256": manifest["core_sha256"],
            "solutions": solutions,
            "tested_at": c.now(),
        }
        result["archives"][a["filename"]] = record
        c.save(cache, record)
        c.save(R / "rom_layout_repairs_v014.json", result)
        print(
            f"[LAYOUT {index}/{len(manifest['archives'])}] {a['filename']} {len(solutions)} exact matches",
            flush=True,
        )
    c.save(R / "rom_layout_repairs_v014.json", result)
    return result


# Select game members that are neither BIOS, optional, nor undumped entries.
def required_without_bios(driver):
    return [m for m in driver["members"] if not m["type"] & (c.BIOS | c.OPT | c.NODUMP)]


# Reconstruct a recorded local member and verify source, output, and applicable inverse hashes.
def materialize(src):
    if src.get("transform", {}).get("kind") == "pcm2":
        from .pcm2_layout import restore

        transform = src["transform"]
        hashes = tuple(item["sha256"] for item in transform["sources"])
        output = restore(src["archive"], transform["role"], hashes)[transform["part"]]
        if digest(output) != src["sha256"]:
            raise ValueError("PCM2 output hash mismatch")
        return output
    if src.get("transform", {}).get("kind") == "cmc":
        from tools.compatibility_lab.cmc_inverse_lab import derive_archive

        t = src["transform"]
        if c.sha(catalog.pick_rom(src["archive"])) != t["archive_sha256"]:
            raise ValueError("CMC source changed")
        encrypted, proof = derive_archive(
            src["archive"], t["family"], t["key"], t["archive_sha256"]
        )
        out = encrypted[
            t["domain_start"] : t["domain_start"] + t["output_size"] * 2 : 2
        ]
        if digest(out) != src["sha256"]:
            raise ValueError("CMC output SHA mismatch")
        return out
    with zipfile.ZipFile(catalog.pick_rom(src["archive"])) as z:
        t = src.get("transform")
        if not t:
            return z.read(src["name"])
        if t["kind"] == "m1":
            from tools.compatibility_lab.cmc_inverse_lab import m1_transform

            b = z.read(src["name"])
            if digest(b) != t["source_sha256"]:
                raise ValueError("M1 source changed")
            out = m1_transform(b, True)
            if digest(m1_transform(out, False)) != t["source_sha256"]:
                raise ValueError("M1 inverse hash failed")
        elif t["kind"] == "single":
            b = z.read(t["source_member"])
            if digest(b) != t["source_sha256"]:
                raise ValueError("Original source changed")
            out = apply(b, t["operation"])
            if digest(inverse(out, t["operation"])) != t["source_sha256"]:
                raise ValueError("Inverse hash failed")
        else:
            pieces = []
            for part in t["segments"]:
                archive = part.get("archive", src["archive"])
                if archive == src["archive"]:
                    b = z.read(part["name"])
                else:
                    path = catalog.pick_rom(archive)
                    if path is None:
                        raise ValueError("Missing segment source archive")
                    with zipfile.ZipFile(path) as other:
                        b = other.read(part["name"])
                if digest(b) != part["source_sha256"]:
                    raise ValueError("Source component changed")
                chunk = b[part["offset"] : part["offset"] + part["length"]]
                if digest(chunk) != part["sha256"]:
                    raise ValueError("Segment hash mismatch")
                pieces.append(chunk)
            out = b"".join(pieces)
        if digest(out) != src["sha256"]:
            raise ValueError("Derived hash mismatch")
        return out


# Reconstruct segmented sources, optionally preserve uncovered bytes, and require full-source hash equality.
def verify_group_inverse(output_members, preserve_remainders=False):
    reconstructed = {}
    coverage = {}
    expected = {}
    for expected_name, src, b in output_members:
        t = src.get("transform")
        if not t or t["kind"] != "segments":
            continue
        position = 0
        for part in t["segments"]:
            key = (part.get("archive", src["archive"]), part["name"])
            n = part["source_size"]
            reconstructed.setdefault(key, bytearray(n))
            coverage.setdefault(key, bytearray(n))
            expected[key] = part["source_sha256"]
            chunk = b[position : position + part["length"]]
            position += part["length"]
            start = part["offset"]
            end = start + part["length"]
            for i, v in enumerate(chunk, start):
                if coverage[key][i] and reconstructed[key][i] != v:
                    raise ValueError("Conflicting inverse segment")
            reconstructed[key][start:end] = chunk
            coverage[key][start:end] = b"\1" * len(chunk)
    # An unchanged member can supply an unchanged region of the same source ROM.
    for _, src, b in output_members:
        key = (src["archive"], src["name"])
        if (
            not src.get("transform")
            and key in reconstructed
            and len(b) == len(reconstructed[key])
        ):
            reconstructed[key][:] = b
            coverage[key][:] = b"\1" * len(b)
    # Old graphics dumps may repeat large address-mirror regions. Recover only
    # contiguous >=128 KiB mirrored C blocks already present in derived C ROMs.
    # Every reference is verified against the full original source SHA below.
    mirror_refs = collections.defaultdict(list)
    for key, buffer in reconstructed.items():
        if all(coverage[key]) or role(key[1]) != "c" or len(buffer) < 131072:
            continue
        source_path = catalog.pick_rom(key[0])
        if source_path is None:
            raise ValueError("Missing original for inverse verification")
        with zipfile.ZipFile(source_path) as z:
            source = z.read(key[1])
        if digest(source) != expected[key]:
            raise ValueError("Source changed during inverse proof")
        unit = 131072
        for start in range(0, len(buffer), unit):
            end = min(start + unit, len(buffer))
            if all(coverage[key][start:end]):
                continue
            if any(coverage[key][start:end]) or end - start < unit:
                continue
            chunk = source[start:end]
            for output_name, other_src, other_bytes in output_members:
                if role(output_name) != "c":
                    continue
                offset = other_bytes.find(chunk)
                if offset < 0 or offset % unit:
                    continue
                buffer[start:end] = other_bytes[offset : offset + unit]
                coverage[key][start:end] = b"\1" * unit
                mirror_refs[key].append(
                    {
                        "derived_member": output_name,
                        "derived_offset": offset,
                        "source_offset": start,
                        "length": unit,
                        "sha256": digest(chunk),
                    }
                )
                break
    recovery = []
    recovery_refs = collections.defaultdict(list)
    if preserve_remainders:
        for key, buffer in reconstructed.items():
            if all(coverage[key]):
                continue
            source_path = catalog.pick_rom(key[0])
            if source_path is None:
                raise ValueError("Missing original remainder source")
            with zipfile.ZipFile(source_path) as z:
                source = z.read(key[1])
            if digest(source) != expected[key]:
                raise ValueError("Remainder source SHA mismatch")
            offset = 0
            while offset < len(buffer):
                if coverage[key][offset]:
                    offset += 1
                    continue
                end = offset + 1
                while end < len(buffer) and not coverage[key][end]:
                    end += 1
                chunk = source[offset:end]
                name = (
                    "_layout_recovery/"
                    + hashlib.sha256((key[0] + "/" + key[1]).encode()).hexdigest()[:16]
                    + "_"
                    + str(offset)
                    + ".bin"
                )
                record = {
                    "derived_member": name,
                    "original_archive": key[0],
                    "original_member": key[1],
                    "source_offset": offset,
                    "size": len(chunk),
                    "sha256": digest(chunk),
                    "role": "RECOVERY_ONLY_NOT_DRIVER_ROM",
                }
                recovery.append((record, chunk))
                recovery_refs[key].append(record)
                buffer[offset:end] = chunk
                coverage[key][offset:end] = b"\1" * len(chunk)
                offset = end
    proof = []
    for key, b in reconstructed.items():
        if not all(coverage[key]):
            raise ValueError("Non-invertible incomplete source coverage: " + str(key))
        if digest(b) != expected[key]:
            raise ValueError("Whole-source inverse SHA mismatch")
        proof.append(
            {
                "archive": key[0],
                "member": key[1],
                "reconstructed_sha256": digest(b),
                "matches_source": True,
                "mirrored_region_references": mirror_refs[key],
                "recovery_regions": recovery_refs[key],
            }
        )
    return (proof, recovery) if preserve_remainders else proof
