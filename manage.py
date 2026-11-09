#!/usr/bin/env python3
"""Neo-Geo Web Emu: standard library only manager."""

import argparse
import json
import platform
import sys
import unittest
from pathlib import Path
from app import catalog, engine, server

ROOT = Path(__file__).resolve().parent
VERSION = "0.1.5.1"


# Print Python, engine, and library diagnostics without installing assets or changing configuration.
def doctor():
    print("=== Neo-Geo Web Emu v{} / DOCTOR ===".format(VERSION))
    print("[PYTHON]", sys.version.split()[0], "|", platform.platform())
    if sys.version_info < (3, 9):
        print("[FAIL] Python 3.9+ required")
        return 1
    print("[ENGINE]", json.dumps(engine.diagnostic_status(), ensure_ascii=False))
    report = catalog.summary()
    for k, v in report.items():
        print("[{}] {}".format(k.upper(), v))
    if not engine.status()["ready"]:
        print("[PENDING] One-time online setup: py -3 manage.py engine install")
    if not report["bios_present"]:
        print("[PENDING] neogeo.zip not found in configured ROMs folder")
    if not report["games"]:
        print("[PENDING] No game ZIP files in configured ROMs folder")
    print(
        "[INFO] Engine file presence, not game compatibility. For one ROM: py -3 manage.py rom-inspect --name breakers.zip"
    )
    return 0


# Parse existing CLI commands and dispatch to their catalog, server, distribution, or test handlers.
def main():
    p = argparse.ArgumentParser(description="Neo-Geo Web Emu v" + VERSION)
    sub = p.add_subparsers(dest="action", required=True)
    sub.add_parser("doctor")
    sp = sub.add_parser(
        "config", help="Link external ROM and screenshot folders; no copy needed"
    )
    sp.add_argument("--roms", type=Path)
    sp.add_argument("--screenshots", type=Path)
    engine_parser = sub.add_parser(
        "engine", help="Install/status of FBNeo WebAssembly engine"
    )
    engine_parser.add_argument("command", choices=["install", "status"])
    engine_parser.add_argument(
        "--force", action="store_true", help="Redownload engine files"
    )
    server_parser = sub.add_parser("serve", help="Start localhost-only offline server")
    server_parser.add_argument("--port", type=int, default=8765)
    server_parser.add_argument(
        "--open", action="store_true", help="Open default browser"
    )
    sub.add_parser("scan", help="Show local ROM count and sample names")
    rom_p = sub.add_parser(
        "rom-inspect", help="Inspect a locally-owned ROM/BIOS ZIP without modifying it"
    )
    rom_p.add_argument(
        "--name", default="breakers.zip", help="ZIP filename in configured ROM folder"
    )
    sub.add_parser("test", help="Run Python regression tests")
    cp = sub.add_parser(
        "compatibility", help="Audit, resolve and browser-test the local ROM library"
    )
    cs = cp.add_subparsers(dest="command", required=True)
    scan_parser = cs.add_parser("scan")
    scan_parser.add_argument("--force", action="store_true")
    cs.add_parser("report")
    cs.add_parser(
        "layouts",
        help="Discover reversible local layout conversions without writing ROMs",
    )
    prep = cs.add_parser("prepare")
    prep.add_argument("--all", action="store_true")
    prep.add_argument("--name", action="append")
    bt = cs.add_parser("test")
    bt.add_argument("--all", action="store_true")
    bt.add_argument("--name", action="append")
    bt.add_argument("--retry-failed", action="store_true")
    bt.add_argument("--phase", choices=["original", "resolved"], default="resolved")
    bt.add_argument("--category")
    bt.add_argument("--observe-seconds", type=int, default=12)
    bt.add_argument("--timeout-seconds", type=int, default=45)
    bt.add_argument("--limit", type=int)
    bt.add_argument("--force", action="store_true")
    bt.add_argument("--endpoint", default="http://127.0.0.1:9224")
    stability_parser = sub.add_parser(
        "stability", help="Serial isolated-browser observation and repeated launches"
    )
    stability_sub = stability_parser.add_subparsers(dest="command", required=True)
    soak = stability_sub.add_parser("test")
    soak.add_argument("--name", action="append")
    soak.add_argument("--seconds", type=int, default=600)
    soak.add_argument("--force", action="store_true")
    soak.add_argument("--repeat", action="store_true")
    soak.add_argument("--endpoint", default="http://127.0.0.1:9224")
    release_parser = sub.add_parser("release")
    release_sub = release_parser.add_subparsers(dest="command", required=True)
    release_sub.add_parser("verify")
    for action, commands in [
        ("web", ["build", "verify"]),
        ("library", ["package", "verify"]),
        ("github", ["audit"]),
    ]:
        parser = sub.add_parser(action)
        parser.add_argument("command", choices=commands)
    args = p.parse_args()
    if args.action in ("web", "library", "github"):
        from app import web_distribution as distribution

        handler = {
            ("web", "build"): distribution.build,
            ("web", "verify"): distribution.verify,
            ("library", "package"): distribution.package,
            ("library", "verify"): distribution.verify_packages,
            ("github", "audit"): distribution.publish_audit,
        }[(args.action, args.command)]
        report = handler()
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report.get("status") == "PASS" else 1
    if args.action == "release":
        from app.release import verify

        report = verify()
        print(json.dumps(report, indent=2))
        return (
            0
            if report["status"] == "PASS"
            else 2
            if report["status"] == "PARTIAL"
            else 1
        )
    if args.action == "stability":
        from app import stability

        stability.test(args.name, args.seconds, args.force, args.endpoint, args.repeat)
        return 0
    if args.action == "compatibility":
        from app import compatibility

        if args.command == "scan":
            compatibility.scan(args.force)
        elif args.command == "layouts":
            from app.rom_layouts import discover

            discover()
            compatibility.resolve()
        elif args.command == "report":
            print(json.dumps(compatibility.report_summary(), indent=2))
        elif args.command == "prepare":
            report = compatibility.load(
                compatibility.REPORTS / "rom_compatibility_static_v014.json"
            )
            if not args.all and not args.name:
                p.error("prepare requires --all or --name")
            errors = []
            for game in report["games"]:
                if game["repair_possible"] and (
                    args.all or game["filename"] in args.name
                ):
                    try:
                        plan = compatibility.build_compatible(game["filename"])
                        print("[PREPARED]", game["filename"], "->", plan["driver"])
                    except ValueError as error:
                        errors.append(
                            {"filename": game["filename"], "error": str(error)}
                        )
                        print("[BLOCKED]", game["filename"], error)
            if errors:
                compatibility.save(
                    compatibility.REPORTS / "derived_build_blocked_v014.json", errors
                )
                return 1
        elif args.command == "test":
            from app.browser_lab import test_games

            if not (args.all or args.name or args.retry_failed or args.category):
                p.error("test requires --all, --name, --category or --retry-failed")
            if args.observe_seconds < 5 or args.timeout_seconds < args.observe_seconds:
                p.error("Invalid observation/timeout bounds")
            test_games(
                names=args.name,
                all_games=args.all,
                retry_failed=args.retry_failed,
                phase=args.phase,
                observe=args.observe_seconds,
                timeout=args.timeout_seconds,
                category=args.category,
                limit=args.limit,
                force=args.force,
                endpoint=args.endpoint,
            )
        return 0
    if args.action == "doctor":
        return doctor()
    if args.action == "engine":
        if args.command == "status":
            print(json.dumps(engine.status(), indent=2))
        else:
            try:
                engine.install(args.force)
            except Exception as error:
                print("[ERROR]", error)
                print(
                    "Your existing local files were kept. Check connection and retry this command."
                )
                return 1
        return 0
    if args.action == "config":
        settings = catalog.settings()
        for key, value in [("roms", args.roms), ("screenshots", args.screenshots)]:
            if value is not None:
                resolved = value.expanduser().resolve()
                if not resolved.is_dir():
                    p.error("{} directory does not exist: {}".format(key, resolved))
                settings[key] = str(resolved)
        catalog.CONFIG.write_text(
            json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print("[CONFIG SAVED]", catalog.CONFIG)
        print(json.dumps(settings, ensure_ascii=False, indent=2))
        return 0
    if args.action == "serve":
        if not 1024 <= args.port <= 65535:
            p.error("Port must be between 1024 and 65535")
        try:
            server.serve(port=args.port, open_browser=args.open)
        except OSError as error:
            print("[ERROR] Could not bind local server:", error)
            return 1
        return 0
    if args.action == "scan":
        games = catalog.scan()
        for game in games[:30]:
            print(
                "[ROM] {} ({:.1f} MB) screenshot={}".format(
                    game["filename"], game["size"] / 1048576, bool(game["screenshot"])
                )
            )
        if len(games) > 30:
            print("... {} more".format(len(games) - 30))
        print("[TOTAL]", len(games), "games;", sum(g["size"] for g in games), "bytes")
        return 0
    if args.action == "rom-inspect":
        from app.diagnostics import inspect_archives

        print(json.dumps(inspect_archives(args.name), ensure_ascii=False, indent=2))
        return 0
    if args.action == "test":
        suite = unittest.defaultTestLoader.discover(
            str(ROOT / "tests"), pattern="test_*.py"
        )
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        return 0 if result.wasSuccessful() else 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
