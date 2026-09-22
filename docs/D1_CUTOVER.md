# D1 replacement cutover contract

This document prepares Issue #72 without granting remote authority. The checked-in
replacement templates point at `d1/drizzle/`; the currently released templates keep
pointing at immutable `d1/migrations/0001`-`0009`. The credential-free preparation
workflow and `scripts/d1-replatform-cutover.ts plan` execute no Cloudflare command.

## Required remote resources

Provisioning is a separate, explicitly approved operation. For each Site, record
redacted fingerprints for the Cloudflare account and these exact, mutually distinct
resources in its protected environment:

| Site | Preview environment | Preview resources | Production replacement resources |
| --- | --- | --- | --- |
| `serp.software` | `serp-software-preview` (new) | new Preview Worker and new Preview D1 | new replacement D1; existing Production Worker is rebound only at cutover |
| `pornvideodownloaders.com` | `pornvideodownloaders-preview` (existing) | existing Preview Worker plus a distinct replacement Preview D1 | new replacement D1; existing Production Worker is rebound only at cutover |

The protected environment must store the expected account ID, source D1 UUID/name,
replacement D1 UUID/name, and Worker name separately. Before every remote command,
read-only identity calls must prove the credential can see the expected account and
that each returned D1 UUID/name matches the registered Site and environment. Source
and replacement UUIDs and names must differ. No wildcard or inferred Site is allowed.

## Preview rehearsal

Preview accepts only a controlled fixture or an explicitly sanitized snapshot.
Sanitization must leave zero Production capability rows, notification-secret rows,
and rate-limit rows. Raw Preview capabilities are generated only for the isolated
Preview journey and never copied from Production.

The protected Preview executor, once separately reviewed and enabled, must:

1. verify account, Site, environment, source D1, replacement D1, and Worker identity;
2. retain identified source and target backups;
3. apply only `d1/drizzle/` to the empty replacement D1;
4. import the controlled or sanitized snapshot and record its SHA-256 digest;
5. verify exact per-table and whole-snapshot parity and the fresh migration ledger;
6. build and deploy the same full commit SHA against the replacement binding;
7. pass Catalog home/category/detail/search/RSS/sitemap/redirect journeys;
8. pass Submission intake/rate-limit/badge/private-preview/approval/rejection journeys;
9. repeat and prove `verified-no-op` with unchanged data checksums; and
10. rehearse the old binding rollback without deleting either database.

Seal the exact Site, full commit SHA, fresh-migration checksum, identity fingerprints,
source snapshot digest, parity, first import, repeated no-op, browser run, and rollback
run. Production rejects evidence from another Site, commit, or migration checksum.

## Production cutover

Workflow preparation never executes Production mutation. A future Production
executor requires a separate protected-environment approval and exact confirmation.
It must acquire one Site-wide mutation lock that freezes Submission, Publication,
approval, and notification writes before the final identified source snapshot. That
exact snapshot is the only authorized import input. Exact parity must pass before the
Worker binding changes.

The old D1 remains intact and read-only for at least 30 days. Record its backup
artifact, retention expiry, protected rollback operation, and responsible Maintainer.
Rollback changes only the Worker binding; it never deletes either database. Unless a
tested replay exists for every post-cutover write, Submission, Publication, approval,
and notification mutation remain frozen for the rollback window.

## Current authorization boundary

Allowed now:

```bash
pnpm d1:replatform:config:validate
pnpm d1:replatform:plan:preview
pnpm d1:replatform:plan:production
```

These commands are credential-free and non-mutating. This preparation does not
authorize `wrangler whoami`, remote D1 list/create/export/execute/migrate, Worker
deploy, GitHub environment mutation, binding changes, or Production operations.

Before remote rehearsal, the Maintainer must choose and approve the concrete SERP
Preview Worker/D1 names, Preview URL or route, Cloudflare account, protected
environment reviewer, controlled-fixture versus sanitized-snapshot policy, backup
retention, rollback-window duration, and responsible Maintainer. Confirm the same
choices independently for PVD without replacing its existing Preview identity.
