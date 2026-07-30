# Share and optimize catalog data operations

Status: completed locally — publication and remote migration remain unauthorized  
Owner: repository data architecture and Cloudflare D1 query operations  
Created: 2026-07-30  
Last updated: 2026-07-30

## Purpose and big picture

Move the duplicated D1 catalog repositories for `serp.software` and
`pornvideodownloaders.com` into one shared `packages/data-ops/` workspace. Every
current and future site will use the same explicitly site-bound operations, summary
and detail projections, indexed navigation, related-listing ranking, shell-count
cache policy, and query telemetry. Adding a site must instantiate this package with
that site's validated identity and D1 binding; it must not copy SQL.

Visitors should see the same catalog, ordering, redirects, related results,
navigation boundaries, pagination, search behavior, and empty states. Operators
should be able to attribute each D1 statement's `rows_read`, `rows_written`, latency,
stable query shape, operation, and site without recording SQL bindings, content,
credentials, or visitor identifiers.

This work also performs the explicitly requested workspace identity migration:
every live package name, dependency, import, TypeScript path, transpilation entry,
component alias, root dependency, and lockfile key moves from the retired fork scope
to `@serpdirectory/*`. The new package is `@serpdirectory/data-ops`.

No Worker is deployed. No remote D1 database is read, migrated, imported, or
otherwise mutated. No Worker identity, target mapping, protected environment,
Wrangler authority, or release confirmation changes.

## Context and orientation

The repository starts this plan at commit
`c980a55b28bd564cd7a14ccbff5bd5f7751b7d1b` on feature branch
`agent/shared-data-ops`. `main` and `origin/main` both pointed at that commit before
the branch was created. The clean baseline passed a frozen install and the full
harness in 43.1 seconds on 2026-07-30.

GitHub issue #23 is not the specification for this work. It is the closed package
cleanup that produced the starting commit. The handoff that initiated this plan is
the authoritative D1 optimization specification; issue #23 and
`docs/exec-plans/completed/package-island-cleanup.md` are predecessor context only.

Both current application repositories are byte-for-byte identical at the start:

- `apps/serp.software/lib/catalog/repository.ts`
- `apps/pornvideodownloaders.com/lib/catalog/repository.ts`

They acquire OpenNext's `DB` binding, resolve site identity through module-level
environment authority, construct SQL, hydrate the same view types, and expose the
same methods. Each site must retain a small server-only adapter at that existing path
because application code owns binding acquisition and runtime-environment checks.
The adapters will contain no catalog SQL.

The shared package will have two intentionally different surfaces:

- `@serpdirectory/data-ops/contracts` contains serializable DTOs, operation names,
  cache interfaces, telemetry interfaces, and test helpers that are safe to import
  as types.
- `@serpdirectory/data-ops/catalog` contains the server-side D1 implementation and
  the `createCatalogOperations` factory.

The package does not import OpenNext or Next.js, call `getCloudflareContext`, read
`process.env`, select a default site, or retain request state in a mutable module
global. Its required construction inputs are:

    createCatalogOperations({
      database,
      siteId,
      cache,
      observe,
      clock
    })

`database` is the already-resolved D1 binding. `siteId` is explicit and is bound to
every public query. `cache` is an injected bounded data-cache adapter. `observe`
receives safe structured query events. `clock` produces one deterministic `asOf`
timestamp per operation; queries bind that value instead of wrapping
`published_at` in `datetime(...)`, allowing the existing publication indexes to use
their time range.

The initial package scope is public catalog reads. Submission intake, private
review, publication writes, protected release tooling, and migration/import tooling
remain in their current owners. Those paths are not duplicated catalog-read
implementations and must not be pulled into this change.

The principal production evidence from 2026-07-30 is:

- previous/next navigation: 566 executions, about 2,004 rows scanned each,
  1,134,264 total;
- related listings: 225 executions, about 2,293 rows scanned each, 516,144 total;
- active category counts: 211 executions, about 1,565 rows scanned each, 330,215
  total;
- PVD catalog cardinality: 286 listings, 3 categories, 519 memberships, 138 media
  rows, 1,971 resource links, and 1,752 FAQs.

Cloudflare defines `rows_read` as rows scanned, not rows returned. The binding result
metadata is authoritative when available. Local Wrangler currently reports duration
but not `rows_read`; therefore the deterministic local benchmark will also use
SQLite's `sqlite3_stmt_scanstatus()` through `.scanstats on` and
`EXPLAIN QUERY PLAN`. The report must label those values as a local surrogate, not
as D1 billing data.

The current root layout is force-dynamic and includes authenticated header state.
This plan does not enable public full-page caching. Request-local React
deduplication, bounded cross-request shell-data caching, and HTTP response caching
remain separate mechanisms.

## Progress

- [x] 2026-07-30 22:49 JST Read repository contracts, local skills, current
  repositories, routes, schemas, indexes, publication paths, package graph, and
  authoritative current Cloudflare guidance.
- [x] 2026-07-30 22:49 JST Confirm the clean baseline with
  `pnpm install --frozen-lockfile` and `pnpm harness:check`; 43 test files and 233
  tests passed with one skipped, both Workers built, and the harness completed in
  43.1 seconds.
- [x] 2026-07-30 22:49 JST Pressure-test package authority, provenance, cache
  invalidation, future-site reuse, namespace scope, rollback, observability, and
  quantitative acceptance.
- [x] 2026-07-30 22:52 JST Repository owner delegated the technical choices after
  confirming the user-visible outcomes, shared-package boundary, complete namespace
  migration, and no-remote-effects limit; proceed with local implementation.
- [x] 2026-07-30 23:18 JST Migrated the workspace namespace to
  `@serpdirectory/*` as a mechanically
  isolated and independently validated milestone.
- [x] 2026-07-30 23:43 JST Added `@serpdirectory/data-ops`, its deterministic
  multisite fixture, legacy
  baseline query shapes, benchmark report, and contract tests.
- [x] 2026-07-30 23:43 JST Implemented request-local detail deduplication and shared
  observable query
  execution.
- [x] 2026-07-30 23:43 JST Replaced adjacency windowing and broad related/detail
  hydration with indexed,
  projection-specific operations.
- [x] 2026-07-30 23:43 JST Added version-keyed bounded shell-count caching and
  migrated both site adapters
  and route consumers.
- [x] 2026-07-30 23:28 JST Ran the repository-local review workflow, fast and full
  harnesses, both Worker builds, local route evidence, fresh migration replay, and
  final before/after report. The final full harness passed in 40.5 seconds with 43
  repository test files and 234 tests passing, one skipped.
- [ ] Publish only through a separately authorized publication workflow; pushing,
  opening a PR, merging, deploying, and remote D1 migration remain unapproved.

## Surprises and discoveries

- Observation: the handoff's issue #23 reference describes the already completed
  package/CLI cleanup, not this D1 optimization.
  Evidence: `gh issue view 23 --repo serpcompany/directory-platform-d1` returns the
  closed issue titled “Remove unused package islands and retire llmstxt-cli safely”;
  the repository has no other D1 optimization issue.
- Observation: the PVD and SERP catalog repositories are exact copies.
  Evidence: `cmp -s` exits zero.
- Observation: the existing local SERP D1 state is populated with 339 approved
  listings and publication version 1, so it can provide additional read-only query
  plan evidence without a local import.
  Evidence: direct read-only SQLite queries against the ignored local state.
- Observation: local Wrangler 4.110.0 returns query duration but omits
  `rows_read`/`rows_written`; the installed SQLite 3.51.0 has
  `ENABLE_STMT_SCANSTATUS`.
  Evidence: read-only Wrangler JSON output contains only `meta.duration`;
  `sqlite_compileoption_used('ENABLE_STMT_SCANSTATUS')` returns 1 and
  `.scanstats on` reports loop/row visits.
- Observation: a materialized shell-count table would become stale when an already
  approved future-dated listing crosses its publication time without a write.
  Evidence: eligibility includes `published_at <= now`, while publication manifests
  accept arbitrary valid datetimes and no scheduler rewrites publication state at
  eligibility time.
- Observation: the default OpenNext configurations do not provide a durable Next.js
  incremental cache binding.
  Evidence: both `open-next.config.ts` files call
  `defineCloudflareConfig()` without an incremental-cache override.
- Observation: the namespace migration affects 10 existing packages, at least 214
  files, and more than 500 live references.
  Evidence: repository-wide `rg` grouped by package and top-level path.
- Observation: the first narrower related-listing rewrite still visited 1,605 local
  scan-status rows and missed the quantitative gate.
  Evidence: the initial deterministic benchmark failed its 700-row assertion.
- Observation: selecting candidate IDs through category membership and hydrating the
  resulting bounded ID set through primary-key lookups reduced the representative
  related operation to 648 local scan-status rows.
  Evidence: the revised deterministic benchmark passes without a schema or index
  change.
- Observation: the multi-step path remained expensive for a real local listing with
  only one category because every candidate had the same score.
  Evidence: Miniflare D1 metadata reported 1,015 rows read for that related query
  before an ordering index and 10 afterward; its four-logo lookup read four more
  rows.
- Observation: SQLite scan status reports bound `VALUES` rows and temporary
  ordering rows even though they are not database table/index reads.
  Evidence: the benchmark reports only `SEARCH`/`SCAN` database access and excludes
  `candidate_ids` constant rows; this remains a labeled local surrogate, not D1
  billing metadata.
- Observation: GitHub's Ubuntu SQLite binary does not include statement scan-status
  support even though the repository's macOS development SQLite does.
  Evidence: PR #25's first Unit Tests run printed `.scanstats not available`, making
  every parsed row count zero. The portable benchmark now records unavailable row
  counts as `null`, enforces query-plan index contracts on every runner, and retains
  strict quantitative assertions whenever scan status exists.

## Decision log

- Decision: use the initiating handoff as the product/testing specification and
  record issue #23 only as predecessor context.
  Rationale: issue #23 is demonstrably the completed cleanup specification.
  Date: 2026-07-30
- Decision: create `packages/data-ops/` named `@serpdirectory/data-ops`.
  Rationale: the repository owner selected this durable shared boundary and name.
  Date: 2026-07-30
- Decision: perform a complete, alias-free migration from the retired fork package
  scope to `@serpdirectory/*`.
  Rationale: the repository owner explicitly expanded the plan to remove the stale
  fork identity everywhere, not only on the new package.
  Date: 2026-07-30
- Decision: bind a data-operations instance to an explicit database, site identity,
  observer, cache adapter, and clock.
  Rationale: this prevents hidden global authority, makes site isolation structural,
  and lets every future site reuse the same implementation.
  Date: 2026-07-30
- Decision: keep OpenNext binding acquisition and fail-closed runtime validation in
  thin app adapters; keep SQL exclusively in `packages/data-ops/`.
  Rationale: application code owns runtime authority while the shared package owns
  portable query behavior.
  Date: 2026-07-30
- Decision: separate summary/card, search, feed/sitemap, navigation, related-card,
  and detail DTOs and query projections.
  Rationale: list routes must not hydrate content, resource links, FAQs, full media,
  or other detail-only fields.
  Date: 2026-07-30
- Decision: replace the adjacency window with bounded indexed seek branches that
  preserve `published_at DESC, display_order ASC, slug ASC` and exact null behavior
  at both ends.
  Rationale: `LAG`/`LEAD` computes the full eligible order before selecting one slug.
  Date: 2026-07-30
- Decision: resolve the current listing's category IDs first, then rank only
  index-reachable candidates by shared-category count with an explicit slug
  tie-break after the current shared-count and name ordering.
  Rationale: this removes the broad current/candidate relationship join and makes
  ranking deterministic without changing non-tied results.
  Date: 2026-07-30
- Decision: cache the combined shell category/featured-count DTO for 60 seconds
  under a key containing `siteId`, operation schema version, and
  `publication_state.version`.
  Rationale: a publication changes the key immediately; TTL bounds time-based
  eligibility staleness and cache propagation; the cache can be disabled without a
  schema rollback.
  Date: 2026-07-30
- Decision: use React `cache` only in each server adapter to deduplicate the same
  slug detail operation between metadata generation and page rendering.
  Rationale: request-local deduplication belongs to the Next application boundary and
  is distinct from the cross-request shell cache.
  Date: 2026-07-30
- Decision: emit one structured event for every D1 statement with a stable query
  shape ID rather than raw SQL.
  Rationale: operators need attribution while SQL text, bindings, content,
  credentials, and visitor data are unnecessary and unsafe.
  Date: 2026-07-30
- Decision: force the existing `listing_categories_category_idx` for related
  candidate selection.
  Rationale: SQLite planner versions made different choices for the same fixture;
  the explicit index preserves the reviewed category-first access path without
  adding another index.
  Date: 2026-07-30
- Decision: add one partial `(site_id, name, slug)` index for eligible public
  related-listing ranking after local D1 metadata proved existing indexes
  insufficient.
  Rationale: the initial index-free one-category operation read 1,015 rows because
  D1 had to visit and sort the full candidate set. The partial index lets the
  operation walk exact deterministic ranking order and stop after four category
  matches while excluding draft, inactive, and unpublished rows. The migration is
  authored and tested locally only; applying it remotely remains separately
  authorized.
  Date: 2026-07-30
- Decision: treat confirmation of the outcome and delegation of advanced technical
  choices as approval for local implementation.
  Rationale: the repository owner explicitly stated the technical plan was too
  advanced for them to adjudicate after separately confirming the package location,
  namespace scope, reuse goal, and cache direction. The agent remains accountable for
  the quantitative and safety gates in this plan.
  Date: 2026-07-30

## Plan of work

### Milestone 1: establish identity and benchmark contracts

First, mechanically rename all workspace package identities and references from the
retired fork scope to `@serpdirectory`. Regenerate the lockfile from unchanged
dependency versions. Add a repository guard that fails if the retired scope returns
in a tracked live file. Run frozen installation, package listing, typecheck, focused
guard tests, both Worker builds, and the full harness before mixing in query changes.

Then add `packages/data-ops/` with explicit exports, package-local TypeScript
configuration, and a deterministic fixture containing two sites in the same SQLite
database. Each site fixture has at least 320 listings, ordering ties, three active
categories, multiple memberships, logos and other media, detail resources, FAQs,
featured and non-featured rows, draft/inactive/future rows, redirects, and empty
categories. IDs and timestamps are fixed.

The benchmark keeps test-only copies of the legacy hotspot query shapes. It produces
a checked-in compact JSON or Markdown report containing fixture cardinality,
operation/query shape, result count, statement count, elapsed harness time,
`EXPLAIN QUERY PLAN`, and scan-status loop/row visits. It must clearly label scan
status as the local safe equivalent. The runtime operation observer separately
captures genuine D1 metadata when the binding supplies it.

### Milestone 2: shared factory, observability, and request deduplication

Implement DTOs and `createCatalogOperations`. Centralize eligibility SQL, prepared
binding, result validation, first-row handling, batching/chunking, and telemetry.
Every public operation binds both the instance's `siteId` and one `asOf` timestamp.
The executor uses result-returning methods that preserve D1 metadata rather than
discarding metadata through `.first()`.

Telemetry events contain:

    {
      event: "d1_query",
      operation,
      queryShape,
      siteId,
      success,
      rowsRead,
      rowsWritten,
      d1DurationMs,
      wallDurationMs,
      resultRows
    }

Unavailable metadata fields are `null`, never fabricated. Error events omit SQL,
bindings, visitor/request IDs, content, credentials, and raw D1 messages.

Create thin site adapters that obtain and validate `DB` and `D1_RUNTIME_ENV`, resolve
the active site explicitly, inject the cache and structured observer, and delegate to
the package. Wrap the detail adapter function in React `cache`. Prove that two calls
for the same slug within a render invoke one underlying operation, while different
slugs and different requests do not collide.

### Milestone 3: indexed navigation and narrower related results

Implement previous and next lookups as bounded seek branches around the already-read
current ordering tuple. Each branch uses equality/range predicates aligned with
`listings_publication_idx`, selects only navigation fields and an optional logo, and
returns `null` at the corresponding boundary. Test duplicate publication dates,
duplicate display orders, slug tie-breaking, first and last entries, ineligible
neighbors, missing slugs, and both sites.

Implement related selection as:

1. read the current listing's ordered active category IDs through
   `listing_categories_listing_order_idx`;
2. scan candidates reachable through `listing_categories_category_idx`;
3. apply explicit site/eligibility predicates;
4. rank by shared-category count descending, name ascending, and slug ascending;
5. hydrate only related-card fields and logo for the first four rows.

The new operation must preserve the current top-four results wherever the existing
ordering is defined, add deterministic slug behavior only for equal count/equal
name ties, exclude the current listing and all ineligible/cross-site rows, and return
an empty array when no related candidate exists.

### Milestone 4: projection-specific hydration

Replace the generic full-object loader with projection-specific operations:

- listing summary/card: card text, category membership, publication/featured flags,
  and logo only;
- pagination result: summaries plus validated total;
- related card: related fields plus logo only;
- navigation: navigation fields plus logo only;
- feed/sitemap: only fields used by those serializers;
- autocomplete/search result: only its declared search and display fields;
- detail: full detail fields, active categories, full media, and resource links.

List, home, category, featured, favorite, search-result, and autocomplete card paths
must not query `listing_resource_links`, `listing_faqs`, non-logo media, or listing
`content` unless a separately named search projection proves that field is used.
Tests inspect stable query-shape ownership rather than brittle raw SQL snapshots.

Migrate route consumers away from the ambiguous `getWebsites()` full-object API.
Keep compatibility wrappers only while a milestone is incomplete; remove them before
final acceptance so future routes must select an intentional operation.

### Milestone 5: shell counts and both-site migration

Combine active category counts and featured count into one `CatalogShellStats` DTO.
The app adapter first reads the indexed publication version, then checks an injected
Cloudflare Cache API adapter using a site/version/schema key. On miss it runs the
count operation, stores the validated DTO for 60 seconds, and returns it. Cache
read/write failure falls back to D1 and emits safe cache state; it never fails the
page or returns another site's data.

Update both root layouts to request the combined DTO once. Use request-local
deduplication for other consumers in the same render. Contract tests prove warm hit,
cold miss, TTL expiry, publication-version invalidation, cache corruption fallback,
cache unavailability, and strict site namespace isolation.

Migrate both app adapters and every public route consumer to the shared operations.
Delete all SQL and hydration logic from both app repository files. Update
`docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/DATA_MODEL.md`, `AGENTS.md`, and
both app `AGENTS.md` files to describe the thin-adapter/shared-operation boundary and
future-site rule.

### Milestone 6: final evidence and review

Run focused package tests and benchmark, fast and full harnesses, frozen install,
package graph validation, both Worker builds, local route/runtime evidence where the
seeded state permits it, and repository-local `review-change`.

Compare the final benchmark report with the frozen legacy query shapes. Read the
complete diff. Confirm no changes under Worker target identities, checked-in
Wrangler authority, protected environment/confirmation contracts, remote workflows,
or the external `retirement-evidence` record.

Move this plan to `completed/` only after all local acceptance criteria have evidence.
Clean-runner CI evidence and publication remain separate. Do not push or open a PR
without the normal publication authorization.

## Concrete commands

Run all commands from:

    /Users/devin/dev/repos/json-project-folder/directory-platform-d1

Baseline already recorded:

    git status --short --branch
    git rev-parse HEAD
    pnpm install --frozen-lockfile
    pnpm -r list --depth -1
    pnpm harness:check

Expected baseline: clean `main` at `c980a55b...`; 14 workspaces; frozen install
passes; full harness passes in 43.1 seconds.

Namespace milestone:

    # Search for the retired fork scope; expect no results.
    pnpm install
    pnpm install --frozen-lockfile
    pnpm -r list --depth -1
    pnpm exec vitest run scripts/architecture-guard.test.ts
    pnpm typecheck
    pnpm worker:build
    pnpm harness:check

Expected: `rg` returns no live tracked occurrence; every shared/config package is
listed under `@serpdirectory/*`; both Workers and the full harness pass.

Focused data-operations loop (exact test filenames may be refined in this living
plan when created, but the package command remains stable):

    pnpm --filter @serpdirectory/data-ops test
    pnpm --filter @serpdirectory/data-ops benchmark
    pnpm harness:fast

Expected: parity, isolation, ordering, navigation, related, projection, pagination,
cache, and telemetry contracts pass; benchmark exits zero and writes only its
declared report.

Query-plan inspection uses the deterministic fixture and the installed SQLite CLI:

    sqlite3 -cmd '.scanstats on' -cmd '.eqp on' <fixture.sqlite> < benchmark.sql

Expected: adjacency plans use bounded index searches and do not materialize a
full-catalog window; related plans enter through category/listing indexes; output
contains scan-status `loops` and `rows`.

Final:

    pnpm install --frozen-lockfile
    pnpm --filter @serpdirectory/data-ops test
    pnpm --filter @serpdirectory/data-ops benchmark
    pnpm harness:fast
    pnpm harness:check
    pnpm worker:build
    git diff --check
    # Search for the retired fork scope and adjacency windows; expect no live-code results.

Expected: all commands exit zero; no retired package scope or adjacency window
remains in live code; the repeated generated OpenNext duplicate-`options` warning may
appear but remains non-failing and out of scope.

The repository-local review workflow supplies its own exact commands after its
`SKILL.md` is read at the final milestone.

## Validation and acceptance

Quantitative acceptance is:

- Adjacency: genuine D1 evidence, when available, is at most 100 `rows_read` per
  execution and at least 90% below the production baseline of about 2,004. Local
  acceptance additionally requires bounded index searches, no window/materialized
  full-order plan, and scan-status rows at or below 100 on the representative
  fixture.
- Related listings: genuine D1 evidence, when available, is at most 700 `rows_read`
  and at least 65% below about 2,293. Local scan-status rows are at or below 700 on
  the representative fixture.
- Shell counts: a warm-cache render reads at most 10 D1 rows (normally only the
  indexed publication-state lookup). Across one cold request and 99 warm requests,
  the average is at most 25 rows per render. The test also proves a maximum
  60-second stale interval for time-only eligibility changes.
- Listing-card routes execute zero query shapes against resource links, FAQs, or
  non-logo media and do not select listing `content`.
- Detail metadata plus page rendering invokes one shared detail operation for a
  slug and uses at most 10 D1 statements on a warm-shell request.
- The deterministic benchmark suite completes within five seconds locally.
- The final full harness on the same runner completes within 25% of the 43.1-second
  baseline, or any regression is investigated and explicitly approved before
  completion.

Functional acceptance is:

- PVD and SERP use the same data-operations implementation; neither app repository
  contains SQL.
- A mixed-site fixture proves no operation or cache key can return another site's
  listings, categories, counts, redirect, navigation, or related result.
- Summary/detail contracts preserve all fields their route consumers use.
- Exact catalog ordering remains
  `published_at DESC, display_order ASC, slug ASC`.
- Pagination clamps current bounds, reports the correct total, and preserves empty
  and beyond-last-page behavior.
- Redirects resolve only eligible same-site listings.
- Related results preserve current ranking for defined ties and use the explicit
  slug tie-break for previously ambiguous equal-name ties.
- Previous and next are correct for middle, first, last, equal-date/equal-order,
  ineligible-neighbor, and singleton catalogs.
- Cache tests prove cold/warm behavior, version invalidation, TTL expiration,
  corruption/failure fallback, and site isolation.
- Query events expose operation, shape, site, rows read/written, D1 and wall latency,
  success, and result count without SQL, bindings, bodies, credentials, or visitor
  identifiers.
- A repository search finds no live tracked retired-scope occurrence and a guard
  prevents reintroduction.
- Frozen install, package graph, full harness, and both OpenNext Worker builds pass.

Evidence artifacts record before/after scan surrogate, D1 statement count per
representative home/category/detail route, benchmark timing, harness timing, and
eventual clean-runner CI timing. Remote post-deployment D1 metadata is a later
operational validation and is not fabricated or obtained during this plan.

## Idempotence and recovery

Frozen install, lint, typecheck, tests, benchmark fixture generation, query-plan
inspection, Worker builds, and read-only review are safe to repeat. Fixture and
benchmark outputs are deterministic; regeneration must produce no diff.

The namespace migration is its own milestone and should be its own commit if
publication is later authorized. It can be reverted independently from data
operations. No compatibility aliases are retained; a partial namespace migration is
not an acceptable pause point. If it fails, restore the whole mechanical milestone
through Git rather than adding dual identities.

The app adapters can roll back to their prior repositories without changing D1
schema or data. The shell cache can be disabled by injecting the no-cache adapter;
failure already falls back to live D1. Versioned cache keys make old entries
unreachable after publication or cache-schema changes and TTL removes them without
purge authority.

Migration `0009_related_listing_name_index.sql` is approved only as local source. It
can be rolled back before publication with `DROP INDEX listings_related_name_idx`;
once remotely applied, rollback would require a separately reviewed forward
migration. Never apply it remotely as part of this work.

No recovery step may deploy a Worker, alter Worker identity, mutate a remote D1
database, touch `retirement-evidence`, weaken CI, or use destructive Git commands.

## Interfaces and dependencies

Required package interfaces:

    type CatalogOperationsConfig = {
      database: D1Database
      siteId: ActiveCheckedInSiteId
      cache: CatalogDataCache
      observe: (event: CatalogQueryEvent | CatalogCacheEvent) => void
      clock: () => Date
    }

    createCatalogOperations(config): CatalogOperations

    CatalogOperations = {
      getListingDetail(slug)
      getCanonicalSlugForRedirect(oldSlug)
      listPublishedSummaries(page)
      listCategorySummaries(categorySlug, page)
      listFeaturedSummaries(limit)
      searchSummaries(query, limit)
      listAutocomplete(query, limit)
      listSitemapEntries()
      listFeedEntries()
      getCatalogShellStats()
      getPublicationVersion()
    }

Exact names may be refined during implementation, but the explicit site-bound
factory, projection separation, cache/observer injection, and absence of framework
authority are acceptance contracts.

Dependencies:

- `@serpdirectory/site-contract` supplies the checked-in active-site type and
  validation boundary.
- Cloudflare's `D1Database` binding is injected; the package never calls the REST
  API.
- `@cloudflare/workers-types` supplies compile-time binding/result metadata types.
- React `cache`, OpenNext context, Cloudflare Cache API, and structured `console`
  logging stay in server-only app adapters.
- Vitest, Node 24, SQLite 3.51 scan status, the existing D1 schema/artifacts, and the
  repository harness supply local proof.

No new remote binding, KV namespace, R2 bucket, Durable Object, Worker, database, or
third-party service is introduced.

## Important artifacts

- This active ExecPlan is the resumption source of truth.
- `docs/exec-plans/completed/package-island-cleanup.md` records the predecessor
  package cleanup.
- The initiating handoff records production D1 hotspot measurements from
  2026-07-30.
- Cloudflare D1 metrics documentation defines row counts as rows scanned and
  provides per-query binding metadata.
- Cloudflare D1 pricing documentation explains current plan allowances, index write
  amplification, and unchanged read-replica row billing. No billing claim is made
  without confirming the account's actual plan.
- `docs/DATA_OPS_BENCHMARK.md` records the deterministic local before/after
  benchmark and its limits.

## Outcomes and retrospective

The two duplicated site repositories are now thin, identical binding adapters over
`@serpdirectory/data-ops`. The shared package owns explicit site-bound catalog SQL,
summary/detail DTOs, indexed navigation, deterministic related ranking, shell-count
caching, safe per-statement telemetry, and a two-site contract fixture. The
architecture guard prevents SQL from returning to either app repository and prevents
the retired workspace scope from returning.

The deterministic benchmark records navigation at 4 local scan-status rows versus
1,281 for the frozen window query. Multi-category related selection records 648
versus 1,279. The partial related-name index path records 38 local scan-status rows;
on the populated local SERP D1 binding it reduced the same related query from 1,015
genuine metadata rows read to 10, plus four logo rows. Warm shell data reads one D1
row and one cold plus 99 warm requests averages 15.55 local scan-status rows.

A local OpenNext route returned 200 for home, category, and representative detail
requests. Its warm detail route executed eight D1 statements including the shell
publication-version lookup, emitted one detail-core query despite metadata and page
consumers, and completed in about 30 ms on the local runner. Both Worker builds pass.
The known generated duplicate-`options` warning remains non-failing and unchanged.

The complete workspace scope now uses `@serpdirectory/*`; frozen installation reports
15 workspaces and the retired scope has zero live occurrences. Namespace-driven
formatting was applied only because the changed-file Biome gate treats every renamed
import as changed.

Residual work is operational, not local source completion: a clean-runner PR must
record CI timing, and an authorized release must apply migration `0009` before
deploying code that names its index. Post-release read-only telemetry must confirm
production D1 row counts. No branch was pushed, no PR was opened, and no remote
Worker or D1 operation was performed.
