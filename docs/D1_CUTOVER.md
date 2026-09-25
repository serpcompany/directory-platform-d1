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
| `serp.software` | `serp-software-preview` (provisioned) | provisioned Preview Worker plus distinct source and replacement Preview D1 databases | new replacement D1; existing Production Worker is rebound only at cutover |
| `pornvideodownloaders.com` | `pornvideodownloaders-preview` (existing) | existing Preview Worker plus a distinct replacement Preview D1 | new replacement D1; existing Production Worker is rebound only at cutover |

The protected environment must store the expected account ID, source D1 UUID/name,
replacement D1 UUID/name, and Worker name separately. Before every remote command,
read-only identity calls must prove the credential can see the expected account and
that each returned D1 UUID/name matches the registered Site and environment. Source
and replacement UUIDs and names must differ. No wildcard or inferred Site is allowed.

### One-time PVD replacement Preview provisioning

`.github/workflows/provision-pornvideodownloaders-replacement-preview.yml` is the
only prepared executor for creating PVD's missing replacement Preview D1. It runs
only from an exact `main` commit in the protected `pornvideodownloaders-preview`
environment and requires the literal confirmation
`provision-pornvideodownloaders.com-replacement-preview`. The registry fixes the
only permitted new name as `pornvideodownloaders-replatform-preview`; the
credential-free replacement Wrangler template continues to consume its protected
name and UUID rather than embedding them.

Before creation, the workflow verifies the active token, exact account, existing
source Preview D1 UUID/name, existing Preview Worker name, clean checkout, and full
`GITHUB_SHA`. It lists every D1 database in the account and refuses a missing or
ambiguous source, a source/target alias, or any unexpected database already using
the replacement name. Only after all read-only proofs pass may it issue one D1
create request. `CLOUDFLARE_D1_PREVIEW_PLACEMENT` records the independently reviewed
source placement as `jurisdiction:<eu|fedramp|us>` or
`region:<weur|eeur|apac|oc|wnam|enam>`. An observed source jurisdiction must exactly
match that value. Cloudflare does not expose a non-jurisdiction database's primary
region through the documented D1 GET response, so the protected region value is the
source of truth and becomes the exact `primary_location_hint` on creation. An absent,
malformed, or contradictory placement stops before creation.

The first run requires both protected replacement identity values to be absent:

- `CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID`
- `CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME`

After creation, the workflow lists and reads the resource again, requires one exact
UUID/name and the observable jurisdiction when applicable, and retains a mode-`0600`
JSON receipt for 30 days. For a region-hinted database, the receipt records the
protected source region and exact successful create hint rather than claiming an
unavailable read-back field.
The receipt contains the Site, commit, account ID, source and replacement UUID/name,
region or jurisdiction, Worker name, action, and verification timestamp; it contains
no credential. The workflow does not write GitHub secrets. A Maintainer must review
the receipt and separately store the returned replacement UUID and exact registry
name in the protected environment before rehearsal.

A rerun is read-only only when both protected replacement values are supplied and
match the sole existing resource exactly. If the name already exists without those
expected values, either expected value is missing, the configured resource is absent,
or any identity/placement differs, the workflow fails closed and never creates a
duplicate. The workflow contains no SQL, migration, import, Worker deployment,
deletion, Production selection, or GitHub-environment mutation path.

## Preview rehearsal

Preview accepts only a controlled fixture or an explicitly sanitized snapshot.
Sanitization must leave zero Production capability rows, notification-secret rows,
and rate-limit rows. Raw Preview capabilities are generated only for the isolated
Preview journey and never copied from Production.

The protected Preview executor is
`.github/workflows/rehearse-d1-replatform-preview.yml`. Dispatch is inert until the
selected protected environment has its exact resources, variables, secrets, reviewer,
and `rehearse-<site>-preview` approval configured.

The rehearsal runs from exactly `refs/heads/main` after the reviewed implementation
has merged. The workflow checks out the dispatched `GITHUB_SHA`, and both identity
and release guards require that exact ref, workflow source ref, clean checkout, and
matching `HEAD`. Topic branches, tags, and pull-request merge refs cannot run this
Preview executor. Running Preview after merge is required because Production evidence
must bind to the same exact commit SHA and migration checksum; a pre-merge receipt
cannot authorize a different merge commit. Preview remains separately protected by
its Site-specific environment and confirmation.

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

Before its first protected rehearsal, SERP had no Preview Worker, and the reviewed
bootstrap exception allowed that one run to create it after proving every other
identity. That exception is now retired: both Sites require the exact existing Worker
identity and fail closed when it is missing or wrong. The run immediately repeats
preflight, deploys the checked-out reviewed commit with the legacy/source Preview D1
binding and no transient rehearsal authority,
captures the single version UUID emitted by that deploy, and reads back the active
Cloudflare deployment, sole 100-percent version, script etag, source D1 binding,
service, and exact workers.dev hostname. The active UUID must equal the captured UUID;
an unchanged, concurrent dashboard, gradual, or ambiguous deployment fails. This
observation is bound to the sealed receipt. Only then may the run install secrets or
mutate either Preview database. The later replacement-bound deployment remains a
separate gate. A failure before transient authority installation requires no remote
cleanup and records that fact without claiming manual database recovery.

The reviewed source-bound version must also prove that all six rehearsal secret names
are absent from its observed bindings. Cloudflare may preserve omitted secrets across a
normal code deploy, so matching script content alone is insufficient. Any preserved
rehearsal secret stops before bulk secret or database mutation, retains explicit manual
recovery evidence, and is never auto-accepted as a credential-free baseline. The
sealed receipt records `credentialFree: true` and the complete absent-name set.

All six transient rehearsal secrets are written to one mode-`0600` runner-temporary
JSON file, installed by one `wrangler secret bulk` operation, and removed immediately.
The workflow requires exactly one new deployment between the reviewed source-bound
deployment and the active secret-bearing deployment. That new deployment must be one
version at 100 percent, retain the exact reviewed script etag, source D1 binding,
service, and hostname, and expose all six secret binding names. Concurrent dashboard
deploys, code drift, incomplete/ambiguous bulk output, or multiple new deployments fail
before database mutation. Both deployment proofs are sealed into the Preview receipt.

Worker propagation can briefly leave the attestation route unavailable immediately
after the replacement or restoration deploy. The attestation gate creates one
run/hostname-bound token and retries only network failures, HTTP 404, and HTTP 5xx for
at most 30 seconds with bounded backoff. A successful response must still match every
Site, environment, service, hostname, commit, run, and binding-nonce field exactly.
Each fetch is aborted at the remaining overall deadline, and a response received at or
after that deadline is rejected even if it is HTTP 200. Deadline abort is a final
fail-closed timeout, not another retry. Other statuses and any 200 identity mismatch
fail immediately without retry.

Before its first approved rehearsal, SERP had no populated legacy Preview source.
That run therefore initialized the isolated source before replacement import:
it re-verifies all identities, applies only immutable `d1/migrations/0001`-`0009`,
imports the reviewed controlled public artifact, proves exact catalog/schema parity
and zero private Submission/notification/rate-limit state, repeats the import to prove
the checksum path is a no-op, and retains the populated rollback backup. The original
empty/pre-bootstrap export is retained separately. For PVD or a repeated SERP run, a
populated source is verified before any migration command; an exact checksum is a
safe no-op, while partial schema, different catalog state, or private rows stop before
mutation rather than being overwritten. The replacement target remains distinct and
empty (or an exact trusted prior receipt) until its fresh-history import.

PVD's pre-rehearsal source contains one historical Preview-only submission, its one
event, and one rate-limit fingerprint while every public/audit table, legacy schema,
migration ledger, and Site identity matches the reviewed controlled fixture. The PVD
path may sanitize only that exact `1/1/1` graph. It first retains and uploads the
source backup, re-verifies the full remote identity, writes a mode-`0600` recovery
journal, and then sends one transactional D1 batch containing three ID-bound deletes
with one-row assertions. Submission children or notifications, a linked Listing,
another Site/status, broader private counts, public/audit drift, schema drift, or an
unretained/stale backup stop before deletion. A rerun over the exact sanitized fixture
is a verified no-op; an uncertain response is re-observed and retried only when the
same exact graph remains. The reviewed opaque full-row digests identify the historical
graph without committing its private content; every delete predicate binds every
observed column so a between-check-and-delete change rolls back the batch. The sealed
Preview receipt records the `sanitized-snapshot` policy, backup digest, before/after
snapshot checksums, reviewed table digests, journal/result digests, and exact deleted
row identities. Production and local databases are not selectable.

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
`REPLATFORM_PREVIEW_CAPABILITY`, and that short-lived HMAC capability matches the
current run and Preview hostname. It exposes no database or review operation. The
journey creates isolated rows, verifies the badge, hydrates the private preview,
exercises the shared approval and rejection plans, and removes only its recorded
generated IDs. Read-only source/target snapshots before, after, and after cleanup
supply the parity, ledger, deletion-safety, and private-row counts in the sealed
receipt; the evidence builder contains no success defaults.

The replacement Preview template enables Cloudflare's
`global_fetch_strictly_public` compatibility flag so the badge verifier exercises
the real public `workers.dev` fixture URL. Replacement Production templates do not
enable that Preview-only self-fetch capability.

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
authority removal; the same token must return 404 after secret/marker deletion. This
distinguishes real revocation from an invalid probe.

## Production cutover

Workflow preparation never executes Production mutation. A future Production
executor requires a separate protected-environment approval and exact confirmation.
It must acquire one Site-wide mutation lock that freezes Submission, Publication,
approval, and notification writes before the final identified source snapshot. That
exact snapshot is the only authorized import input. Exact parity must pass before the
Worker binding changes.

Stage 1 lock enforcement is implemented independently of that future executor. The
lock is an active reserved `migration_runs` row with ID prefix
`d1-cutover-lock-v1:<site>:`. Public write batches, protected publication and
submission decisions, notification delivery, and generic Production migration/import
all fail closed while it is active. Production D1 workflows for a Site share the
same `<site>-production-d1` concurrency group. This enforcement does not itself
create a lock or authorize a Production cutover.

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
Separately, an explicitly approved dispatch of the exact-main PVD provisioning
workflow authorizes only its read-only identity calls and single missing replacement
Preview D1 creation described above. It does not authorize a local equivalent or any
subsequent schema/data/Worker operation.

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
