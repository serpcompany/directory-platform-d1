# `serp.software` Runtime D1 Cutover Plan

This document is the canonical refactor plan for moving the public `serp.software`
directory from checked-in listing JSON and a GitHub Pages static export to runtime
Cloudflare D1 reads on Cloudflare Workers.

It supersedes the build-time D1/static-export direction described by the uncommitted
draft in `docs/PLAN.md`. That user-owned draft is preserved and reconciled only with a
prominent supersession notice; its remaining inventory is updated during the
documentation phase of this initiative.

## Decision Summary

- `serp.software` is the sole active and deployable site.
- PR #147 and the ShadcnBlocks public UI refactor are merged.
- The next initiative is a runtime D1 cutover, not a build-time D1 snapshot pipeline.
- Deploy the existing Next.js application to Cloudflare Workers with
  `@opennextjs/cloudflare`, the adapter selected by current Cloudflare guidance.
- Use one dedicated production D1 database as the canonical source for public listings
  and categories. Development and preview use separate databases and must never bind
  production.
- Keep TypeScript site configuration and MDX-authored pages file-backed.
- Keep the GitHub issue submission handoff. Approved listing and category changes are
  published through reviewed, versioned manifests and an approval-gated CI workflow.
- Remove `products.json`, `categories.json`, and generated `data/listings.json` from the
  public serving path. They remain only as temporary migration inputs until production
  parity, rollback acceptance, the agreed rollback window, and a successful D1 restore
  rehearsal.
- Payload CMS remains a later control-plane initiative.

Selected platform references, verified 2026-07-13:

- [Cloudflare Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
  documents OpenNext as the Workers adapter and recommends preview testing in the
  `workerd` runtime.
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) require query and
  schema design to account for database size, bound-parameter, subrequest, statement,
  query-duration, and single-database throughput limits.
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) provides
  point-in-time recovery through bookmarks, but a restore overwrites the database in
  place and therefore does not replace verified exports or an application rollback.

## Reconciled Repository Status

As of 2026-07-13:

- Current branch: `main`.
- PR #147, `Adopt ShadcnBlocks UI and local D1 source`, was merged as commit `42600e8`.
- Phases 0 and 1 are complete. Their detailed implementation history remains in git and
  supporting docs rather than in this execution plan.
- Phases 2 and 3 from the earlier plan are superseded. Public issue intake remains; a
  hosted operator/admin surface is not required for this cutover.
- Phase 4's source-boundary work and Phase 6's local D1 experiments are useful inputs,
  but the build-time snapshot architecture is superseded by the runtime decision.
- Phase 5's architecture decision is resolved in favor of Workers, OpenNext, and
  runtime D1.
- The old broad Phase 7 is replaced by the execution phases below.
- The old optional hosted-submission phase is deferred until the later Payload control
  plane decision.
- `apps/serp.software` is the only real site wrapper. `apps/starter` and
  `sites/default` remain non-deployable framework infrastructure.
- Shared route rendering and reusable UI live in `packages/web-core`; checked-in site
  configuration and source contracts live in `packages/site-contract`.
- The active public data path is still:

  ```text
  sites/serp.software/products.json
    -> trial-products-json adapter
    -> generated data/listings.json
    -> static Next.js export
    -> GitHub Pages repository sync
  ```

- Existing D1 migrations, conversion scripts, snapshot tooling, and tests are migration
  inputs only. Their existence does not make D1 canonical or runtime-backed.
- Existing uncommitted deletions and documentation edits, including `docs/PLAN.md`, are
  user-owned and must not be restored, overwritten, staged, or committed implicitly.

## Target Architecture and Ownership

```text
GitHub issue submission
  -> reviewed change manifest
  -> protected CI environment + explicit approval
  -> idempotent publisher
  -> canonical serp.software D1
  -> server-only async repository
  -> Next.js routes/components on Cloudflare Workers via OpenNext
```

Ownership boundaries:

- `apps/serp.software`: thin Next.js wrapper, OpenNext entry configuration, Worker
  configuration, and app-specific binding wiring.
- `packages/web-core`: shared route composition and server readers. It consumes typed
  repositories and never imports D1 bindings or SQL.
- A server-only data package or server-only app boundary: Drizzle schema, D1 repository
  implementation, row mapping, query policy, caching, and observability.
- `packages/site-contract` and `sites/serp.software`: file-backed TypeScript site
  configuration, MDX page content, and static assets. Listing/category JSON is not part
  of the target serving contract.
- CI publisher tooling: reviewed mutation authority, manifest validation, audit records,
  checksums, and cache invalidation. The runtime Worker has read-only application
  authority and no migration or publishing credentials.
- Cloudflare resources: one production D1 database dedicated to `serp.software`, plus
  isolated local and preview databases/bindings.

The public application must fail closed when a required binding is missing, a D1 query
fails, or returned data violates the repository contract. It must never silently fall
back to JSON or serve an unverified stale snapshot.

## Public Repository Interfaces

Replace synchronous `getWebsites()` and file-backed category access with server-only,
typed, asynchronous interfaces. Exact names may follow existing package conventions,
but the supported operations must include:

```ts
interface PublishedListingRepository {
  list(input: PublishedListingPageInput): Promise<PublishedListingPage>;
  listFeatured(input: PublishedListingPageInput): Promise<PublishedListingPage>;
  listLatest(input: PublishedListingPageInput): Promise<PublishedListingPage>;
  findBySlug(siteId: string, slug: string): Promise<PublishedListing | null>;
  search(input: PublishedListingSearchInput): Promise<PublishedListingPage>;
  count(input: PublishedListingCountInput): Promise<number>;
  listByCategory(input: PublishedCategoryListingInput): Promise<PublishedListingPage>;
  listRelated(input: RelatedListingInput): Promise<PublishedListing[]>;
  getAdjacent(input: AdjacentListingInput): Promise<AdjacentListings>;
  iterateForSitemap(siteId: string): AsyncIterable<PublishedListingRoute>;
  iterateForRss(siteId: string): AsyncIterable<PublishedListingFeedItem>;
  getPublicationVersion(siteId: string): Promise<string>;
}

interface PublishedCategoryRepository {
  list(siteId: string): Promise<PublishedCategory[]>;
  findBySlug(siteId: string, slug: string): Promise<PublishedCategory | null>;
  countListings(siteId: string, slug: string): Promise<number>;
}
```

All public listing queries enforce the full publication predicate inside the repository:
correct `site_id`, active listing, `status = 'approved'`, and `published_at` not null and
not in the future. Callers cannot opt out. Admin, migration, and publisher operations use
separate interfaces and credentials.

Public routes, canonical URLs, trailing slashes, rendered listing shape, metadata,
structured data, analytics attributes, search behavior, and client-side favorites must
remain unchanged.

## Target D1 Model

Use versioned SQL migrations managed through Drizzle-compatible repository tooling.
The initial runtime schema must include at least:

- `listings`
  - deterministic identity: unique `(site_id, slug)`;
  - stable internal ID separate from slug so slug changes are auditable;
  - every currently rendered listing field, including content, links, media, featured
    state, source timestamps, and publication fields;
  - `status`, `is_active`, `published_at`, and timestamps;
  - source provenance and a deterministic content checksum.
- `categories`
  - unique `(site_id, slug)`;
  - name, description, display order, activation state, and timestamps.
- `listing_categories`
  - normalized many-to-many relation;
  - uniqueness per listing/category;
  - explicit primary-category semantics with at most one primary category per listing.
- `migration_runs`
  - migration/input version, source revision, checksum, counts, timestamps, outcome,
    and error summary.
- `publication_runs`
  - manifest identity, actor/workflow provenance, input checksum, before/after
    publication version, affected records, idempotency key, outcome, and timestamps.
- `publication_state`
  - the current monotonic publication version per site for caching and reconciliation.

Add indexes based on measured query plans for:

- `(site_id, slug)` lookup;
- published ordering and pagination;
- featured and latest lists;
- category order and active-category lookup;
- category filtering through `listing_categories`;
- search fields or a proven D1-supported search strategy;
- published counts;
- related listing lookup;
- previous/next navigation.

Every migration must have forward verification and a documented rollback or roll-forward
strategy. Destructive schema cleanup happens only after compatible application code is
deployed and rollback requirements are satisfied. Bulk mutations must be batched within
current D1 limits, and query-plan evidence must demonstrate that public queries do not
degrade single-database throughput.

## Execution Plan

### Phase 7A: Freeze Contracts and Establish Baselines

Status: next. No database or deployment permission required.

1. Inventory every active listing/category reader and writer, including homepage,
   search, category, detail, metadata, JSON-LD, sitemap, RSS, layout, navigation,
   autocomplete, favorites, validation, logo maintenance, and workflows.
2. Capture route, metadata, schema, sitemap, RSS, search-index, count, ordering, and
   visual baselines from the accepted static release.
3. Define the repository interfaces, error contract, publication predicate, pagination
   contract, ordering tie-breakers, cache contract, and tenant isolation rules.
4. Record the runtime architecture decision and mark the build-time/static direction in
   `docs/PLAN.md` as superseded without discarding its useful inventory.
5. Identify every GitHub Pages/static-export assumption in Next config, build scripts,
   deploy scripts, workflows, tests, and docs.
6. Convert the current `products.json` and `categories.json` into an immutable,
   versioned migration input and record source revision and checksums without changing
   the source files.

Exit criteria:

- Every public reader and JSON writer has an owner and migration disposition.
- Baseline artifacts and deterministic ordering rules are reviewable.
- Repository and failure contracts are approved before route changes begin.
- No active behavior has changed.

### Phase 7B: Workers and OpenNext Foundation

Status: pending Phase 7A. No real deployment.

1. Add the current compatible `@opennextjs/cloudflare` and Wrangler dependencies.
2. Add OpenNext configuration and Worker configuration for assets, compatibility date,
   `nodejs_compat`, observability, and D1 bindings.
3. Define distinct local, preview, and production configurations. Configuration
   validation must reject production database IDs in local or preview environments.
4. Replace static-export-only Next behavior while preserving route and trailing-slash
   contracts.
5. Add build, preview, type-generation, and dry-run deploy scripts. Production deploy
   scripts remain approval-gated and are not executed during implementation.
6. Replace the GitHub Pages deployment contract with a Workers workflow design while
   retaining the last accepted Pages release for rollback.
7. Add missing-binding preview-runtime smoke tests that execute in `workerd`, not only
   `next dev`. Any `wrangler dev` or preview path that creates, migrates, seeds,
   restores, or queries local D1 remains a database command and requires explicit user
   permission.

Exit criteria:

- The OpenNext build succeeds.
- The missing-binding application smoke starts under local Worker preview without a
  production binding or database query.
- Static assets, redirects, canonicals, and trailing slashes match the baseline.
- No GitHub Pages sync or Worker deployment has run.

### Phase 7C: Server-Only Drizzle Repository

Status: pending Phase 7A; may proceed alongside 7B only when file ownership does not
overlap.

1. Add Drizzle ORM with the D1 driver behind a `server-only` boundary.
2. Implement the normalized schema, migrations, row mapping, repository interfaces,
   publication policy, deterministic ordering, and typed errors.
3. Resolve the D1 binding only inside the server data boundary. React components,
   route modules, and shared UI receive repository results and never access bindings or
   contain SQL.
4. Add query instrumentation for latency, rows read, errors, overloads, empty-result
   anomalies, and binding failures without logging secrets or sensitive content.
5. Add cache keys partitioned by site, query shape, category/slug, and publication
   version. Define invalidation before enabling cache reuse.
6. Implement tests with a non-database repository double and migration/schema
   inspection. Do not run a local D1 command without explicit permission.

Exit criteria:

- Unit tests cover mapping, publication filtering, pagination, ordering, search,
  category relations, malformed data, and tenant isolation.
- Contract tests prove public code cannot import bindings, Drizzle, or SQL directly.
- Missing bindings and D1 failures produce explicit fail-closed errors.
- Query and index design is checked against current D1 limits.

### Phase 7D: Convert Every Public Reader

Status: pending 7C.

1. Change listing and category access to async repository calls.
2. Update homepage, search, category, detail, metadata, JSON-LD, sitemap, RSS, layout,
   navigation, autocomplete, related listings, and previous/next readers.
3. Start independent reads together and await them as late as practical; use request
   deduplication where the same server query feeds metadata and rendering.
4. Preserve the server/client boundary. Pass only the listing fields needed by client
   search, favorites, and interactive components.
5. Remove active runtime imports of `products.json`, `categories.json`, generated
   `data/listings.json`, and `trial-products-json`. The migration converter may still
   read the immutable source input.
6. Add a temporary, explicit comparison harness outside the user response path. It may
   compare D1-shaped repository results with the migration source but may never become
   a runtime fallback.

Exit criteria:

- Contract tests enumerate every public reader and prove repository usage.
- Missing D1 data cannot silently produce a stale JSON response.
- Functional, visual, metadata, JSON-LD, sitemap, and RSS tests match the baseline.
- The build and preview runtime contain no active JSON listing/category serving path.

### Phase 7E: Deterministic Migration and Parity Proof

Status: code and artifact generation may proceed without database access; any local D1
execution is blocked on explicit permission.

1. Produce a versioned deterministic migration manifest from the current product and
   category files without modifying them.
2. Validate constraints, required fields, normalized categories, primary-category
   selection, publication eligibility, URLs, media, and checksums before emitting SQL
   or mutation batches.
3. Produce parity reports for:
   - total and published counts;
   - exact slug sets and duplicates;
   - category definitions, membership, order, and primary category;
   - every rendered field and media reference;
   - featured, active, status, and `published_at` state;
   - deterministic content hashes;
   - expected route, metadata, schema, sitemap, and RSS output.
4. Prove manifest generation is deterministic and idempotent.
5. With explicit permission, apply migrations and import only to local D1 through
   checked-in repository tooling, then repeat parity and query-plan checks.
6. Rehearse local restore only with separate explicit permission because restore is a
   destructive database operation.

Cutover blockers:

- missing or duplicate records;
- unreviewed normalization differences;
- invalid rows or publication-state leaks;
- ordering differences;
- metadata, structured-data, sitemap, RSS, route, or trailing-slash differences;
- content-hash mismatches;
- unresolved functional or visual regressions;
- query plans that exceed the accepted latency/read budget.

Exit criteria:

- Source-to-manifest parity is complete before any database write.
- If permission is granted, local D1 parity and restore rehearsal pass.
- Every accepted difference is explicit, reviewed, and covered by a test.

### Phase 7F: Preview Database and Worker Qualification

Status: blocked on separate explicit permission for non-production D1 writes and a
preview Worker deployment.

1. Create or select a non-production D1 database that cannot be mistaken for production.
2. Apply reviewed migrations and the deterministic import through least-privilege
   tooling; record the migration run and checksums.
3. Deploy a preview Worker bound only to the preview database.
4. Run route-level dual-read comparison outside the user response path.
5. Execute functional and visual parity for homepage, search, category, detail,
   autocomplete, favorites, sorting, empty states, mobile navigation, and mobile search.
6. Execute SEO parity for metadata, JSON-LD, sitemap index and children, RSS, robots,
   canonicals, redirects, and trailing slashes.
7. Test missing bindings, D1 errors, overloads, empty anomalies, malformed rows, cache
   invalidation, and stale-publication-version behavior.
8. Measure cold starts, query latency, rows read, cache hits/misses, concurrent load,
   and query plans against explicit acceptance budgets.
9. Rehearse application rollback and preview data restore; verify the old Pages release
   remains independently available.

Exit criteria:

- Preview parity has no unresolved blocker.
- Failure injection proves fail-closed behavior and useful telemetry.
- Load and query-plan results fit current D1 and Worker limits.
- Application, data, and traffic rollback runbooks have been executed in preview.

### Phase 7G: Production Cutover

Status: blocked on explicit user approval for each production database write, Worker
deployment, DNS change, and traffic cutover.

1. Provision the dedicated production D1 database and production binding through the
   approved Cloudflare account workflow.
2. Capture a verified source export, migration input checksum, and pre-write evidence.
3. Apply migrations and import through the reviewed, idempotent publisher tooling.
4. Verify counts, hashes, publication predicates, query plans, and a production Time
   Travel bookmark before serving traffic.
5. Deploy the production Worker without changing traffic; run origin-level smoke and
   parity checks where the platform permits.
6. Confirm telemetry, cache invalidation, on-call ownership, rollback authority, and
   the retained Pages release.
7. Obtain a final explicit cutover approval, then make the authorized DNS/traffic change.
8. Monitor D1 latency/errors, overloads, binding failures, result counts, cache behavior,
   route errors, SEO endpoints, and user-critical journeys throughout the rollback
   window.
9. Roll back immediately on an accepted error-budget, parity, data-integrity, or SEO
   breach. Do not use JSON fallback inside the Worker.

Exit criteria:

- Production serves runtime repository reads from the dedicated production D1 database.
- All cutover checks and approvals are recorded.
- The last accepted Pages release remains available for the agreed rollback window.
- Restore and traffic rollback remain possible and owned.

### Phase 7H: Approval-Gated Publisher and Writer Cutover

Status: may be developed before production cutover; enabling production mutation is
blocked on protected-environment approval.

1. Define typed, versioned change manifests for listing/category create, update,
   unpublish, and slug-change operations.
2. Validate manifest schema, base publication version, authorization, invariants,
   affected routes, and deterministic checksum before mutation.
3. Add an approval-gated CI publisher that:
   - uses a protected production environment and least-privilege credentials;
   - applies mutations transactionally or with a documented compensating strategy;
   - is idempotent across retries and duplicate workflow delivery;
   - records publication-run audit and before/after checksums;
   - advances the publication version only after all mutations succeed;
   - invalidates affected query, category, slug, sitemap, RSS, and version caches;
   - emits a typed, auditable result artifact.
4. Keep runtime Worker credentials read-only and unable to migrate or publish.
5. Keep the public submission form's GitHub issue handoff. Document how an approved
   issue becomes a reviewed manifest and who authorizes production publication.
6. Add unauthorized-publish, duplicate-manifest, stale-base-version, retry, partial
   failure, slug-conflict, and cache-invalidation tests.

Exit criteria:

- No human or workflow edits canonical listing/category JSON.
- Production writes require review and protected-environment approval.
- Every mutation is attributable, idempotent, reconciled, and recoverable.

### Phase 7I: Retire JSON Serving and GitHub Pages

Status: only after production parity, publisher acceptance, restore rehearsal, and the
agreed rollback window.

1. Remove `products.json`, `categories.json`, generated `data/listings.json`, the
   `trial-products-json` adapter, temporary D1 seed source, and JSON-backed runtime
   loaders from active serving and writing contracts.
2. Retain JSON only when explicitly classified as a versioned migration artifact,
   export, test fixture, disaster-recovery artifact, or protocol serialization.
3. Update build, validation, search, logo/media maintenance, workflows, submission docs,
   deployment docs, onboarding, and implementation tracking for D1-backed contracts.
4. Remove GitHub Pages repository-sync workflows and static-export-only checks only
   after the Worker deployment and rollback window are accepted.
5. Archive the accepted Pages release and its source/export evidence according to the
   retention decision.
6. Delete temporary comparison and migration-source code only after a successful D1
   restore rehearsal proves JSON is unnecessary for operational recovery.

Exit criteria:

- D1 is the sole canonical listing and category source and the sole public serving path.
- No active runtime, build, validation, or writer dependency references retired JSON.
- Workers is the documented deployment contract.
- Disaster recovery relies on verified exports, Time Travel, migrations, manifests, and
  tested application/traffic rollback rather than an application JSON fallback.

## Verification Matrix

### Unit and Schema

- Drizzle row mapping, null/malformed handling, and rendered-shape compatibility.
- Publication predicate enforcement in every public query.
- Pagination, deterministic ordering, featured/latest lists, search, counts, related,
  previous/next, category relations, and tenant isolation.
- Migration constraints, indexes, idempotency, checksums, and forward/rollback behavior.
- Manifest validation, slug changes, duplicate delivery, retries, and audit results.

### Contract and Integration

- Every public reader uses the async repository.
- No React component or route accesses SQL or Cloudflare bindings directly.
- No active runtime import references retired JSON.
- Missing bindings, D1 errors, overloads, empty anomalies, malformed data, cache
  invalidation, and stale publication versions fail closed.
- Unauthorized production publication is rejected before any mutation.

### Functional and Visual

- Homepage, search, category pages, listing details, autocomplete, favorites,
  sorting/result counts, empty states, mobile navigation, and mobile search.
- Existing routes, copy, analytics attributes, link semantics, layouts, and responsive
  behavior remain equivalent.

### SEO and Feeds

- Metadata, canonical URLs, redirects, trailing slashes, JSON-LD, robots, sitemap index
  and children, and RSS.
- Exact published slug coverage and deterministic update timestamps/order.

### Runtime and Operations

- Repository tests, typecheck, site validation, OpenNext build, and `workerd` preview
  smoke tests.
- Cold starts, query-plan and rows-read budgets, cache hit rate, concurrent load, D1
  overload behavior, and structured telemetry.
- Verified export, Time Travel bookmark, restore rehearsal, application rollback, and
  traffic rollback.

## Approval Gates and Guardrails

- Do not run any local, preview, staging, or production database command without explicit
  user permission. Generating SQL, manifests, schemas, and parity reports without
  connecting to a database is allowed.
- Local database permission does not authorize preview or production work. Preview
  permission does not authorize production work.
- Require separate explicit approval before production database creation/write,
  production Worker deployment, DNS change, or traffic cutover.
- Do not run a real deploy or GitHub Pages sync without explicit permission and completed
  gitflow. Dry-run build/package validation is allowed.
- Do not run `git add`, `git commit`, or `git push` without explicit permission.
- Preserve every existing uncommitted deletion and documentation edit. Do not restore or
  reformat user-owned files as collateral work.
- Development and preview must never bind the production D1 database. Enforce this in
  configuration validation and CI tests, not only documentation.
- Runtime bindings must not have schema migration or publishing authority.
- Never silently fall back to JSON, cached unverified data, or an empty success response.
- Keep the last accepted GitHub Pages release available throughout the agreed rollback
  window.
- Do not remove migration inputs or the temporary comparison reader until production
  parity, rollback acceptance, and a successful D1 restore rehearsal.

## Deferred Decisions

Resolve these before their corresponding phase, not by assumption:

- Workers paid/free plan and the resulting D1 size, subrequest, and Time Travel window.
- Exact database, binding, Worker, preview-environment, and custom-domain names.
- Server data package location and ownership if existing package boundaries are
  insufficient.
- Search implementation and ranking contract after representative query-plan tests.
- Cache provider, TTLs, purge mechanism, and accepted staleness/error budgets.
- Pagination shape and maximum page size within D1 parameter/subrequest limits.
- Production import/publisher authentication method and protected-environment reviewers.
- Monitoring destination, alert thresholds, rollback decision owner, and rollback window.
- Retention location and duration for verified exports and audit artifacts beyond the
  Time Travel window.
- When Payload CMS replaces reviewed manifests as the control plane.

None of these decisions changes the selected runtime architecture: public listing and
category reads come from D1 through a server-only repository on a Cloudflare Worker.
