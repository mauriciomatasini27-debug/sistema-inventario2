# pstack model configuration (OpenCode adaptation of setup-pstack)
# budget: small (free tier). OpenCode's Task tool selects a subagent by `subagent_type`, not by model slug.
# Wherever a pstack skill says "pass model X to a Task subagent", dispatch the OpenCode subagent named below instead.
# Per-skill/agent models and fallback order live in .opencode/modelos-por-skill.json (ADR-0109); .opencode/modelos.mjs resolves them and warns + logs to .opencode/modelos-caidos.log on fallback.
# pstack-worker: opencode-go/deepseek-v4.1-flash. pstack-judge: opencode-go/kimi-k2.7-code (different family for cross-judging). Primaries are OpenCode Go (zero-retention paid endpoints by default, docs/console/go/#privacy); free Zen models are the fallback chain; models that may train on data are last-resort only.
# Merge gate: npm run verify (Node 22, PG A/B) + node scripts/cadena/puede-mergear.mjs <PR> exit 0; GitHub Actions manual-only (ADR-0086).
feature, refactoring: pstack-worker
bug-fix: pstack-worker
perf-issue: pstack-worker
hillclimb: pstack-worker
judgment and prose: pstack-judge
hardest tasks: pstack-judge
how explorer: pstack-worker
how explainer: pstack-judge
why investigators: pstack-worker
why synthesizer: pstack-judge
reflect tooling: pstack-worker
reflect judgment, divergent, synthesizer: pstack-judge
arena runners: pstack-worker, pstack-judge
arena cross-judge pool: pstack-judge
swarm workers: pstack-worker
architect runners: pstack-worker, pstack-judge
interrogate reviewers: pstack-worker, pstack-judge
# Cursor-only tools: AskQuestion -> OpenCode `question` tool or plain text; generalPurpose -> `general` subagent.
