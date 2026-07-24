#!/usr/bin/env python3
"""PreToolUse hook (Edit|Write|MultiEdit): guard the closed ChartEngine core.

Invariant (CLAUDE.md #2): the engine core is closed to modification; new behavior
is added as a new Capability under emulador/src/app/domain/chart/capabilities/.
Edits to the core (domain/chart/** OUTSIDE capabilities/) are escalated to the
user via permissionDecision "ask" so they are always deliberate. Capabilities,
specs, and everything else flow normally.

Fail-open: any error -> exit 0 (never block a legitimate edit by accident).
Switch "ask" to "deny" below if you want core edits hard-blocked instead.
"""
import json
import sys

# Windows hooks get cp1252 std streams; a non-ASCII file_path would mangle or
# raise. Force UTF-8 so JSON in/out is robust. Fail-open if unavailable.
try:
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


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
    if data.get("tool_name", "") not in ("Edit", "Write", "MultiEdit"):
        return
    fp = (data.get("tool_input") or {}).get("file_path", "") or ""
    norm = fp.replace("\\", "/")

    if "/domain/chart/" not in norm:
        return  # not the engine
    if "/domain/chart/capabilities/" in norm:
        return  # capabilities are the sanctioned extension point
    if norm.endswith(".spec.ts"):
        return  # editing a core test is fine

    escalate(
        "Engine core is CLOSED to modification (CLAUDE.md invariant #2). New "
        "behavior belongs in a new Capability under domain/chart/capabilities/, "
        "not in the core. Confirm only if this is a deliberate, RFC-sanctioned "
        "core change."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # fail-open: do not block on hook error
    sys.exit(0)
