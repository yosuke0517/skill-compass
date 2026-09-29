# Skill Compass agent instructions

Read `docs/agents/workflow.md` before starting development or changing agent policy.
Use `docs/LLM/README.md` to select task-specific product guidance, including design
and QA tasks. Read matching guides only; do not preload the entire directory.
The same workflow applies to Codex and Claude Code. Keep product-specific settings
in `.codex/` and `.claude/`; do not duplicate the common policy there.

When the user points out a mistake, fix and verify the current task first. Then use
`learn-rules` and `docs/agents/learn-rules.md` to assess recurrence and present an exact
proposal. Do not edit governing rules until the user approves that proposal. An
approved proposal authorizes its own branch, commit, ordinary push and rule-update
PR; it does not authorize merging, deploying, unrelated changes or force pushing.

Never force push, rewrite remote history, bypass hooks/permissions, or broaden an
allow rule to get past a rejection. State the operation, target and risk and obtain
specific approval. The Codex guard deliberately leaves a blocked force push to the
human's terminal because its Hook API cannot request native approval.

Read existing specifications and operational guides relevant to a task. Preserve
unrelated local edits and stage only named files. Do not put credentials, private
architecture documents or raw conversation transcripts into this public repository.
