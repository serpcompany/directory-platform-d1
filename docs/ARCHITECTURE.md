# Architecture

The public application is `apps/serp.software`, built by
`@opennextjs/cloudflare` and deployed as a Cloudflare Worker.

Each request reaches the Worker with a D1 database bound as `DB`. Server components
and route handlers call the server-only catalog repository. That repository performs
prepared SQL queries and maps relational rows into the existing website view model.
There is no filesystem fallback.

```text
Browser
  -> Cloudflare Worker / Next.js routes
     -> server-only catalog/submission repositories
        -> D1 binding (DB)
           -> public catalog and private submission tables
```

The same repository supplies home/category/product pages, `/api/search`, RSS, and
sitemap inputs. Site presentation settings remain checked in at
`sites/serp.software/site-config.ts`; they do not contain catalog records.

`D1_RUNTIME_ENV` must match the intended local, preview, or production environment.
Wrangler configuration keeps those identities separate. Production commands also
require a clean `main` checkout inside an approved GitHub Actions workflow.

## Responsibility map

- `apps/serp.software/app/` adapts HTTP routes and Server Components to application
  behavior.
- `apps/serp.software/lib/catalog/` owns D1 access, public eligibility, relational
  hydration, and server-only enforcement.
- `apps/serp.software/lib/submissions/` owns private intake, capability access,
  rate limits, and badge verification state.
- `sites/serp.software/` owns checked-in presentation, route, feature, and public site
  settings.
- `packages/web-core/` owns reusable page/view behavior but never obtains a database
  binding directly.
- `d1/migrations/` owns forward schema history.
- `d1/publications/` owns reviewed ongoing catalog mutations.
- `d1/artifacts/` preserves the immutable initial bootstrap and parity evidence.
- `scripts/worker-release.ts`, `scripts/d1-submission-approver.ts`, and protected
  workflows own remote release planning and execution.
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

The repository is currently single-site outside the relational schema. Adding another
site requires the tenancy and isolation work in [the migration SOP](./MIGRATION_SOP.md),
not merely another `sites/` directory.
