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

The supplied retirement decision requires separate explicit approval for:

- protected preview or production Worker deployments;
- a merge that deploys remaining static sites or publishes packages;
- credential creation, rotation, or scope changes;
- Search Console sitemap deletion or submission;
- Cloudflare DNS records or redirect rules;
- disabling GitHub Actions, Pages, or Issues;
- repository visibility changes and archival.

No ExecPlan checkbox or local test grants those approvals. Record the approver,
timestamp, exact target, and approved action immediately before each mutation.

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
- [ ] Prove D1 publication versions, checksums, and public counts are unchanged
  before and after any approved Worker deployment.
- [ ] Prove the D1 sitemap workflow has usable credential authority and successful
  canonical sitemap resolution for both sites.
- [x] 2026-07-30 13:20 JST — Implemented the combined legacy cleanup from
  `0326c8a`, including removed-site tombstones, fail-closed manual dispatch,
  reusable badge/submission allow-lists, and architecture regression tests.
- [x] 2026-07-30 13:29 JST — Committed the locally validated D1 preparation as
  `cba2b172bdf00d7d38d83d59cd11bbb4bdaf2144` and the combined legacy cleanup as
  `fedba3fe67786d6c78bf9a18ef2b28601aca7607`. Neither commit was pushed, merged,
  or deployed.
- [ ] Validate every remaining active static site, exact cleanup-diff target
  resolution, Changesets behavior, and all affected workflows without deploying.
  Repository tests, typechecking, validate/build, and deploy dry-runs pass.
  `serp.ai` sitemap audit passes; the other three retain identical pre-existing
  sitemap-audit failures on untouched `main`. The exact cleanup diff resolves all
  four remaining sites and therefore requires production approval before merge.
  `pnpm test:repo` reports 236 passing tests with 7 skipped; `pnpm typecheck`,
  all four validates/builds, and all four deploy dry-runs pass. An empty Changeset
  makes package publication intentionally empty.
- [ ] Obtain and record the required approval before any protected Worker deployment,
  merge/redeploy, credential change, Search Console mutation, DNS/rule change, or
  GitHub repository setting mutation.
- [ ] Narrow legacy `GH_PAT` authority and prove historical reruns cannot write either
  retired target.
- [ ] Replace GitHub-backed DNS with proxied originless records and add `www` to apex
  redirects, one domain at a time, without changing Worker routes.
- [ ] Disable target Actions, Pages, and Issues; make repositories private; observe
  production for 14 days while leaving them unarchived.
- [ ] After the observation window, obtain archival approval, archive both private
  repositories, complete the reference inventory, and move this plan to
  `completed/`.
- [ ] Retain mirror, metadata, zone, D1-fingerprint, and HTTP evidence for 90 days.

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

- Observation: GitHub exposes the legacy `GH_PAT` secret name and update time but
  not the stored token's principal, kind, expiry, scopes, or repository allow-list.
  Those properties cannot be inferred safely from the secret value because GitHub
  does not return it. The owner explicitly accepted continued use of this existing
  credential for remaining legacy targets; no rotation is part of this retirement.

## Decision log

- Decision: treat the current user request as authority for local implementation,
  read-only evidence collection, backups, and dry-run validation, but not as the
  fresh explicit approvals enumerated above.
  Rationale: the supplied plan deliberately makes those actions approval-gated and
  the repository runbooks say an ExecPlan does not authorize external effects.
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
the missing preview path as a follow-up. Any protected deployment waits for approval.

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
and request approval before merge.

### Milestone 5: narrow credentials

Record the legacy `GH_PAT` principal, kind, expiry, scopes, repository allow-list, and
consumer graph without exposing the token. After explicit approval, replace it with a
fine-grained credential that can write only the source and valid remaining targets,
explicitly excluding the retired repositories. Keep the prior credential recoverable
only until valid dry-run and permission proofs pass.

### Milestone 6: change DNS one domain at a time

After explicit approval and a same-moment export, create the `www` redirect rule,
replace `www` GitHub CNAME with proxied `A 192.0.2.0`, and replace the eight GitHub
Pages apex A/AAAA records with one proxied `A 192.0.2.0`. Preserve record comments,
unrelated DNS, email, validation, nameservers, DNSSEC, CAA, Workers, D1, and both
Worker routes. Validate SERP fully before repeating for PVD.

### Milestone 7: retire target repositories and close references

After approved D1 releases remove live issue links and approved DNS changes pass,
verify both mirrors, disable Actions, disable Pages/custom-domain binding, disable
Issues, verify no deploy authority remains, then make the repositories private.
Keep them unarchived for the 14-day observation window. After that window and fresh
approval, archive them.

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
- narrowed legacy credentials cannot write either retired repository, including
  through historical reruns;
- both apexes return `x-opennext: 1`; both `www` hosts permanently redirect to apex;
- tested responses have no GitHub/Fastly provenance and `/build-info.json` is a
  Worker-owned 404;
- `/brands/` remains served by `brands-page`, whose specific route remains ahead of
  the general Worker route;
- representative home, product, category, search, RSS, sitemap, submit, badge,
  canonical, redirect, and TLS checks pass for both sites;
- Worker routes/bindings and D1 IDs/publication versions/checksums/counts are
  unchanged;
- `pornvideodownloaders-preview` remains isolated and missing SERP preview is recorded
  only as a follow-up;
- Pages is absent across all 13 connected Cloudflare accounts;
- unrelated and mail DNS records are byte-for-byte unchanged;
- Search Console retains both properties and only canonical D1 sitemap indexes;
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

No batch below has been approved or executed.

1. **D1 application releases — approved 2026-07-30.** Deploy the link-removal change to
   `pornvideodownloaders-preview`, verify it, then deploy the protected PVD
   production Worker. Deploy the SERP change through its protected production
   workflow without inventing a preview environment. Recheck the recorded D1
   fingerprints before and after each release.
2. **D1 GSC credential authority — approved 2026-07-30.** Provision the existing four OAuth/quota
   credential names and the two domain mappings in the D1 repository, then run a
   protected canonical dry/proof submission. This credential change and Search
   Console submission need explicit approval.
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
8. **Archival after observation.** After 14 successful days and a fresh approval,
   archive both private repositories and begin the 90-day evidence-retention clock.

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
until local branches are reviewed and all approval-gated mutations are complete.

## Outcomes and retrospective

Incomplete. Populate only after all local checks, approvals, external mutations,
14-day observation, archival, Search Console closure, and final reference
classification have authoritative evidence.
