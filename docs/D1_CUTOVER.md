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

The protected Preview executor is
`.github/workflows/rehearse-d1-replatform-preview.yml`. Dispatch is inert until the
selected protected environment has its exact resources, variables, secrets, reviewer,
and `rehearse-<site>-preview` approval configured. It then:

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

The workflow derives the commit from trusted `GITHUB_SHA`, proves checked-out `HEAD`
matches it, and seals the complete evidence object with SHA-256. The receipt contains
the exact Site, full commit SHA, fresh-migration checksum, expected and observed
identity, controlled source digest, parity, first import, repeated no-op, browser run,
and rollback run. Production must revalidate the complete embedded Preview evidence
and match its digest to a separately configured protected value; matching only three
labels is insufficient.

For sanitized data, `copiedProduction` capability, notification-secret, and rate-limit
counts must all be zero. `previewGenerated` records separate nonnegative counts for
isolated Preview rows created by the journey itself; those are allowed and are never
represented as copied Production state.

The Submission gate uses the real replacement Preview D1 and HTTP routes. Its badge
page exists only when `D1_RUNTIME_ENV=preview`, the request carries the protected
`REPLATFORM_PREVIEW_CAPABILITY`, and the verifier User-Agent matches. It exposes no
database or review operation. The journey creates isolated rows, verifies the badge,
hydrates the private preview, exercises the shared approval and rejection plans, and
removes only its recorded generated IDs. Read-only source/target snapshots before,
after, and after cleanup supply the parity, ledger, deletion-safety, and private-row
counts in the sealed receipt; the evidence builder contains no success defaults.

The account, source D1, replacement D1, Worker service name, and live Preview hostname
are observed again immediately before each remote mutation group. Missing or unknown
`D1_RELEASE_GENERATION` in the rehearsal fails closed rather than selecting legacy.

The job generates a per-run signing secret and binding nonce, installs the required
Worker secrets only after the protected identity gate, and removes them plus the
target marker in an `always()` cleanup. Badge and attestation URLs contain only an
expiring HMAC token bound to the exact run and hostname; the reusable signing secret
is never placed in a URL or Submission row. A capability-secured Preview-only
attestation route reads the nonce through the active `DB` binding and returns the
exact Site, service, commit, run, hostname, and binding nonce. This proves the public
Preview hostname is serving the intended deployed Worker and replacement binding.

The rate-limit journey makes at most twelve bounded requests and requires a real HTTP
429. While the transient intake secret exists, unrelated Preview intake is rejected,
so the first controlled request must create exactly one fingerprint in otherwise
empty private state. The workflow records and removes only that exact fingerprint;
if any concurrent unrelated fingerprint appears, it is preserved and parity fails.
It never deletes a set inferred solely from elapsed time or a broad row-count delta.

All evidence is written beneath the runner temporary directory, never the checkout,
so repeated clean-tree identity gates remain meaningful. Final cleanup re-lists Worker
secrets to prove every transient name is absent, queries D1 to prove the binding marker
is absent, and negatively probes both temporary endpoints for HTTP 404. Any remaining
authority fails the protected workflow.

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

The Preview workflow is the only prepared remote executor. There is deliberately no
Production mutation job in either preparation workflow. A later Production executor
must consume the trusted sealed Preview receipt and implement every Production gate
above under a separate `cutover-<site>-production` approval.

Before remote rehearsal, the Maintainer must choose and approve the concrete SERP
Preview Worker/D1 names, Preview URL or route, Cloudflare account, protected
environment reviewer, backup retention, rollback-window duration, and responsible
Maintainer. The prepared executor uses controlled fixtures; a sanitized-snapshot
executor requires its own reviewed implementation. Confirm the same
choices independently for PVD without replacing its existing Preview identity.
