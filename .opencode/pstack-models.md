# pstack model configuration (OpenCode adaptation of setup-pstack)
# budget: small (free tier). OpenCode's Task tool selects a subagent by `subagent_type`, not by model slug.
# Wherever a pstack skill says "pass model X to a Task subagent", dispatch the OpenCode subagent named below instead.
# Primary: opencode/deepseek-v4.1-flash-free. Fallback order: opencode/space-bunny-free, opencode/longcat-2.5-preview-free, opencode/big-pickle (unreliable, last). muse-spark-1.3-contributor-free no longer exists in Zen.
# pstack-worker, poteto-agent, comment-sicko: opencode/deepseek-v4.1-flash-free. pstack-judge: opencode/big-pickle (different family for cross-judging).
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
poteto-mode routing target: poteto-agent
no-comments reviewer: comment-sicko
# Cursor-only tools: AskQuestion -> OpenCode `question` tool or plain text; generalPurpose -> `general` subagent.
