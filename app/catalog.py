"""Local ROM catalog and NeoRAGEx 5.2a decimal-ID -> hex BMP preview mapping."""

import json
import re
from pathlib import Path
from . import metadata

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.json"
ROM_EXT = ".zip"
SHOT_EXT = (".png", ".webp", ".jpg", ".jpeg", ".gif", ".bmp")
INI_LINE = re.compile(r"^\s*(\d+)\s*,\s*([^,\\/]+\.zip)\s*$", re.IGNORECASE)


# Load configured ROM and screenshot directories, retaining defaults for invalid configuration.
def settings():
    defaults = {"roms": str(ROOT / "ROMs"), "screenshots": str(ROOT / "Screenshots")}
    if CONFIG.is_file():
        try:
            data = json.loads(CONFIG.read_text(encoding="utf-8"))
            for key in ("roms", "screenshots"):
                if isinstance(data.get(key), str) and data[key].strip():
                    defaults[key] = data[key]
        except (OSError, ValueError):
            pass
    return defaults


# Resolve the configured directory for the requested catalog role.
def folder(name):
    return Path(settings()[name]).expanduser().resolve()


def _read_preview_map(romdir, shotdir):
    """Original INI rows: 94605,2020bb.zip -> PREVIEWS/1718d.bmp."""
    result = {}
    candidates = (
        shotdir.parent / "neoragex5.2a.ini",
        romdir.parent / "neoragex5.2a.ini",
    )
    for candidate in dict.fromkeys(candidates):
        if not candidate.is_file():
            continue
        try:
            # INI is legacy text and may contain bytes outside Unicode.
            with candidate.open("r", encoding="latin-1") as source:
                for line in source:
                    match = INI_LINE.match(line.strip())
                    if match:
                        result.setdefault(
                            match[2][:-4].casefold(), format(int(match[1]), "x")
                        )
            if result:
                break
        except (OSError, ValueError):
            continue
    return result


# Enumerate nonempty game ZIPs and associate previews by filename or legacy INI ID.
def scan():
    romdir = folder("roms")
    shotdir = folder("screenshots")
    shots = {}
    if shotdir.is_dir():
        for path in shotdir.iterdir():
            if path.is_file() and path.suffix.lower() in SHOT_EXT:
                shots.setdefault(path.stem.casefold(), path.name)
    previews = _read_preview_map(romdir, shotdir)
    games = []
    if romdir.is_dir():
        for file in romdir.iterdir():
            if (
                not file.is_file()
                or file.suffix.lower() != ROM_EXT
                or file.name.casefold() == "neogeo.zip"
            ):
                continue
            try:
                size = file.stat().st_size
                if size == 0:
                    continue
            except OSError:
                continue
            stem = file.stem
            key = stem.casefold()
            image = shots.get(key) or shots.get(previews.get(key, "").casefold())
            games.append(
                {
                    "filename": file.name,
                    "id": stem,
                    "title": metadata.get_title(stem),
                    "size": size,
                    "screenshot": image,
                    "category": metadata.get_category(stem),
                    "is_modified": "-" in stem,
                }
            )
    games.sort(key=lambda g: g["title"].casefold())
    return games


# Return an existing game ZIP only when its name and resolved path stay inside the ROM directory.
def pick_rom(name):
    if (
        not isinstance(name, str)
        or not name
        or "/" in name
        or "\\" in name
        or name in {".", ".."}
        or name.startswith(".")
    ):
        return None
    if Path(name).suffix.lower() != ROM_EXT or name.casefold() == "neogeo.zip":
        return None
    base = folder("roms")
    p = base / name
    return p if p.is_file() and p.resolve().is_relative_to(base) else None


# Locate the BIOS ZIP case-insensitively while enforcing the configured directory boundary.
def pick_bios():
    base = folder("roms")
    if not base.is_dir():
        return None
    for f in base.iterdir():
        if (
            f.name.casefold() == "neogeo.zip"
            and f.is_file()
            and f.resolve().is_relative_to(base)
        ):
            return f
    return None


# Return a supported image only when the name and resolved path remain inside the preview directory.
def pick_shot(name):
    if (
        not isinstance(name, str)
        or not name
        or "/" in name
        or "\\" in name
        or name.startswith(".")
    ):
        return None
    base = folder("screenshots")
    p = base / name
    return (
        p
        if p.is_file()
        and p.suffix.lower() in SHOT_EXT
        and p.resolve().is_relative_to(base)
        else None
    )


# Summarize supplied or scanned games and report configured paths and BIOS presence.
def summary(games=None):
    games = scan() if games is None else games
    return {
        "games": len(games),
        "total_bytes": sum(g["size"] for g in games),
        "with_screenshots": sum(bool(g["screenshot"]) for g in games),
        "bios_present": pick_bios() is not None,
        "roms": str(folder("roms")),
        "screenshots": str(folder("screenshots")),
    }
