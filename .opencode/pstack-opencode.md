# pstack on OpenCode — adaptation layer (always loaded via opencode.json "instructions")

pstack skills were written for Cursor. When a skill names a Cursor-only thing, use the OpenCode equivalent below.

## Tools
- `Task` / `generalPurpose` subagent -> OpenCode `task` tool with `subagent_type`. Use `general` for generalPurpose, `explore` for read-only search, or a pstack role agent (see "Models").
- Task `model` parameter -> not supported. Pick the role agent instead: `pstack-worker` (muse-spark-1.3-contributor-free) or `pstack-judge` (big-pickle). Different models = cross-family judging for arena/architect/interrogate/show-me-your-work.
- `AskQuestion` -> OpenCode `question` tool when it is present (interactive TUI). In `opencode run` (headless) it is absent: state the default you chose and proceed (principle-never-block-on-the-human), or ask in plain text and stop.
- `create-skill` -> write `.agents/skills/<name>/SKILL.md` with frontmatter `name: <name>` (must equal the folder name, lowercase-hyphen) and `description:`. Verify with `~/.local/bin/opencode debug skill`.
- Worktrees -> the project is a git repo; use `git worktree add ../si-wt-<slug> -b wt/<slug>` and remove it when done.

## Paths
- `~/.cursor/rules/*.mdc` (always-applied rules) -> `.opencode/*.md` listed in `opencode.json` `instructions`, or `AGENTS.md` at the project root.
- `~/.cursor/rules/pstack-models.mdc` -> `.opencode/pstack-models.md`.
- `~/.cursor/skills/`, `~/.cursor/plugins/` -> `.agents/skills/` (project) or `~/.config/opencode/skills/` (user).
- `~/.cursor/projects/*/agent-transcripts/` (used by reflect, recall, automate-me, show-me-your-work) -> OpenCode sessions:
  - list: `~/.local/bin/opencode session list --format json -n 20` (fields: id, title, created, updated, directory)
  - read one: `~/.local/bin/opencode export <sessionID>` -> JSON `{info, messages}`; each message has `parts` (text, tool calls with input/output)
  - search: `for id in $(~/.local/bin/opencode session list --format json -n 50 | jq -r '.[].id'); do ~/.local/bin/opencode export $id | jq -r '.messages[].parts[]?.text // empty' | grep -il "<term>" >/dev/null && echo $id; done`
  - raw store (only if sqlite3 is installed): SQLite `~/.local/share/opencode/opencode.db` (read-only; never write). Logs: `~/.local/share/opencode/log/`.
  - usage/cost: `~/.local/bin/opencode stats`.
  Always pass `</dev/null` to these CLI calls.

## setup-pstack on OpenCode
1. Detect models: `~/.local/bin/opencode models opencode` (Zen catalog); free ones: `opencode/muse-spark-1.3-contributor-free`, `opencode/big-pickle`.
2. Roles are subagents in `opencode.json` `agent` (`pstack-worker`, `pstack-judge`, `poteto-agent`, `comment-sicko`), each with a `model`.
3. Write the role table to `.opencode/pstack-models.md` (not `~/.cursor/rules`). Budget maps to `--variant` / agent `reasoningEffort` where the provider supports it.
4. Changes apply to new sessions. Check with `~/.local/bin/opencode debug config`.

## Running sessions
OpenCode keeps state in one SQLite DB; parallel `opencode run` processes can fail with "database is locked".
Run one at a time, or start one server and attach: `.opencode/pstack-run.sh` (see its header).
