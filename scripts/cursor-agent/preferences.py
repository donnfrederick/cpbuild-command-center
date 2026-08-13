"""
preferences.py — Persistent preference store for the Cursor Voice Agent.

Saves to ~/.cursor-agent-prefs.json so settings survive restarts.
Rules are voice-feedback-driven: "less errors", "more deploys", etc.
"""

import json
import os
import threading
from dataclasses import dataclass, asdict, field
from typing import Literal

PREFS_PATH = os.path.expanduser("~/.cursor-agent-prefs.json")

RuleType = Literal["include", "exclude"]


@dataclass
class Rule:
    type: RuleType       # "include" (speak more of this) or "exclude" (silence this)
    keyword: str         # the word/phrase that triggers this rule
    source: str = "voice"  # "voice" | "default"


@dataclass
class Preferences:
    muted: bool = False
    speak_rate: int = 190          # macOS say -r value
    voice: str = "Samantha"
    gemini_enabled: bool = True
    rules: list = field(default_factory=list)  # list of Rule dicts

    def get_include_keywords(self) -> list[str]:
        return [r["keyword"] for r in self.rules if r["type"] == "include"]

    def get_exclude_keywords(self) -> list[str]:
        return [r["keyword"] for r in self.rules if r["type"] == "exclude"]


_lock = threading.Lock()
_DEFAULT_RULES: list[dict] = [
    # Things always worth hearing
    {"type": "include", "keyword": r"\[\d{2}:\d{2}:\d{2}\]", "source": "default"},
    {"type": "include", "keyword": "error",     "source": "default"},
    {"type": "include", "keyword": "Error",     "source": "default"},
    {"type": "include", "keyword": "FAILED",    "source": "default"},
    {"type": "include", "keyword": "passed",    "source": "default"},
    {"type": "include", "keyword": "failed",    "source": "default"},
    {"type": "include", "keyword": "merged",    "source": "default"},
    {"type": "include", "keyword": "Deploy",    "source": "default"},
    {"type": "include", "keyword": "deploy",    "source": "default"},
    {"type": "include", "keyword": "build",     "source": "default"},
    {"type": "include", "keyword": "TypeScript","source": "default"},
    {"type": "include", "keyword": "lint",      "source": "default"},
    {"type": "include", "keyword": "test",      "source": "default"},
    {"type": "include", "keyword": "PR #",      "source": "default"},
    {"type": "include", "keyword": "CI",        "source": "default"},
    # Things always silenced
    {"type": "exclude", "keyword": "GET /api",           "source": "default"},
    {"type": "exclude", "keyword": "POST /api",          "source": "default"},
    {"type": "exclude", "keyword": "DELETE /api",        "source": "default"},
    {"type": "exclude", "keyword": "401 in",             "source": "default"},
    {"type": "exclude", "keyword": "200 in",             "source": "default"},
    {"type": "exclude", "keyword": "Fast Refresh",       "source": "default"},
    {"type": "exclude", "keyword": "compile:",           "source": "default"},
    {"type": "exclude", "keyword": "proxy.ts:",          "source": "default"},
    {"type": "exclude", "keyword": "generate-params",    "source": "default"},
    {"type": "exclude", "keyword": "render:",            "source": "default"},
    {"type": "exclude", "keyword": "hot-reload",         "source": "default"},
]


def load() -> Preferences:
    """Load preferences from disk. Returns defaults if file doesn't exist."""
    with _lock:
        if not os.path.exists(PREFS_PATH):
            prefs = Preferences(rules=list(_DEFAULT_RULES))
            _save_unlocked(prefs)
            return prefs
        try:
            with open(PREFS_PATH, "r") as f:
                data = json.load(f)
            prefs = Preferences(
                muted=data.get("muted", False),
                speak_rate=data.get("speak_rate", 190),
                voice=data.get("voice", "Samantha"),
                gemini_enabled=data.get("gemini_enabled", True),
                rules=data.get("rules", list(_DEFAULT_RULES)),
            )
            return prefs
        except (json.JSONDecodeError, KeyError):
            prefs = Preferences(rules=list(_DEFAULT_RULES))
            _save_unlocked(prefs)
            return prefs


def save(prefs: Preferences) -> None:
    """Persist preferences to disk."""
    with _lock:
        _save_unlocked(prefs)


def _save_unlocked(prefs: Preferences) -> None:
    with open(PREFS_PATH, "w") as f:
        json.dump(asdict(prefs), f, indent=2)


def add_rule(prefs: Preferences, rule_type: RuleType, keyword: str) -> Preferences:
    """Add a new voice-feedback rule and persist it."""
    # Avoid duplicates
    for existing in prefs.rules:
        if existing["type"] == rule_type and existing["keyword"].lower() == keyword.lower():
            return prefs
    prefs.rules.append({"type": rule_type, "keyword": keyword, "source": "voice"})
    save(prefs)
    return prefs


def remove_rule(prefs: Preferences, keyword: str) -> Preferences:
    """Remove all rules matching a keyword."""
    prefs.rules = [r for r in prefs.rules if r["keyword"].lower() != keyword.lower()]
    save(prefs)
    return prefs


def set_muted(prefs: Preferences, muted: bool) -> Preferences:
    prefs.muted = muted
    save(prefs)
    return prefs


def describe(prefs: Preferences) -> str:
    """Return a short human-readable summary for TTS status command."""
    voice_rules = [r for r in prefs.rules if r["source"] == "voice"]
    inc = [r["keyword"] for r in voice_rules if r["type"] == "include"]
    exc = [r["keyword"] for r in voice_rules if r["type"] == "exclude"]
    parts = []
    if prefs.muted:
        parts.append("Currently muted.")
    else:
        parts.append("Monitoring is active.")
    if inc:
        parts.append(f"Boosted topics: {', '.join(inc)}.")
    if exc:
        parts.append(f"Silenced topics: {', '.join(exc)}.")
    if not inc and not exc:
        parts.append("No custom filters set yet.")
    return " ".join(parts)
