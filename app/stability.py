"""Serial, resumable long-running tests in the isolated CDP browser."""

import hashlib, json, subprocess, sys, time
from pathlib import Path
from . import compatibility as c, browser_lab

R = c.REPORTS
REPRESENTATIVES = [
    "breakers.zip",
    "mslug.zip",
    "blazstar.zip",
    "fbfrenzy.zip",
    "magdrop2.zip",
    "kof98.zip",
    "kof97-5a.zip",
]


# Run resumable serial browser observations and persist per-launch evidence and cleanup outcomes.
def _test(
    names=None, seconds=600, force=False, endpoint="http://127.0.0.1:9224", repeat=False
):
    if seconds < 10:
        raise ValueError("Observation must be at least 10 seconds")
    names = names or (
        ["breakers.zip", "mslug.zip", "kof98.zip", "samsho4.zip", "breakers.zip"]
        if repeat
        else REPRESENTATIVES
    )
    static = c.load(R / "rom_compatibility_static_v014.json")
    lookup = {g["filename"]: g for g in static["games"]}
    report_path = R / ("repeated_launch_v014.json" if repeat else "stability_v014.json")
    report = c.load(report_path, {"runs": []})
    report["core_sha256"] = c.sha(c.CORE)
    subprocess.run(
        ["node", str(c.ROOT / "tools/browser_game_runner/cleanup.cjs"), endpoint],
        check=True,
        capture_output=True,
    )
    for index, name in enumerate(names):
        if name not in lookup:
            raise ValueError("Unknown game " + name)
        launch = c.launch_plan(name)
        fingerprint = hashlib.sha256(
            json.dumps(
                [
                    name,
                    index,
                    seconds,
                    static["core_sha256"],
                    lookup[name]["archive_sha256"],
                    launch.get("derived_sha256"),
                    "soak-1",
                ]
            ).encode()
        ).hexdigest()
        if not force and any(
            r.get("fingerprint") == fingerprint and r["status"] == "PASS"
            for r in report["runs"]
        ):
            continue
        evidence_id = (
            f"{Path(name).stem}-"
            + ("repeat" if repeat else "stability")
            + f"-{fingerprint[:10]}-{time.time_ns()}"
        )
        evidence = R / "game_boot_evidence" / evidence_id
        options = {
            "root": str(c.ROOT),
            "filename": name,
            "url": "http://127.0.0.1:8765/player.html?rom=" + name,
            "phase": "stability",
            "expectedDriver": launch["driver"],
            "evidenceId": evidence_id,
            "coreSha256": static["core_sha256"],
            "endpoint": endpoint,
            "observeSeconds": seconds,
            "timeoutSeconds": seconds + 90,
            "python": sys.executable,
            "cold": index == 0,
            "stability": True,
            "runtimeFiles": {
                name: c.sha(c.ROOT / name)
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
        option_path = c.ROOT / "work/v014/stability-options.json"
        c.save(option_path, options)
        c.save(
            R / "stability_progress_v014.json",
            {
                "active": name,
                "seconds": seconds,
                "index": index + 1,
                "total": len(names),
                "started_at": c.now(),
            },
        )
        print("[STABILITY START]", name, seconds, flush=True)
        try:
            p = subprocess.run(
                [
                    "node",
                    str(c.ROOT / "tools/browser_game_runner/run_game.cjs"),
                    str(option_path),
                ],
                cwd=c.ROOT,
                capture_output=True,
                text=True,
                timeout=seconds + 140,
            )
            raw = c.load(evidence / "runtime.json")
            if not raw:
                raise RuntimeError(p.stderr[-500:])
            raw.pop("pcm", None)
            c.save(evidence / "runtime.json", raw)
            result = browser_lab.classify(raw, lookup[name], evidence)
            if not raw.get("bootObserved"):
                result["status"] = "FAIL"
                result["failure_class"] = (
                    raw.get("watchdogFailure") or "OBSERVATION_INCOMPLETE"
                )
            if not result.get("cleanup", {}).get("target_closed") or result.get(
                "cleanup", {}
            ).get("remaining_game_pages"):
                result["status"] = "FAIL"
                result["failure_class"] = "CLEANUP_FAILURE"
            result.update(
                memory_timeline=raw.get("memoryTimeline", []),
                observation_seconds=seconds,
                frame_watchdog="5 seconds without progress while unpaused",
                worker_hang="NOT VERIFIED independently; main frame progress monitored",
                memory_leak_verdict="NOT VERIFIED: trend data requires analysis, cache growth alone is not proof",
                physical_audio="PHYSICAL_AUDIO_NOT_VERIFIED",
            )
        except (OSError, subprocess.TimeoutExpired, RuntimeError) as e:
            result = {"status": "FAIL", "failure_message": str(e)}
        report["runs"].append(
            {
                "filename": name,
                "index": index,
                "fingerprint": fingerprint,
                "tested_at": c.now(),
                "evidence": evidence.relative_to(c.ROOT).as_posix(),
                **result,
            }
        )
        report["summary"] = {
            "pass": sum(r["status"] == "PASS" for r in report["runs"]),
            "fail": sum(r["status"] != "PASS" for r in report["runs"]),
        }
        c.save(report_path, report)
        print("[STABILITY END]", name, result["status"], flush=True)
    c.save(
        R / "stability_progress_v014.json", {"active": None, "completed_at": c.now()}
    )
    return report


# Hold the suite lock and ensure the isolated browser is ready before starting observations.
def test(
    names=None, seconds=600, force=False, endpoint="http://127.0.0.1:9224", repeat=False
):
    from .lab_lock import lock
    from .lab_browser import ensure

    with lock():
        ensure(endpoint)
        return _test(names, seconds, force, endpoint, repeat)
