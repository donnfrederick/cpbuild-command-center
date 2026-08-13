#!/usr/bin/env python3
"""Render a human-readable dashboard from COPILOT_ROUNDS_METRICS.jsonl.

Invoked by .github/workflows/track-copilot-rounds.yml after each PR merge.
Also safe to run locally:

    python3 scripts/render-copilot-dashboard.py \
        docs/COPILOT_ROUNDS_METRICS.jsonl \
        docs/agent-context/copilot-rounds-dashboard.md

The dashboard's primary consumer is the agent at session start — the
session-start checklist in `.cursor/rules/project-prompt.mdc` reads the
trend line at the top of this file and surfaces it to Phil so he can see
whether recursive self-improvement is actually making the loop cheaper
over time.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from statistics import mean


def load_records(jsonl_path: Path) -> list[dict]:
    records: list[dict] = []
    if not jsonl_path.exists():
        return records
    for line in jsonl_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError as exc:
            print(f"Warning: skipping malformed line: {exc}", file=sys.stderr)
    records.sort(key=lambda r: r.get("merged_at", ""))
    return records


def sanitize_snippet(snippet: str, max_len: int = 200) -> str:
    """Strip Markdown control sequences from a Copilot comment excerpt so it
    renders safely inside a `- **PR #N:** ...` bullet.

    Raw Copilot comments often include triple-backtick suggestion blocks
    (```` ```suggestion ```` ... ```` ``` ````), table pipes, and embedded
    newlines. Writing those verbatim into the dashboard breaks Markdown
    rendering — the dashboard actually started a stray code fence mid-bullet
    before this was fixed. We normalise whitespace, replace triple-backtick
    runs with a plain-text token that contains no backticks at all (so it
    cannot accidentally open OR close an inline-code span — an earlier
    zero-width-space-between-backticks approach was still ambiguous and left
    stray backtick fragments visible in the rendered dashboard), escape
    pipes, and truncate to keep each bullet single-line-ish.
    """
    if not snippet:
        return ""
    # Collapse all whitespace (including newlines) to single spaces so a
    # multi-line suggestion block collapses to one line.
    s = re.sub(r"\s+", " ", snippet).strip()
    # Replace any run of 3+ backticks with a plain-text placeholder. No
    # backticks in the replacement, so Markdown parsers cannot open or close
    # code spans based on this fragment. Pad with surrounding spaces so the
    # marker doesn't collide with adjacent text (e.g. "```suggestion" must
    # render as "[code block] suggestion", not "[code block]suggestion"),
    # then re-collapse whitespace to keep the bullet on one line.
    s = re.sub(r"`{3,}", " [code block] ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Escape pipes so a snippet that happens to land inside a future table
    # doesn't split the column.
    s = s.replace("|", "\\|")
    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "\u2026"
    return s


def trend_arrow(seq: list[float | None]) -> str:
    """Return ↓ / → / ↑ based on the slope of the last few values.

    Ignores None / missing entries. Needs at least 2 points.
    """
    vals = [v for v in seq if v is not None]
    if len(vals) < 2:
        return ""
    # Simple comparison: average of the first half vs the second half.
    mid = len(vals) // 2
    first_avg = mean(vals[:mid]) if mid > 0 else vals[0]
    second_avg = mean(vals[mid:])
    delta = second_avg - first_avg
    if abs(delta) < 0.1:
        return "→"
    return "↓" if delta < 0 else "↑"


def format_trend_line(recent: list[dict]) -> str:
    """One-line summary suitable for the session-start checklist."""
    if not recent:
        return "No PRs tracked yet."
    rounds = [r.get("rounds") for r in recent]
    ratios = [r.get("preventable_ratio") for r in recent
              if r.get("preventable_ratio") is not None]
    rounds_arrow = trend_arrow([float(x) for x in rounds if x is not None])
    ratio_arrow = trend_arrow(ratios)
    rounds_fmt = " → ".join(str(r) for r in rounds if r is not None)
    ratio_fmt = (
        f"{ratios[0]:.2f} → {ratios[-1]:.2f}"
        if len(ratios) >= 2 else
        (f"{ratios[0]:.2f}" if ratios else "n/a")
    )
    return (
        f"Last {len(recent)} PRs rounds: {rounds_fmt} {rounds_arrow} "
        f"| preventable ratio: {ratio_fmt} {ratio_arrow}"
    )


def render_markdown(records: list[dict]) -> str:
    # Only the most recent N PRs go in the summary table; full history
    # lives in the JSONL file.
    RECENT_N = 10
    recent = records[-RECENT_N:]

    # `_Last updated_` is tied to the most recent record's `merged_at` rather
    # than `now()` so the file is deterministic: re-running the renderer on
    # the same JSONL produces byte-identical output. The line only changes
    # when a new record is appended — no gratuitous diffs on unrelated
    # workflow runs.
    last_updated = records[-1].get("merged_at", "")[:10] if records else "never"

    lines: list[str] = []
    lines.append("# Copilot Rounds Dashboard")
    lines.append("")
    lines.append(
        "> Auto-generated from `docs/COPILOT_ROUNDS_METRICS.jsonl` by "
        "`.github/workflows/track-copilot-rounds.yml` after each PR merge. "
        "Do not hand-edit — commit changes to the JSONL file or the renderer instead."
    )
    lines.append("")
    lines.append(f"_Last updated: {last_updated} (UTC, merge date of most recent tracked PR)_")
    lines.append("")
    lines.append("## Session-start trend line")
    lines.append("")
    lines.append("The agent surfaces this line in the session-start status report:")
    lines.append("")
    lines.append("```")
    lines.append(format_trend_line(recent))
    lines.append("```")
    lines.append("")
    lines.append("## What these numbers mean")
    lines.append("")
    lines.append(
        "- **rounds** — how many Copilot review rounds this PR required before merge. "
        "Target: trend toward 1."
    )
    lines.append(
        "- **preventable_ratio** — fraction of Copilot comments that matched a category "
        "already in our pre-push self-check (`session-checklist.md` top-3 or a row in "
        "`project-prompt.mdc`'s Pre-Push Self-Check table). Target: trend toward 0 — "
        "a low ratio means we are catching issues upfront, not after Copilot flags them."
    )
    lines.append(
        "- **novel comments** — Copilot catches that did NOT match any existing category. "
        "These are the patterns we have not yet captured in a rule. Each one is a "
        "candidate for a new Pre-Push row or a new `session-checklist.md` entry."
    )
    lines.append("")
    lines.append("## Recent PRs")
    lines.append("")
    if not recent:
        lines.append("_No PRs tracked yet._")
    else:
        lines.append(
            "| PR | Merged | Rounds | Comments | Preventable | Novel | Ratio | Title |"
        )
        lines.append(
            "|----|--------|--------|----------|-------------|-------|-------|-------|"
        )
        for r in recent:
            ratio = r.get("preventable_ratio")
            ratio_fmt = f"{ratio:.2f}" if ratio is not None else "n/a"
            # Normalize the title for Markdown table safety. Titles can
            # contain pipes, backticks, or newlines — any of those would
            # break the row or silently introduce inline code. Collapse
            # whitespace, truncate for width, then escape table-breaking
            # characters.
            title = re.sub(r"\s+", " ", str(r.get("title") or "")).strip()
            if len(title) > 60:
                title = title[:57].rstrip() + "\u2026"
            title = title.replace("\\", "\\\\").replace("|", "\\|").replace("`", "\\`")
            lines.append(
                f"| #{r.get('pr','?')} "
                f"| {r.get('merged_at','')[:10]} "
                f"| {r.get('rounds','?')} "
                f"| {r.get('total_comments','?')} "
                f"| {r.get('comments_preventable','?')} "
                f"| {r.get('comments_novel','?')} "
                f"| {ratio_fmt} "
                f"| {title} |"
            )
    lines.append("")

    # Aggregate novel comments across recent PRs to surface new-pattern
    # candidates Phil / the agent should consider adding to the Pre-Push
    # table. De-dup only exact repeats.
    novel_snippets: list[tuple[int, str]] = []
    for r in recent:
        for s in r.get("novel_comment_snippets") or []:
            novel_snippets.append((r.get("pr", 0), s))
    if novel_snippets:
        lines.append("## Novel comments (recent) — candidates for new Pre-Push rows")
        lines.append("")
        lines.append(
            "These Copilot comments did not match any existing category pattern. "
            "If a recurring theme shows up in this list, add a row to the "
            "`project-prompt.mdc` Pre-Push Self-Check table or a category to "
            "`session-checklist.md`."
        )
        lines.append("")
        seen: set[str] = set()
        for pr_num, snippet in novel_snippets[-20:]:
            clean = sanitize_snippet(snippet)
            if not clean or clean in seen:
                continue
            seen.add(clean)
            lines.append(f"- **PR #{pr_num}:** {clean}")
        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "Usage: render-copilot-dashboard.py <jsonl_in> <md_out>",
            file=sys.stderr,
        )
        return 2
    jsonl_path = Path(sys.argv[1])
    md_path = Path(sys.argv[2])

    records = load_records(jsonl_path)
    md = render_markdown(records)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(md, encoding="utf-8")
    print(f"Wrote {md_path} ({len(records)} records).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
