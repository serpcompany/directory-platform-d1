# Directory Platform D1

Cloudflare Worker platform for directory-style sites.

The current model is:

- checked-in site config under `sites/**`
- runtime listing and category reads from Cloudflare D1
- an OpenNext build for the active Next.js Worker
- protected, approval-gated D1 migration, publication, backup, and Worker release flows

## Quick start

Use Node `24` and `pnpm`.

```bash
pnpm install
pnpm dev
```

That starts the only active site wrapper, `serp.software`, at `http://localhost:3005`.

If you want the starter wrapper specifically:

```bash
pnpm dev:starter
```

To scaffold a new thin site wrapper app:

```bash
pnpm generate:site-wrapper -- --site your-site-id
```

## Core commands

Active Worker:

```bash
pnpm worker:config:validate
pnpm test:d1
pnpm worker:build
```

`serp.software` is the only active, deployable site in this repository. The starter
wrapper and default config remain non-deployable framework infrastructure.

Starter wrapper:

```bash
pnpm validate:site -- --site default
pnpm build:site -- --site default
```

Useful repo checks:

```bash
pnpm test:repo
pnpm --dir apps/starter exec jest --runInBand
```

## Current source of truth

- site config: `sites/site-config.default.ts` plus `sites/<site-id>/site-config.ts`
- optional site-owned content: `sites/<site-id>/site-content.ts`
- active listing/category source: the `serp.software` Cloudflare D1 database
- D1 schema: `d1/migrations/*.sql`
- reviewed intake proposals: `d1/proposals/*.yaml`
- approved publication manifests: `d1/publications/*.yaml`
- deterministic initial migration evidence: `d1/artifacts/`
- public docs content: `packages/content/data/docs/*.mdx`
- legal content: `packages/content/data/legal/*.mdx`

## Key docs

- [Current Plan](./docs/PLAN.md)
- [Onboarding Notes](./docs/ONBOARDING.md)
- [Build Pipeline](./docs/BUILD_PIPELINE.md)
- [Rebrand Runbook](./docs/REBRAND_RUNBOOK.md)
- [Deploy Runbook](./docs/DEPLOY_RUNBOOK.md)
- [Site Config Notes](./docs/knowledge/site-config.md)
- [Static Starter Notes](./docs/knowledge/static-starter-notes.md)

## Current product boundaries

In scope now:

- runtime directory pages on Cloudflare Workers
- optional docs, posts, and network pages
- GitHub-issue-based submit flow
- deterministic OpenNext build and protected Worker release

Out of scope for the active starter:

- hosted auth
- runtime moderation dashboards
- dynamic user accounts as a core build dependency

## Legacy/reference material

This repo still contains some legacy/reference areas from the earlier product direction.

Use [Legacy Reference Boundary](./docs/knowledge/legacy-reference-boundary.md) for the keep/move/rewrite decisions on:

- `packages/content/data/websites/**`
- `apps/e2e/playwright-report/**`
- `apps/e2e/test-results/**`
- `websites/**`
- `_archive/**`

The Playwright source under `apps/e2e/tests/**` remains active coverage.
The areas above are not the active starter contract unless explicitly called out in the docs above.
