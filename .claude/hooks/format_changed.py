#!/usr/bin/env python3
"""PostToolUse hook (Edit|Write|MultiEdit): format the changed file with Prettier.

Runs the repo's Prettier (from emulador/) on the single file that was just written,
matching `npm run format` scope (src/**/*.{ts,html,css}). Only reformats when the
file is actually unformatted, and then tells Claude via additionalContext so it
re-reads before the next edit. Fail-open and non-blocking: always exits 0.

Note: adds ~1-2s to each matching edit. Delete this hook block from settings.json
if that latency isn't worth it and rely on `/verify-gates` + format:check instead.
"""
import json
import os
import subprocess
import sys

# Windows hooks get cp1252 std streams; a non-ASCII file_path would mangle or
# raise. Force UTF-8 so JSON in/out is robust. Fail-open if unavailable.
try:
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

EXTS = (".ts", ".html", ".css", ".scss")


def emit(msg: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": msg,
        }
    }))


def main() -> None:
    data = json.load(sys.stdin)
    if data.get("tool_name", "") not in ("Edit", "Write", "MultiEdit"):
        return
    fp = (data.get("tool_input") or {}).get("file_path", "") or ""
    norm = fp.replace("\\", "/")
    if "/emulador/src/" not in norm or not norm.endswith(EXTS):
        return

    project = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    emulador = os.path.join(project, "emulador")
    prettier = ["npx", "--no-install", "prettier"]

    # Only act if the file is not already formatted (exit 1). Exit 0 = clean;
    # exit 2 (or anything else) = error / missing prettier / ignored -> leave it.
    try:
        check = subprocess.run(
            prettier + ["--check", fp],
            cwd=emulador, capture_output=True, text=True, timeout=60,
        )
    except Exception:
        return
    if check.returncode != 1:
        return

    write = subprocess.run(
        prettier + ["--write", fp],
        cwd=emulador, capture_output=True, text=True, timeout=60,
    )
    if write.returncode == 0:
        rel = norm.split("/emulador/", 1)[-1]
        emit(f"Auto-formatted emulador/{rel} with Prettier - re-read it before editing again.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # never block on a formatting hook
    sys.exit(0)
