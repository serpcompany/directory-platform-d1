# Maintainer onboarding

`serp.software` is the only application and deployable site in this repository.

Start with [`AGENTS.md`](../AGENTS.md), then use the
[documentation index](./README.md). Read [Architecture](./ARCHITECTURE.md),
[Data model](./DATA_MODEL.md), [Development](./DEVELOPMENT.md), and
[Harness](./HARNESS.md). Checked-in site settings live in
`sites/serp.software/site-config.ts`; catalog data lives only in D1.

Schema work belongs in `d1/migrations/`. Public intake is staged in normalized D1
submission tables, and maintainer-authored mutations belong in `d1/publications/`. Never create a
starter/default site, catalog file, source adapter, or file-backed fallback.

Substantial work uses [`PLANS.md`](../PLANS.md). Future legacy site onboarding follows
the [migration SOP](./MIGRATION_SOP.md); no second site is currently enabled.
