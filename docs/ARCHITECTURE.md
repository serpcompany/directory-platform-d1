# Architecture

The public applications are `apps/serp.software` and
`apps/pornvideodownloaders.com`. Each is built by `@opennextjs/cloudflare` and
deployed as a distinct Cloudflare Worker with a distinct D1 database.

Each request reaches the Worker with a D1 database bound as `DB`. Server components
and route handlers call the server-only catalog adapter. The adapter validates the
runtime binding and site identity, then constructs the shared
`@serpdirectory/data-ops` catalog operations. The shared package performs prepared
SQL queries and maps relational rows into intentional summary and detail DTOs. There
is no filesystem fallback.

```text
Browser
  -> Cloudflare Worker / Next.js routes
     -> server-only site adapter
        -> shared catalog data operations
           -> D1 binding (DB)
              -> public catalog tables
     -> server-only submission adapter
        -> shared Submission data operations
           -> D1 binding (DB)
              -> private submission tables
```

The same repository supplies home/category/product pages, `/api/search`, RSS, and
sitemap inputs. Site presentation settings remain checked in under `sites/<site-id>/`;
they do not contain catalog records.

`D1_RUNTIME_ENV` must match the intended local, preview, or production environment.
Wrangler configuration keeps those identities separate. Production commands also
require a clean `main` checkout inside an approved GitHub Actions workflow.

## Responsibility map

- `apps/<site-id>/app/` adapts HTTP routes and Server Components to application
  behavior.
- `apps/<site-id>/lib/catalog/` owns OpenNext binding acquisition, runtime
  environment validation, explicit site selection, request-local React
  deduplication, and server-only enforcement. It contains no catalog SQL.
- `apps/<site-id>/lib/submissions/` validates the OpenNext binding/runtime
  environment and explicit Site identity, performs bounded badge HTTP verification,
  and delegates every Submission database operation to `packages/data-ops/`.
- `sites/<site-id>/` owns checked-in presentation, route, feature, and public site
  settings.
- `configs/wrangler/<site-id>/` owns checked-in local, preview, and production Worker
  templates. Ignored materialized configuration, local state, and backups remain
  grouped by lifecycle under `.wrangler/`.
- `packages/web-core/` owns reusable page/view behavior but never obtains a database
  binding directly.
- `packages/data-ops/` owns the shared Drizzle schema and injected, Site-explicit D1
  client as well as public catalog DTOs, eligibility SQL, projection-specific
  hydration, pagination, redirects, related ranking, indexed adjacency, bounded
  publication-versioned caching contracts, safe per-statement D1 telemetry, and all
  Submission intake, capability, rate-limit, verification, draft-preview, repeatable
  field, event, and notification-ledger operations. It receives the database, site
  identity, clock, cache, and observer explicitly; it never imports OpenNext or
  selects a site from global authority.
- `d1/drizzle/` owns the fresh Drizzle-generated schema history applied by Wrangler to
  replacement databases. `d1/migrations/0001`-`0009` remains immutable legacy history
  for the current database generation until the protected cutover is complete.
- `d1/publications/` owns reviewed ongoing catalog mutations.
- `d1/artifacts/` preserves the immutable initial bootstrap and parity evidence.
- `scripts/worker-release.ts`, `scripts/d1-submission-approver.ts`,
  `scripts/d1-submission-notifier.ts`, and protected workflows own remote release,
  review, and private admin-notification execution. Approval and notification
  scripts consume credential-free typed statement plans from `packages/data-ops/`;
  the protected scripts remain the only layer that acquires credentials or calls
  remote APIs.
- `scripts/harness/` owns local feedback, runtime evidence, and worktree isolation.
- `scripts/migration/` may inspect an explicit external source but is not imported by
  runtime or build code.
- `scripts/d1-replatform.ts` owns guarded, local-only transfer and exact parity
  between an explicit legacy D1 export and an empty fresh-history D1 database.

## Dependency and trust direction

```text
untrusted request / environment / migration source
  -> boundary parser
     -> precise application or migration representation
        -> repository/release operation
           -> explicit local D1 or protected remote workflow
```

Client code never imports the catalog repository. Shared view packages never acquire
Cloudflare bindings. Migration code never becomes a runtime adapter. Local tools
cannot select preview or production identities, and a local passing harness does not
authorize a remote operation.

Every current and future site uses the same `packages/data-ops/` implementation.
Adding a site requires a thin binding adapter and an explicit checked-in site
identity, not a copied repository or copied SQL. Summary/card routes use the summary
projection; only detail routes may hydrate content, full media, and resource links.
Request-local operation deduplication, publication-version-keyed cross-request
catalog data caching, and full-page HTTP caching are separate mechanisms. Public
summary arrays, completed details, and shell counts may be cached because their keys
include the explicit site and current publication version; authenticated page
responses are never inserted into that data cache.

The private admin preview route reuses the public listing-detail renderer but not its
public catalog lookup or structured-data slot. Its thin server-only adapter passes
the validated `DB` binding and Site identity to the shared Submission operations,
which read normalized staging tables, require `verified` status and a hashed review
capability, and revoke access on every terminal status.

Conditional badge verification, rejection, and approval plans create a temporary
CHECK-constrained guard inside the same D1 batch. Every compare-and-swap transition
must change exactly one expected row; a stale status, category, publication version,
or checksum violates the guard and rolls back the Listing, Submission, event,
publication-state, and audit statements together.

Every executable site selection is explicit and checked against the active-site
registry in `scripts/site-targets.ts`. Each tenant has its own app package, local
state subdirectory, production D1 resource, Worker name, route, confirmation strings,
and protected production environment. PVD also has isolated preview resources. SERP
does not yet have a proper preview path; future sites must not copy that exception.
Shared publication and submission tools bind their SQL to the selected site and
reject mismatches. Adding a third site still requires the full tenancy and isolation
work in [the migration SOP](./MIGRATION_SOP.md), not merely another `sites/`
directory.

The shared client is constructed only from an injected `D1Database` and an explicit
supported Site ID. Applications must not define a schema or construct an app-local
Drizzle client. `drizzle.config.ts` is target-neutral and credential-free: it generates
reviewable SQL in `d1/drizzle/`; Wrangler, not Drizzle push, owns migration application
and the `d1_migrations` ledger. During the replacement-database project, checked-in
Preview and Production templates continue to point at the immutable legacy history;
their protected switch to the fresh history is intentionally deferred to the cutover.
