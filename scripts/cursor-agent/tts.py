"""
tts.py — Non-blocking TTS queue wrapping macOS `say`.

All speech is dispatched to a background thread so the main monitoring
loop is never blocked waiting for the previous sentence to finish.
Lines are dropped if the queue is full (prevents a pileup of stale messages).
"""

import queue
import re
import subprocess
import threading

import preferences as prefs_module
from preferences import Preferences

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[mGKHF]")
_MAX_CHARS = 220   # truncate very long lines before sending to say
_QUEUE_MAX = 8     # drop new items if queue is already this deep (lag prevention)

_q: queue.Queue = queue.Queue(maxsize=_QUEUE_MAX)
_worker_thread: threading.Thread | None = None
_stop_event = threading.Event()


def _sanitize(text: str) -> str:
    """Strip ANSI codes, [server] prefix, markdown noise, and truncate."""
    text = _ANSI_RE.sub("", text)
    text = re.sub(r"^\[server\]\s*", "", text)
    text = re.sub(r"[`*_#]", "", text)
    text = text.strip()
    return text[:_MAX_CHARS]


def _worker(prefs_ref: list) -> None:
    """Background thread: reads from queue and calls macOS `say`."""
    while not _stop_event.is_set():
        try:
            text = _q.get(timeout=0.5)
        except queue.Empty:
            continue

        # Re-read muted state each time (can change mid-session)
        current_prefs: Preferences = prefs_ref[0]
        if current_prefs.muted:
            _q.task_done()
            continue

        clean = _sanitize(text)
        if not clean:
            _q.task_done()
            continue

        try:
            subprocess.run(
                ["say", "-v", current_prefs.voice, "-r", str(current_prefs.speak_rate), "--", clean],
                timeout=15,
                check=False,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
        finally:
            _q.task_done()


def start(prefs_ref: list) -> None:
    """
    Start the TTS worker thread.
    prefs_ref is a one-element list holding the current Preferences object
    so the worker always sees the latest mute state / voice without reloading disk.
    """
    global _worker_thread
    _stop_event.clear()
    _worker_thread = threading.Thread(target=_worker, args=(prefs_ref,), daemon=True, name="tts-worker")
    _worker_thread.start()


def stop() -> None:
    """Signal the worker to stop after finishing the current sentence."""
    _stop_event.set()
    if _worker_thread:
        _worker_thread.join(timeout=5)


def speak(text: str) -> None:
    """
    Enqueue a line for TTS. Non-blocking — drops silently if queue is full
    so a burst of log lines never creates a minutes-long backlog.
    """
    try:
        _q.put_nowait(text)
    except queue.Full:
        pass  # deliberately drop stale messages


def speak_now(text: str, prefs: Preferences) -> None:
    """
    Bypass the queue and speak immediately (used for agent confirmations
    like "muted", "waking up", "shutting down"). Blocks until done.
    """
    clean = _sanitize(text)
    if not clean:
        return
    try:
        subprocess.run(
            ["say", "-v", prefs.voice, "-r", str(prefs.speak_rate), "--", clean],
            timeout=15,
            check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass


def drain() -> None:
    """Clear all pending items from the queue (e.g. on mute)."""
    while not _q.empty():
        try:
            _q.get_nowait()
            _q.task_done()
        except queue.Empty:
            break
