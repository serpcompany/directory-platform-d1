# Deploy Runbook

The active `serp.software` release is an OpenNext Cloudflare Worker backed by
Cloudflare D1. GitHub Pages repo sync and local production deploys are not supported.

## Local verification

These commands do not access a remote database:

```bash
pnpm worker:config:validate
pnpm test:d1
pnpm test:repo
pnpm typecheck
pnpm worker:build
```

Local D1 migration, import, publication, verification, and preview commands require
separate database-operation approval. They are guarded by
`scripts/d1-local-guard.ts` and can target only the checked-in local D1 identity.

## Initial production release

Use `.github/workflows/build-and-deploy.yml` from `main`. The workflow requires:

- the protected `production` environment;
- the exact `deploy-serp.software-production` confirmation;
- successful configuration, D1 contract, type, and Worker build checks.

The workflow retains a pre-change D1 export, applies migrations, imports the
deterministic initial catalog only when publication state is empty, verifies exact
catalog parity, and then deploys the Worker. A failed migration, import, or
verification stops the release before Worker deployment.

Do not run production Wrangler or D1 commands from a local worktree.

## Ongoing catalog publication

Catalog changes follow a two-stage review path:

1. Submission automation creates a proposal under `d1/proposals/`.
2. A maintainer reviews it and authors a versioned manifest under
   `d1/publications/`.
3. From `main`, manually run `.github/workflows/publish-d1.yml`.
4. Enter `publish-serp.software-production` and approve the protected production
   environment.

The publication workflow retains a pre-change backup and sends the validated
manifest as one D1 batch. The publisher checks the tenant, base publication version,
prior checksum, stable IDs, slugs, categories, URLs, repeatable fields, and manifest
provenance before execution.

## Rollback

Every production mutation workflow retains the D1 export created before the change.
If rollback is required:

1. stop further publication and Worker release workflows;
2. identify the retained export from the affected workflow run;
3. review the export and intended recovery point;
4. obtain explicit production database-operation approval;
5. restore using the reviewed Cloudflare recovery procedure;
6. run exact catalog verification before resuming traffic changes or publication.

Never restore a production export merely because an application deploy failed; the
database may already contain a valid forward migration.

## Post-release checks

After an authorized production run:

- confirm the workflow’s migration, import/publication, parity, and deploy steps;
- confirm the deployed Worker uses the production `DB` binding and
  `D1_RUNTIME_ENV=production`;
- verify the home page, product detail, category, search, RSS, and sitemap routes;
- verify a legacy root product slug redirects to `/products/<slug>/`;
- retain the workflow backup for the required recovery window.

See [BUILD_PIPELINE.md](./BUILD_PIPELINE.md) for ownership and release architecture.
