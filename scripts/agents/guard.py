#!/usr/bin/env python3
"""Shared advisory hooks. Never executes commands or treats text as approval."""
import json
import re
import shlex
import sys


def dangerous_push_args(args):
    return any(
        arg.startswith(("--force", "--mirror", "--delete", "+"))
        or bool(re.fullmatch(r"-[A-Za-z]*[fd][A-Za-z]*", arg))
        for arg in args
    )


def risky_command(words, depth):
    # Only executable positions count; printf/echo arguments are data.
    while words and (re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0])
                     or words[0] in ("!", "if", "then", "elif", "do", "else")):
        words = words[1:]
    if not words:
        return False
    program = words[0].rsplit("/", 1)[-1]
    args = words[1:]
    if program in ("command", "exec", "env"):
        while args:
            if args[0] in ("-u", "--unset") and program == "env":
                args = args[2:]
            elif args[0].startswith("-") or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", args[0]):
                args = args[1:]
            else:
                break
        return risky_command(args, depth)
    if program in ("sh", "bash", "zsh", "dash"):
        for i, arg in enumerate(args):
            if re.fullmatch(r"-[A-Za-z]*c[A-Za-z]*", arg):
                return i + 1 >= len(args) or risky_git(args[i + 1], depth + 1)
        return False
    if program != "git":
        return False
    while args and args[0].startswith("-"):
        option = args.pop(0)
        if option in ("-C", "-c", "--git-dir", "--work-tree"):
            if not args:
                return True
            value = args.pop(0)
            if option == "-c" and value.startswith("alias.") and "=" in value:
                alias = value.split("=", 1)[1]
                if risky_git(alias[1:] if alias.startswith("!") else "git " + alias, depth + 1):
                    return True
        elif option.startswith("-c") and "alias." in option:
            # Attached configuration syntax is left for human inspection.
            return True
    return bool(args and args[0] == "push" and dangerous_push_args(args[1:]))


def risky_git(command, depth=0):
    if depth > 16:
        return True
    # Substitutions require a shell AST to distinguish execution from quoted data.
    # Retain conservative handling for Git-looking substitutions, not a safety proof.
    if ("$(" in command or "`" in command) and "git" in command and "push" in command:
        return True
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()\n")
    lexer.whitespace = " \t\r"
    lexer.whitespace_split = True
    try:
        tokens = list(lexer)
        quoted = shlex.shlex(command, posix=False, punctuation_chars=";&|()\n")
        quoted.whitespace = " \t\r"
        quoted.whitespace_split = True
        raw_tokens = list(quoted)
    except ValueError:
        return True
    # Keep quoted separators as arguments. Unaligned tokenizations are ambiguous.
    if len(tokens) != len(raw_tokens):
        return "git" in command and "push" in command
    words = []
    for token, raw in zip(tokens + [";"], raw_tokens + [";"]):
        if token == raw and token and all(char in ";&|()\n" for char in token):
            if risky_command(words, depth):
                return True
            words = []
        else:
            words.append(token)
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
