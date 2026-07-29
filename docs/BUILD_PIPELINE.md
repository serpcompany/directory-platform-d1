# Build and Release Pipeline

The active `serp.software` application is a Next.js Worker built with
`@opennextjs/cloudflare`. Public listings and categories are queried from Cloudflare D1
at runtime. There is no JSON serving fallback and no GitHub Pages artifact sync in the
active release path.

## Ownership

- `sites/serp.software/site-config.ts`: checked-in application configuration.
- `packages/content/data/**/*.mdx`: file-authored documentation and legal content.
- `d1/migrations/`: versioned D1 schema.
- `d1/artifacts/`: deterministic initial migration and parity evidence.
- `listing_submissions` and child tables: private, badge-gated public intake.
- `d1/publications/`: approved, versioned mutation manifests.
- `apps/serp.software/lib/catalog/`: server-only D1 repository.

No catalog JSON inputs exist. Runtime, build, search, sitemap, RSS, and writer paths
must remain D1-only.

## Validate and build

```bash
pnpm worker:config:validate
pnpm test:d1
pnpm typecheck
pnpm worker:build
```

The OpenNext build emits `apps/serp.software/.open-next/worker.js` and its assets.
Local, preview, and production Wrangler configurations use separate identities and
bindings. Configuration validation rejects cross-environment references.

## Initial production release

`.github/workflows/build-and-deploy.yml` is manual, main-only, and protected by the
production environment. After confirmation it:

1. validates configuration, tests, types, and the Worker build;
2. retains a production D1 export as a workflow artifact;
3. applies D1 migrations;
4. idempotently imports the deterministic initial catalog when publication state is
   empty;
5. verifies exact publication checksum, version, count, and slug set;
6. deploys the OpenNext Worker.

No production command is authorized from a dirty local worktree.

## Verified submission approval

The public form writes normalized staging rows to D1. Server-side badge verification
makes a submission reviewable but not public. A maintainer runs the protected
`approve-d1-submission.yml` workflow, which retains a backup and atomically promotes
only a verified row.

`notify-d1-submissions.yml` polls badge-verified rows every five minutes and creates
an assigned issue in the private repository. The D1 notification ledger prevents
duplicates and lets an interrupted issue-create/write sequence recover by marker.
The issue is closed only after the protected approval workflow has successfully
approved or declined the authoritative D1 row.

Maintainer-authored catalog changes still use a versioned manifest under
`d1/publications/` and `.github/workflows/publish-d1.yml`.

The publisher enforces tenant identity, base version, prior checksum, record/category
invariants, stable IDs, idempotency, and audit rows. The next checksum is derived from
the reviewed manifest source rather than trusted caller input.

## Local D1 guard

All local D1 commands pass through `scripts/d1-local-guard.ts`, which pins the local
Worker name, database name, database ID, config path, and `--local` flag. Local
permission never authorizes preview or production access.
