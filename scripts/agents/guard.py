#!/usr/bin/env python3
"""Shared advisory hooks. Never executes commands or treats text as approval."""
import json
import re
import shlex
import sys


def risky_git(command):
    # Inspect nested shell strings too; this is detection, not a shell interpreter.
    pending = [command]
    seen = set()
    while pending:
        text = pending.pop()
        if text in seen:
            continue
        seen.add(text)
        try:
            tokens = shlex.split(text)
        except ValueError:
            return True  # Unparseable shell text needs human inspection.
        for token in tokens:
            if token != text and re.search(r"(?:^|[\s/])git(?:\s|$)", token):
                pending.append(token)
        git_present = bool(re.search(r"(?:^|[\s/;(=`])git(?:[\s'\"]|$)", text))
        if not git_present:
            continue
        # Conservatively catch quoted subcommands, global options and compound forms.
        words = [t.strip(";()`") for t in tokens]
        push = "push" in words
        dangerous = any(
            t.startswith(("--force", "--mirror", "--delete", "+"))
            or bool(re.fullmatch(r"-[A-Za-z]*[fd][A-Za-z]*", t))
            for t in words
        )
        if push and dangerous:
            return True
        # Inline aliases can contain an otherwise hidden push.
        if any("alias." in t and "push" in t for t in words):
            return True
    return False


def output(host, event):
    if event.get("hook_event_name") == "UserPromptSubmit":
        return {"hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "If the user corrected your work, resolve and verify it first, then follow docs/agents/learn-rules.md: inspect existing rules, show an exact proposal, ask for Yes, and only then create a separate policy PR. Do not infer approval or claim unresolved work is fixed."
        }}
    if event.get("tool_name") != "Bash":
        return {}
    command = event.get("tool_input", {}).get("command")
    if not isinstance(command, str):
        raise ValueError("Bash command must be a string")
    if not risky_git(command):
        return {}
    return {"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "ask" if host == "claude" else "deny",
        "permissionDecisionReason": "Potential remote history rewrite/deletion. Obtain approval for the exact repository, ref and operation. Codex users must perform an approved blocked operation in their own terminal; never bypass this guard."
    }}


def main():
    try:
        host = sys.argv[1]
        if host not in ("codex", "claude"):
            raise ValueError("Expected codex or claude")
        event = json.load(sys.stdin)
        print(json.dumps(output(host, event)))
    except (ValueError, TypeError, KeyError, IndexError, AttributeError) as exc:
        print("Agent guard could not inspect input: " + str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
