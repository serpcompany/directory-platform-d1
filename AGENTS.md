# Repository contract for coding agents

This repository operates the production `serp.software` and `pornvideodownloaders.com` directories as isolated Next.js OpenNext Workers backed by distinct Cloudflare D1 databases. D1 is the only catalog database.

## Start here

Read in this order:

1. [Architecture](./docs/ARCHITECTURE.md) for stable responsibilities and boundaries.
2. [Data model](./docs/DATA_MODEL.md) for D1 ownership and publication rules.
3. [Development](./docs/DEVELOPMENT.md) for the local loop.
4. [Harness](./docs/HARNESS.md) for validation, runtime evidence, and worktrees.
5. [Migration SOP](./docs/MIGRATION_SOP.md) before examining a legacy JSON-directory site.
6. [Deploy runbook](./docs/DEPLOY_RUNBOOK.md) before any Cloudflare operation.

Use [PLANS.md](./PLANS.md) for architectural, schema, deployment, multisite, or multi-file work. Active plans live under `docs/exec-plans/active/`.

## Repository map

- `apps/<site-id>/`: site-specific Next.js routes and OpenNext Worker boundary.
- `apps/<site-id>/lib/catalog/`: server-only adapter that acquires and validates the
  site's D1 binding.
- `sites/<site-id>/`: checked-in presentation and route configuration.
- `configs/wrangler/<site-id>/`: checked-in local, preview, and production Worker
  templates.
- `.wrangler/generated/`: ignored, environment-specific Worker configuration
  materialized by protected release tooling.
- `d1/migrations/`: forward-only database schema changes.
- `d1/publications/`: reviewed ongoing catalog mutation manifests.
- `d1/artifacts/`: immutable initial-bootstrap and parity evidence.
- `packages/web-core/`: shared page, navigation, search, sitemap, and RSS behavior.
- `packages/data-ops/`: shared, explicitly site-bound catalog DTOs, D1 queries,
  caching contracts, and safe query telemetry.
- `scripts/harness/`: deterministic agent feedback and runtime tooling.
- `scripts/migration/`: read-only legacy source inspection.
- `scripts/site-targets.ts`: exhaustive active-site identities and release targets.
- `.agents/skills/`: progressively disclosed repeatable agent workflows.
- `docs/`: repository-local source of truth and operating procedures.

Closer `AGENTS.md` files add local rules without replacing this contract.

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues for `serpcompany/directory-platform-d1`. See [the issue-tracker instructions](./docs/agents/issue-tracker.md).

### Domain docs

This repository uses a single-context domain-doc layout: root `CONTEXT.md` plus system-wide ADRs under `docs/adr/`. See [the domain-doc instructions](./docs/agents/domain.md).

## Primary commands

- `pnpm harness:fast`: docs, architecture, D1 contracts, and type boundaries.
- `pnpm harness:check`: the full non-deployment validation loop.
- `pnpm docs:check`: documentation links, indexes, commands, and skill contracts.
- `pnpm agent:manifest`: machine-readable local runtime and binding information.
- `pnpm agent:doctor`: prerequisite and isolation diagnostics.
- `pnpm agent:dev`: logged, isolated local D1 Worker preview.
- `pnpm agent:pornvideodownloaders:dev`: second-site local Worker preview.
- `pnpm worktree:new -- <name>`: create an isolated `codex/<name>` worktree.
- `pnpm worktree:destroy -- <name>`: safely remove a registered harness worktree.
- `pnpm migration:preflight -- ...`: read-only legacy site inventory.

Default root aliases select `serp.software` explicitly. Named `*:pornvideodownloaders*` aliases select `pornvideodownloaders.com`; lower-level multisite commands require `--site <site-id>` and reject missing or unknown sites.

## When an ExecPlan is required

Create or continue an ExecPlan when work changes architecture, D1 schema, deployment, Cloudflare resources, tenancy, package boundaries, or more than five related files.
Also use one when rollback risk is meaningful or another agent must resume the work without the original conversation.

Keep Progress, Surprises, Decision Log, and Outcomes current while working. Record
exact commands, observable acceptance, idempotence, and recovery—not intended results.

## Non-negotiable architecture

- Read listings and categories through `apps/<site-id>/lib/catalog/repository.ts`;
  that adapter must delegate catalog SQL to `packages/data-ops/`.
- Add or optimize public catalog queries once in `packages/data-ops/`; never copy
  catalog SQL into a site application.
- Add every executable site to `scripts/site-targets.ts`; never infer a default.
- Obtain the database only through the server-only OpenNext `DB` binding.
- Fail closed when the D1 binding or `D1_RUNTIME_ENV` is missing or invalid.
- Parse untrusted input at its boundary and pass precise values inward.
- Use prepared statements and bind every runtime value.
- Add schema changes under `d1/migrations/`.
- Add reviewed data changes as YAML manifests under `d1/publications/`.
- Keep search, taxonomy, RSS, sitemap, and submission options derived from D1.
- Preserve each site's separate local and production identities. Preserve PVD's
  preview identity; SERP's missing preview environment is a known follow-up and must
  not be invented during unrelated work.
- Route production mutations through protected GitHub Actions only.

## Forbidden patterns

Do not add a catalog JSON/YAML/CSV runtime, generated browser search index, filesystem
fallback, static-directory build, GitHub Pages deploy path, or default/starter
directory implementation. Do not add catalog files named `listings.json`,
`products.json`, `categories.json`, or `search-index.json`.

Do not treat migration source files as application inputs. The migration preflight is
read-only and external-source-only. Never copy legacy catalog files into this repo.

The SQL under `d1/artifacts/` is immutable bootstrap evidence, not an authoring
format. Never regenerate an existing artifact from a catalog file.

## Completion contract

Run targeted checks while editing and `pnpm harness:check` before claiming a
substantial change is complete. For runtime behavior, also capture the relevant
Playwright or live-route evidence. Read the diff, preserve unrelated user changes,
and report residual risks.

Production database or Worker operations require the confirmations and protected
environments in [the deploy runbook](./docs/DEPLOY_RUNBOOK.md). A passing local
harness never grants deployment authority.

Relevant skills: [Migrate a JSON-directory site](./.agents/skills/migrate-json-directory-site/SKILL.md),
[write an ExecPlan](./.agents/skills/write-exec-plan/SKILL.md), and
[review a change](./.agents/skills/review-change/SKILL.md).
