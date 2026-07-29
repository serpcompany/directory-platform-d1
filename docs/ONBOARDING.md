# Maintainer onboarding

`serp.software` is the only application and deployable site in this repository.

Start with `AGENTS.md`, then read `ARCHITECTURE.md`, `DATA_MODEL.md`, and
`DEVELOPMENT.md`. Checked-in site settings live in
`sites/serp.software/site-config.ts`; catalog data lives only in D1.

Schema work belongs in `d1/migrations/`. Reviewed intake proposals belong in
`d1/proposals/`, and approved mutations belong in `d1/publications/`. Never create a
starter/default site, catalog file, source adapter, or file-backed fallback.
