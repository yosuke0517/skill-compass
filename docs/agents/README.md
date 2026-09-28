# Codex / Claude Code harness

Shared policy: [AGENTS.md](../../AGENTS.md), [workflow](workflow.md),
[learning from feedback](learn-rules.md), [task record](task-record-template.md).
Claude imports AGENTS.md through CLAUDE.md. Both skill entry points reference the
same protocol; a test checks that the small entry files remain identical.

## Start using it

1. Open this checkout as the project in Codex or start Claude Code from its root.
   Review and accept the product's project/hook trust prompts yourself. Restart an
   existing session after config changes. This Vault chat is a different project;
   adding files here does not activate them in this already-running Vault session.
2. Codex discovers `.agents/skills/learn-rules`; Claude discovers
   `.claude/skills/learn-rules`. Explicit invocation is `$learn-rules` in Codex and
   `/learn-rules` in Claude. Ordinary corrections are also covered by AGENTS.md and
   a UserPromptSubmit reminder. No model-based classification is claimed by the hook.
3. Codex uses `.codex/config.toml`, `.codex/rules/git-push.rules` and
   `.codex/hooks.json`. Claude uses `.claude/settings.json`. Keep private settings in
   ignored `.claude/settings.local.json`. Never enable bypass permissions to use this.
4. Run `python3 -m unittest discover -s tests/agents -v` and, if installed,
   `codex execpolicy check --rules .codex/rules/git-push.rules -- git push --force origin HEAD`.
   The latter only evaluates policy; it does not run Git or contact a remote.
5. In a new trusted session, use a disposable repository with no remote to confirm
   each product actually loads the skill and hook, and that a proposed force push
   stops/asks before execution. Do not test this against production. This live host
   acceptance check is separate from the automated hook-input and CLI-rule tests.

## First-time Codex hook trust (CLI)

Hook definitions live in this repository's `.codex/hooks.json`; the implementation
is `scripts/agents/guard.py`. Committing these files does not itself authorize their
execution. Codex separately asks the operator to review and trust the definitions.
Trusting these project hooks does not install them in every other project. Check
**Source** in the review screen to distinguish project hooks from user/plugin hooks.

The following UI was verified with Codex CLI `0.158.0-alpha.2.1` on macOS on
2026-09-28. Use the **terminal CLI**, not the Codex desktop app's chat composer or
the OS shell, for the `/hooks` command. Desktop UI and trust propagation from CLI
to desktop have not been verified.

1. In a terminal, start Codex with this checkout as its working directory (replace
   the example path with your own):

   ```sh
   codex -C /absolute/path/to/skill-compass
   ```

   If the shell says `command not found: codex`, the executable is not available
   on that shell's PATH; this does not establish that no CLI is installed. On the
   tested Mac, the app-bundled executable could be started directly:

   ```sh
   "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex" -C /absolute/path/to/skill-compass
   ```

   This bundle path is installation-specific, not a stable installation contract.
   If it does not exist, locate the installed CLI before proceeding.
2. At **Hooks need review**, select **Review hooks** and press Enter. If that
   screen does not appear, type `/hooks` inside the running Codex CLI.
3. Select **PreToolUse**, then press Enter to open its hook details. Confirm the
   Source is this checkout's `.codex/hooks.json`, the matcher is `Bash`, and the
   command invokes `scripts/agents/guard.py` with the `codex` argument. Press **t**
   to trust this reviewed hook; Esc returns to the event list.
4. Repeat for **UserPromptSubmit**, checking the same source and script. Review
   the individual definitions before using any “trust all” option: other projects
   or user/plugin configurations can expose different hooks in the same browser.
5. Confirm both events show **Installed 1 / Active 1**, with no review pending.
   The Review column may disappear when no hooks require review. Esc closes the
   browser. New or changed definitions can require another trust review.

**Active is activation evidence, not an enforcement test.** Follow the disposable-
repository acceptance check above to verify actual event firing and command
control. Record the client version, project path, event and observed result.
The operator confirmed both events Active in the CLI on 2026-09-28; this alone
is not evidence that the desktop app or a different checkout has loaded them.

## Coverage and limits

| Control | Codex | Claude Code |
| --- | --- | --- |
| Shared instructions | AGENTS.md | CLAUDE.md imports AGENTS.md |
| Recognized normal Git push | Native rule prompts | Native permission rule asks |
| Recognized force push / remote deletion | Hook denies; human performs approved operation in their own terminal | Hook requests native approval |
| Correction workflow | Shared Skill + prompt reminder | Shared Skill + prompt reminder |
| Lasting policy change | Exact proposal → user Yes → separate open PR | Same |

The guard detects common `-f`, combined short flags, `--force*`, `--mirror`,
`--delete`, `-d`, and `+refspec` forms, including quoted/nested command strings.
Compound commands are inspected separately, and literal examples passed to
`printf`/`echo` are not recursively interpreted as shell programs. Explicit shell
`-c` bodies are inspected. This remains a bounded heuristic, not a shell AST: Git-
looking command substitutions and ambiguous tokenization may still require review.
It does not interpret arbitrary programs, resolve existing Git aliases or prevent
all alternate APIs. Interactive stdin is outside its inspection. It does not grant
permission when no pattern matches; normal tool permissions continue to apply.
Repo trust, enabled hooks and the correct project root are prerequisites. Higher
priority or managed policies may override these files. A mutable repo guard is not
a substitute for server-side branch protections and restricted credentials.

Codex's documented PreToolUse API does not support `permissionDecision: ask`.
Returning it would be an error, so this adapter returns `deny` for risky commands.
There is deliberately no writable “approved=true” bypass token. A chat Yes to a
policy proposal is also not approval for a force push.

No live device/host or model-conversation result is inferred from mocked inputs.
Windows shell support is not established; the hook commands require Git and Python3
on a POSIX host. ChatGPT's ordinary web chat does not execute these repository hooks;
this setup targets Codex with repository/tool access and Claude Code.

## Sources and verification context

Checked 2026-09-27. Local tools: Codex 0.158.0-alpha.2.1; Claude Code 2.1.109.
Current web docs can describe newer features than an installed client; live loading
must still be checked on the intended client before treating it as an active guard.

- [Codex skills](https://developers.openai.com/codex/skills)
- [Codex rules](https://developers.openai.com/codex/rules)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Codex config](https://developers.openai.com/codex/config-basic)
- [Claude skills](https://code.claude.com/docs/en/skills)
- [Claude memory imports](https://code.claude.com/docs/en/memory)
- [Claude permissions](https://code.claude.com/docs/en/permissions)
- [Claude hooks](https://code.claude.com/docs/en/hooks)
