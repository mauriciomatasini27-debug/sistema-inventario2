# pstack model configuration (OpenCode adaptation of setup-pstack)
# budget: small (free tier). OpenCode's Task tool selects a subagent by `subagent_type`, not by model slug.
# Wherever a pstack skill says "pass model X to a Task subagent", dispatch the OpenCode subagent named below instead.
# pstack-worker, poteto-agent, comment-sicko: opencode/deepseek-v4.1-flash-free (fallback opencode/muse-spark-1.3-contributor-free). pstack-judge: opencode/big-pickle (different family for cross-judging).
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
