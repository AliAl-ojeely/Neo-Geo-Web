"""Start only an isolated local browser when a replay command needs one."""

import os, subprocess, time, urllib.request, urllib.error
from pathlib import Path
from urllib.parse import urlsplit
from . import compatibility as c


# Validate a loopback CDP endpoint and reuse it or start a dedicated headless Windows browser.
def ensure(endpoint):
    url = urlsplit(endpoint)
    if (
        url.scheme != "http"
        or url.hostname not in ("127.0.0.1", "localhost")
        or not url.port
        or not 1024 <= url.port <= 65535
        or url.path not in ("", "/")
        or url.username
    ):
        raise ValueError("CDP endpoint must be a local HTTP port")

    # Probe the local version endpoint and treat connection failures as not ready.
    def ready():
        try:
            with urllib.request.urlopen(
                endpoint.rstrip("/") + "/json/version", timeout=1
            ) as response:
                return response.status == 200
        except (OSError, urllib.error.URLError):
            return False

    if ready():
        return {"started": False, "endpoint": endpoint}
    if os.name != "nt":
        raise RuntimeError(
            "Start Chrome with a dedicated profile and --remote-debugging-port="
            + str(url.port)
        )
    choices = [
        Path(os.environ.get("PROGRAMFILES", "C:/Program Files"))
        / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)"))
        / "Microsoft/Edge/Application/msedge.exe",
    ]
    executable = next((p for p in choices if p.is_file()), None)
    if executable is None:
        raise RuntimeError("Chrome/Edge executable not found")
    profile = c.ROOT / "work/v014" / ("browser-" + str(url.port))
    profile.parent.mkdir(parents=True, exist_ok=True)
    process = subprocess.Popen(
        [
            str(executable),
            "--headless=new",
            "--remote-debugging-port=" + str(url.port),
            "--user-data-dir=" + str(profile),
            "--autoplay-policy=no-user-gesture-required",
            "--disable-background-networking",
            "--enable-precise-memory-info",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    record = {
        "started": True,
        "endpoint": endpoint,
        "pid": process.pid,
        "profile": str(profile),
    }
    c.save(c.ROOT / "work/v014" / ("browser-" + str(url.port) + ".json"), record)
    for _ in range(100):
        if ready():
            return record
        time.sleep(0.1)
    raise RuntimeError("Isolated browser did not expose its local debugging endpoint")
