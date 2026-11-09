"""Resumable real-browser boot coverage. Runtime success is distinct from visual review."""

import base64, collections, csv, hashlib, json, math, statistics, subprocess, sys, time, wave, struct
from pathlib import Path
from PIL import Image, ImageStat
from . import catalog, compatibility

ROOT = compatibility.ROOT
REPORTS = compatibility.REPORTS
MATRIX = REPORTS / "game_boot_matrix_v014.json"


# Summarize image pixels and hashes for automated blank-screen and error-screen heuristics.
def frame_info(path):
    if not path.is_file():
        return None
    with Image.open(path) as image:
        rgb = image.convert("RGB")
        pixels = list(getattr(rgb, "get_flattened_data", rgb.getdata)())
        n = len(pixels)
        colors = len(set(pixels))
        black = sum(max(p) < 8 for p in pixels) / max(1, n)
        grey = sum(
            max(p) - min(p) < 8 and 210 < sum(p) / 3 < 250 for p in pixels
        ) / max(1, n)
        return {
            "width": rgb.width,
            "height": rgb.height,
            "colors": colors,
            "black_fraction": black,
            "light_grey_fraction": grey,
            "entropy": rgb.entropy(),
            "sha256": compatibility.sha(path),
            "error_screen_likely": grey > 0.65,
            "black_screen": black > 0.995,
        }


# Combine core logs, frames, audio, and cleanup evidence without equating boot success with gameplay.
def classify(raw, static, evidence):
    final = raw.get("final") or {}
    logs = final.get("driverLogs", [])
    text = (
        "\n".join(logs)
        + "\n"
        + raw.get("pageText", "")
        + "\n"
        + str(raw.get("runnerError", ""))
        + "\n"
        + json.dumps(raw.get("exceptions", []))
    )
    init = bool(raw.get("gameInitMessage"))
    screens = {name: frame_info(evidence / name) for name in raw.get("screenshots", [])}
    native = [v for v in screens.values() if v]
    last = native[-1] if native else None
    logo_hashes = set(compatibility.load(REPORTS / "bios_logo_hashes_v014.json", []))
    ending = [v for name, v in screens.items() if name.startswith("frame-after") and v]
    confirmed = [
        v
        for v in ending
        if not v["black_screen"]
        and not v["error_screen_likely"]
        and v["sha256"] not in logo_hashes
    ]
    if confirmed:
        last = confirmed[-1]
    result = {
        "status": "NOT VERIFIED",
        "failure_class": None,
        "failure_message": raw.get("failureMessage") or raw.get("runnerError"),
        "game_init": "PASS" if init else "FAIL",
        "visual": "NOT VERIFIED",
        "visual_review": "PENDING",
        "digital_audio": "NOT VERIFIED",
        "physical_audio": "PHYSICAL_AUDIO_NOT_VERIFIED",
        "input": "DELIVERED_NOT_RESPONSE_VERIFIED"
        if raw.get("inputEvents")
        else "NOT VERIFIED",
        "game_compatibility": "NOT VERIFIED",
        "frames": final.get("frames"),
        "native_screenshots": screens,
        "runtime_driver": raw.get("gameInitMessage", "").split(" for ")[-1].strip()
        if raw.get("gameInitMessage")
        else None,
    }
    if (
        init
        and last
        and not last["error_screen_likely"]
        and not last["black_screen"]
        and final.get("frames", 0) > 20
    ):
        result["status"] = "PASS"
        result["visual"] = "AUTOMATED_NATIVE_CONTENT_CONFIRMED"
        result["failure_message"] = None
    else:
        result["status"] = "FAIL"
        if "ROM at index" in text and "is required" in text:
            missing = [
                line
                for line in logs
                if "ROM at index" in line and "is required" in line
            ]
            result["failure_message"] = "\n".join(missing)
            result["failure_class"] = (
                "BIOS_MISSING"
                if any(
                    x in result["failure_message"]
                    for x in ["sp-", "bios", "sm1.sm1", "sfix.sfix", "000-lo.lo"]
                )
                else "ROM_MISSING"
            )
            result["status"] = "BLOCKED"
            if result["failure_class"] == "ROM_MISSING":
                resolved = static.get("static_original", {}).get("resolved_members", [])
                if any(
                    v["source"]["archive"] != static["filename"]
                    and not (v["expected"]["type"] & compatibility.BIOS)
                    for v in resolved
                ):
                    result["failure_class"] = "PARENT_ROM_MISSING"
                missing_static = static.get("static_original", {}).get("missing", [])
                if any(m["reason"] == "CRC_MISMATCH" for m in missing_static):
                    result["failure_class"] = "CRC_MISMATCH"
        elif any(
            x.lower() in text.lower()
            for x in [
                "romset is unknown",
                "This romset is not known",
                "driver not found",
                "not supported by this version",
                "doesn't exist",
            ]
        ):
            result["failure_class"] = "GAME_DRIVER_NOT_FOUND"
            result["status"] = "BLOCKED"
        elif not static.get("driver_declared") and not init:
            result["failure_class"] = "GAME_DRIVER_NOT_FOUND"
            result["status"] = "BLOCKED"
        elif "memory" in text.lower() and any(
            x in text.lower() for x in ["out of", "cannot enlarge", "allocation fail"]
        ):
            result["failure_class"] = "MEMORY_ALLOCATION_FAILURE"
        elif "Failed initializing driver" in text:
            result["failure_class"] = "GAME_INIT_FAILURE"
        elif raw.get("exceptions") or final.get("errors"):
            result["failure_class"] = (
                "WASM_RUNTIME_ERROR"
                if "wasm" in text.lower() or "RuntimeError" in text
                else "RUNTIME_CRASH"
            )
        elif last and last["black_screen"]:
            result["failure_class"] = "BLACK_SCREEN"
        elif raw.get("runnerError") and "CDP_TIMEOUT" in raw["runnerError"]:
            result["failure_class"] = "BOOT_TIMEOUT"
        elif not init:
            result["failure_class"] = "BOOT_TIMEOUT"
        else:
            result["failure_class"] = "UNKNOWN_FAILURE"
    audio = final.get("audio", {})
    if audio.get("nonzero", 0) > 0 and "running" in audio.get("contextStates", []):
        result["digital_audio"] = "PASS_SIGNAL_PRESENT"
    elif audio.get("created"):
        result["digital_audio"] = "SILENT_OBSERVATION_NOT_VERIFIED"
    if init and not confirmed and ending and all(v["black_screen"] for v in ending):
        result["status"] = "NOT VERIFIED"
        result["failure_class"] = "BLACK_FRAME_OBSERVATION_INCONCLUSIVE"
        result["visual"] = "NOT VERIFIED"
    if last and last["sha256"] in logo_hashes:
        result["status"] = "NOT VERIFIED"
        result["failure_class"] = "BIOS_LOGO_ONLY"
        result["visual"] = "BIOS_ONLY_NOT_GAME_CONTENT"
    if (
        raw.get("expectedDriver")
        and result["runtime_driver"]
        and raw["expectedDriver"] != result["runtime_driver"]
    ):
        result["status"] = "FAIL"
        result["failure_class"] = "WRONG_GAME_DRIVER"
        result["failure_message"] = (
            "Initialized driver differs from the validated launch plan"
        )
    if raw.get("watchdogFailure"):
        result["status"] = "FAIL"
        result["failure_class"] = raw["watchdogFailure"]
        result["failure_message"] = raw["watchdogFailure"]
    if final.get("errors") or final.get("gpuLoss"):
        result["runtime_errors"] = final.get("errors")
        result["gpu_context_events"] = final.get("gpuLoss")
        if result["status"] == "PASS":
            result["status"] = "FAIL"
            result["failure_class"] = (
                "RUNTIME_CRASH"
                if final.get("errors")
                else "GRAPHICS_INITIALIZATION_FAILURE"
            )
    samples = [s for s in raw.get("samples", []) if s.get("frames") is not None]
    # Drop early compilation/initialization and report actual emulation progress, not rAF as game FPS.
    stable = samples[3:] if len(samples) > 4 else samples
    fps = None
    if len(stable) > 1 and stable[-1]["ms"] > stable[0]["ms"]:
        fps = (
            (stable[-1]["frames"] - stable[0]["frames"])
            * 1000
            / (stable[-1]["ms"] - stable[0]["ms"])
        )
    expected = None
    import re

    for line in logs:
        m = re.search(r"driver.s refresh rate \(([0-9.]+) Hz\)", line)
        if m:
            expected = float(m[1])
    times = raw.get("rafTimes", [])
    intervals = [b - a for a, b in zip(times, times[1:]) if 0 < b - a < 1000]
    rendered = 1000 / statistics.mean(intervals) if intervals else None
    p99 = (
        sorted(intervals)[min(len(intervals) - 1, int(len(intervals) * 0.99))]
        if intervals
        else None
    )
    cpu_before = {
        p["id"]: p["cpuTime"]
        for p in raw.get("processBefore", {}).get("processInfo", [])
    }
    cpu = sum(
        max(0, p["cpuTime"] - cpu_before.get(p["id"], 0))
        for p in raw.get("processAfter", {}).get("processInfo", [])
    )
    result["performance"] = {
        "valid_game_measurement": result["status"] == "PASS",
        "emulated_fps": fps,
        "fps_counter_kind": "RetroArch Emscripten frontend iteration counter; independent FBNeo video callback FPS NOT VERIFIED",
        "driver_nominal_hz": expected,
        "rendered_raf_fps": rendered,
        "raf_p99_interval_ms": p99,
        "raf_percentile_window_seconds": (times[-1] - times[0]) / 1000
        if len(times) > 1
        else None,
        "raf_p99_scope": "At most 20,000 rendered frames; independent of core frame timing",
        "core_1pct_low_fps": None,
        "core_1pct_low_note": "Per-frame emulation timestamps unavailable; rAF is reported separately",
        "loading_seconds": raw.get("loadingSeconds"),
        "elapsed_seconds": raw.get("elapsedSeconds"),
        "cpu_seconds_isolated_browser": cpu,
        "peak_js_heap_observed": max(
            (s.get("jsHeap", 0) or 0 for s in samples), default=0
        ),
        "peak_wasm_heap_observed": max(
            (s.get("wasmHeap", 0) or 0 for s in samples), default=0
        ),
        "browser_working_set_at_end": sum(
            p["working_set"] for p in raw.get("processMemory", {}).values()
        ),
        "audio_late_starts": audio.get("late"),
        "audio_schedule_gaps_over_25ms": audio.get("gaps"),
        "audio_underruns": "NOT VERIFIED; scheduling observations are not hardware underrun counters",
    }
    result["cleanup"] = {
        "target_closed": raw.get("targetClosed", False),
        "remaining_game_pages": [
            t
            for t in raw.get("afterCloseTargets", [])
            if t["type"] == "page" and "/player.html" in t["url"]
        ],
        "remaining_owned_workers": [
            t
            for t in raw.get("afterCloseTargets", [])
            if any(t["url"] == w["url"] for w in final.get("workers", []))
        ],
    }
    return result


# Merge matching saved reviews and write matrix, failure, CSV, and performance reports.
def write_matrix(matrix):
    reviews = compatibility.load(REPORTS / "visual_reviews_v014.json", {})
    for row in matrix["games"]:
        review = reviews.get(row["filename"], {})
        if review.get("fingerprint") == row.get("fingerprint"):
            row["visual_review"] = review["status"]
            row["visual_review_note"] = review["note"]
            if review["status"] == "BIOS_ONLY_REQUIRES_LONGER_OBSERVATION":
                row["boot_status"] = "NOT VERIFIED"
                row["failure_class"] = "BIOS_LOGO_ONLY"
                row["visual"] = "BIOS_ONLY_NOT_GAME_CONTENT"
    gameplay = compatibility.load(REPORTS / "gameplay_reviews_v014.json", {})
    for row in matrix["games"]:
        review = gameplay.get(row["filename"], {})
        if (
            row.get("boot_status") == "PASS"
            and review.get("core_sha256") == row.get("core_sha256")
            and review.get("source_sha256") == row.get("source_sha256")
        ):
            row["game_compatibility"] = review["status"]
            row["input"] = review["input"]
            row["gameplay_evidence"] = review["evidence"]
            row["gameplay_note"] = review["note"]
    rows = matrix["games"]
    matrix["updated_at"] = compatibility.now()
    counts = collections.Counter(g["boot_status"] for g in rows)
    tested = sum(bool(g.get("tested_at")) for g in rows)
    passed = counts["PASS"]
    matrix["summary"] = {
        "total_games": len(rows),
        "boot_tested": tested,
        "boot_passed": passed,
        "boot_failed": counts["FAIL"],
        "boot_blocked": counts["BLOCKED"],
        "boot_not_verified": counts["NOT VERIFIED"] - (len(rows) - tested),
        "not_tested": len(rows) - tested,
        "coverage_percent": 100 * tested / max(1, len(rows)),
        "success_among_tested_percent": 100 * passed / max(1, tested),
        "game_compatibility_pass": sum(
            g.get("game_compatibility") == "PASS" for g in rows
        ),
        "visual_review_pending": sum(
            g.get("visual_review") == "PENDING"
            for g in rows
            if g["boot_status"] == "PASS"
        ),
    }
    compatibility.save(MATRIX, matrix)
    compatibility.save(
        REPORTS / "game_boot_failures_v014.json",
        {
            "updated_at": matrix["updated_at"],
            "failures": [g for g in rows if g["boot_status"] in ("FAIL", "BLOCKED")],
        },
    )
    path = REPORTS / "game_boot_matrix_v014.csv"
    tmp = path.with_suffix(".tmp")
    fields = [
        "filename",
        "title",
        "driver",
        "static_status",
        "boot_status",
        "game_compatibility",
        "visual",
        "digital_audio",
        "input",
        "failure_class",
        "failure_message",
        "emulated_fps",
        "loading_seconds",
        "elapsed_seconds",
        "evidence",
        "tested_at",
    ]
    with tmp.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for g in rows:
            writer.writerow({**g, **g.get("performance", {})})
    tmp.replace(path)
    compatibility.save(
        REPORTS / "performance_v014.json",
        {
            "updated_at": matrix["updated_at"],
            "games": [
                {"filename": g["filename"], **g.get("performance", {})}
                for g in rows
                if g["boot_status"] != "NOT VERIFIED"
            ],
            "note": "Core FPS and rendered rAF FPS are separate. No invented core 1% low.",
        },
    )


# Create entries from the static audit while retaining previously recorded per-game evidence.
def initial_matrix(static):
    old = compatibility.load(MATRIX, {})
    previous = {g["filename"]: g for g in old.get("games", [])}
    rows = []
    for g in static["games"]:
        row = {
            "filename": g["filename"],
            "title": g["driver_title"] or g["title"],
            "category": g["category"],
            "driver": g["driver_declared"],
            "static_status": g["static_original"]["status"],
            "source_sha256": g["archive_sha256"],
            "core_sha256": static["core_sha256"],
            "boot_status": "NOT VERIFIED",
            "game_compatibility": "NOT VERIFIED",
            "history": [],
        }
        if g["filename"] in previous:
            row.update(previous[g["filename"]])
        rows.append(row)
    return {"schema": 1, "core_sha256": static["core_sha256"], "games": rows}


# Select resumable browser runs, capture per-game evidence, and persist results after each attempt.
def _test_games(
    names=None,
    all_games=False,
    retry_failed=False,
    phase="resolved",
    observe=12,
    timeout=45,
    category=None,
    limit=None,
    force=False,
    endpoint="http://127.0.0.1:9224",
):
    static = compatibility.load(REPORTS / "rom_compatibility_static_v014.json")
    if not static:
        raise ValueError("Run compatibility scan first")
    matrix = initial_matrix(static)
    lookup = {g["filename"]: g for g in static["games"]}
    chosen = []
    for row in matrix["games"]:
        if names and row["filename"] not in names:
            continue
        if category and row["category"] != category:
            continue
        if retry_failed and row["boot_status"] not in ("FAIL", "BLOCKED"):
            continue
        if not all_games and not names and not category and not retry_failed:
            continue
        g = lookup[row["filename"]]
        plan = (
            compatibility.load(
                REPORTS / "compatibility_resolver_v014.json", {"games": {}}
            )["games"].get(row["filename"])
            if phase == "resolved"
            else None
        )
        if (
            phase == "resolved"
            and not plan
            and row.get("tested_at")
            and row.get("source_sha256") == g["archive_sha256"]
            and row.get("core_sha256") == static["core_sha256"]
            and observe <= 12
            and not force
        ):
            continue
        if phase == "resolved" and not plan and retry_failed and not force:
            continue
        expected_driver = plan["driver"] if plan else g["driver_declared"]
        launch_fingerprint = hashlib.sha256(
            json.dumps(
                {
                    "rom": g["archive_sha256"],
                    "core": static["core_sha256"],
                    "derived": plan.get("derived_sha256") if plan else None,
                    "driver": expected_driver,
                    "policy": "MVS_EUR-strict-v013",
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()
        if (
            not force
            and row["boot_status"] == "PASS"
            and row.get("launch_fingerprint") == launch_fingerprint
            and row.get("observation_seconds", 0) >= observe
        ):
            continue
        fingerprint = hashlib.sha256(
            json.dumps(
                {
                    "rom": g["archive_sha256"],
                    "core": static["core_sha256"],
                    "phase": phase,
                    "derived": plan.get("derived_sha256") if plan else None,
                    "observe": observe,
                    "protocol": "v014-boot-1",
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()
        if (
            not force
            and row.get("fingerprint") == fingerprint
            and row["boot_status"] == "PASS"
        ):
            continue
        if (
            not force
            and row.get("fingerprint") == fingerprint
            and not retry_failed
            and row["boot_status"] != "NOT VERIFIED"
        ):
            continue
        chosen.append((row, g, fingerprint, launch_fingerprint))
    if limit:
        chosen = chosen[:limit]
    subprocess.run(
        ["node", str(ROOT / "tools/browser_game_runner/cleanup.cjs"), endpoint],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    write_matrix(matrix)
    print("[BROWSER SUITE]", len(chosen), "selected", flush=True)
    for index, (row, g, fingerprint, launch_fingerprint) in enumerate(chosen, 1):
        evidence_id = (
            f"{Path(row['filename']).stem}-{phase}-{fingerprint[:10]}-{time.time_ns()}"
        )
        evidence = REPORTS / "game_boot_evidence" / evidence_id
        url = "http://127.0.0.1:8765/player.html?rom=" + __import__(
            "urllib.parse", fromlist=["quote"]
        ).quote(row["filename"])
        if phase == "original":
            url += "&compat=original"
        options = {
            "root": str(ROOT),
            "filename": row["filename"],
            "url": url,
            "phase": phase,
            "expectedDriver": compatibility.launch_plan(row["filename"])["driver"]
            if phase == "resolved"
            else g["driver_declared"],
            "evidenceId": evidence_id,
            "coreSha256": static["core_sha256"],
            "endpoint": endpoint,
            "observeSeconds": observe,
            "timeoutSeconds": timeout,
            "python": sys.executable,
            "cold": index == 1,
            "runtimeFiles": {
                name: compatibility.sha(ROOT / name)
                for name in [
                    "web/player.js",
                    "web/runtime-guard.js",
                    "web/state-guard.js",
                    "web/fbneo-compat.js",
                    "tools/browser_game_runner/run_game.cjs",
                    "tools/browser_game_runner/probe.js",
                ]
            },
        }
        option_path = ROOT / "work/v014/runner-options.json"
        compatibility.save(option_path, options)
        compatibility.save(
            REPORTS / "game_boot_progress_v014.json",
            {
                "active": row["filename"],
                "index": index,
                "selected": len(chosen),
                "phase": phase,
                "started_at": compatibility.now(),
                "fingerprint": fingerprint,
            },
        )
        try:
            process = subprocess.run(
                [
                    "node",
                    str(ROOT / "tools/browser_game_runner/run_game.cjs"),
                    str(option_path),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout + 40,
            )
            raw = compatibility.load(evidence / "runtime.json")
            if not raw:
                raise RuntimeError(process.stdout[-1000:] + process.stderr[-1000:])
            pcm = raw.pop("pcm", [])
            if pcm:
                with wave.open(str(evidence / "audio.wav"), "wb") as wav:
                    wav.setnchannels(1)
                    wav.setsampwidth(2)
                    wav.setframerate(raw["final"]["audio"]["rate"] or 44100)
                    wav.writeframes(
                        b"".join(
                            struct.pack("<h", max(-32767, min(32767, round(v * 32767))))
                            for v in pcm
                        )
                    )
            compatibility.save(evidence / "runtime.json", raw)
            out = classify(raw, g, evidence)
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as e:
            out = {
                "status": "FAIL",
                "failure_class": "BOOT_TIMEOUT"
                if isinstance(e, subprocess.TimeoutExpired)
                else "UNKNOWN_FAILURE",
                "failure_message": str(e),
            }
        if row.get("tested_at"):
            row.setdefault("history", []).append(
                {
                    k: row.get(k)
                    for k in [
                        "boot_status",
                        "failure_class",
                        "failure_message",
                        "evidence",
                        "fingerprint",
                        "tested_at",
                        "driver",
                    ]
                }
            )
        row.update(
            {
                **out,
                "boot_status": out.pop("status"),
                "fingerprint": fingerprint,
                "tested_at": compatibility.now(),
                "evidence": evidence.relative_to(ROOT).as_posix(),
                "phase": phase,
                "source_sha256": g["archive_sha256"],
                "core_sha256": static["core_sha256"],
                "observation_seconds": observe,
                "launch_fingerprint": launch_fingerprint,
            }
        )
        if out.get("runtime_driver"):
            row["driver"] = out["runtime_driver"]
        write_matrix(matrix)
        compatibility.save(
            REPORTS / "game_boot_progress_v014.json",
            {
                "active": None,
                "last_completed": row["filename"],
                "index": index,
                "selected": len(chosen),
                "phase": phase,
                "updated_at": compatibility.now(),
            },
        )
        print(
            f"[BOOT {index}/{len(chosen)}] {row['filename']} {row['boot_status']} {row.get('failure_class') or ''}",
            flush=True,
        )
    return matrix


# Acquire the suite lock and prepare the isolated browser before running the selected games.
def test_games(**options):
    from .lab_lock import lock
    from .lab_browser import ensure

    with lock():
        ensure(options.get("endpoint", "http://127.0.0.1:9224"))
        return _test_games(**options)
