---
name: write-exec-plan
description: Create or maintain a self-contained living ExecPlan for substantial work in this repository. Use for architecture, D1 schema, deployment, Cloudflare resources, tenancy, package boundaries, risky changes, research spikes, or work spanning more than five related files.
---

# Write an ExecPlan

1. Read `PLANS.md` and `docs/exec-plans/template.md` completely.
2. Read `AGENTS.md` and every governing document for the affected area.
3. Inspect current code and commands; do not write a plan from chat assumptions.
4. Create `docs/exec-plans/active/<descriptive-name>.md`.
5. Make the purpose user-observable and orient a new agent to files and terminology.
6. Divide work into milestones that each leave independently testable progress.
7. Map every acceptance criterion to a command, runtime observation, or artifact.
8. Include exact working directories, commands, expected output, safe retries, and
   recovery.
9. Record decisions with rationale and dates. Append superseding decisions rather
   than deleting history.
10. Update Progress, Surprises, and Outcomes as implementation changes the facts.
11. Move the plan to `completed/` only after every requirement has authoritative
    evidence.

The plan must enable resumption from the repository alone. It never grants production
or destructive authority.
