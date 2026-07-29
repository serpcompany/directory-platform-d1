# SERP Software on Cloudflare D1

This repository contains the production `serp.software` application: a Next.js
OpenNext Worker whose directory catalog is stored in Cloudflare D1.

There is one catalog authority:

- runtime listings, categories, search, RSS, and sitemaps read from the `DB` binding;
- schema changes live in `d1/migrations/`;
- reviewed catalog mutations live in `d1/publications/`;
- the initial SQL bootstrap and its parity evidence live in `d1/artifacts/`.

Catalog JSON files, static search indexes, JSON import adapters, starter wrappers, and
static-directory deployment code are intentionally absent. `pnpm test:repo` enforces
that boundary.

## Local preview

Use Node 24 and pnpm:

```bash
pnpm install
pnpm d1:local:migrate
pnpm d1:local:import
pnpm d1:local:verify
pnpm dev
```

The guarded preview builds the OpenNext Worker and runs it with a local D1 database.
It cannot target preview or production Cloudflare resources.

## Verification

```bash
pnpm worker:config:validate
pnpm test:d1
pnpm test:repo
pnpm typecheck
pnpm worker:build
```

Production releases run only from protected GitHub Actions workflows on `main`.
See [Architecture](./docs/ARCHITECTURE.md), [Development](./docs/DEVELOPMENT.md),
[Data model](./docs/DATA_MODEL.md), and [Deploy runbook](./docs/DEPLOY_RUNBOOK.md).
