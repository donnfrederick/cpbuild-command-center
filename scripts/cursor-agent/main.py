#!/usr/bin/env python3
"""
main.py — Cursor Voice Agent entry point.

Wires together:
  - terminal_monitor  → watches Cursor terminal files, emits new lines
  - gemini_filter     → decides what's worth speaking, parses voice commands
  - tts               → non-blocking macOS say queue
  - voice_controller  → Porcupine wake word + Whisper transcription
  - preferences       → persistent user preference store

Usage:
  python3 main.py

Stop:
  Ctrl+C  or  say "computer" then "stop"
"""

import os
import signal
import sys
import time
from datetime import datetime

import gemini_filter
import preferences as prefs_module
import terminal_monitor
import tts
import voice_controller
from preferences import Preferences

# ── Configuration ─────────────────────────────────────────────────────────────

TERMINALS_DIR = (
    "/Users/philpersonal/.cursor/projects/"
    "Users-philpersonal-Projects-command-center-reboot/terminals"
)

_SHUTDOWN = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def log(msg: str) -> None:
    print(f"[{ts()}] {msg}", flush=True)


# ── Core line handler (called from terminal_monitor threads) ──────────────────

def on_terminal_line(line: str, prefs_ref: list) -> None:
    """
    Callback for every new terminal line. Runs in a background thread.
    Checks preferences and optionally Gemini before enqueuing for TTS.
    """
    prefs: Preferences = prefs_ref[0]
    if prefs.muted:
        return
    if gemini_filter.should_speak(line, prefs):
        tts.speak(line)


# ── Voice command dispatcher ──────────────────────────────────────────────────

def handle_command(transcript: str, prefs_ref: list) -> None:
    """
    Called by voice_controller when the user speaks after the wake word.
    Dispatches to the appropriate action.
    """
    global _SHUTDOWN

    prefs: Preferences = prefs_ref[0]
    cmd = gemini_filter.parse_command(transcript, prefs)
    action = cmd.get("action", "unknown")
    keyword = cmd.get("keyword")

    log(f"Voice command: action={action!r} keyword={keyword!r} (from: '{transcript}')")

    if action == "mute":
        prefs_ref[0] = prefs_module.set_muted(prefs, True)
        tts.drain()
        tts.speak_now("Muted. Say computer unmute when you're back.", prefs_ref[0])

    elif action == "unmute":
        prefs_ref[0] = prefs_module.set_muted(prefs, False)
        tts.speak_now("Back online. Resuming monitoring.", prefs_ref[0])

    elif action == "stop":
        tts.speak_now("Shutting down. Goodbye.", prefs)
        _SHUTDOWN = True

    elif action == "status":
        status_text = prefs_module.describe(prefs)
        tts.speak_now(status_text, prefs)

    elif action == "summarize":
        tts.speak_now("Give me a moment to summarise.", prefs)
        recent = terminal_monitor.get_recent_lines(40)
        summary = gemini_filter.summarize(recent, prefs)
        log(f"Summary: {summary}")
        tts.speak_now(summary, prefs)

    elif action == "add_include" and keyword:
        prefs_ref[0] = prefs_module.add_rule(prefs, "include", keyword)
        tts.speak_now(f"Got it. I'll tell you more about {keyword}.", prefs_ref[0])

    elif action == "add_exclude" and keyword:
        prefs_ref[0] = prefs_module.add_rule(prefs, "exclude", keyword)
        tts.speak_now(f"Got it. I'll silence {keyword} from now on.", prefs_ref[0])

    elif action == "remove_rule" and keyword:
        prefs_ref[0] = prefs_module.remove_rule(prefs, keyword)
        tts.speak_now(f"Rule for {keyword} removed.", prefs_ref[0])

    else:
        tts.speak_now(
            "I didn't understand that. Try: mute, unmute, stop, status, or what just happened.",
            prefs,
        )


# ── Startup banner ────────────────────────────────────────────────────────────

def print_banner(prefs: Preferences, voice_on: bool) -> None:
    print()
    print("╔══════════════════════════════════════════════╗")
    print("║         Cursor Voice Agent  🎙               ║")
    print("╠══════════════════════════════════════════════╣")
    print(f"║  Terminals : {TERMINALS_DIR[-32:]:<32} ║")
    print(f"║  Voice     : {prefs.voice:<32} ║")
    print(f"║  Rate      : {prefs.speak_rate} wpm{' ' * 27}║")
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    gemini_status = "configured" if gemini_key else "NOT SET — regex-only mode"
    print(f"║  Gemini    : {gemini_status:<32} ║")
    pvc_key = os.environ.get("PICOVOICE_ACCESS_KEY", "")
    pvc_status = "configured" if pvc_key else "NOT SET — no wake word"
    print(f"║  Wake word : {'computer (Porcupine)' if voice_on else pvc_status:<32} ║")
    print("╠══════════════════════════════════════════════╣")
    print("║  Commands (after saying 'computer'):         ║")
    print("║    mute / unmute / stop / status             ║")
    print("║    what just happened                        ║")
    print("║    less <topic> / more <topic>               ║")
    print("╚══════════════════════════════════════════════╝")
    print()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    global _SHUTDOWN

    # Load (or create) preferences
    prefs = prefs_module.load()

    # Shared mutable ref so threads always see the latest prefs after voice updates
    prefs_ref = [prefs]

    voice_on = voice_controller.voice_available()
    print_banner(prefs_ref[0], voice_on)

    log(f"[{ts()}] Starting TTS worker...")
    tts.start(prefs_ref)

    log(f"[{ts()}] Starting terminal monitor — watching {TERMINALS_DIR}")
    terminal_monitor.start(
        TERMINALS_DIR,
        on_line=lambda line: on_terminal_line(line, prefs_ref),
    )

    if voice_on:
        log(f"[{ts()}] Starting wake-word listener ('computer')...")
        voice_controller.start(
            on_transcript=lambda t: handle_command(t, prefs_ref),
        )
    else:
        log(f"[{ts()}] Voice commands unavailable — set PICOVOICE_ACCESS_KEY to enable.")

    tts.speak_now(
        "Cursor voice agent started. I'm watching your terminals.",
        prefs_ref[0],
    )

    # Graceful shutdown on Ctrl+C
    def _on_sigint(sig, frame):
        global _SHUTDOWN
        print()
        log("Interrupt received — shutting down...")
        _SHUTDOWN = True

    signal.signal(signal.SIGINT, _on_sigint)
    signal.signal(signal.SIGTERM, _on_sigint)

    log(f"[{ts()}] Running. Press Ctrl+C to stop.")
    print()

    try:
        while not _SHUTDOWN:
            time.sleep(0.25)
    finally:
        log(f"[{ts()}] Stopping all threads...")
        voice_controller.stop()
        terminal_monitor.stop()
        tts.stop()
        log(f"[{ts()}] Cursor Voice Agent stopped.")


if __name__ == "__main__":
    main()
