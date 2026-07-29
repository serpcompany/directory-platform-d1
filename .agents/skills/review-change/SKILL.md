---
name: review-change
description: Perform the repository’s evidence-first review loop for a substantial change. Use before completion, release, or handoff; when reviewing a diff; after a failure; or whenever architecture, D1, Cloudflare, runtime behavior, documentation, and regression risk must be checked together.
---

# Review a change

1. Read the relevant ExecPlan, architecture docs, runbooks, and closest `AGENTS.md`.
2. Inspect `git status`, the complete diff, and untracked files. Preserve unrelated
   user work.
3. Map every requested outcome and plan acceptance item to authoritative evidence.
4. Review:
   - D1-only and tenant boundaries;
   - boundary parsing and prepared statements;
   - local/preview/production identity isolation;
   - rollback and migration safety;
   - Worker compatibility;
   - tests and failure remediation;
   - docs, skills, and stale paths;
   - unnecessary abstractions or duplicated source paths.
5. Run the narrowest relevant checks while correcting findings.
6. Run `pnpm harness:fast`.
7. Exercise changed runtime behavior with Playwright or direct route checks.
8. Run `pnpm harness:check`.
9. Re-read the final diff and verify the worktree state.
10. Update the ExecPlan with commands, results, surprises, and residual risks.

Do not infer production authorization from a passing harness. Follow
`docs/DEPLOY_RUNBOOK.md` for remote actions.
