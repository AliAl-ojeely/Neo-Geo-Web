"""Prevent two library suites from sharing a browser or overwriting progress."""

import contextlib, ctypes, json, os
from . import compatibility as c


# Check process liveness using Windows process status or a signal probe on other systems.
def alive(pid):
    if os.name == "nt":
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        kernel.OpenProcess.restype = ctypes.c_void_p
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return ctypes.get_last_error() == 5
        try:
            code = ctypes.c_ulong()
            kernel.GetExitCodeProcess.argtypes = [
                ctypes.c_void_p,
                ctypes.POINTER(ctypes.c_ulong),
            ]
            kernel.GetExitCodeProcess(handle, ctypes.byref(code))
            return code.value == 259
        finally:
            kernel.CloseHandle.argtypes = [ctypes.c_void_p]
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


# Acquire an exclusive suite lock, remove a dead owner record, and release the file on exit.
@contextlib.contextmanager
def lock():
    path = c.ROOT / "work/v014/browser-lab.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(2):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            old = c.load(path, {})
            if not old.get("pid") or alive(old["pid"]):
                raise RuntimeError(
                    "Another browser suite owns the run lock; wait for it to finish"
                )
            path.unlink()
    else:
        raise RuntimeError("Cannot acquire browser suite lock")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump({"pid": os.getpid(), "created_at": c.now()}, f)
        yield
    finally:
        path.unlink(missing_ok=True)
