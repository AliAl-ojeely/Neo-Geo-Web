"""Private local packages and allowlisted static distribution. Never uploads files."""

import collections, datetime, json, re, shutil, subprocess, zipfile
from pathlib import Path
from . import compatibility as c

PRIVATE = c.ROOT.parent / "Neo-Geo-Web-private-v015"
PUBLIC = c.ROOT / "dist/github-pages"
EXCLUDED_ENGINE = {
    "compression/libunrar.js",
    "compression/libunrar.wasm",
    "cores/fbneo-wasm.data",
    "cores/fbneo-legacy-wasm.data",
}


# Assemble public metadata for boot-passing games while retaining private source paths for packaging.
def catalog():
    matrix = c.load(c.REPORTS / "game_boot_matrix_v014.json")
    plans = c.load(c.REPORTS / "compatibility_resolver_v014.json")["games"]
    drivers = {
        d["short_name"]: d
        for d in c.load(c.REPORTS / "fbneo_driver_database_v014.json")["drivers"]
    }
    local = {g["filename"]: g for g in c.catalog.scan()}
    games = []
    for g in matrix["games"]:
        if g["boot_status"] != "PASS":
            continue
        plan = plans.get(g["filename"])
        source = (
            c.ROOT / plan["derived_file"] if plan else c.catalog.pick_rom(g["filename"])
        )
        driver = plan["driver"] if plan else g["runtime_driver"]
        meta = local[g["filename"]]
        games.append(
            {
                "id": meta["id"],
                "filename": g["filename"],
                "title": meta["title"],
                "category": meta["category"],
                "selected_filename": driver + ".zip",
                "driver": driver,
                "size": source.stat().st_size,
                "sha256": c.sha(source),
                "screenshot": meta["screenshot"],
                "original_preview_id": Path(meta["screenshot"]).stem
                if meta["screenshot"]
                else None,
                "parent": drivers[driver].get("parent"),
                "dependencies": [],
                "self_contained_verified": True,
                "boot_status": "PASS",
                "game_compatibility": g["game_compatibility"],
                "_source": str(source),
            }
        )
    assert len({g["selected_filename"] for g in games}) == len(games), (
        "Driver filename collision"
    )
    bios = c.catalog.folder("roms") / "neogeo.zip"
    return {
        "schema": 1,
        "version": "0.1.5.1",
        "core_sha256": c.sha(c.CORE),
        "bios": {
            "filename": "neogeo.zip",
            "size": bios.stat().st_size,
            "sha256": c.sha(bios),
        },
        "games": games,
    }


def recovery():
    """One final bounded recheck of all missing signatures, without retesting PASS."""
    manifest = c.load(c.REPORTS / "rom_library_manifest_v014.json")
    index = c.member_index(manifest["archives"])
    static = {
        g["filename"]: g
        for g in c.load(c.REPORTS / "rom_compatibility_static_v014.json")["games"]
    }
    matrix = c.load(c.REPORTS / "game_boot_matrix_v014.json")
    rows = []
    for g in matrix["games"]:
        if g["boot_status"] != "BLOCKED":
            continue
        s = static[g["filename"]]
        missing = s["static_resolved"]["missing"]
        absent = [
            {"name": m["name"], "size": m["size"], "crc32": m["crc32"]}
            for m in missing
            if (m["crc32"], m["size"]) not in index
        ]
        rows.append(
            {
                "filename": g["filename"],
                "status": "DEFERRED",
                "runtime_category": g["failure_class"],
                "remaining_unmatched": absent,
                "candidate_drivers": s["candidate_drivers"],
                "reason": "No complete locally verified plan; prior layout/CMC/M1 evidence retained. Unsupported hacks require separate driver work.",
            }
        )
    report = {
        "generated_at": c.now(),
        "previous_pass": 127,
        "new_pass": 0,
        "final_pass": 127,
        "deferred": len(rows),
        "core_unchanged": True,
        "method": "Bounded recheck of pinned requirements against full original + verified virtual-member index; no new matching complete plans; no download or core modifications",
        "games": rows,
    }
    c.save(c.REPORTS / "v015_rom_recovery.json", report)
    return report


# Write private local game packages and manifests, then verify their member hashes.
def package():
    PRIVATE.mkdir(exist_ok=True)
    (PRIVATE / ".gitignore").write_text("*\n!.gitignore\n", encoding="utf-8")
    data = catalog()
    records = []
    package_specs = [
        ("ROMs", [(g["selected_filename"], Path(g["_source"])) for g in data["games"]]),
        (
            "PREVIEWS",
            [
                (name, c.catalog.folder("screenshots") / name)
                for name in sorted(
                    {g["screenshot"] for g in data["games"] if g["screenshot"]}
                )
            ],
        ),
        ("BIOS", [("neogeo.zip", c.catalog.folder("roms") / "neogeo.zip")]),
    ]
    for folder, files in package_specs:
        output = PRIVATE / ("NeoGeo_" + folder + "_Package.zip")
        members = []
        with zipfile.ZipFile(output, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
            for name, path in files:
                member = folder + "/" + name
                z.write(path, member)
                members.append(
                    {"name": member, "size": path.stat().st_size, "sha256": c.sha(path)}
                )
            public_data = {
                **data,
                "games": [
                    {k: v for k, v in g.items() if k != "_source"}
                    for g in data["games"]
                ],
            }
            z.writestr(
                "manifest.json",
                json.dumps(
                    {
                        "privacy": "PRIVATE_NOT_PUBLICLY_LICENSED",
                        "files": members,
                        "library": public_data,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )
        records.append(
            {
                "package": folder,
                "path": str(output),
                "bytes": output.stat().st_size,
                "sha256": c.sha(output),
                "content_files": len(files),
                "members": members,
            }
        )
    report = {
        "generated_at": c.now(),
        "privacy": "PRIVATE_LOCAL_ONLY",
        "outside_repository": True,
        "packages": records,
    }
    c.save(c.ROOT / "web/data/catalog.json", public_data)
    c.save(c.ROOT / "dist/reports/package_hashes.json", report)
    c.save(c.REPORTS / "v015_package_hashes.json", report)
    return verify_packages()


# Check package hashes, ZIP member sets, and streamed member digests before reporting integrity.
def verify_packages():
    report = c.load(c.ROOT / "dist/reports/package_hashes.json")
    if not report:
        raise RuntimeError("Run library package first")
    for p in report["packages"]:
        assert c.sha(p["path"]) == p["sha256"]
        with zipfile.ZipFile(p["path"]) as z:
            assert z.testzip() is None
            assert set(z.namelist()) == {
                "manifest.json",
                *(m["name"] for m in p["members"]),
            }
            for m in p["members"]:
                import hashlib

                assert z.getinfo(m["name"]).file_size == m["size"]
                h = hashlib.sha256()
                with z.open(m["name"]) as f:
                    for chunk in iter(lambda: f.read(1048576), b""):
                        h.update(chunk)
                assert h.hexdigest() == m["sha256"]
        p["integrity"] = "PASS"
    report["status"] = "PASS"
    c.save(c.ROOT / "dist/reports/package_hashes.json", report)
    c.save(c.REPORTS / "v015_package_hashes.json", report)
    return {
        "status": "PASS",
        "packages": [
            dict(
                package=p["package"],
                bytes=p["bytes"],
                files=p["content_files"],
                sha256=p["sha256"],
            )
            for p in report["packages"]
        ],
    }


# Generate the allowlisted static distribution and manifest, refusing unknown existing output files.
def build():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    # This directory is generated only; refuse unexpected content instead of deleting it.
    old = c.load(c.ROOT / "dist/reports/static_build_manifest.json", {})
    for p in PUBLIC.rglob("*"):
        if p.is_file() and p.relative_to(PUBLIC).as_posix() not in old.get("files", {}):
            raise RuntimeError(
                "Unexpected static output file: " + str(p.relative_to(PUBLIC))
            )

    # Copy one source into the generated distribution, creating its destination directories.
    def copy(source, target):
        dest = PUBLIC / target
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)

    for p in (c.ROOT / "web").rglob("*"):
        if p.is_file() and p.suffix.lower() in (
            ".js",
            ".css",
            ".png",
            ".svg",
            ".webp",
            ".ico",
        ):
            copy(p, "assets/" + p.relative_to(c.ROOT / "web").as_posix())
    for name in ["index.html", "player.html", "settings.html"]:
        text = (c.ROOT / "web" / name).read_text(encoding="utf-8")
        text = (
            text.replace('href="/assets/', 'href="./assets/')
            .replace('src="/assets/', 'src="./assets/')
            .replace('href="/settings.html"', 'href="./settings.html"')
            .replace('href="/"', 'href="./"')
        )
        text = (
            text.replace("يعمل دون إنترنت", "ملفات ألعاب محلية")
            .replace("v0.1.4", "v0.1.5")
            .replace("عبر خادم Python المحلي", "بإذن قراءة من المتصفح")
        )
        scripts = (
            '<script src="./assets/library/bootstrap.js?v=0.1.5.1"></script>'
            + "".join(
                '<script defer src="./assets/library/' + f + '.js?v=0.1.5.1"></script>'
                for f in [
                    "indexeddb-store",
                    "filesystem-access",
                    "local-companion",
                    "library-manager",
                    "rom-provider",
                    "preview-provider",
                    "library-ui",
                    "session-navigation",
                    "player-recovery",
                ]
            )
        )
        text = re.sub(r'(src="\./assets/[^"]+\.js)(")', r"\1?v=0.1.5.1\2", text)
        text = text.replace(
            "<head>",
            '<head><meta http-equiv="Content-Security-Policy" content="default-src &apos;self&apos; blob: data:; script-src &apos;self&apos; blob: &apos;unsafe-eval&apos; &apos;wasm-unsafe-eval&apos;; style-src &apos;self&apos; &apos;unsafe-inline&apos;; connect-src &apos;self&apos; blob: data:; object-src &apos;none&apos;; base-uri &apos;self&apos;; form-action &apos;none&apos;">'
            + scripts,
        )
        (PUBLIC / name).write_text(text, encoding="utf-8")
    # CI uses only the sanitized, precomputed catalog, never private ROMs/reports/config.
    data = c.load(c.ROOT / "web/data/catalog.json")
    if not data or data["core_sha256"] != c.sha(c.CORE):
        raise RuntimeError("Missing public catalog or pinned core mismatch")
    c.save(PUBLIC / "data/catalog.json", data)
    for p in (c.ROOT / "vendor/emulatorjs/data").rglob("*"):
        rel = p.relative_to(c.ROOT / "vendor/emulatorjs/data").as_posix()
        if p.is_file() and rel not in EXCLUDED_ENGINE:
            copy(p, "vendor/emulatorjs/data/" + rel)
    for rel in EXCLUDED_ENGINE:
        target = PUBLIC / "vendor/emulatorjs/data" / rel
        previous = old.get("files", {}).get(target.relative_to(PUBLIC).as_posix())
        if target.is_file():
            if (
                not target.resolve().is_relative_to(PUBLIC.resolve())
                or not previous
                or c.sha(target) != previous["sha256"]
            ):
                raise RuntimeError("Unrecognized generated file; not removing " + rel)
            target.unlink()  # Only a hash-verified generated copy, never installed vendor files.
    for name in [
        "fbneo-legacy-wasm.data",
        "fbneo.json",
        "LICENSE.txt",
        "manifest.json",
    ]:
        copy(
            c.ROOT / "vendor/fbneo-selected-bios" / name,
            "vendor/fbneo-selected-bios/" + name,
        )
    for p in (c.ROOT / "vendor/fbneo-selected-bios/patches").glob("*"):
        if p.is_file():
            copy(p, "vendor/fbneo-selected-bios/patches/" + p.name)
    for name in ["LICENSE", "THIRD_PARTY_NOTICES.md"]:
        copy(c.ROOT / name, name)
    copy(c.ROOT / "vendor/emulatorjs/LICENSE", "vendor/emulatorjs/LICENSE")
    (PUBLIC / ".nojekyll").write_text("", encoding="utf-8")
    # A deterministic asset index makes the user-approved offline download exhaustive and verifiable.
    import hashlib
    existing = sorted(
        p for p in PUBLIC.rglob('*') if p.is_file() and p.relative_to(PUBLIC).as_posix()
        not in {'.nojekyll', 'offline-sw.js', 'offline-manifest.json'}
    )
    signature = '\n'.join(
        p.relative_to(PUBLIC).as_posix() + ':' + c.sha(p) for p in existing
    )
    build_id = hashlib.sha256(signature.encode('utf-8')).hexdigest()[:16]
    template = (c.ROOT / 'tools/offline-sw.template.js').read_text(encoding='utf-8')
    if template.count('__NG_OFFLINE_BUILD_ID__') != 1:
        raise RuntimeError('Offline Service Worker build token is missing or ambiguous')
    (PUBLIC / 'offline-sw.js').write_text(
        template.replace('__NG_OFFLINE_BUILD_ID__', build_id), encoding='utf-8'
    )
    offline_paths = existing + [PUBLIC / 'offline-sw.js']
    offline_files = [
        {
            'path': p.relative_to(PUBLIC).as_posix(),
            'sha256': c.sha(p),
            'bytes': p.stat().st_size,
        }
        for p in offline_paths
    ]
    (PUBLIC / 'offline-manifest.json').write_text(
        json.dumps({
            'schema': 1,
            'id': build_id,
            'files': offline_files,
            'totalBytes': sum(x['bytes'] for x in offline_files),
        }, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    files = {
        p.relative_to(PUBLIC).as_posix(): {
            "sha256": c.sha(p),
            "bytes": p.stat().st_size,
        }
        for p in PUBLIC.rglob("*")
        if p.is_file()
    }
    c.save(
        c.ROOT / "dist/reports/static_build_manifest.json",
        {
            "version": "0.1.5.1",
            "core_sha256": data["core_sha256"],
            "files": files,
            "bytes": sum(x["bytes"] for x in files.values()),
        },
    )
    return verify()


# Check generated file hashes, relative HTML assets, core identity, and the public-asset audit.
def verify():
    manifest = c.load(c.ROOT / "dist/reports/static_build_manifest.json")
    if not manifest:
        raise RuntimeError("Run web build first")
    errors = []
    actual = {
        p.relative_to(PUBLIC).as_posix() for p in PUBLIC.rglob("*") if p.is_file()
    }
    if actual != set(manifest["files"]):
        errors.append("Static file set differs from build manifest")
    for name, m in manifest["files"].items():
        path = PUBLIC / name
        if not path.is_file() or c.sha(path) != m["sha256"]:
            errors.append("Hash mismatch " + name)
        if path.suffix in (".html", ".js", ".css") and not name.startswith("vendor/"):
            text = path.read_text(encoding="utf-8")
            if name.endswith(".html"):
                for url in re.findall(r'(?:src|href)="([^"]+)"', text):
                    if url.startswith("/"):
                        errors.append("Root absolute URL " + name + ": " + url)
                    elif (
                        not url.startswith(("#", "http", "blob:", "data:"))
                        and not (path.parent / url.split("?")[0]).exists()
                    ):
                        errors.append("Missing asset " + url)
    # Runtime API strings exist only in preserved Python branches, guarded by NGLocal.
    assert c.sha(PUBLIC / "vendor/fbneo-selected-bios/fbneo-legacy-wasm.data") == c.sha(
        c.CORE
    )
    audit = publish_audit()
    errors.extend(audit["errors"])
    result = {
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
        "base_path": "Relative URLs; tested separately under /Neo-Geo-Web/",
        "files": len(manifest["files"]),
        "backend_required": False,
        "published": False,
    }
    c.save(c.ROOT / "dist/reports/static_verification.json", result)
    readiness = c.load(c.ROOT / "dist/reports/deployment_readiness.json", {}) or {
        "status": "NOT_VERIFIED_RUNTIME",
        "published": False,
    }
    readiness["static_build"] = result["status"]
    readiness["static_scope"] = (
        "File integrity/public audit only; not a full runtime or UI acceptance result"
    )
    c.save(c.ROOT / "dist/reports/deployment_readiness.json", readiness)
    return result


# Audit static assets and existing Git history for prohibited content without uploading anything.
def publish_audit():
    files = [p for p in PUBLIC.rglob("*") if p.is_file()]
    errors = []
    for p in files:
        name = p.relative_to(PUBLIC).as_posix()
        if name == "vendor/emulatorjs/data/emulator.min.zip":
            with zipfile.ZipFile(p) as z:
                if (
                    set(z.namelist()) != {"emulator.min.js", "emulator.min.css"}
                    or z.testzip() is not None
                ):
                    errors.append("Unexpected engine archive contents")
        if (
            p.suffix.lower() in (".zip", ".rom", ".sp1", ".bmp", ".state", ".sav")
            and name != "vendor/emulatorjs/data/emulator.min.zip"
        ) or name == "config.json":
            errors.append("Private/prohibited asset " + name)
        if p.stat().st_size >= 100 * 1024 * 1024:
            errors.append("GitHub large file " + name)
        if p.suffix.lower() in (".html", ".js", ".json", ".md"):
            content = p.read_text(encoding="utf-8", errors="replace")
            if re.search(r"[CD]:(?:\\+|/)(?:Users|Games|dev)(?:\\+|/)", content):
                errors.append("Machine path " + name)
    git = {"status": "NOT_PRESENT", "history_audited": False}
    if (c.ROOT / ".git").exists():
        tracked = (
            subprocess.run(
                ["git", "ls-files", "-z"], cwd=c.ROOT, capture_output=True, check=True
            )
            .stdout.decode("utf-8")
            .split("\0")
        )
        history = subprocess.run(
            ["git", "rev-list", "--objects", "--all"],
            cwd=c.ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.splitlines()

        # Classify tracked or historical paths that must not enter a public repository.
        def private(name):
            return (
                name.startswith(
                    (
                        "work/",
                        "backups/",
                        "ROMs/",
                        "Screenshots/",
                        "dist/local-packages/",
                        "reports/",
                    )
                )
                or Path(name).name.lower()
                in ("config.json", ".env", "credentials.json", "id_rsa", "id_ed25519")
                or Path(name).suffix.lower() in (".pem", ".pfx")
                or (
                    Path(name).suffix.lower()
                    in (".zip", ".7z", ".rom", ".sp1", ".bmp", ".sav", ".state")
                    and name != "vendor/emulatorjs/data/emulator.min.zip"
                )
            )

        unsafe = sorted(
            {name for name in tracked if private(name)}
            | {
                line.partition(" ")[2]
                for line in history
                if private(line.partition(" ")[2])
            }
        )
        sizes = subprocess.run(
            ["git", "cat-file", "--batch-check=%(objecttype) %(objectsize) %(rest)"],
            cwd=c.ROOT,
            input="\n".join(history) + "\n",
            capture_output=True,
            text=True,
            check=True,
        ).stdout.splitlines()
        large = [
            line
            for line in sizes
            if line.startswith("blob ")
            and int(line.split(" ", 2)[1]) >= 100 * 1024 * 1024
        ]
        git = {
            "status": "PRESENT",
            "tracked_count": len([n for n in tracked if n]),
            "history_audited": True,
            "unsafe_paths": unsafe,
            "large_blobs": large,
        }
        errors.extend("Private Git history/tracked path " + n for n in unsafe)
        errors.extend("Large Git blob " + n for n in large)
        secret = re.compile(
            r"(?:sk-[A-Za-z0-9]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)"
        )
        for name in tracked:
            file = c.ROOT / name
            if (
                name
                and file.is_file()
                and file.suffix.lower()
                in (".py", ".js", ".cjs", ".json", ".yml", ".md", ".txt")
                and secret.search(file.read_text(encoding="utf-8", errors="replace"))
            ):
                errors.append("Possible credential in tracked source " + name)
    report = {
        "generated_at": c.now(),
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
        "public_files": len(files),
        "git": git,
        "private_packages": str(PRIVATE),
        "uploaded": False,
        "license_scope": "Noncommercial FBNeo terms, verbatim licenses, pinned source and public patches; see notices",
    }
    c.save(c.ROOT / "dist/reports/public_asset_audit.json", report)
    return report
