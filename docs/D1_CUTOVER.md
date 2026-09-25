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
and `rehearse-<site>-preview` approval configured.

The rehearsal intentionally runs before merge from exactly
`refs/heads/codex/issue-72-preview-cutover`. The workflow checks out the dispatched
`GITHUB_SHA`, and both identity and release guards require that exact ref, workflow
source ref, clean checkout, and matching `HEAD`. `main`, other `codex/*` branches,
tags, and pull-request merge refs cannot run this Preview executor. This exception is
Preview-only: Production, publication, Submission approval, notification, and every
other remote mutation remain strictly protected `refs/heads/main` operations with
their independent confirmations.

The approved Preview run then:

1. verify account, Site, environment, source D1, replacement D1, and Worker identity;
2. retain identified pre-bootstrap source and empty replacement-target backups;
3. apply only `d1/drizzle/` to the empty replacement D1;
4. import the controlled or sanitized snapshot and record its SHA-256 digest;
5. verify exact per-table and whole-snapshot parity and the fresh migration ledger;
6. build and deploy the same full commit SHA against the replacement binding;
7. pass Catalog home/category/detail/search/RSS/sitemap/redirect journeys;
8. pass Submission intake/rate-limit/badge/private-preview/approval/rejection journeys;
9. repeat and prove `verified-no-op` with unchanged data checksums; and
10. rehearse the old binding rollback without deleting either database.

SERP also begins without a Preview Worker. The first protected run performs a
read-only preflight that still proves the exact account, source and replacement D1
UUID/name pairs, Site, environment, integration ref, and checked-out SHA. It may
classify a missing Worker only for the checked-in SERP bootstrap exception; PVD and
wrong existing Worker identities fail closed. The run immediately repeats preflight,
deploys the exact reviewed replacement Worker once with no transient secrets or
binding marker installed, observes the created Worker service and exact workers.dev
hostname, and switches to the normal full identity gate before any database, source,
or secret mutation. A failure before transient authority installation requires no
remote cleanup and records that fact without claiming manual database recovery.

SERP has no pre-existing populated legacy Preview source. Within this same approved
run, the workflow therefore initializes the isolated source before replacement import:
it re-verifies all identities, applies only immutable `d1/migrations/0001`-`0009`,
imports the reviewed controlled public artifact, proves exact catalog/schema parity
and zero private Submission/notification/rate-limit state, repeats the import to prove
the checksum path is a no-op, and retains the populated rollback backup. The original
empty/pre-bootstrap export is retained separately. For PVD or a repeated SERP run, a
populated source is verified before any migration command; an exact checksum is a
safe no-op, while partial schema, different catalog state, or private rows stop before
mutation rather than being overwritten. The replacement target remains distinct and
empty (or an exact trusted prior receipt) until its fresh-history import.

The immutable legacy lineage is one exported canonical filename list for
`0001`–`0009`; generation and classification fail if the directory adds, removes, or
renames any SQL file, so an accidental `0010` is never absorbed. The sealed Preview
receipt embeds the complete final classifier artifact plus its canonical SHA-256,
including exact migration names, normalized schema fingerprint, observed Site set,
unexpected-object result, and full application/audit snapshot proof. Receipt
validation recomputes that digest and cross-checks every summary field.

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

Before the first Submission write, the workflow atomically persists an external
recovery journal containing the run identity, exact Publication state, Publication
audit IDs, private-state baseline, rate fingerprints, and subsequently discovered
Submission/Listings IDs. Each phase advances that journal before the next mutation.
An idempotent recovery command consumes it after a successful journey and again from
the `always()` cleanup, covering interruption after intake, notification, approval,
rejection, or rate limiting. It restores the exact journaled Publication/audit state
and deletes only recorded or exact run-discovered rows. If intake committed before
its fingerprint could be journaled, recovery may adopt a fingerprint only when the
recorded baseline was empty, an exact run-owned Submission is discovered, and exactly
one current fingerprint exists. Zero, multiple, or preexisting/mismatched candidates
stop for manual recovery without deleting any fingerprint.

The journal also records the shared canonical digest of every application table in
both source and target before the journey. Recovery recomputes that same digest after
cleanup and may emit `recovered: true` only when source, target, and both recorded
digests match. This covers Listings, relationships, redirects, Submission children,
events, notifications, rate limits, Publication state, and audit tables—not merely a
small set of cleanup counters.

The final cleanup first performs a fresh full identity verification. If that fails,
it performs zero Cloudflare/D1 cleanup mutations, retains the journal plus a
`MANUAL_RECOVERY_REQUIRED` artifact, and fails explicitly. On a verified target it
uses one still-unexpired token to prove both temporary endpoints return 200 before
authority removal; the same token and badge-verifier User-Agent must return 404 after
secret/marker deletion. This distinguishes real revocation from an invalid probe.

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
