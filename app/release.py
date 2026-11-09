"""Release checks for the current static port, with explicit acceptance limits."""

import json
import subprocess
import sys
from . import compatibility as c


# Run the actual discovered suites and public build gates; never infer gameplay or license clearance.
def verify():
    c.REPORTS.mkdir(parents=True, exist_ok=True)
    checks = []
    commands = [
        ("python", [sys.executable, "manage.py", "test"]),
        (
            "node",
            [
                "node",
                "--test",
                *[
                    str(p.relative_to(c.ROOT))
                    for p in sorted((c.ROOT / "tests").glob("*.test.cjs"))
                ],
            ],
        ),
        ("static_build", [sys.executable, "manage.py", "web", "build"]),
        ("static_verify", [sys.executable, "manage.py", "web", "verify"]),
        ("public_audit", [sys.executable, "manage.py", "github", "audit"]),
    ]
    for label, command in commands:
        result = subprocess.run(
            command,
            cwd=c.ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        (c.REPORTS / ("release_" + label + ".txt")).write_text(
            result.stdout + result.stderr, encoding="utf-8"
        )
        checks.append(
            {
                "check": label,
                "status": "PASS" if result.returncode == 0 else "FAIL",
                "exit_code": result.returncode,
            }
        )
    manifest = c.load(c.ROOT / "vendor/fbneo-selected-bios/manifest.json", {})
    public = c.ROOT / "dist/github-pages"
    checks.append(
        {
            "check": "pinned_core",
            "status": "PASS"
            if manifest.get("package_sha256") == c.sha(c.CORE)
            else "FAIL",
        }
    )
    checks.append(
        {
            "check": "localization_distribution",
            "status": "PASS"
            if (public / "assets/languages.js").is_file()
            and all(
                "assets/languages.js" in (public / page).read_text(encoding="utf-8")
                for page in ("index.html", "player.html", "settings.html")
            )
            else "FAIL",
        }
    )
    # These require separate evidence, not automatic promotion by passing unit tests.
    for label in (
        "full_gameplay_acceptance",
        "physical_audio_gamepad",
        "public_https_deployment",
        "complete_binary_redistribution_review",
    ):
        checks.append({"check": label, "status": "NOT VERIFIED"})
    report = {
        "generated_at": c.now(),
        "version": "0.1.5.1",
        "checks": checks,
        "status": "FAIL"
        if any(x["status"] == "FAIL" for x in checks)
        else "PARTIAL"
        if any(x["status"] != "PASS" for x in checks)
        else "PASS",
        "note": "Current port suites replace obsolete missing test references. PARTIAL is not a full release acceptance.",
    }
    c.save(c.REPORTS / "release_verification_v0151.json", report)
    return report
