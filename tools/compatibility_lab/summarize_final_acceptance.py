"""Summarize supplied browser evidence without changing catalogs or approving screenshots."""

import argparse
import json
from pathlib import Path

from tools.compatibility_lab.prepare_kof2003_acceptance import ROOT, LAB


# Require measured audio, fullscreen and persisted state, beyond the inherited harness's PASS flag.
def assess(directory, driver):
    paths = {"online": directory / "online/results.json", "offline": directory / "offline/results.json",
             "manual": directory / "manual/manual-results.json"}
    missing = [str(path.relative_to(ROOT)) for path in paths.values() if not path.is_file()]
    if missing:
        return dict(status="NOT VERIFIED", missing=missing)
    evidence = {name: json.loads(path.read_text("utf8")) for name, path in paths.items()}
    online, offline, manual = (evidence[name] for name in ("online", "offline", "manual"))
    c, o = online.get("checks", {}), offline.get("checks", {})
    saved, restored = c.get("save_and_load", {}), o.get("offline_save_restore", {})
    checks = dict(
        online=online.get("status") == "PASS", offline=offline.get("status") == "PASS",
        driver=c.get("static_boot", {}).get("driver") == driver and o.get("offline_boot", {}).get("driver") == driver,
        audio=c.get("digital_audio", {}).get("nonzero", 0) > 0 and c.get("digital_audio", {}).get("peak", 0) > 0,
        fullscreen=c.get("fullscreen") is True, pause_resume=c.get("pause_resume") is True,
        save_restore=saved.get("bytes", 0) > 0 and saved.get("hash") == saved.get("storedHash") == restored.get("hash"),
        server_stopped=o.get("offline_boot", {}).get("serverReachable") is False,
        manual=manual.get("status") == "MANUAL_OBSERVATIONS_COMPLETE_REVIEW_REQUIRED" and manual.get("driver") == driver,
        no_external=all(not e.get("external") and not e.get("errors") for e in evidence.values()),
        return_to_library=c.get("returned_to_library") is True,
    )
    return dict(status="SCREENSHOT_REVIEW_REQUIRED" if all(checks.values()) else "INCOMPLETE_OR_FAILED",
                checks=checks, evidence={name: str(path.relative_to(ROOT)) for name, path in paths.items()},
                note="A reviewer must inspect character selection and actual gameplay screenshots before promotion")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", default="run-01")
    args = parser.parse_args()
    if not args.run or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for c in args.run):
        parser.error("Use an alphanumeric run label")
    report = {game: {browser: assess(LAB / "evidence" / browser / ("candidate-" + game) / args.run, driver)
                     for browser in ("chrome", "brave", "edge")}
              for game, driver in (("kof2003", "kof2k3fd"), ("mslug5", "mslug5fd"))}
    output = ROOT / ("reports/FINAL_ACCEPTANCE_BROWSER_STATUS_" + args.run + ".json")
    output.write_text(json.dumps(report, indent=2), encoding="utf8")
    print(output)
    print(json.dumps({game: {browser: row["status"] for browser, row in rows.items()} for game, rows in report.items()}, indent=2))
