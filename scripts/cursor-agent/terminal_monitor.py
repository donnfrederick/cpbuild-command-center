"""
terminal_monitor.py — Watches all Cursor terminal files for a project and
emits new lines via a callback.

Cursor writes live terminal output to .txt files in a project-specific folder.
This module:
  1. Scans the folder for existing .txt files and starts tailing each one.
  2. Polls for newly created .txt files every SCAN_INTERVAL seconds.
  3. Calls on_line(line: str) for every new line that arrives.

Threading model: one daemon thread per monitored file + one scanner thread.
All threads are stored so they can be joined on shutdown.
"""

import os
import threading
import time
from collections import deque
from typing import Callable

SCAN_INTERVAL = 5       # seconds between scans for new terminal files
HISTORY_MAXLEN = 200    # lines kept in memory for "what just happened" queries

_threads: list[threading.Thread] = []
_watched: set[str] = set()
_stop_event = threading.Event()

# Ring buffer of recent raw lines (for Gemini summarisation)
recent_lines: deque[str] = deque(maxlen=HISTORY_MAXLEN)
_recent_lock = threading.Lock()


def get_recent_lines(n: int = 40) -> list[str]:
    """Return up to n most-recent terminal lines (thread-safe)."""
    with _recent_lock:
        lines = list(recent_lines)
    return lines[-n:]


def _tail_file(path: str, on_line: Callable[[str], None]) -> None:
    """
    Open a file, seek to the end, then follow new content line by line.
    Runs until _stop_event is set.
    """
    try:
        with open(path, "r", errors="replace") as f:
            f.seek(0, 2)  # seek to EOF — only watch NEW content
            while not _stop_event.is_set():
                line = f.readline()
                if line:
                    line = line.rstrip("\n")
                    with _recent_lock:
                        recent_lines.append(line)
                    on_line(line)
                else:
                    time.sleep(0.1)
    except OSError:
        pass  # file may have been deleted; silently exit this tail


def _scanner(terminals_dir: str, on_line: Callable[[str], None]) -> None:
    """Periodically find new .txt files and spawn a tail thread for each."""
    while not _stop_event.is_set():
        try:
            entries = os.listdir(terminals_dir)
        except OSError:
            time.sleep(SCAN_INTERVAL)
            continue

        for fname in entries:
            if not fname.endswith(".txt"):
                continue
            fpath = os.path.join(terminals_dir, fname)
            if fpath in _watched:
                continue
            _watched.add(fpath)
            t = threading.Thread(
                target=_tail_file,
                args=(fpath, on_line),
                daemon=True,
                name=f"tail-{fname}",
            )
            t.start()
            _threads.append(t)

        time.sleep(SCAN_INTERVAL)


def start(terminals_dir: str, on_line: Callable[[str], None]) -> None:
    """
    Begin monitoring all terminal files in terminals_dir.
    on_line is called from background threads — make it thread-safe.
    """
    _stop_event.clear()
    scanner = threading.Thread(
        target=_scanner,
        args=(terminals_dir, on_line),
        daemon=True,
        name="terminal-scanner",
    )
    scanner.start()
    _threads.append(scanner)


def stop() -> None:
    """Signal all monitor threads to stop."""
    _stop_event.set()
    for t in _threads:
        t.join(timeout=2)
    _threads.clear()
    _watched.clear()
