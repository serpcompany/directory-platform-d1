# Retire the legacy JSON/static architecture for two migrated sites

Status: active  
Owner: platform and release engineering  
Created: 2026-07-30  
Last updated: 2026-07-30

## Purpose and big picture

Remove `serp.software` and `pornvideodownloaders.com` from the legacy
`serpcompany/json-directory-template` static build, GitHub Pages, badge, submission,
and sitemap-deployment authority while preserving their live OpenNext Workers, D1
data, canonical domains, and the more-specific `/brands*` Worker routes.

The observable end state is:

- the legacy source repository cannot select, build, deploy, badge-scan, accept
  submissions for, or submit sitemaps for either retired site;
- both apex hostnames continue to serve their current OpenNext Workers and both
  `www` hostnames permanently redirect to the matching apex without GitHub as an
  origin;
- the two static-output repositories have no enabled Actions, Pages, deploy
  credential path, public issue dependency, or public visibility and are archived
  only after a 14-day observation window;
- D1 identities, publication versions, checksums, public counts, Workers, Worker
  bindings, and Worker routes are unchanged except for explicitly approved Worker
  deployments that remove live issue-tracker links;
- recovery evidence is retained for 90 days.

“Retired” is reversible operational retirement. Private archived Git history is
recovery evidence; repository deletion and history rewriting are out of scope.

## Context and orientation

The two active applications live in `serpcompany/directory-platform-d1`. Each is a
Next.js OpenNext Worker backed by a distinct D1 database. The legacy source repository
is `serpcompany/json-directory-template`, checked out locally as `json-directory`.
It must continue to serve `browserextensions.io`, `serp.ai`, `serp.co`,
`serpdownloaders.com`, and every other valid registered static site.

The source checkouts and implementation worktrees are:

- D1 controlling checkout:
  `/Users/devin/dev/repos/json-project-folder/directory-platform-d1`
- D1 implementation worktree:
  `/Users/devin/dev/repos/json-project-folder/directory-platform-d1-worktrees/retire-legacy-json-static`
- legacy controlling checkout:
  `/Users/devin/dev/repos/json-project-folder/json-directory`
- legacy implementation worktree:
  `/Users/devin/dev/repos/json-project-folder/json-directory-worktrees/retire-legacy-json-static`

Fresh fetch evidence on 2026-07-30 established:

- D1 `main` and `origin/main` are
  `9b6ecf992792cb374be77f51a0000e36f231991e`.
- Legacy remote `main` is
  `0326c8acd129b10625ee31c2700d11161f60e21f`.
- The legacy controlling checkout remains one unpublished commit ahead at
  `783724e81f452ccea8595466cce690f26a46870a`. That commit removes only
  `serp.software`; it is evidence and must not be pushed or merged as the combined
  cleanup.
- The combined cleanup worktree was created directly from remote `main` at
  `0326c8a`.

Private or high-volume evidence belongs under the ignored directory:

```text
.runtime/retirement/2026-07-30/
  action-log.ndjson
  github/
  mirrors/
  cloudflare/
  d1/
  http/
  references/
  validation/
```

Do not commit credentials, raw private submissions, GitHub secret values, Cloudflare
tokens, private D1 exports, or sensitive DNS material. The committed plan records
redacted identities, hashes, counts, response status, timestamps, and local evidence
paths.

The retirement plan identified the following approval-gated actions:

- protected preview or production Worker deployments;
- a merge that deploys remaining static sites or publishes packages;
- credential creation, rotation, or scope changes;
- Search Console sitemap deletion or submission;
- Cloudflare DNS records or redirect rules;
- disabling GitHub Actions, Pages, or Issues;
- repository visibility changes and archival.

The owner explicitly approved all of them on 2026-07-30. The action log records the
approval, timestamp, exact target, mutation, and rollback point.

## Progress

- [x] 2026-07-30 12:47 JST — Re-fetched both source repositories and confirmed the
  expected D1 SHA, legacy remote SHA, and evidence-only unpublished legacy commit.
- [x] 2026-07-30 12:50 JST — Created clean implementation worktrees:
  `codex/retire-legacy-json-static` from each repository's remote baseline.
- [x] 2026-07-30 12:51 JST — Created this active cross-system ExecPlan before code or
  external mutations.
- [x] 2026-07-30 13:05 JST — Captured fresh GitHub, Cloudflare, D1, HTTP, mirror,
  and Cloudflare Pages evidence under the ignored evidence root; verified both
  repository bundles against `SHA256SUMS`.
- [x] 2026-07-30 13:08 JST — Removed live public-repository links in the D1
  applications, added an architecture guard, and passed focused tests,
  `pnpm docs:check`, and `pnpm typecheck`.
- [x] 2026-07-30 14:46 JST — Deployed PVD preview and both production applications
  through protected workflows in `worker-only` mode. Every D1 backup, migration,
  import, publication, and verification step was skipped. Before/after read-only
  fingerprints retained publication v1, the exact recorded checksums and public
  counts, and `rows_written: 0`.
- [x] 2026-07-30 14:11 JST — Transferred the four existing GSC OAuth/quota secrets
  through one-time legacy workflow run `30515079205`, configured the two canonical
  domain-property mappings, removed the relay workflow, and passed read-only D1
  credential verification run `30515839263` without a Search Console mutation.
- [x] 2026-07-30 13:20 JST — Implemented the combined legacy cleanup from
  `0326c8a`, including removed-site tombstones, fail-closed manual dispatch,
  reusable badge/submission allow-lists, and architecture regression tests.
- [x] 2026-07-30 13:29 JST — Committed the locally validated D1 preparation as
  `cba2b172bdf00d7d38d83d59cd11bbb4bdaf2144` and the combined legacy cleanup as
  `fedba3fe67786d6c78bf9a18ef2b28601aca7607`. Neither commit was pushed, merged,
  or deployed.
- [x] 2026-07-30 14:50 JST — Validated every remaining active static site, exact
  cleanup-diff target resolution, Changesets behavior, and affected workflows
  without deploying.
  Repository tests, typechecking, validate/build, and deploy dry-runs pass.
  `serp.ai` sitemap audit passes; the other three retain identical pre-existing
  sitemap-audit failures on untouched `main`.
  `pnpm test:repo` reports 236 passing tests with 7 skipped; `pnpm typecheck`,
  all four validates/builds, and all four deploy dry-runs pass. An empty Changeset
  made package publication intentionally empty. Legacy PR `#149` was squash-merged
  as `4e7d83473b8db6f160e93982027872464423a115`; Build & Deploy run `30517647317`
  was skipped, Release run `30517647313` reported “All changesets are empty,” and
  no release PR, package publish, or remaining-site deployment occurred.
- [x] 2026-07-30 15:10 JST — The owner explicitly approved all remaining production,
  Search Console, DNS, GitHub repository-setting, observation, and post-observation
  archival actions.
- [x] 2026-07-30 15:02 JST — The owner explicitly accepted continued use of the
  existing legacy `GH_PAT`; no credential rotation or scope change was performed.
  Actions/Pages disablement and target repository privatization remain the controls
  that will prevent historical reruns from publishing the retired sites.
- [x] 2026-07-30 15:23 JST — Replaced both zones' eight GitHub Pages apex records
  and GitHub-backed `www` CNAME with one proxied originless `A 192.0.2.0` per
  hostname, one domain at a time. The account lacked Redirect Rules/Page Rules
  authority, so merged SERP PR `#1358` added two explicit `www/*` routes to
  `brands-page`; both hosts now return Cloudflare-owned 301 redirects preserving
  path/query. Existing apex Worker route IDs are unchanged; Wrangler recreated the
  two `/brands*` route IDs while preserving their patterns, scripts, precedence,
  and bindings.
- [x] 2026-07-30 15:25 JST — Disabled target Actions, Pages/custom domain, and
  Issues, then made both repositories private. They remain unarchived for the
  14-day observation window ending no earlier than 2026-08-13.
- [x] 2026-07-30 15:37 JST — Added read-only sitemap inventory mode in D1 PR `#20`.
  Inventory run `30519870789` compared registered URLs with live D1 sitemap
  indexes. Mutation run `30520108154` removed only SERP's redirecting
  `/sitemap.xml` and PVD's two singular 404 sitemap URLs, then submitted both
  canonical `/sitemap-index.xml` URLs. Post-mutation inventory run `30520216679`
  succeeded and confirmed only the canonical indexes and valid D1 child sitemaps
  remain.
- [ ] After the observation window, archive both private repositories, complete the
  final reference inventory, and move this plan to `completed/`.
- [x] Retain mirror, metadata, zone, D1-fingerprint, and HTTP evidence through at
  least 2026-10-28.

## Surprises and discoveries

- Observation: the fresh legacy remote baseline is still `0326c8a`; the unpublished
  `783724e` patch is not a safe combined cleanup base.
  Evidence: `git fetch --prune origin`, `git rev-parse HEAD origin/main`, and the
  worktree creation transcript from 2026-07-30.

- Observation: the D1 repository has an active `Submit GSC Sitemaps` workflow but no
  repository Actions secrets, no GSC repository variables, and no historical run
  for `submit-gsc-sitemaps.yml`. It has one unrelated repository variable,
  `SUBMISSION_REVIEWER_GITHUB_LOGIN`; its visible environment secrets are Cloudflare
  release credentials only.
  Evidence: read-only `gh secret list`, `gh variable list`, environment inspection,
  and workflow-run inspection on 2026-07-30. This must be rechecked by the primary
  implementation agent and captured under `.runtime/retirement/2026-07-30/github/`.
  GitHub never returns stored secret values, and the four values are not present in
  this workstation environment. The approved transfer will therefore use a
  one-time, confirmation-gated legacy Actions relay that injects the existing
  secrets and writes them directly to the D1 repository without logging them.
  Removing the migrated domains from the legacy scheduler remains blocked until
  the relay and destination proof pass.

- Observation: `serp.software` still has no proper preview environment in the D1
  repository.
  Evidence: read-only GitHub environment inventory on 2026-07-30. Creating one is a
  separate platform task and is not authorized by this retirement.

- Observation: the 13-account Cloudflare Pages audit paginated every connected
  account and found no project matching either retired domain or repository name.
  Evidence: `.runtime/retirement/2026-07-30/cloudflare/`.

- Observation: `serp.software/brands*` remains routed ahead of the general Worker,
  but the live `/brands/` response currently falls back to GitHub and returns 404.
  `pornvideodownloaders.com/brands*` returns the expected KV-backed response.
  Evidence: fresh route exports and HTTP snapshots. The canonical source was found
  in `serpcompany/serp/workers/brands-page`; the approved fix uses direct service
  bindings to both D1 Workers so neither retired GitHub origin supplies a shell.

- Observation: the initial exact legacy cleanup diff resolved to all four remaining
  sites because broad `sites/**` and `scripts/**` push filters matched deletions and
  maintenance files. The workflow now excludes both retired site trees, tests, and
  source-only maintenance scripts changed by this cleanup. A changed shared
  badge-score registry still correctly matches the workflow, so the squash merge
  commit must include the tested `[skip static deploy]` marker. `Build & Deploy`
  will be recorded as skipped and no site will build or deploy; normal active
  app/site/shared-runtime changes continue to deploy.

- Observation: sitemap audits on untouched legacy `main` and the cleanup branch
  match exactly: `browserextensions.io` has 10 errors, `serp.co` has 6, and
  `serpdownloaders.com` has 5; `serp.ai` has none. These failures are pre-existing
  noindex/canonical inconsistencies and are not caused by the retirement.

- Observation: `scripts/serpdownloaders-products.test.ts` has the same three
  failures on untouched `main` and the cleanup branch (catalog count, LaunchBuzz
  product-page expectation, and a missing Patreon related-link expectation). It is
  not in `test:repo`; remaining valid coverage was preserved rather than deleting
  the file to conceal the baseline.

- Observation: the first production verification exposed that every legal route on
  both D1 Workers returned 500. Worker tail identified `next-mdx-remote` as an
  external module unavailable to Workerd; bundling it then exposed its use of
  string code generation, which Workerd prohibits. D1 PR `#18` replaced the runtime
  MDX compiler with the existing `react-markdown`/GFM renderer across legal, docs,
  and guide pages and removed `next-mdx-remote`. Seeded local Worker checks, full
  CI, PVD preview, and both production Workers now return 200 for legal routes.
  This repair changed Worker versions only and did not change D1.

- Observation: the final approved production Worker versions are
  `b13dcdde-bd70-4fdc-a47e-0d145ed05a55` for SERP and
  `f8c932f0-9867-4e09-87bd-489c0bfade4d` for PVD; PVD preview is
  `def0057b-3cfb-44b8-9876-e8785df29027`. Home, products, featured category,
  search, RSS, sitemap index, submit, and legal checks pass; `/build-info.json`
  remains a Worker-owned 404 and no checked response has GitHub Pages provenance.

- Observation: SERP PR `#1357` merged the `/brands*` origin repair as
  `51efcbbe008fd3854aba295e7fec9e3107a133d1`. The shared `brands-page` Worker now
  has explicit service bindings to `serp-software-production` and
  `pornvideodownloaders-production`; 46 tests, typechecking, and Wrangler dry-run
  passed. It was deployed as version `162fb079-dcea-4fa6-ad3f-11fba40f6b82`.
  Because the account could not create Redirect Rules or legacy Page Rules, SERP
  PR `#1358` then added two tested canonical `www/*` routes and was deployed as
  version `d431c523-b63f-48fc-8292-efe148aaa933`. All tested `/brands/` consumers
  return 200.

- Observation: Wrangler preserves route patterns and scripts but recreated the
  `/brands*` route records during the approved shared Worker deployment. The apex
  routes retain IDs `f032ba43f0324fe59ceba4eb37714552` and
  `7ea81204a85d41358fcb3c1d3c593f33`; the new `/brands*` IDs are
  `438ef9a1fed1490b83108e367cc33b00` and
  `c51042a51a52456d87eb62456a60e0a4`. This is a control-plane identity change,
  not a route pattern, script, precedence, binding, or D1 change.

- Observation: GitHub exposes the legacy `GH_PAT` secret name and update time but
  not the stored token's principal, kind, expiry, scopes, or repository allow-list.
  Those properties cannot be inferred safely from the secret value because GitHub
  does not return it. The owner explicitly accepted continued use of this existing
  credential for remaining legacy targets; no rotation is part of this retirement.

## Decision log

- Decision: initial work was limited to local implementation, read-only evidence,
  backups, and dry-run validation until the owner supplied explicit approvals. The
  owner approved every enumerated mutation on 2026-07-30 before those mutations ran.
  Rationale: the repository runbooks say an ExecPlan alone does not authorize
  external effects; the later owner approval did.
  Date: 2026-07-30.

- Decision: keep `783724e` unchanged in the controlling checkout and reimplement the
  two-site cleanup in a separate worktree from `origin/main`.
  Rationale: this preserves the partial patch as evidence and prevents an incomplete
  one-site retirement from becoming the publication source.
  Date: 2026-07-30.

- Decision: preserve D1 content and all Worker routes, including the more-specific
  `/brands*` route, as protected invariants.
  Rationale: the task retires legacy publication authority, not the live D1
  architecture or brand-page routing.
  Date: 2026-07-30.

- Decision: use two explicit `www/*` routes on the existing `brands-page` Worker
  after both the connected API and authenticated dashboard proved unable to create
  Redirect Rules or Page Rules. The Worker returns 301 to the HTTPS apex while
  preserving path and query.
  Rationale: this removes GitHub as origin and satisfies the canonical redirect
  requirement using existing Cloudflare-owned compute and recoverable source,
  without modifying either apex application route or D1.
  Date: 2026-07-30.

- Decision: do not remove the migrated domains from legacy GSC ownership until the
  D1 scheduler has credential authority and a successful canonical-sitemap proof.
  Rationale: removing the only proven scheduler first would create an SEO operations
  gap and violate milestone ordering.
  Date: 2026-07-30.

- Decision: use proxied `A 192.0.2.0` records for the approved originless DNS state.
  Rationale: Cloudflare documents that reserved address for proxied originless
  redirect and Worker-routing setups; requests are intercepted at the edge.
  Date: 2026-07-30.

- Decision: the user explicitly approved the D1 application releases and GSC
  credential transfer on 2026-07-30. Release workflows must use the new
  `worker-only` mode; migration, import, publication, and restoration remain
  prohibited.

- Decision: do not redeploy remaining static sites for this cleanup. Negative path
  filters exclude deletion-only retired trees and maintenance files, while the
  required `[skip static deploy]` squash-merge marker safely covers the legitimate
  shared registry cleanup without weakening future shared-runtime deployments.

- Decision: accept the identical pre-existing sitemap-audit failures as baseline
  evidence rather than retirement regressions.

- Decision: retain and use the existing legacy `GH_PAT`; the owner accepts its
  pre-existing authority as irrelevant to this retirement once target Actions,
  Pages, public visibility, and active source mappings are removed.

- Decision: fix both D1 sites' `brands-page` shell lookup with Worker service
  bindings before originless DNS changes. This removes the hidden GitHub-origin
  dependency while preserving the existing `/brands*` routes.

## Plan of work

### Milestone 1: freeze and inventory

Create read-only recovery evidence before each external mutation. Capture repository
metadata, mirror backups, zone and route exports, Pages enumeration across the
explicit 13-account list, Worker versions and bindings, D1 identities and public-only
fingerprints, representative HTTP surfaces, and a classified reference inventory.
Hash every evidence file. Never put private submission rows in this plan.

### Milestone 2: remove live public-repository dependencies

In the D1 worktree, set Porn Video Downloaders issue owner/repository/URL fields to
`null`, remove the resulting not-found network link, and update tests. Replace the
SERP cookie-policy issue link with neutral language that does not invent a contact
channel. Mark documentation that assigns current submission or badge authority to the
public static repositories as superseded while keeping genuine history.

Confirm `/submit` remains D1-native and badge assets remain Worker/R2-owned. Validate
PVD locally and prepare its existing preview release. Validate SERP locally and record
the missing preview path as a follow-up. Protected deployments ran only after the
recorded owner approval.

### Milestone 3: retire both IDs from the legacy pipeline

In the clean legacy worktree, remove both app and site trees and every active registry,
source-adapter, build, deploy, GSC, badge, submission, listing-update, package-command,
path-filter, and documentation ownership entry. Preserve the reusable badge workflow
and remaining sites.

Add a single authoritative retired-site guard so validate, build, deploy, resolver,
workflow dispatch, GSC, listing-update, submission, and badge entry points reject
both IDs with remediation-oriented errors. Add architecture tests preventing either
site ID, target repository, static catalog path, or Pages configuration from becoming
active again.

The GSC-specific deletion is staged but must not be merged until Milestone 2 proves
the D1 scheduler. Preserve `SITE_ID=serpdownloaders.com` and all GSC OAuth secrets.

### Milestone 4: validate remaining legacy behavior

Run repository checks and the validate/build/sitemap-audit/deploy-dry-run sequence for
every remaining active static site. Run the exact cleanup diff through the workflow
target resolver. Inspect Changesets output and every workflow affected by the merge.
If shared paths resolve remaining targets, document the exact production redeploy set
before merge and apply the recorded approval only to that reviewed set.

### Milestone 5: narrow credentials

Record every `GH_PAT` property GitHub exposes without revealing the token and document
its consumer graph. GitHub does not expose its principal, kind, expiry, scopes, or
repository allow-list. The owner directed this retirement to retain and use the
existing credential; target Actions/Pages disablement, privatization, and removal
from active source mappings prevent it from publishing the retired sites.

### Milestone 6: change DNS one domain at a time

After the recorded approval and a same-moment export, create the `www` redirect,
replace `www` GitHub CNAME with proxied `A 192.0.2.0`, and replace the eight GitHub
Pages apex A/AAAA records with one proxied `A 192.0.2.0`. Preserve record comments,
unrelated DNS, email, validation, nameservers, DNSSEC, CAA, Workers, D1, and both
Worker routes. Validate SERP fully before repeating for PVD.

### Milestone 7: retire target repositories and close references

After approved D1 releases remove live issue links and approved DNS changes pass,
verify both mirrors, disable Actions, disable Pages/custom-domain binding, disable
Issues, verify no deploy authority remains, then make the repositories private.
Keep them unarchived for the 14-day observation window. The owner has already
approved archival after that window; archive them no earlier than 2026-08-13.

Confirm canonical D1 sitemap submission, remove only obsolete static sitemap entries
from Search Console after approval, classify all residual references, and preserve
live navigation, content, migration evidence, historical exports, catalog URLs, and
screenshots unless they are proven stale operational authority.

## Concrete commands

All commands below are read-only or local unless explicitly labeled approval-gated.

From the D1 implementation worktree:

```bash
pnpm docs:check
pnpm harness:fast
pnpm harness:check
pnpm worker:build
pnpm worker:pornvideodownloaders:build
```

Use focused test commands discovered from the affected packages before the full
harness. For local runtime behavior, use isolated harness aliases and capture actual
responses under `.runtime/retirement/2026-07-30/http/`.

From the legacy implementation worktree, first enumerate active sites from the
checked-in registry, then for each remaining ID run:

```bash
pnpm validate:site -- --site <site-id>
pnpm build:site -- --site <site-id>
pnpm audit:sitemaps -- --site <site-id>
pnpm deploy:site -- --site <site-id> --dry-run
```

Also run repository tests, resolver tests against the exact diff, retired-ID negative
tests for every entry point, and Changesets status. Never run `pnpm deploy`,
`pnpm deploy:site` without `--dry-run`, or any target repo sync from a dirty,
unpushed, or unreviewed worktree.

Before and after any approved external action:

```bash
git status --short --branch
git diff --check
```

Record the exact API request method/path, redacted response summary, target IDs,
timestamps, approval, and rollback point in `action-log.ndjson`.

## Validation and acceptance

Acceptance requires authoritative evidence for every item:

- legacy source `main` has no active app, catalog, registry, deploy, dispatch, GSC,
  badge, or submission authority for either retired site;
- every legacy entry point rejects both retired IDs;
- all remaining static sites validate, build, audit, and dry-run to their unchanged
  target repositories;
- no unexpected package publication or unapproved remaining-site deployment occurs;
- target repositories have no Actions, Pages, custom domain, deploy credentials,
  public visibility, or Issues after the approved retirement; after 14 days they are
  private and archived;
- the owner's accepted legacy `GH_PAT` remains unchanged; disabled Actions and Pages
  prevent historical workflow reruns from publishing either retired site;
- both apexes return `x-opennext: 1`; both `www` hosts permanently redirect to apex;
- tested responses have no GitHub/Fastly provenance and `/build-info.json` is a
  Worker-owned 404;
- `/brands/` remains served by `brands-page`, whose specific route remains ahead of
  the general Worker route;
- representative home, product, category, search, RSS, sitemap, submit, badge,
  canonical, redirect, and TLS checks pass for both sites;
- apex Worker routes, Worker bindings, and D1
  IDs/publication versions/checksums/counts are unchanged; two `www/*` redirect
  routes were added and Wrangler recreated the `/brands*` route record IDs without
  changing their behavior;
- `pornvideodownloaders-preview` remains isolated and missing SERP preview is recorded
  only as a follow-up;
- Pages is absent across all 13 connected Cloudflare accounts;
- unrelated and mail DNS records are byte-for-byte unchanged;
- Search Console retains both properties, canonical D1 sitemap indexes, and valid
  D1 child sitemaps; obsolete redirecting/404 static sitemap registrations are
  absent;
- every residual reference has a reviewed classification.

## Idempotence and recovery

Local code and tests can be rerun safely. Read-only inventories are timestamped rather
than overwritten. Every evidence directory has a SHA-256 manifest; verify it before
using recovery material.

Retain repository mirrors, GitHub metadata, Cloudflare zone exports, D1 fingerprints,
and HTTP evidence for 90 days. Before archive, re-enabling a target repository,
Actions, or Pages requires fresh approval. DNS rollback restores the recorded zone
state while preserving record IDs where the API supports it, followed by route and
TLS verification. Legacy-source regressions roll back by reverting the reviewed
source PR. Credential rollback may restore the prior credential only to valid
remaining targets and never broaden it to the retired repositories without approval.

No failure in this plan authorizes D1 restore, migration, import, publication, Worker
deletion, Worker-route removal, repository deletion, or history rewriting.

## Interfaces and dependencies

- D1 active-site and release registry: `scripts/site-targets.ts`
- D1 site configuration: `sites/<site-id>/`
- D1 submission and cookie-policy application surfaces under `apps/<site-id>/`
- D1 protected release and sitemap workflows under `.github/workflows/`
- Legacy active-site registry and site contract under `packages/site-contract/`
- Legacy site wrappers and data under `apps/<site-id>/` and `sites/<site-id>/`
- Legacy workflow target resolver and deploy scripts under `scripts/`
- Legacy `build-and-deploy.yml`, badge, submission, listing-update, and GSC workflows
- GitHub repository settings, Actions, Pages, environments, and credentials
- Cloudflare zones, DNS, rulesets, Worker routes, Workers, bindings, and D1 metadata
- Google Search Console properties and sitemap entries

## Prepared approval batches

All batches were approved on 2026-07-30. Batches 1-7 are complete; batch 8 must
wait for the observation window.

1. **D1 application releases — approved 2026-07-30.** Deploy the link-removal change to
   `pornvideodownloaders-preview`, verify it, then deploy the protected PVD
   production Worker. Deploy the SERP change through its protected production
   workflow without inventing a preview environment. Recheck the recorded D1
   fingerprints before and after each release.
2. **D1 GSC credential authority — approved 2026-07-30.** Provision the existing four OAuth/quota
   credential names and the two domain mappings in the D1 repository, then run a
   protected canonical dry/proof submission. Both actions ran under the recorded
   owner approval.
3. **Legacy cleanup merge.** Merge the reviewed cleanup only after batch 2 passes.
   Squash-merge it with `[skip static deploy]` in the commit title so the resolver
   job is skipped; the empty Changeset proves no package publication is requested.
4. **Legacy credential decision — closed 2026-07-30.** Retain the existing `GH_PAT`
   by owner direction; do not rotate or broaden it.
5. **Cloudflare DNS, one zone at a time.** First `serp.software`, then PVD:
   create the `www` permanent redirect, replace the GitHub-backed records with
   proxied `A 192.0.2.0`, preserve both route IDs and all unrelated/email records,
   and run the full HTTP/TLS suite before continuing.
6. **Target repository reversible retirement.** Disable Actions, Pages/custom
   domain, and Issues; make each target private; keep both unarchived for 14 days.
7. **Search Console cleanup.** After D1 canonical submission is proven, remove only
   obsolete static sitemap URLs while retaining properties and verification.
8. **Archival after observation — approved, time-gated.** After 14 successful days,
   archive both private repositories. Evidence retention already runs through at
   least 2026-10-28.

## Important artifacts

- Active evidence root:
  `.runtime/retirement/2026-07-30/`
- Legacy partial-patch evidence commit:
  `783724e81f452ccea8595466cce690f26a46870a`
- D1 implementation branch:
  `codex/retire-legacy-json-static`
- Legacy implementation branch:
  `codex/retire-legacy-json-static`
- Cloudflare originless-routing documentation:
  `https://developers.cloudflare.com/workers/configuration/routing/custom-domains/`

Verified recovery bundles:

- `serp.software.bundle`:
  `5c1bb55e02b2226fe2d15fa0691623dd9566b0887a0dccb25305e352a01f448c`
- `pornvideodownloaders.com.bundle`:
  `852a3006fb9ab97b417c5036ee5e1b2497f2fa6bfb01a37bb18b28d251c253ad`

Protected D1 fingerprints captured by read-only queries:

| Site/database | Database ID | Publication checksum | Listings |
|---|---|---|---:|
| `serp-software-directory-db` | `dda690b0-19c1-4d7e-a3c8-da2a9e3216a8` | `02a719a3aa6ba6060a5b2ce6cd90bc2d367b82940de10051f866df3d6fcccfe7` | 339 |
| `pornvideo-downloaders-production` | `d934a6c2-b382-4c50-a220-1e9dc0e5f8e5` | `5f692bca14184318a5517a0713efde0fd6af1629424291be538faaace96c4f8a` | 286 |
| `pornvideo-downloaders-preview` | `f92694b0-af7d-4c13-91f2-ee0393af9bdd` | `5f692bca14184318a5517a0713efde0fd6af1629424291be538faaace96c4f8a` | 286 |

## Reference inventory

Reviewed current classifications:

- **Operational deployment authority — remove:** both legacy app/site trees,
  active-site registry entries, deploy targets, dispatch/path filters, listing
  source adapters, badge manifests, reusable submission targets, and legacy GSC
  selection for the two retired IDs.
- **Live navigation — preserve:** canonical live-domain links and the
  `packages/web-core/src/data/network-brands.json` network catalog. These point to
  the OpenNext applications, not static publication authority.
- **Catalog/product content — preserve:** domain references, product URLs,
  `*.pages.dev` entries, media, and screenshots in remaining catalogs unless a
  separate content review proves them stale.
- **Historical migration evidence — preserve and label:** completed plans,
  audits, archived incubating-site records, parity/bootstrap material, the
  unpublished `783724e` patch, and historical Cloudflare exports.
- **Current documentation — rewrite:** runbooks and status files that claim the
  static repository or public target issue repositories still own either live
  site's deployment, submission, badge, or sitemap operations.
- **D1 live application links — remove:** the PVD not-found issue link and SERP
  cookie-policy issue-tracker link. No replacement contact channel was invented.

The final organization-wide search and per-reference attachment remain pending
until the observation window closes and the repositories are archived.

## Outcomes and retrospective

Production retirement is active: GitHub-backed DNS is gone, both target repositories
are private with Actions/Pages/Issues disabled, D1 and apex Worker routes remain
healthy, `/brands/` and `www` canonicalization are Cloudflare-owned, and Search
Console retains the canonical D1 sitemap surfaces. The only time-gated work is the
14-day observation, private archival on or after 2026-08-13, the final reference
inventory, and moving this plan to `completed/`.
