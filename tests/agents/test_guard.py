import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / "scripts/agents/guard.py"
spec = importlib.util.spec_from_file_location("guard", GUARD)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class GuardTests(unittest.TestCase):
    def test_risky_forms(self):
        commands = [
            "git push -f origin HEAD", "git push origin HEAD --force",
            "git push --force-with-lease=refs/heads/x:abc origin HEAD",
            "git push --force-if-includes origin HEAD", "git push -vf origin HEAD",
            "git push origin +HEAD:main", "git push --mirror origin",
            "git push --delete origin x", "git push -d origin x",
            "git -C /tmp push --force origin x", "/usr/bin/git push -f origin x",
            "env X=1 git push -f origin x", "git 'push' --force origin x",
            "git status && git push -f origin x", "git push -f origin x; true",
            "bash -lc 'git push --force origin x'",
            'git -c "alias.fp=push --force" fp', "git push --force 'unterminated",
        ]
        for command in commands:
            for host, decision in (("codex", "deny"), ("claude", "ask")):
                with self.subTest(command=command, host=host):
                    result = guard.output(host, {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": command}})
                    self.assertEqual(result["hookSpecificOutput"]["permissionDecision"], decision)

    def test_non_risky_commands_do_not_grant_permission(self):
        for command in ("git status", "git diff", "git push origin HEAD", "git fetch origin", "python3 -m unittest", "rm -f temporary-file"):
            with self.subTest(command=command):
                self.assertEqual(guard.output("codex", {"tool_name": "Bash", "tool_input": {"command": command}}), {})

    def test_hook_process_and_invalid_input(self):
        good = subprocess.run([sys.executable, str(GUARD), "codex"], input=json.dumps({"tool_name": "Bash", "tool_input": {"command": "git push -f origin HEAD"}}), text=True, capture_output=True)
        self.assertEqual(good.returncode, 0)
        self.assertEqual(json.loads(good.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")
        for payload in ("broken", "[]", '{"tool_name":"Bash","tool_input":{}}'):
            bad = subprocess.run([sys.executable, str(GUARD), "codex"], input=payload, text=True, capture_output=True)
            self.assertEqual(bad.returncode, 2)

    def test_prompt_reminder_never_mints_approval(self):
        for host in ("codex", "claude"):
            result = guard.output(host, {"hook_event_name": "UserPromptSubmit", "prompt": "yes"})
            self.assertEqual(set(result["hookSpecificOutput"]), {"hookEventName", "additionalContext"})

    def test_adapters_share_skill_and_hooks(self):
        self.assertEqual((ROOT / ".agents/skills/learn-rules/SKILL.md").read_text(), (ROOT / ".claude/skills/learn-rules/SKILL.md").read_text())
        for host, path in (("codex", ".codex/hooks.json"), ("claude", ".claude/settings.json")):
            config = json.loads((ROOT / path).read_text())
            self.assertEqual(config["hooks"]["PreToolUse"][0]["matcher"], "Bash")
            command = config["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
            run = subprocess.run(command, shell=True, cwd=ROOT, input=json.dumps({"tool_name": "Bash", "tool_input": {"command": "git push --force origin HEAD"}}), text=True, capture_output=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(json.loads(run.stdout)["hookSpecificOutput"]["permissionDecision"], "deny" if host == "codex" else "ask")

    @unittest.skipUnless(shutil.which("codex"), "Codex CLI not installed")
    def test_native_codex_rules(self):
        for args in (["git", "push", "origin", "HEAD"], ["git", "push", "--force", "origin", "HEAD"], ["git", "push", "origin", "+HEAD:main"], ["git", "-C", "/tmp", "push", "origin", "HEAD"], ["/usr/bin/git", "push", "origin", "HEAD"]):
            run = subprocess.run(["codex", "execpolicy", "check", "--rules", str(ROOT / ".codex/rules/git-push.rules"), "--", *args], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(json.loads(run.stdout)["decision"], "prompt")


if __name__ == "__main__":
    unittest.main()
