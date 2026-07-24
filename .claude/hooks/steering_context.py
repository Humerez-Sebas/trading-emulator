#!/usr/bin/env python3
"""UserPromptSubmit hook: inject persistent repo steering + live git state.

Prints a compact steering block to stdout. On UserPromptSubmit, stdout (exit 0)
is added to Claude's context for the turn. This hook MUST NEVER exit non-zero
(that would reject the user's prompt) and must never raise on the write path ->
worst case is an empty injection.
"""
import os
import subprocess
import sys

# Hooks run with stdout piped, which on Windows decodes as a legacy codepage
# (cp1252). If the injected text carries any non-ASCII, a raw write raises
# UnicodeEncodeError and the whole injection silently vanishes. Force UTF-8 so
# the steering actually reaches Claude regardless of the console codepage.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def _git(project, *args, timeout=5):
    try:
        r = subprocess.run(
            ["git", *args], cwd=project,
            capture_output=True, text=True, timeout=timeout,
        )
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def _track(branch):
    if branch.startswith("feature/"):
        return "architectural/RFC track -> PR target: develop (confirm via ROADMAP)"
    if branch.startswith(("claude/", "fix/", "chore/")):
        return "product track -> PR target: main"
    if branch.startswith("docs/"):
        return "docs -> main or develop per what it documents"
    if branch in ("main", "develop"):
        return f"on {branch} directly -> start a branch before committing"
    return "classify (RFC->develop / product->main) before opening a PR"


def main():
    project = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

    # Static steering digest (single source of truth, user-editable).
    steering = ""
    try:
        with open(
            os.path.join(project, ".claude", "steering.md"),
            "r", encoding="utf-8",
        ) as fh:
            steering = fh.read().strip()
    except OSError:
        pass

    branch = _git(project, "rev-parse", "--abbrev-ref", "HEAD")

    # Ahead/behind vs the last-fetched upstream (offline — uses the local
    # remote-tracking ref, no network). Surfaces a stale branch every turn so
    # "I built on a branch that was behind origin" stops being a mid-task surprise.
    drift = ""
    counts = _git(project, "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
    parts = counts.split()
    if len(parts) == 2:
        ahead, behind = parts
        if behind != "0":
            drift = (f"  |  WARNING: {behind} commit(s) BEHIND upstream "
                     "(fetch + rebase before building further)")
        elif ahead != "0":
            drift = f"  |  {ahead} commit(s) ahead of upstream"

    lines = ["## Repo steering (auto-injected)"]
    if branch:
        lines.append(f"Current branch: {branch}  |  {_track(branch)}{drift}")
    if steering:
        lines.append("")
        lines.append(steering)
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Never block a prompt because of a steering hook.
        pass
    sys.exit(0)
