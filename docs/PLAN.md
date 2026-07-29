# Directory Platform D1 Plan

This is the current execution plan for `directory-platform-d1`.

Historical implementation plans remain under [`docs/superpowers/plans/`](./superpowers/plans/).
Completed work should be recorded in [`docs/IMPLEMENTATION_TRACKER.md`](./IMPLEMENTATION_TRACKER.md).

## Architecture Supersession Notice

The build-time D1/static-export direction below was drafted before the runtime hosting decision
was finalized. It is retained as implementation inventory, but its static snapshot architecture,
rejection of runtime D1 reads, and GitHub Pages end state are superseded by
[`PLAN_REFACTOR.md`](../PLAN_REFACTOR.md).

The selected direction is runtime D1 on Cloudflare Workers through `@opennextjs/cloudflare`, with
server-only asynchronous repositories and no JSON serving fallback. Use `PLAN_REFACTOR.md` as the
canonical execution plan. Reconcile the remaining build-time phase details during Phase 7A rather
than executing them as written.

## Current State

As of 2026-07-13:

- `serp.software` is the only active and deployable site in this repository.
- `apps/serp.software` is its only real site wrapper.
- `apps/starter` and `sites/default` remain non-deployable framework infrastructure.
- The original `json-directory` repository no longer owns the `serp.software` wrapper, site
  config, source data, build path, deploy path, badge assets, or submission target.
- Shared runtime and route logic lives in `packages/web-core`.
- Checked-in site contract and source resolution live in `packages/site-contract`.
- The UI and wrapper work transferred from Phase 1 is complete enough to begin the D1 initiative.
- No Payload CMS app is currently installed or scaffolded.
- `docs/IMPLEMENTATION_TRACKER.md` still describes the previous six-site repository state and must
  be reconciled when Phase 2 documentation is updated.

## Current Data Path

`serp.software` is not D1-backed yet. Its configured source is:

```text
sites/serp.software/products.json
  -> trial-products-json adapter
  -> generated data/listings.json
  -> static Next.js export
```

The checked-in product JSON is still the source of truth. The generated
`data/listings.json` file is a build interchange format consumed by the static public app.

The repository already contains the foundation for the replacement path:

- `d1/migrations/0001_public_listings.sql`
- `scripts/d1-listing-records.ts`
- `scripts/d1-local-prepare.ts`
- `scripts/d1-local-seed.ts`
- `scripts/d1-listings-snapshot.ts`
- `scripts/listing-source-adapters.ts`
- the `d1-listings` source contract with `local-d1` and `snapshot` modes
- tests for D1 record conversion, source validation, and snapshot materialization

The intended public build boundary remains:

```text
Payload CMS -> authoritative D1 public projection -> approved build snapshot
  -> generated data/listings.json -> static Next.js export
```

"Fully off JSON" for this initiative means checked-in listing JSON is no longer an active source
of truth or required seed. It does not mean eliminating JSON serialization from generated build
artifacts or API boundaries. Removing the generated interchange file would be a separate runtime
architecture change.

## Superseded Build-Time D1 Draft (Inventory Only)

### Phase 2A: Confirm the Architecture and Harden the D1 Contract

Status: next.

1. Record the architecture decision that D1 becomes the canonical public listing store while the
   static app continues to consume generated JSON at build time. Runtime D1 reads remain rejected
   unless hosting and deployment architecture are reconsidered separately.
2. Define ownership for listings, moderation status, categories, media metadata, submissions,
   generated snapshots, and rollback artifacts.
3. Rename the placeholder local database identity from `json-directory-local` to a
   repository/site-specific name and update `wrangler.jsonc`, commands, docs, and tests together.
4. Confirm that `0001_public_listings.sql` represents every field currently rendered by
   `serp.software`, including categories, content, media, resource links, feature state, status,
   and source timestamps.
5. Add adapter and migration tests for malformed rows, null fields, round trips, constraints,
   indexes, site scoping, approved-only filtering, and deterministic ordering.
6. Define snapshot provenance, schema versioning, checksums, failure behavior, and rollback format.
7. Rename or replace the misleading `d1:import` and `d1:export` aliases. They currently only run
   `d1-listings-snapshot.ts` and do not import into or export from a D1 database.
8. Add explicit parity reporting for source count, slugs, field values, category coverage,
   featured records, media, and content checksums.
9. Keep all database access behind the checked-in scripts and source adapters. Do not add direct
   database reads to public React routes.

Exit criteria:

- D1 schema and adapter tests pass without database access.
- The migration and source contracts cover the complete 339-record pilot catalog.
- The local and production database names and bindings are unambiguous.

### Phase 2B: Read-Only Migration Rehearsal

Status: pending Phase 2A; does not require database access.

1. Generate a versioned D1-format snapshot from the current `trial-products-json` source without
   writing to a database.
2. Produce a parity report covering record count, exact slug set, normalized fields, categories,
   featured records, media references, content, and checksums.
3. Record every accepted normalization difference instead of weakening parity assertions.
4. Produce and verify a rollback snapshot from the same source revision.
5. Prove repeated snapshot generation from the same normalized input is deterministic, excluding
   explicitly non-deterministic provenance timestamps from the content checksum.

Exit criteria:

- The D1 record shape represents all 339 pilot listings without missing or duplicate slugs.
- Field-level parity and accepted differences are reviewable artifacts.
- Snapshot and rollback formats are versioned and validated.

### Phase 2C: Local D1 Pilot

Status: pending Phase 2B and blocked on explicit approval to run local database commands.

1. Temporarily configure `serp.software` as `d1-listings` in `local-d1` mode with the current
   `trial-products-json` source retained only as a migration seed.
2. With explicit user approval, run the checked-in ORM/adapter workflow:
   - apply local migrations;
   - seed the local D1 projection;
   - query through `scripts/listing-source-adapters.ts`;
   - materialize the existing static build input.
3. Compare D1 output against the current source for exact slug coverage and required-field parity.
4. Run validation, typecheck, repository tests, and the complete `serp.software` static build.
5. Exercise homepage, search, category pages, listing detail pages, sitemap output, favorites,
   sorting, autocomplete, mobile search, and mobile navigation against D1-derived data.

Exit criteria:

- Local D1 is the configured listing source for the pilot.
- D1-derived output has approved-record parity with the current 339-record catalog.
- No public route reads `sites/serp.software/products.json` directly.
- The static artifact and user-visible behavior remain equivalent.

### Phase 2D: Production D1 and Build Integration

Status: pending Phase 2C and blocked on separate explicit approval for production database work.

1. Create a dedicated Cloudflare D1 database for this repository and replace the placeholder
   database ID only after the resource exists.
2. Implement real, unambiguous remote ingestion, export/backup, verification, and rollback tools.
   Production D1 changes must use reviewed repository tooling, not ad hoc Wrangler commands.
3. Choose and document the production build mechanism:
   - preferred: export approved D1 rows to a versioned build snapshot in CI; or
   - add a tested remote-D1 build adapter if direct authenticated build reads are required.
4. Configure CI secrets and least-privilege Cloudflare access without committing credentials.
5. Add a dry-run import plan, record counts, checksum evidence, and an idempotent import audit row.
6. With explicit approval, migrate the pilot data to production D1 and verify approved-only output.
7. Make CI validation and static builds consume the D1 projection instead of checked-in products.
8. Prove that the existing `d1:local:prepare` CI step is no longer a no-op and that production
   builds do not merely reseed an ephemeral database from checked-in JSON.

Exit criteria:

- Production builds obtain listings from D1 through a reproducible, authenticated build boundary.
- No developer-local Wrangler state is required by CI.
- Failed exports/imports stop the build rather than silently falling back to checked-in JSON.
- Rollback can select a previously verified D1 snapshot without restoring JSON as source of truth.

### Phase 2E: Cut Over Writers and Remove JSON Source Ownership

Status: pending production parity.

1. Redirect accepted submissions, moderation, imports, operator tooling, and media/logo maintenance
   to the reviewed D1 ingestion boundary until Payload replaces that control-plane workflow. Logo
   tooling currently rejects `d1-listings` and must be adapted or replaced before cutover.
2. Remove `sites/serp.software/products.json` from the active config and all scripts/tests that
   treat it as a source or seed.
3. Remove the temporary `seedSource` after production D1 import and rollback evidence are complete.
4. Remove importer, upgrade, logo-sync, and validation branches that exist only for the old
   `trial-products-json` pilot source, while preserving reusable framework adapters if still needed.
5. Keep generated `data/listings.json`, search indexes, and static artifacts classified as build
   outputs only; they must never become an editable source.
6. Add regression tests proving that a missing D1 export/binding fails closed and that no active
   `serp.software` configuration references checked-in listing JSON.
7. Reconcile `README.md`, `sites/README.md`, `BUILD_PIPELINE.md`, `SUBMISSION_FLOW.md`, onboarding,
   deploy guidance, and `IMPLEMENTATION_TRACKER.md` with the final source and writer boundaries.

Exit criteria:

- D1 is the sole authoritative public listing source.
- The repository contains no active JSON listing source or migration seed for `serp.software`.
- Search indexes and static pages are reproducibly generated from approved D1 records.
- Every remaining JSON writer is documented as a generated-artifact writer rather than an
  authoritative listing writer.

## Following Initiative: Payload CMS Control Plane

### Phase 3A: Acquire and Inspect the Payload Add-on

Status: not started.

The current repository documents a Payblocks/Payload concept, but the private add-on source is not
present and no Payload dependency or app exists. Before implementation:

1. Use the configured ShadcnBlocks account, extension, and MCP access to locate the exact current
   Payload/Payblocks add-on, installation requirements, license constraints, and supported versions.
2. Record an adopted/adapted/rejected mapping for its auth, admin shell, collections, media,
   moderation, and deployment assumptions.
3. Confirm whether the add-on supports Cloudflare-compatible infrastructure and D1 directly.
4. Do not claim direct D1 support until it is verified from the add-on source and official docs.

Exit criteria:

- The exact add-on source and version are available locally.
- Its runtime, database, storage, auth, and deployment requirements are documented.
- The integration boundary is approved before generated source is added.

### Phase 3B: Scaffold the CMS as a Separate App

1. Add Payload as a separate control-plane app; do not place admin/runtime dependencies in the
   public `serp.software` wrapper.
2. Model listings, categories, media, publication status, revisions, and provenance with typed
   collections and migrations.
3. Preserve `draft`, `review`, `approved`, and `rejected` workflow states.
4. Keep public D1 rows as a projection of approved CMS records, not a second independently editable
   source of truth.
5. Add role-based access, audit history, validation, preview, and media ownership before enabling
   non-developer editing.

### Phase 3C: Payload-to-D1 Projection

1. Implement an idempotent projection from approved Payload records to `public_listings`.
2. Define behavior for unpublishing, deleting, renaming slugs, category changes, and media changes.
3. Record projection runs, checksums, failures, and source revision IDs.
4. Trigger the static build only after the D1 projection commits successfully.
5. Add reconciliation that detects divergence among Payload, D1, and the generated public snapshot.

Exit criteria:

- Editors manage listings in Payload.
- Only approved records are projected to D1 and published.
- Projection and build failures are observable and recoverable.
- The GitHub issue submission flow is either integrated into CMS review or explicitly retired.

## Required Verification Per Cutover PR

- `git status --short` before and after, with every file accounted for.
- `pnpm test:repo`
- `pnpm test`
- `pnpm typecheck`
- `pnpm validate:site -- --site serp.software`
- `pnpm build:site -- --site serp.software`
- Targeted D1 adapter, migration, parity, and approved-only tests.
- Deterministic repeated builds from the same approved D1 snapshot.
- Verified export/backup and a tested rollback procedure before source removal.
- Browser checks for homepage, search, category, listing detail, empty search, autocomplete,
  favorites, sort/result count, mobile drawer, and mobile search overlay.
- No real deploy until source changes complete gitflow and the user explicitly approves deployment.
- No local, staging, or production database command without explicit user approval.

## Non-Goals During the D1 Cutover

- No additional active sites.
- No route, metadata, schema-markup, analytics, or visual redesign work unless required to preserve
  behavior during the source change.
- No direct runtime database reads from static public routes.
- No silent fallback from D1 to checked-in JSON.
- No undocumented writer may continue treating `products.json` as canonical.
- No production deploy before parity evidence and rollback procedures are reviewed.

## Ownership Model

- `apps/serp.software`: thin public static wrapper.
- future CMS app: Payload control plane and editorial workflow.
- `packages/web-core`: shared rendering, routes, and reusable UI.
- `packages/site-contract`: checked-in source contract and site resolution.
- D1: approved public listing projection and build source.
- Payload: eventual editorial source of truth.
- `data/listings.json`, search indexes, and `dist/sites/serp.software`: generated artifacts only.
