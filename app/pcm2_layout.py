"""Reversible PCM2 dump conversions for the pinned Neo Geo driver definitions."""

from functools import lru_cache

import hashlib
import zipfile

from . import catalog

RECIPES = {
    "mslug4.zip": ("263d", None, None, None, None),
    "samsho5.zip": ("270d", (0, 1, 14, 13, 10, 3, 4, 9, 6, 15, 12, 5, 2, 11, 8, 7),
                    0xA000, 0xFEB2C0, (0xCB, 0x29, 0x7D, 0x43, 0xD2, 0x3A, 0xC2, 0xB4)),
    "samsh5sp.zip": ("272d", (0, 1, 10, 9, 12, 11, 14, 5, 2, 13, 8, 15, 4, 7, 6, 3),
                     0x2000, 0xFFB440, (0x4B, 0xA4, 0x63, 0x46, 0xF0, 0x91, 0xEA, 0x62)),
}


@lru_cache(maxsize=2)
def restore(archive, role, sources):
    import numpy as np

    path = catalog.pick_rom(archive)
    if path is None:
        raise ValueError("PCM2 source archive is missing")
    prefix, order, offset, rotation, keys = RECIPES[archive]
    with zipfile.ZipFile(path) as z:
        parts = [z.read(f"{prefix}-{role}{number}.rom") for number in (1, 2)]
    if tuple(hashlib.sha256(part).hexdigest() for part in parts) != sources:
        raise ValueError("PCM2 source member hash mismatch")
    data = np.frombuffer(b"".join(parts), dtype=np.uint8)
    if role == "p" and len(data) == 0x800000:
        blocks = data.reshape(16, -1)
        encrypted = blocks[np.argsort(order)]
        recovered = encrypted[list(order)].reshape(-1)
    elif role == "v" and len(data) == 0x1000000 and keys is None:
        def permute_words(payload):
            result = payload.copy()
            result[:-8] = payload[:-8].reshape(-1, 8)[:, [4, 5, 6, 7, 0, 1, 2, 3]].reshape(-1)
            return result

        encrypted = permute_words(data)
        recovered = permute_words(encrypted)
    elif role == "v" and len(data) == 0x1000000:
        address = np.arange(len(data), dtype=np.uint32)
        destination = (
            (address & 0xFEFFFE) | ((address & 0x10000) >> 16) | ((address & 1) << 16)
        ) ^ offset
        source = (address + rotation) & 0xFFFFFF
        xor = np.array(keys, dtype=np.uint8)[destination & 7]
        encrypted = np.empty_like(data)
        encrypted[source] = data[destination] ^ xor
        recovered = np.empty_like(data)
        recovered[destination] = encrypted[source] ^ xor
    else:
        raise ValueError("Unexpected PCM2 ROM size or role")
    if not np.array_equal(data, recovered):
        raise ValueError("PCM2 inverse verification failed")
    return tuple(part.tobytes() for part in np.split(encrypted.reshape(-1), 2))
