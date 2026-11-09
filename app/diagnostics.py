"""Inspect local ZIP metadata without making claims of core ROM-set compatibility."""

from pathlib import Path
from zipfile import ZipFile, BadZipFile
from . import catalog


# Read ZIP directory metadata for a present file, recording supported archive errors in the result.
def _inspect_file(path):
    if path is None:
        return {"present": False}
    report = {"present": True, "filename": path.name, "bytes": path.stat().st_size}
    try:
        with ZipFile(path) as archive:
            infos = archive.infolist()
            report["zip_ok"] = True
            report["members"] = len(infos)
            report["files_sample"] = [i.filename for i in infos[:25]]
            report["total_uncompressed_bytes"] = sum(i.file_size for i in infos)
            report["encrypted_members"] = sum(bool(i.flag_bits & 1) for i in infos)
            report["known_zip_directory"] = all(
                not i.filename.startswith(("/", "../")) for i in infos
            )
    except (BadZipFile, OSError, ValueError, RuntimeError) as e:
        report["zip_ok"] = False
        report["error"] = str(e)
    return report


# Inspect the selected local game and BIOS without treating ZIP structure as driver compatibility.
def inspect_archives(game_filename):
    p = catalog.pick_rom(game_filename)
    return {
        "rom": _inspect_file(p),
        "bios": _inspect_file(catalog.pick_bios()),
        "note": "This checks ZIP structure only. FBNeo driver/CRC/parent ROM compatibility remains unverified.",
    }
