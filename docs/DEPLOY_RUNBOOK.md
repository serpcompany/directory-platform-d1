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

## Verified public submissions

Public submissions are staged in normalized D1 tables and require a successful badge
verification. `.github/workflows/notify-d1-submissions.yml` checks the production
review queue every five minutes and on manual dispatch. It creates or recovers one
private GitHub Issue, assigns the login configured in the
`SUBMISSION_REVIEWER_GITHUB_LOGIN` repository variable, and records the issue in D1.
The administrator sees pending work under the repository's assigned open Issues.

Review the submitted fields, website, and badge in that issue, then manually run
`.github/workflows/approve-d1-submission.yml` from `main` with the submission UUID and
the exact `approve-serp.software-submission-production` confirmation. The protected
workflow backs up D1, applies migrations, and promotes only a verified row while
recording publication provenance. Select `reject` to close a pending or verified
submission without publishing it. After the D1 decision succeeds, the workflow
comments on and closes the matching admin issue.

GitHub Issues are notifications only. Never edit an issue as a substitute for the D1
decision workflow, and never reconstruct a submission from issue text.

## Maintainer-authored catalog publication

Catalog changes follow a two-stage review path:

1. A maintainer authors a versioned manifest under
   `d1/publications/`.
2. From `main`, manually run `.github/workflows/publish-d1.yml`.
3. Enter `publish-serp.software-production` and approve the protected production
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
