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
     -> server-only submission repository
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
- `apps/<site-id>/lib/submissions/` owns private intake, submitter and reviewer
  capability access, rate limits, badge verification state, and the D1-backed draft
  preview mapping.
- `sites/<site-id>/` owns checked-in presentation, route, feature, and public site
  settings.
- `configs/wrangler/<site-id>/` owns checked-in local, preview, and production Worker
  templates. Ignored materialized configuration, local state, and backups remain
  grouped by lifecycle under `.wrangler/`.
- `packages/web-core/` owns reusable page/view behavior but never obtains a database
  binding directly.
- `packages/data-ops/` owns public catalog DTOs, eligibility SQL, projection-specific
  hydration, pagination, redirects, related ranking, indexed adjacency, bounded
  publication-versioned caching contracts, and safe per-statement D1 telemetry. It receives
  the database, site identity, clock, cache, and observer explicitly; it never
  imports OpenNext or selects a site from global authority.
- `d1/migrations/` owns forward schema history.
- `d1/publications/` owns reviewed ongoing catalog mutations.
- `d1/artifacts/` preserves the immutable initial bootstrap and parity evidence.
- `scripts/worker-release.ts`, `scripts/d1-submission-approver.ts`,
  `scripts/d1-submission-notifier.ts`, and protected workflows own remote release,
  review, and private admin-notification execution.
- `scripts/harness/` owns local feedback, runtime evidence, and worktree isolation.
- `scripts/migration/` may inspect an explicit external source but is not imported by
  runtime or build code.

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
public catalog lookup or structured-data slot. Its server-only repository reads the
normalized staging tables through `DB`, requires `verified` status and a hashed
review capability, and fails closed with the same runtime-environment checks as the
other D1 boundaries.

Every executable site selection is explicit and checked against the active-site
registry in `scripts/site-targets.ts`. Each tenant has its own app package, local
state subdirectory, production D1 resource, Worker name, route, confirmation strings,
and protected production environment. PVD also has isolated preview resources. SERP
does not yet have a proper preview path; future sites must not copy that exception.
Shared publication and submission tools bind their SQL to the selected site and
reject mismatches. Adding a third site still requires the full tenancy and isolation
work in [the migration SOP](./MIGRATION_SOP.md), not merely another `sites/`
directory.
