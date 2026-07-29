# Repository contract for coding agents

`serp.software` is a Cloudflare Worker backed by D1. D1 is the only catalog database.

## Non-negotiable architecture

- Read listings and categories through `apps/serp.software/lib/catalog/repository.ts`.
- Obtain the database only through the server-only OpenNext `DB` binding.
- Fail closed when the D1 binding or `D1_RUNTIME_ENV` is missing.
- Use prepared statements and bind all values.
- Add schema changes under `d1/migrations/`.
- Add reviewed data changes as YAML manifests under `d1/publications/`.
- Keep search, taxonomy, RSS, sitemap, and submission options derived from D1 data.

## Forbidden patterns

Do not add a catalog JSON/YAML/CSV runtime, a generated browser search-index file, a
filesystem fallback, a static-directory build, a GitHub Pages deploy path, or a
default/starter directory implementation. Do not add files named `listings.json`,
`products.json`, `categories.json`, or `search-index.json` for catalog data.

The SQL files under `d1/artifacts/` are immutable bootstrap evidence, not an authoring
format. Never regenerate them from a catalog file.

## Required checks

Run `pnpm test:repo`, `pnpm test:d1`, `pnpm typecheck`, and `pnpm worker:build` before
claiming a catalog or deployment change is complete. Production database and Worker
operations are authorized only through the protected workflows documented in
`docs/DEPLOY_RUNBOOK.md`.
