"""
gemini_filter.py — Gemini 1.5 Flash integration for the Cursor Voice Agent.

Two responsibilities:
  1. should_speak(line, prefs) — decide if a raw terminal line is worth reading aloud,
     first using fast regex rules, then (optionally) asking Gemini for ambiguous lines.
  2. summarize(recent_lines, prefs) — when user says "what just happened",
     ask Gemini to summarise the last N terminal lines into 2-3 spoken sentences.
  3. parse_command(transcript, prefs) — interpret a voice command transcript and
     return a structured action dict.

Gemini is only called when GEMINI_API_KEY is set. Without it, the agent falls back
to regex-only filtering and simple keyword command parsing — fully functional offline.
"""

import os
import re
import threading
from typing import Optional

from preferences import Preferences

_gemini_available = False
_model = None
_init_lock = threading.Lock()

GEMINI_MODEL = "gemini-1.5-flash"

# Lines longer than this are chunked before sending to Gemini
_MAX_LINE_LEN = 300


def _init_gemini() -> None:
    global _gemini_available, _model
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return
    try:
        import google.generativeai as genai  # type: ignore
        genai.configure(api_key=api_key)
        _model = genai.GenerativeModel(GEMINI_MODEL)
        _gemini_available = True
    except Exception:
        _gemini_available = False


def _ensure_init() -> None:
    with _init_lock:
        if _model is None and not _gemini_available:
            _init_gemini()


# ── Fast regex filter (no API call) ──────────────────────────────────────────

def _regex_decision(line: str, prefs: Preferences) -> Optional[bool]:
    """
    Returns True (speak), False (silence), or None (needs Gemini judgment).
    None is only returned when Gemini is available — otherwise defaults to False.
    """
    # Exclusions first — cheapest check
    for kw in prefs.get_exclude_keywords():
        try:
            if re.search(kw, line):
                return False
        except re.error:
            if kw in line:
                return False

    # Explicit inclusions
    for kw in prefs.get_include_keywords():
        try:
            if re.search(kw, line):
                return True
        except re.error:
            if kw in line:
                return True

    # If Gemini is available, let it handle the ambiguous middle ground
    if _gemini_available:
        return None

    return False  # offline default: only speak what explicitly matches


# ── Gemini judgment for ambiguous lines ──────────────────────────────────────

_FILTER_PROMPT = """\
You are a filter for a developer voice assistant that reads terminal output aloud.
The developer is a busy software engineer who wants to stay informed while away from their desk.

User preferences:
- Boosted topics (always speak): {include}
- Silenced topics (never speak): {exclude}

Terminal line:
{line}

Reply with exactly one word: SPEAK or SILENCE.
- SPEAK if this line signals something meaningful a developer would want to know
  (errors, warnings, build results, deploy events, test failures, PRs, CI, timestamps).
- SILENCE if it's HTTP noise, routine polling, repetitive server chatter, or not actionable."""


def should_speak(line: str, prefs: Preferences) -> bool:
    """Return True if this terminal line should be read aloud."""
    decision = _regex_decision(line, prefs)
    if decision is not None:
        return decision

    # Ask Gemini for ambiguous lines
    _ensure_init()
    if not _gemini_available or _model is None:
        return False

    try:
        prompt = _FILTER_PROMPT.format(
            include=", ".join(prefs.get_include_keywords()) or "none set",
            exclude=", ".join(prefs.get_exclude_keywords()) or "none set",
            line=line[:_MAX_LINE_LEN],
        )
        response = _model.generate_content(prompt)
        answer = response.text.strip().upper()
        return answer.startswith("SPEAK")
    except Exception:
        return False


# ── Summarise recent activity ─────────────────────────────────────────────────

_SUMMARY_PROMPT = """\
You are a voice assistant for a software engineer named Phil.
Summarise the following terminal log excerpt in 2-3 short spoken sentences.
Focus on: errors, build status, deploy state, test results, PR/CI activity.
Skip HTTP noise and routine polling. Be concrete — name files or error types if present.
Keep it under 50 words total. Write as if speaking aloud, no bullet points.

Terminal output (most recent last):
{lines}"""


def summarize(recent_lines: list[str], prefs: Preferences) -> str:
    """
    Summarise the recent terminal lines into spoken prose.
    Falls back to a simple last-3-lines recap if Gemini is unavailable.
    """
    _ensure_init()

    if not _gemini_available or _model is None:
        # Offline fallback: return last 3 meaningful lines
        meaningful = [
            ln for ln in recent_lines[-20:]
            if not re.search(r"GET /api|POST /api|401 in|200 in|Fast Refresh", ln)
        ]
        if not meaningful:
            return "Nothing significant in the recent terminal output."
        return "Recent activity: " + ". ".join(meaningful[-3:])

    try:
        lines_text = "\n".join(recent_lines[-40:])
        prompt = _SUMMARY_PROMPT.format(lines=lines_text[:3000])
        response = _model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        return f"Could not summarise activity: {e}"


# ── Voice command parsing ─────────────────────────────────────────────────────

_COMMAND_PROMPT = """\
You are a command parser for a voice-controlled developer assistant.
The developer just spoke this command after the wake word:

"{transcript}"

Classify it into exactly one of these actions (return JSON only, no prose):
{{
  "action": "<one of: mute | unmute | stop | status | summarize | add_include | add_exclude | remove_rule | unknown>",
  "keyword": "<extracted topic if action is add_include / add_exclude / remove_rule, else null>"
}}

Examples:
- "mute" → {{"action": "mute", "keyword": null}}
- "quiet" → {{"action": "mute", "keyword": null}}
- "I'm back" / "unmute" / "resume" → {{"action": "unmute", "keyword": null}}
- "stop" / "shut down" / "quit" → {{"action": "stop", "keyword": null}}
- "what just happened" / "what's going on" / "catch me up" → {{"action": "summarize", "keyword": null}}
- "status" / "how are you doing" → {{"action": "status", "keyword": null}}
- "less errors" / "ignore API calls" / "silence 401s" → {{"action": "add_exclude", "keyword": "<topic>"}}
- "more deploys" / "focus on builds" / "tell me about tests" → {{"action": "add_include", "keyword": "<topic>"}}
- "forget errors rule" / "remove errors" → {{"action": "remove_rule", "keyword": "<topic>"}}"""

_COMMAND_PATTERNS: list[tuple[re.Pattern, dict]] = [
    (re.compile(r"\b(mute|quiet|silence me|be quiet)\b", re.I),   {"action": "mute",      "keyword": None}),
    (re.compile(r"\b(unmute|resume|i.?m back|wake up)\b", re.I),  {"action": "unmute",    "keyword": None}),
    (re.compile(r"\b(stop|quit|shut down|shutdown|exit)\b", re.I),{"action": "stop",      "keyword": None}),
    (re.compile(r"\b(status|how are you)\b", re.I),                {"action": "status",    "keyword": None}),
    (re.compile(r"\b(what.?s? (just )?happened|catch me up|what.?s? going on)\b", re.I),
                                                                   {"action": "summarize", "keyword": None}),
]


def _regex_command(transcript: str) -> Optional[dict]:
    for pattern, action in _COMMAND_PATTERNS:
        if pattern.search(transcript):
            return dict(action)
    return None


def parse_command(transcript: str, prefs: Preferences) -> dict:
    """
    Parse a voice command transcript into an action dict.
    Returns {"action": ..., "keyword": ...}
    Falls back to Gemini for complex commands like "less errors" / "focus on builds".
    """
    # Fast regex first
    quick = _regex_command(transcript)
    if quick:
        return quick

    # Gemini for nuanced commands
    _ensure_init()
    if _gemini_available and _model is not None:
        try:
            import json
            prompt = _COMMAND_PROMPT.format(transcript=transcript[:200])
            response = _model.generate_content(prompt)
            text = response.text.strip()
            # Strip markdown code fences if Gemini wraps in ```json
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            result = json.loads(text)
            if "action" in result:
                return result
        except Exception:
            pass

    return {"action": "unknown", "keyword": None}
