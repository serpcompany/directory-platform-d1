# Build and Release Pipeline

The active `serp.software` and `pornvideodownloaders.com` applications are distinct
Next.js Workers built with `@opennextjs/cloudflare`. Each queries its own Cloudflare
D1 database at runtime. There is no JSON serving fallback and no GitHub Pages artifact
sync in either release path.

## Ownership

- `scripts/site-targets.ts`: exhaustive executable site and release identities.
- `sites/<site-id>/site-config.ts`: checked-in application configuration.
- `configs/wrangler/<site-id>/*.jsonc`: checked-in Worker and D1 binding templates.
- `packages/content/data/**/*.mdx`: file-authored documentation and legal content.
- `d1/drizzle/`: fresh Drizzle-generated D1 history for replacement databases;
  `d1/migrations/0001`-`0009` remains immutable current-database history until cutover.
- `d1/artifacts/`: deterministic initial migration and parity evidence.
- `listing_submissions` and child tables: private, badge-gated public intake.
- `d1/publications/`: approved, versioned mutation manifests.
- `packages/data-ops/`: shared catalog DTOs, query SQL, hydration, caching contracts,
  and safe query telemetry for every current and future site.
- `apps/<site-id>/lib/catalog/`: thin server-only adapter that validates and supplies
  the site's explicit D1 binding and identity to `packages/data-ops/`; it owns no
  catalog SQL.

No catalog JSON inputs exist. Runtime, build, search, sitemap, RSS, and writer paths
must remain D1-only.

## Validate and build

```bash
pnpm worker:config:validate
pnpm test:d1
pnpm typecheck
pnpm worker:build
```

The OpenNext build emits one `.open-next/worker.js` and asset set under each app.
Both sites have separate local and production Wrangler identities and bindings.
PVD also has separate preview configuration. SERP's `serp-software-preview`
replacement template is prepared but remains unprovisioned. Configuration validation
rejects cross-environment and cross-site references. Release tooling materializes
ignored environment-specific configuration
under `.wrangler/generated/` and rebases Worker, asset, schema, and migration paths
relative to that generated configuration.

Replacement templates are separate `replatform-*.jsonc` files and point only at
`d1/drizzle/`. They do not replace released templates before protected cutover. See
[the replacement cutover contract](./D1_CUTOVER.md).

## Protected production release

`main` is protected. Changes arrive through pull requests whose strict required
checks must pass on a revision current with `main`; conversations must be resolved,
and direct pushes, force pushes, and branch deletion are prohibited. The repository
does not require another approving reviewer because it has one Maintainer.

Merging a pull request triggers a read-only full-harness validation of the integrated
`main` revision. Production release remains manual after that merge; updating `main`
does not deploy a Worker. Use the site-specific protected workflow from the reviewed
`main` commit:

| Site | Workflow | Protected production environment |
| --- | --- | --- |
| `serp.software` | `.github/workflows/build-and-deploy.yml` | `production` |
| `pornvideodownloaders.com` | `deploy-pornvideodownloaders.yml` | `pornvideodownloaders-production` |

The dispatcher chooses:

- `worker-only` only when the reviewed commit requires no unapplied migration; or
- `database-and-worker` for a new migration, a possibly lagging database, or any case
  where compatibility cannot be established.

Both modes validate configuration, tests, types, and the Worker build. Immediately
before deployment, the guarded `check-schema` command reads applied migration names
from the exact remote target and fails closed if every checked-in migration cannot be
proven present. A Worker-only run performs no D1 mutation.

The database-and-Worker mode retains a D1 export, applies migrations, idempotently
imports the initial catalog only when publication state is empty, verifies exact
publication checksum/version/count/slug parity, verifies schema compatibility, and
only then deploys the OpenNext Worker. See
[the deploy runbook](./DEPLOY_RUNBOOK.md) for release-mode selection, smoke coverage,
D1 analytics evidence, and rollback thresholds.

No production command is authorized from a dirty local worktree.

## Verified submission approval

Each public form writes normalized staging rows to its site's D1. Server-side badge
verification makes a submission reviewable but not public. A maintainer runs the
protected `approve-d1-submission.yml` workflow, which retains a backup and atomically
promotes only a verified row.

`notify-d1-submissions.yml` polls both active sites' badge-verified rows every five
minutes and creates an assigned issue in the private repository. The D1 notification
ledger prevents duplicates and lets an interrupted issue-create/write sequence
recover by marker. The issue is closed only after the protected approval workflow
has successfully approved or declined the authoritative D1 row.

Maintainer-authored catalog changes still use a versioned manifest under
`d1/publications/` and `.github/workflows/publish-d1.yml`, with an explicit registered
site and that site's protected production environment.

The publisher enforces tenant identity, base version, prior checksum, record/category
invariants, stable IDs, idempotency, and audit rows. The next checksum is derived from
the reviewed manifest source rather than trusted caller input.

## Local D1 guard

All local D1 commands pass through `scripts/d1-local-guard.ts --site <site-id>`, which
resolves the registered local Worker name, database name, synthetic database ID,
config path, state directory, and `--local` flag. Convenience aliases select a site
explicitly. Local permission never authorizes preview or production access.
