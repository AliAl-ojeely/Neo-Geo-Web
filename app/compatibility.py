"""Read-only ROM audit and byte-preserving compatibility plans for the pinned core."""

import collections, datetime, hashlib, json, re, zipfile, zlib, os
from pathlib import Path, PurePosixPath
from . import catalog

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
CORE = ROOT / "vendor/fbneo-selected-bios/fbneo-legacy-wasm.data"
ESS = 1 << 24
BIOS = 1 << 25
SELECT = 1 << 26
OPT = 1 << 27
NODUMP = 1 << 28
PRG = 1 << 20


# Return the current UTC timestamp in ISO format.
def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# Stream a local file into SHA-256 and return its hexadecimal digest.
def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


# Create parent directories and replace a JSON report through a sibling temporary file.
def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


# Read JSON or return the supplied default on file or parsing errors.
def load(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


# Reuse matching audit metadata or verify ZIP members, hashes, paths, and bounded archive sizes.
def audit_archive(path, force=False):
    path = Path(path)
    st = path.stat()
    cache = REPORTS / "rom_audit_cache_v014" / (path.name + ".json")
    old = load(cache)
    signature = {"bytes": st.st_size, "mtime_ns": st.st_mtime_ns}
    if (
        not force
        and old
        and old.get("file_stat") == signature
        and old.get("audit_version") == 1
    ):
        return old
    r = {
        "filename": path.name,
        "short_name": path.stem,
        "file_stat": signature,
        "sha256": sha(path),
        "audited_at": now(),
        "audit_version": 1,
        "integrity": "PASS",
        "members": [],
        "errors": [],
    }
    try:
        with zipfile.ZipFile(path) as z:
            infos = z.infolist()
            r["central_directory_offset"] = z.start_dir
            if (
                len(infos) > 10000
                or sum(i.file_size for i in infos) > 512 * 1024 * 1024
            ):
                raise ValueError("Archive exceeds audited size/member limits")
            seen = set()
            for i in infos:
                key = i.filename.casefold()
                unsafe = (
                    i.filename.startswith(("/", "\\"))
                    or ".." in PurePosixPath(i.filename.replace("\\", "/")).parts
                    or ":" in i.filename
                )
                row = {
                    "name": i.filename,
                    "size": i.file_size,
                    "compressed_size": i.compress_size,
                    "crc32": f"{i.CRC:08x}",
                    "flags": i.flag_bits,
                    "encrypted": bool(i.flag_bits & 1),
                    "directory": i.is_dir(),
                    "unsafe_path": unsafe,
                    "case_duplicate": key in seen,
                }
                seen.add(key)
                if unsafe or row["case_duplicate"]:
                    r["errors"].append("Unsafe/duplicate ZIP member: " + i.filename)
                if not i.is_dir() and not row["encrypted"]:
                    crc = 0
                    h = hashlib.sha256()
                    count = 0
                    with z.open(i) as f:
                        for data in iter(lambda: f.read(1024 * 1024), b""):
                            count += len(data)
                            crc = zlib.crc32(data, crc)
                            h.update(data)
                    row.update(
                        calculated_crc32=f"{crc:08x}",
                        sha256=h.hexdigest(),
                        verified_bytes=count,
                    )
                    if count != i.file_size or crc != i.CRC:
                        r["errors"].append("CRC/size mismatch: " + i.filename)
                elif row["encrypted"]:
                    r["errors"].append("Encrypted ZIP member: " + i.filename)
                r["members"].append(row)
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile) as e:
        r["errors"].append(str(e))
    if r["errors"]:
        r["integrity"] = "FAIL"
    r["member_count"] = len(r["members"])
    save(cache, r)
    return r


# Audit configured ZIPs, save the library manifest, and resolve its pinned driver requirements.
def scan(force=False):
    games = catalog.scan()
    paths = sorted(
        catalog.folder("roms").glob("*.zip"), key=lambda p: p.name.casefold()
    )
    archives = []
    for n, path in enumerate(paths, 1):
        archives.append(audit_archive(path, force))
        print(f"[AUDIT] {n}/{len(paths)} {path.name}", flush=True)
    r = {
        "schema": 1,
        "generated_at": now(),
        "core_sha256": sha(CORE),
        "games": len(games),
        "archives": archives,
        "summary": {
            "archives": len(archives),
            "integrity_pass": sum(a["integrity"] == "PASS" for a in archives),
            "integrity_fail": sum(a["integrity"] != "PASS" for a in archives),
        },
        "note": "All member bytes read once; unchanged archives reused by size/mtime and prior SHA manifest.",
    }
    save(REPORTS / "rom_library_manifest_v014.json", r)
    return resolve(r)


# Find the BIOS DIP default using the input and mask associated with its selection table.
def bios_default(driver):
    dips = driver.get("dips", [])
    for i, d in enumerate(dips):
        if d.get("text") == "BIOS" and d["flags"] in (0xFD, 0xFE) and i + 1 < len(dips):
            first = dips[i + 1]
            for x in dips:
                if x["flags"] == 0xFF and x["input"] == first["input"]:
                    return x["setting"] & first["mask"]
    return None


# Resolve selected-BIOS requirements for managed boards while preserving other mandatory members.
def required(driver, available_bios):
    default = bios_default(driver)
    managed = (driver["hardware"] & 0x7FFF0000) == 0x05010000 and default == 0
    chosen = (
        next(
            (
                m
                for m in driver["members"]
                if m["type"] & SELECT
                and (m["crc32"], m["size"]) in available_bios
                and m["crc32"] in ("91b64be3", "9036d879", "c7f2fa45")
            ),
            None,
        )
        if managed
        else None
    )
    # The order follows the actual MVS_EUR preference table, not an arbitrary CRC union.
    if chosen is None and managed:
        chosen = next((m for m in driver["members"] if m["index"] == 128), None)
    result = []
    for m in driver["members"]:
        t = m["type"]
        if t & SELECT and managed:
            if chosen and m["index"] == chosen["index"]:
                result.append(m)
            continue
        if not (t & (OPT | NODUMP)):
            result.append(m)
    return result, {
        "managed": managed,
        "default_dip": default,
        "selected": chosen,
        "special_board": not managed,
    }


# Index valid size/CRC signatures and include derived members only when core and source hashes match.
def member_index(archives):
    result = collections.defaultdict(list)
    for a in archives:
        if a["integrity"] != "PASS":
            continue
        for m in a["members"]:
            if m.get("sha256"):
                result[(m["crc32"], m["size"])].append({"archive": a["filename"], **m})
    crypto = load(REPORTS / "cmc_repairs_v014.json", {})
    if crypto.get("core_sha256") == sha(CORE):
        for a in archives:
            record = crypto.get("archives", {}).get(a["filename"], {})
            if record.get("source_sha256") == a["sha256"]:
                for member in record.get("solutions", []):
                    result[(member["crc32"], member["size"])].append(member)
    layouts = load(REPORTS / "rom_layout_repairs_v014.json", {})
    if layouts.get("core_sha256") == sha(CORE):
        for a in archives:
            record = layouts.get("archives", {}).get(a["filename"], {})
            if record.get("source_sha256") != a["sha256"]:
                continue
            for m in record.get("solutions", []):
                result[(m["crc32"], m["size"])].append(m)
    return result


# Compare audited local data with the pinned driver database and persist candidate repair requirements.
def resolve(manifest=None):
    manifest = manifest or load(REPORTS / "rom_library_manifest_v014.json")
    db = load(REPORTS / "fbneo_driver_database_v014.json")
    if not manifest or not db:
        raise RuntimeError("Run ROM scan and driver extraction first")
    if db["provenance"]["core_sha256"] != sha(CORE):
        raise RuntimeError("Driver database does not match installed core")
    drivers = {d["short_name"]: d for d in db["drivers"]}
    archives = {a["filename"]: a for a in manifest["archives"]}
    global_index = member_index(manifest["archives"])
    bios = archives.get("neogeo.zip", {})
    available_bios = {
        (m["crc32"], m["size"]) for m in bios.get("members", []) if m.get("sha256")
    }
    prepared = load(REPORTS / "compatibility_resolver_v014.json", {"games": {}})[
        "games"
    ]
    games = catalog.scan()
    results = []
    for game in games:
        a = archives[game["filename"]]
        local = {
            key
            for key, values in global_index.items()
            if any(v["archive"] == a["filename"] for v in values)
        }
        declared = drivers.get(game["id"])
        candidates = []
        for d in drivers.values():
            if d.get("bios") != "neogeo" or not d["flags"] & 1:
                continue
            req, _ = required(d, available_bios)
            greq = [m for m in req if not m["type"] & BIOS]
            primary = [m for m in greq if m["type"] & PRG and m["type"] & 255 == 1]
            if not primary or not all(
                (m["crc32"], m["size"]) in local for m in primary
            ):
                continue
            matched = [m for m in greq if (m["crc32"], m["size"]) in local]
            ratio = sum(m["size"] for m in matched) / max(
                1, sum(m["size"] for m in greq)
            )
            complete = all((m["crc32"], m["size"]) in global_index for m in req)
            if ratio >= 0.7:
                candidates.append(
                    {
                        "driver": d["short_name"],
                        "local_byte_ratio": ratio,
                        "all_required_available": complete,
                        "matching_members": len(matched),
                        "required_members": len(greq),
                    }
                )
        candidates.sort(
            key=lambda c: (
                c["all_required_available"],
                c["local_byte_ratio"],
                c["driver"] == game["id"],
            ),
            reverse=True,
        )
        proposed = declared
        if candidates:
            best = candidates[0]
            best_driver = drivers[best["driver"]]
            declared_req = required(declared, available_bios)[0] if declared else []
            declared_complete = bool(declared) and all(
                (m["crc32"], m["size"]) in global_index for m in declared_req
            )
            tied = [
                c
                for c in candidates
                if c["all_required_available"] == best["all_required_available"]
                and c["local_byte_ratio"] == best["local_byte_ratio"]
            ]
            if best["all_required_available"] and (
                not declared or not declared_complete
            ):
                if len(tied) == 1:
                    proposed = best_driver
                else:
                    title = game["title"].casefold()
                    preferred = [
                        c
                        for c in tied
                        if drivers[c["driver"]]["title"].casefold() == title
                    ]
                    if len(preferred) == 1:
                        proposed = drivers[preferred[0]["driver"]]
        prior = prepared.get(game["filename"], {})
        if (
            prior.get("core_sha256") == manifest["core_sha256"]
            and prior.get("source_fingerprint") == a["sha256"]
            and any(
                v["driver"] == prior.get("driver") and v["all_required_available"]
                for v in candidates
            )
        ):
            proposed = drivers[prior["driver"]]

        # Resolve required members with parent preference, rejecting ambiguous size/CRC matches with different hashes.
        def evaluate(d, allow_layouts=True):
            if not d:
                return {
                    "status": "UNSUPPORTED_DRIVER",
                    "missing": [],
                    "resolved_members": [],
                    "bios_policy": None,
                    "unexpected": [],
                }
            req, policy = required(d, available_bios)
            missing = []
            resolved = []
            used = set()
            parents = []
            p = d.get("parent")
            while p and p not in parents:
                parents.append(p)
                p = drivers.get(p, {}).get("parent")
            permitted = [a["filename"]] + [p + ".zip" for p in parents] + ["neogeo.zip"]
            for m in req:
                found = [
                    v
                    for v in global_index.get((m["crc32"], m["size"]), [])
                    if allow_layouts or not v.get("transform")
                ]
                unique = {v["sha256"] for v in found}
                if len(unique) > 1:
                    missing.append({**m, "reason": "AMBIGUOUS_CRC_SIZE_HASHES"})
                    continue
                src = next(
                    (
                        v
                        for archive in permitted
                        for v in found
                        if v["archive"] == archive
                    ),
                    found[0] if found else None,
                )
                if src:
                    used.add(src["name"])
                    resolved.append(
                        {
                            "expected": m,
                            "source": {
                                k: src[k]
                                for k in [
                                    "archive",
                                    "name",
                                    "size",
                                    "crc32",
                                    "sha256",
                                    "transform",
                                ]
                                if k in src
                            },
                            "in_declared_search_paths": src["archive"] in permitted,
                        }
                    )
                else:
                    same = next(
                        (
                            v
                            for v in a["members"]
                            if (
                                v["name"].casefold() == m["name"].casefold()
                                or PurePosixPath(v["name"]).stem.casefold()
                                == PurePosixPath(m["name"]).stem.casefold()
                            )
                        ),
                        None,
                    )
                    reason = "MISSING_REQUIRED_ROM"
                    if same:
                        reason = (
                            "SIZE_MISMATCH"
                            if same["size"] != m["size"]
                            else "CRC_MISMATCH"
                        )
                    if m["type"] & BIOS:
                        reason = "BIOS_DEPENDENCY"
                    missing.append({**m, "reason": reason, "actual": same})
            if a["integrity"] != "PASS":
                status = "CRC_MISMATCH"
            elif missing:
                status = next(
                    (x["reason"] for x in missing if x["reason"] == "BIOS_DEPENDENCY"),
                    missing[0]["reason"],
                )
            elif any(not x["in_declared_search_paths"] for x in resolved):
                status = "PARENT_DEPENDENCY"
            else:
                status = "COMPATIBLE_STATIC"
            return {
                "status": status,
                "missing": missing,
                "resolved_members": resolved,
                "bios_policy": policy,
                "parent_chain": parents,
                "unexpected": [
                    m["name"]
                    for m in a["members"]
                    if m["name"] not in used and not m["directory"]
                ],
            }

        original = evaluate(declared, False)
        target = evaluate(proposed)
        can_build = (
            bool(proposed) and not target["missing"] and a["integrity"] == "PASS"
        )
        needs = (
            any(v["source"].get("transform") for v in target["resolved_members"])
            or proposed is not declared
            or target["status"] == "PARENT_DEPENDENCY"
            or any(
                v["source"]["archive"] not in (a["filename"], "neogeo.zip")
                for v in target["resolved_members"]
            )
        )
        row = {
            **game,
            "archive_sha256": a["sha256"],
            "file_stat": a["file_stat"],
            "driver_declared": declared["short_name"] if declared else None,
            "driver_resolved": proposed["short_name"] if proposed else None,
            "static_original": original,
            "static_resolved": target,
            "candidate_drivers": candidates[:8],
            "repair_possible": can_build and needs,
            "repair_applied": False,
            "driver_title": proposed["title"] if proposed else None,
            "parent": proposed.get("parent") if proposed else None,
            "core_sha256": manifest["core_sha256"],
        }
        results.append(row)
    r = {
        "schema": 1,
        "generated_at": now(),
        "core_sha256": manifest["core_sha256"],
        "database_provenance": db["provenance"],
        "games": results,
        "summary": dict(
            collections.Counter(x["static_original"]["status"] for x in results)
        ),
        "repair_candidates": sum(g["repair_possible"] for g in results),
    }
    save(REPORTS / "rom_compatibility_static_v014.json", r)
    print(
        json.dumps(
            {"summary": r["summary"], "repair_candidates": r["repair_candidates"]}
        )
    )
    return r


# Build a derived ZIP from validated local sources, prove hashes and reversibility, and persist its plan.
def build_compatible(name):
    report = load(REPORTS / "rom_compatibility_static_v014.json")
    row = next((g for g in report["games"] if g["filename"] == name), None)
    if not row or not row["repair_possible"]:
        raise ValueError("No complete, validated local repair plan for " + name)
    if report["core_sha256"] != sha(CORE):
        raise ValueError("Core changed; rebuild driver database and audit")
    driver = row["driver_resolved"]
    prior = load(REPORTS / "compatibility_resolver_v014.json", {"games": {}})[
        "games"
    ].get(name)
    if prior and prior.get("driver") == driver:
        expected = {
            (x["expected"]["name"], x["expected"]["size"], x["expected"]["crc32"])
            for x in row["static_resolved"]["resolved_members"]
            if not x["expected"]["type"] & BIOS
        }
        recorded = {
            (x["derived_member"], x["size"], x["crc32"]) for x in prior["members"]
        }
        if expected == recorded:
            try:
                if launch_plan(name)["prepared"]:
                    return prior
            except ValueError:
                pass
    if not re.fullmatch("[a-zA-Z0-9_]+", driver):
        raise ValueError("Unsafe driver name")
    output = ROOT / "work/compatible-roms" / Path(name).stem / (driver + ".zip")
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix(".tmp")
    members = []
    inverse_members = []
    from . import rom_layouts

    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as out:
        for item in row["static_resolved"]["resolved_members"]:
            m = item["expected"]
            src = item["source"]
            if m["type"] & BIOS:
                continue
            path = catalog.pick_rom(src["archive"])
            if path is None:
                raise ValueError("Source ROM is no longer available")
            b = rom_layouts.materialize(src)
            digest = hashlib.sha256(b).hexdigest()
            if (
                digest != src["sha256"]
                or len(b) != m["size"]
                or f"{zlib.crc32(b):08x}" != m["crc32"]
            ):
                raise ValueError("Source bytes changed")
            inverse_members.append((m["name"], src, b))
            out.writestr(m["name"], b)
            members.append(
                {
                    "original_archive": src["archive"],
                    "original_member": src["name"],
                    "derived_member": m["name"],
                    "size": len(b),
                    "crc32": m["crc32"],
                    "sha256_before": src.get("transform", {}).get(
                        "source_sha256", digest
                    )
                    if src.get("transform", {}).get("kind") != "segments"
                    else None,
                    "sha256_materialized": digest,
                    "sha256_after": digest,
                    "transform": src.get("transform"),
                    "source_sha256": src.get("transform", {}).get(
                        "source_sha256", digest
                    ),
                }
            )
    with zipfile.ZipFile(tmp) as check:
        assert check.testzip() is None
        for m in members:
            assert (
                hashlib.sha256(check.read(m["derived_member"])).hexdigest()
                == m["sha256_after"]
            )
    try:
        inverse_proof, recovery = rom_layouts.verify_group_inverse(
            inverse_members, preserve_remainders=True
        )
    except ValueError:
        tmp.unlink(missing_ok=True)
        raise
    if recovery:
        with zipfile.ZipFile(tmp, "a", zipfile.ZIP_DEFLATED, compresslevel=6) as out:
            for record, data in recovery:
                out.writestr(record["derived_member"], data)
        with zipfile.ZipFile(tmp) as check:
            if check.testzip() is not None:
                raise ValueError("Recovery ZIP integrity failed")
            for record, _ in recovery:
                if (
                    hashlib.sha256(check.read(record["derived_member"])).hexdigest()
                    != record["sha256"]
                ):
                    raise ValueError("Recovery bytes changed")
    os.replace(tmp, output)
    plan = {
        "source_filename": name,
        "driver": driver,
        "core_sha256": report["core_sha256"],
        "source_fingerprint": row["archive_sha256"],
        "file_stat": row["file_stat"],
        "derived_file": output.relative_to(ROOT).as_posix(),
        "derived_sha256": sha(output),
        "members": members,
        "group_inverse_proof": inverse_proof,
        "recovery_members": [record for record, _ in recovery],
        "created_at": now(),
    }
    enrich_plan_sources(plan)
    save(output.with_suffix(".manifest.json"), plan)
    resolver = load(
        REPORTS / "compatibility_resolver_v014.json", {"schema": 1, "games": {}}
    )
    resolver["games"][name] = plan
    save(REPORTS / "compatibility_resolver_v014.json", resolver)
    return plan


# Return the timestamp, status counts, and repair-candidate count from the saved static report.
def report_summary():
    r = load(REPORTS / "rom_compatibility_static_v014.json", {})
    return {k: r.get(k) for k in ["generated_at", "summary", "repair_candidates"]}


# Return an original or hash-verified prepared launch plan without building archives in HTTP requests.
def launch_plan(name):
    # Never build in an HTTP request. Only previously verified plans are served.
    original = catalog.pick_rom(name)
    if original is None:
        raise ValueError("Unknown ROM")
    plan = load(REPORTS / "compatibility_resolver_v014.json", {"games": {}})[
        "games"
    ].get(name)
    if not plan:
        return {
            "prepared": False,
            "driver": original.stem,
            "rom_url": "/api/rom/"
            + __import__("urllib.parse", fromlist=["quote"]).quote(name),
        }
    if plan["core_sha256"] != sha(CORE):
        raise ValueError("Prepared ROM belongs to a different core")
    st = original.stat()
    if (
        plan["file_stat"] != {"bytes": st.st_size, "mtime_ns": st.st_mtime_ns}
        or sha(original) != plan["source_fingerprint"]
    ):
        raise ValueError("Original ROM changed; rerun compatibility audit")
    path = (ROOT / plan["derived_file"]).resolve()
    allowed = (ROOT / "work/compatible-roms").resolve()
    if not path.is_relative_to(allowed) or path.suffix != ".zip" or not path.is_file():
        raise ValueError("Invalid prepared ROM path")
    if sha(path) != plan["derived_sha256"]:
        raise ValueError("Prepared ROM integrity check failed")
    return {
        "prepared": True,
        "driver": plan["driver"],
        "rom_url": "/api/compatible-rom/"
        + __import__("urllib.parse", fromlist=["quote"]).quote(name)
        + "/"
        + plan["driver"]
        + ".zip",
        "derived_sha256": plan["derived_sha256"],
        "path": path,
    }


# Attach original-member hashes and sizes to each derived member using the audit manifest.
def enrich_plan_sources(plan):
    audit = load(REPORTS / "rom_library_manifest_v014.json")
    index = {
        (a["filename"], m["name"]): m for a in audit["archives"] for m in a["members"]
    }
    for member in plan["members"]:
        t = member.get("transform")
        names = (
            list(dict.fromkeys(p["name"] for p in t["segments"]))
            if t and t["kind"] == "segments"
            else [v["name"] for v in t["sources"]]
            if t and t["kind"] == "cmc"
            else [member["original_member"]]
        )
        sources = []
        for name in names:
            original = index[(member["original_archive"], name)]
            sources.append(
                {
                    "archive": member["original_archive"],
                    "member": name,
                    "size": original["size"],
                    "crc32": original["crc32"],
                    "sha256": original["sha256"],
                }
            )
        member["source_members"] = sources
        member["sha256_before"] = sources[0]["sha256"] if len(sources) == 1 else None
        member["crc32_before"] = sources[0]["crc32"] if len(sources) == 1 else None
        member["crc32_after"] = member["crc32"]
        member["size_before"] = sources[0]["size"] if len(sources) == 1 else None
        member["sha256_materialized"] = member["sha256_after"]
    return plan
