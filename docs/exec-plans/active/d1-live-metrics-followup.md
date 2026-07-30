# Reduce deployed catalog reads using live D1 evidence

Status: active
Owner: shared catalog data operations
Created: 2026-07-31
Last updated: 2026-07-31

## Purpose and big picture

The PVD preview should preserve its current catalog results while ordinary home,
category, and detail traffic stops repeating stable broad D1 work. A maintainer can
observe the result in Cloudflare's real query analytics: warm requests use a
publication-version lookup and cached catalog DTOs, multi-category related ranking
reads a bounded number of rows, and navigation remains an indexed seek.

This is a follow-up to `docs/exec-plans/completed/shared-data-ops.md`. That change
fixed adjacency and projections, but post-deployment metrics proved that
multi-category related selection and repeated stable summary/detail operations still
consume too many rows under actual traffic.

## Context and orientation

`packages/data-ops/` owns the shared, explicitly site-bound SQL and cache contracts.
Each app adapter in `apps/<site-id>/lib/catalog/repository.ts` injects its validated
`DB` binding and a Cache API implementation. `publication_state.version` changes
when reviewed public catalog data changes, so a cache key containing the site and
publication version has explicit invalidation without caching an authenticated page.

The affected preview database is
`f92694b0-af7d-4c13-91f2-ee0393af9bdd`
(`pornvideo-downloaders-preview`) in the SERP Cloudflare account. Cloudflare plugin
access is read-only for diagnosis and result validation. Production is out of scope.
No D1 schema change is planned.

## Progress

- [x] 2026-07-31 00:29 JST Confirmed the exact preview database, indexes, catalog
  distribution, deployed query strings, and real D1 metadata through the Cloudflare
  plugin.
- [x] 2026-07-31 00:41 JST Implemented and proved shared cached published/detail
  operations and the bounded multi-category related seek. Package tests report 14
  passing tests; local scan status reports 36 multi-category related rows with no
  temporary grouping tree.
- [x] 2026-07-31 00:41 JST Ran targeted tests, PVD browser QA, the full harness, and
  the repository review workflow. PVD E2E passed 4 tests; the full harness passed 10
  gates, including 234 repository tests and both OpenNext builds.
- [ ] Publish through normal GitHub review, deploy only the PVD preview Worker, and
  compare real Cloudflare query analytics and route results.

## Surprises and discoveries

- Observation: the deployed multi-category related candidate query still reads
  1,040 rows per execution and materializes a temporary grouping tree.
  Evidence: the Cloudflare D1 API returned `rows_read: 1040`; `EXPLAIN QUERY PLAN`
  reported `USE TEMP B-TREE FOR GROUP BY`.
- Observation: an equivalent ordered seek over `listings_related_name_idx` returns
  the identical four results for a representative two-category listing in 25 rows.
  Evidence: live D1 returned the same `3movs`, `4k69`, `4kporn`, and
  `5moviesporn` ordering for the old and proposed shapes; old read 1,053 rows with
  hydration and proposed read 25.
- Observation: stable summary queries remain expensive when repeated.
  Evidence: live D1 measured 2,768 rows for all 286 summaries, 1,937 rows for 200,
  and 465 rows for 48. In the 2026-07-30 14:30–15:30 UTC analytics window, the full
  summary shape ran 19 times for 52,592 rows and the category summary shape ran 14
  times for 41,704 rows.
- Observation: query repetition, not row width, now dominates the deployed result.
  Evidence: the same one-hour window recorded 131 multi-category candidate
  executions for 136,240 rows and 179 80-ID hydration executions for 14,320 rows.
- Observation: splitting 200 summaries into base/category/logo statements did not
  materially improve cold reads.
  Evidence: live D1 measured 2,188 rows across seven chunked statements, so this
  plan prefers publication-version invalidation and bounded data caching.

## Decision log

- Decision: cache published summary arrays and completed listing details by explicit
  `siteId` and `publicationVersion`, with a one-hour retention bound and validation
  before use.
  Rationale: catalog publication versioning provides immediate logical invalidation;
  the TTL bounds orphaned entries and cache corruption exposure. This preserves
  authenticated dynamic page behavior while eliminating repeated stable D1 work.
  Date: 2026-07-31.
- Decision: derive category lists, featured lists, latest lists, RSS, and sitemap
  DTOs from the cached canonical summary array, while preserving the bounded
  page-and-count SQL for explicit pagination calls.
  Rationale: these are deterministic projections of the same ordered public
  summaries and do not need separate D1 query shapes. Explicit pagination must not
  regress from 48 summary rows to a cold full-catalog read.
  Date: 2026-07-31.
- Decision: replace multi-category candidate materialization with the live-proven
  partial-index ranking seek, without adding an index.
  Rationale: the existing index returns identical deterministic results at 25
  `rows_read` on the actual preview data versus 1,053 for the old operation.
  Date: 2026-07-31.

## Plan of work

Milestone 1 adds regression tests that model repeated calls, corrupt/missing cache
entries, publication-version invalidation, site isolation, derived list parity, and
multi-category related ordering. The benchmark must fail if the old broad candidate
shape or temporary grouping returns.

Milestone 2 implements framework-independent request deduplication inside one
catalog-operations instance, validated cross-request summary/detail cache entries,
and the ordered multi-category related seek. Site adapters remain thin and both
sites receive the behavior automatically.

Milestone 3 runs package tests and benchmark, both-site type/build tests, local PVD
route QA, the complete repository harness, and `review-change`. The plan records
actual commands and output.

Milestone 4 publishes the reviewed branch normally. After protected checks pass,
merge to `main`, run the PVD preview workflow in Worker-only mode, exercise fixed
home/category/detail routes with controlled cold/warm requests, and query Cloudflare
analytics plus D1 metadata through the plugin. Do not deploy or mutate production.

## Concrete commands

Run from `/Users/devin/dev/repos/json-project-folder/directory-platform-d1`:

    pnpm --filter @serpdirectory/data-ops test
    pnpm --filter @serpdirectory/data-ops benchmark
    pnpm harness:fast
    pnpm test:e2e:pornvideodownloaders
    pnpm harness:check

Use `.agents/skills/review-change/SKILL.md` against the complete diff. Publication
uses the normal GitHub workflow and protected checks. The PVD preview release uses
`.github/workflows/deploy-pornvideodownloaders.yml` with `environment=preview`,
the exact preview confirmation, and `release_mode=worker-only`.

## Validation and acceptance

- A representative two-category related query returns the same four slugs in the
  same order and reads at most 100 rows on live preview D1; its plan uses
  `listings_related_name_idx` and no temporary grouping.
- A cold published-summary load may execute the existing summary query once. A
  second operation instance with the same publication version returns identical
  DTOs without executing that query.
- A cold listing detail may execute detail, related, logo, and navigation statements
  once. A second operation instance returns the identical detail without those
  statements.
- Changing publication version produces a miss and fresh data; corrupt cache data
  falls back to D1; cache keys and results remain site-isolated.
- Category, featured, latest, pagination, sitemap, and full-published outputs retain
  exact ordering, boundaries, empty states, and projection fields.
- After deployment, a controlled warm home/category/detail sample issues no full
  published/category summary query and no detail/related query for cache hits.
  Warm catalog reads target at most two D1 rows per route, allowing the
  publication-version lookup and no stable aggregate/hydration work.
- The full harness, PVD E2E suite, protected PR checks, protected preview release,
  and read-only live route checks pass.

## Idempotence and recovery

Read-only Cloudflare D1 and GraphQL analytics calls are safe to repeat. Cache keys use
a new schema version, so rollback does not require cache deletion; old entries expire
and are ignored by code using a different schema. The related rewrite requires no
schema migration. Reverting the Worker commit restores the prior query behavior.

Only the protected GitHub workflow may update the preview Worker. A failed build or
deploy leaves the prior deployed version available for Cloudflare rollback.
Production Worker and D1 operations require fresh explicit authorization and are not
part of this plan.

## Interfaces and dependencies

- `CatalogDataCache` remains the injected cache boundary.
- `createCatalogOperations` owns publication-version memoization, DTO validation,
  published/detail cache orchestration, derived list operations, and SQL.
- `CatalogQueryEvent` and `catalog_cache` events remain free of bindings, content,
  credentials, and visitor identifiers.
- Both site adapters continue using generated `CloudflareEnv`, the `DB` binding,
  explicit site resolution, and `caches.open('catalog-data-ops')`.

## Important artifacts

- Prior plan: `docs/exec-plans/completed/shared-data-ops.md`
- Prior benchmark: `docs/DATA_OPS_BENCHMARK.md`
- Preview workflow baseline:
  `https://github.com/serpcompany/directory-platform-d1/actions/runs/30554865211`
- Cloudflare documentation:
  `https://developers.cloudflare.com/d1/observability/metrics-analytics/`,
  `https://developers.cloudflare.com/d1/best-practices/use-indexes/`, and
  `https://developers.cloudflare.com/workers/runtime-apis/cache/`

## Outcomes and retrospective

Pending implementation and deployed evidence.
