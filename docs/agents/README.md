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
