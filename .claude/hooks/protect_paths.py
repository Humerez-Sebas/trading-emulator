#!/usr/bin/env python3
"""PreToolUse hook (Bash): guard protected infra files against deletion/overwrite.

The insights report's signature incident was a subagent deleting fill_r2.py (the
R2 pipeline orchestrator). Steering text cannot prevent that — it is not injected
into subagent prompts — but a PreToolUse hook fires for EVERY tool call, subagents
included. This escalates a destructive Bash command (rm / git rm / mv / move / del /
erase / rmdir / unlink, or a truncating '>' redirect) that targets a protected path
to a confirm prompt.

Protected: pipeline/** (esp. fill_r2), the .claude guardrails (hooks, settings.json,
steering.md), and CLAUDE.md. Escalation is "ask" (deliberate), never a hard block.
Fail-open: any error -> exit 0. Switch permissionDecision to "deny" to hard-block.
"""
import json
import re
import sys

try:
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Destructive verbs, word-bounded so "format" != rm and "remove" != mv/move.
DESTRUCTIVE = re.compile(
    r"\b(?:rm|rmdir|unlink|del|erase|mv|move)\b|\bgit\s+rm\b", re.IGNORECASE
)
# A lone '>' (not '>>', not '2>') truncates its target file.
TRUNCATE = re.compile(r"(?<![>\d&])>(?!>)")

PROTECTED = (
    "pipeline/",
    "fill_r2",
    ".claude/hooks",
    ".claude/settings.json",
    ".claude/steering.md",
    "claude.md",
)


def escalate(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def main() -> None:
    data = json.load(sys.stdin)
    if data.get("tool_name", "") != "Bash":
        return
    cmd = (data.get("tool_input") or {}).get("command", "") or ""
    norm = cmd.replace("\\", "/").lower()

    if not any(p in norm for p in PROTECTED):
        return  # no protected path referenced
    if not (DESTRUCTIVE.search(cmd) or TRUNCATE.search(cmd)):
        return  # references a protected path but is not destructive (cat/grep/commit)

    escalate(
        "This Bash command deletes or overwrites a PROTECTED path (pipeline/**, "
        "fill_r2, the .claude guardrails, or CLAUDE.md). The insights report's "
        "signature regression was a subagent deleting fill_r2.py. Confirm ONLY if "
        "removing/overwriting this file is genuinely intended."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # fail-open: never block a Bash call on a guard error
    sys.exit(0)
