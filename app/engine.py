"""Pinned EmulatorJS 4.2.3 offline FBNeo dependency acquisition (one-time online)."""

import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "vendor" / "emulatorjs" / "data"
VERSION = "4.2.3"
BASE = "https://cdn.emulatorjs.org/{}/data/".format(VERSION)
FILES = [
    "loader.js",
    "emulator.min.js",
    "emulator.min.css",
    "emulator.css",
    "emulator.min.zip",
    "version.json",
    "src/GameManager.js",
    "src/compression.js",
    "src/emulator.js",
    "src/gamepad.js",
    "src/nipplejs.js",
    "src/shaders.js",
    "src/socket.io.min.js",
    "src/storage.js",
    "compression/extract7z.js",
    "compression/extractzip.js",
    "compression/libunrar.js",
    "compression/libunrar.wasm",
    "localization/ar-AR.json",
    "localization/en-US.json",
    "localization/retroarch.json",
    "cores/cores.json",
    "cores/reports/fbneo.json",
    "cores/fbneo-wasm.data",
    "cores/fbneo-legacy-wasm.data",
]
REQUIRED = {
    "loader.js": 1000,
    "emulator.min.js": 10000,
    "cores/fbneo-wasm.data": 1000000,
    "cores/fbneo-legacy-wasm.data": 1000000,
    "cores/reports/fbneo.json": 50,
}


# Check installed dependency sizes and selected-BIOS core presence without making network requests.
def status():
    missing = []
    for name in FILES:
        p = DATA / name
        if not p.is_file() or p.stat().st_size < REQUIRED.get(name, 1):
            missing.append(name)
    compat = ROOT / "vendor" / "fbneo-selected-bios"
    compat_missing = [
        name
        for name in ("fbneo-legacy-wasm.data", "fbneo.json")
        if not (compat / name).is_file()
    ]
    return {
        "selected_core": {
            "mode": "FBNeo selected BIOS / WebGL1",
            "ready": not compat_missing,
            "missing": compat_missing,
        },
        "version": VERSION,
        "ready": len(missing) == 0 and not compat_missing,
        "found": len(FILES) - len(missing),
        "total": len(FILES),
        "missing": missing,
    }


def install(force=False, url_base=BASE):
    """Install all files into local data folder. Always compare expected origin string.

    No installer network operations occur on manage.py serve.
    """
    if not url_base.startswith("https://cdn.emulatorjs.org/") or not url_base.endswith(
        "/data/"
    ):
        raise ValueError("Only official EmulatorJS CDN is accepted")
    hashes = {}
    for idx, name in enumerate(FILES, 1):
        target = DATA / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if (
            target.is_file()
            and not force
            and target.stat().st_size >= REQUIRED.get(name, 1)
        ):
            print("[EXISTS] {}/{} {}".format(idx, len(FILES), name))
        else:
            url = url_base + name
            print("[FETCH] {}/{} {}".format(idx, len(FILES), name), flush=True)
            tmp = target.with_name(target.name + ".download")
            err = None
            for attempt in range(3):
                try:
                    request = urllib.request.Request(
                        url, headers={"User-Agent": "NeoGeo-WebEmu/0.1.0"}
                    )
                    with (
                        urllib.request.urlopen(request, timeout=45) as response,
                        tmp.open("wb") as out,
                    ):
                        if response.geturl().split("/")[2] != "cdn.emulatorjs.org":
                            raise RuntimeError("Unexpected download redirect host")
                        while True:
                            block = response.read(1024 * 1024)
                            if not block:
                                break
                            out.write(block)
                    if tmp.stat().st_size < REQUIRED.get(name, 1):
                        raise RuntimeError(
                            "Downloaded file is unexpectedly small: " + name
                        )
                    os.replace(tmp, target)
                    err = None
                    break
                except (OSError, urllib.error.URLError, RuntimeError) as ex:
                    err = ex
                    tmp.unlink(missing_ok=True)
                    if attempt < 2:
                        time.sleep(1 + attempt)
            if err:
                raise RuntimeError("Unable to install {}: {}".format(name, err))
        h = hashlib.sha256()
        with target.open("rb") as source:
            for buf in iter(lambda: source.read(1024 * 1024), b""):
                h.update(buf)
        hashes[name] = h.hexdigest()
    manifest = {"version": VERSION, "origin": url_base, "sha256": hashes}
    (DATA / "engine-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(
        "[ENGINE INSTALLED] {} / {} files locally available".format(
            len(hashes), len(FILES)
        )
    )
    return status()


# Extend asset status with the offline core mode and browser prerequisites.
def diagnostic_status():
    result = status()
    result["core_mode"] = "fbneo"
    result["offline"] = True
    result["browser_core_prerequisites"] = [
        "cores/reports/fbneo.json",
        "cores/fbneo-wasm.data",
        "cores/fbneo-legacy-wasm.data",
    ]
    return result
