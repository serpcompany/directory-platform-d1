# Execution plans

An ExecPlan is a self-contained, living implementation document. It lets a fresh
agent understand the goal, current repository state, decisions, exact next action,
and proof of completion without access to the original conversation.

Use an ExecPlan when work changes architecture, authentication, D1 schema,
deployment, Cloudflare resources, tenancy, package boundaries, or more than five
related files. Also use one for multi-hour work, research spikes, or changes with
meaningful rollback risk.

Start from [`docs/exec-plans/template.md`](./docs/exec-plans/template.md). Put an
in-progress plan in `docs/exec-plans/active/<descriptive-name>.md`. Move it to
`completed/` only after its acceptance criteria are proven.

## Requirements

Every plan must:

- explain the user-visible purpose and observable result;
- orient a reader to relevant files, terms, and constraints;
- use milestones that independently demonstrate progress;
- maintain timestamped Progress checkboxes;
- record unexpected facts in Surprises and Discoveries;
- record decisions and their rationale in Decision Log;
- state exact commands and expected observations;
- describe idempotence, recovery, and rollback;
- identify required interfaces, dependencies, and external authority;
- finish with Outcomes and Retrospective grounded in evidence.

Plans evolve as facts change. Update the plan before pausing so the next agent can
resume from it. Do not erase earlier decisions; append a superseding entry. Do not
claim a milestone is complete because code exists—record the command or runtime
observation that proves it.

An ExecPlan does not authorize production deployment, database mutation, deletion, or
other external effects. Those actions still require the permissions and confirmations
defined by the relevant runbook.
