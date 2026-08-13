# Post-deployment Visitor tracer bullet

Status: research recommendation; no implementation authority

Researched: 2026-08-13

Source revision: `8aa77ccd7e16846043df7b6b40702154f11d4f13`

## Question and boundary

This note identifies the smallest safe way to prove one Visitor and
discoverability journey immediately after an authorized production Worker deploy. It
uses repository source and first-party GitHub Actions documentation. It does not
propose continuous monitoring, a complete runbook automation, a deployment trigger,
Cloudflare analytics access, or any D1 operation.

## Recommendation

Add one downstream, read-only `post-deploy` job to each existing production deploy
workflow. The job should run only after that workflow's deploy job succeeds, check out
the same `github.sha`, install the existing toolchain, and invoke one shared
site-explicit probe. It should not declare a GitHub environment and should receive no
Cloudflare or D1 secrets.

The probe should perform one bounded journey against the selected Site's checked-in
`publicUrl`:

1. fetch the home page and require `200`, the configured Site identity, and an
   indexable canonical for the Site origin;
2. select one same-origin `/products/<slug>/` link from that home response and require
   its detail page to return `200` with a matching canonical and without `noindex`;
3. fetch `/listings-sitemap.xml` and require that exact detail URL to occur in the
   sitemap.

This single path connects a Visitor-visible discovery surface, a D1-backed Listing
detail, and the search-engine discovery surface. It deliberately excludes Search,
categories, RSS, every sitemap entry, redirects, mobile layout, accessibility,
performance budgets, D1 analytics, and periodic scheduling. Those remain manual or
Later work unless this tracer produces evidence that a stable additional invariant is
worth its cost. The repository's confidence map already names this exact boundary:
one post-deployment smoke before any comprehensive monitor
([`docs/CONFIDENCE_SYSTEM.md`, lines 71-105](../CONFIDENCE_SYSTEM.md#L71-L105)).

## Where production deployment currently ends

| Site | Authorized production path | Last repository-owned action | Evidence currently available |
| --- | --- | --- | --- |
| `serp.software` | Manual `workflow_dispatch` on `main`; the only `site_id` choice is `serp.software`; exact production confirmation; protected `production` environment | Schema compatibility check followed by `pnpm worker:deploy:production` | GitHub run identity and `github.sha`; dispatch `site_id`, `release_mode`, and confirmation; protected environment name; inherited deploy CLI log; for `database-and-worker`, a 30-day backup artifact named with the SHA |
| `pornvideodownloaders.com` | Manual `workflow_dispatch` on `main`; `environment=production`; exact production confirmation; protected `pornvideodownloaders-production` environment | Schema compatibility check followed by `worker-release.ts deploy production --site pornvideodownloaders.com` | GitHub run identity and `github.sha`; dispatch `environment`, `release_mode`, and confirmation; protected environment name; inherited deploy CLI log; for `database-and-worker`, a 30-day backup artifact named with the SHA |

The SERP workflow's job guard, environment, validation, optional D1 path, backup name,
and terminal deploy command are explicit in
[`build-and-deploy.yml`, lines 3-113](../../.github/workflows/build-and-deploy.yml#L3-L113).
The PVD production job has the corresponding boundary in
[`deploy-pornvideodownloaders.yml`, lines 101-164](../../.github/workflows/deploy-pornvideodownloaders.yml#L101-L164).

The release wrapper strengthens the commit correlation before any remote command: it
requires GitHub Actions, `refs/heads/main`, a nonempty `GITHUB_SHA`, the approved
workflow identity and confirmation, a clean checkout, and `HEAD === GITHUB_SHA`
([`scripts/worker-release.ts`, lines 150-188](../../scripts/worker-release.ts#L150-L188)).
It then delegates deploy to the OpenNext CLI with inherited standard output; it does
not parse a Worker version or emit a structured release record
([`scripts/worker-release.ts`, lines 353-372](../../scripts/worker-release.ts#L353-L372)).
The public production route and `D1_RUNTIME_ENV=production` are fixed in each checked-in
Wrangler template
([SERP template, lines 7-28](../../configs/wrangler/serp.software/production.jsonc#L7-L28),
[PVD template, lines 7-28](../../configs/wrangler/pornvideodownloaders.com/production.jsonc#L7-L28)).

Consequently, a successful run currently proves that the reviewed SHA was passed to
the selected protected release path, and its logs may contain deploy CLI details, but
the repository does not yet produce a normalized post-deploy result tying public HTTP
observations to the Site, environment, SHA, release mode, and workflow URL. The deploy
runbook asks the operator to record those fields and then perform live checks, while
also stating that analytics evidence remains outside the workflow credential contract
([`docs/DEPLOY_RUNBOOK.md`, lines 136-177](../DEPLOY_RUNBOOK.md#L136-L177)).

GitHub supplies stable context fields for the missing correlation record:
`github.sha` is the triggering commit, `github.run_id` identifies the workflow run,
and the context also contains repository and server URL fields
([GitHub Actions contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context)).
For a manual dispatch, `GITHUB_SHA` is the last commit on the dispatched ref and
`GITHUB_REF` is that ref
([GitHub Actions events reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)).

## Existing read-only pieces worth reusing

### Site identity and public origin

The checked-in Site contract already owns each canonical public origin
([SERP, lines 67-72](../../sites/serp.software/site-config.ts#L67-L72),
[PVD, lines 81-86](../../sites/pornvideodownloaders.com/site-config.ts#L81-L86)).
The release registry rejects missing or unknown Site IDs rather than guessing a
default ([`scripts/site-targets.ts`, lines 1-35 and 104-111](../../scripts/site-targets.ts#L104-L111)).
The new command should preserve that explicit `--site <site-id>` boundary and derive
the origin from the checked-in Site configuration rather than accepting an arbitrary
URL.

### HTTP, sitemap, and metadata primitives

The sitemap auditor already contains tested primitives for parsing `<loc>` values,
normalizing URLs, enforcing same-origin membership, fetching with timeouts, and
checking canonical and robots metadata
([`scripts/audit-sitemaps.ts`, lines 80-149](../../scripts/audit-sitemaps.ts#L80-L149),
[`scripts/audit-sitemaps.ts`, lines 615-713](../../scripts/audit-sitemaps.ts#L615-L713)).
Those small primitives or their behavior can be reused. The complete `--live` audit
should not be used as the tracer: it recursively requests every URL in every child
sitemap and also probes legacy sitemap files
([`scripts/audit-sitemaps.ts`, lines 716-953](../../scripts/audit-sitemaps.ts#L716-L953)).
That is a broad SEO audit, not one bounded journey.

### Browser smoke

The multisite Playwright test already exercises Site identity, exact catalog counts,
a representative Listing, category, Search, sitemaps, feed, and mobile containment
([`apps/e2e/tests/multisite-smoke.spec.ts`, lines 5-77](../../apps/e2e/tests/multisite-smoke.spec.ts#L5-L77)).
It can accept a remote `PLAYWRIGHT_BASE_URL`, but its configuration also owns a local
web-server command and its assertions depend on hard-coded Site-specific counts and
fixtures
([`apps/e2e/playwright.config.ts`, lines 3-17 and 91-113](../../apps/e2e/playwright.config.ts#L3-L17),
[`apps/e2e/package.json`, lines 5-16](../../apps/e2e/package.json#L5-L16)).
Running it unchanged after production deployments would be larger than the tracer and
would make intentional catalog publication look like a test regression until fixture
counts were updated. Keep it as local/browser evidence; do not make it the first live
release gate.

The point-in-time live baseline confirms that both public Sites currently support the
proposed thin path and documents the broader checks as separate evidence
([`docs/LIVE_VISITOR_BASELINE.md`, lines 21-65](../LIVE_VISITOR_BASELINE.md#L21-L65),
[`docs/LIVE_VISITOR_BASELINE.md`, lines 204-227](../LIVE_VISITOR_BASELINE.md#L204-L227)).

## Safe GitHub Actions seam

A separate downstream job inside each existing deploy workflow is preferable to both
an extra step in the privileged deploy job and a separate `workflow_run` workflow.

- `needs: deploy` (or `needs: production` for PVD) makes successful deployment the
  prerequisite. GitHub skips a dependent job when its prerequisite fails unless an
  explicit conditional changes that behavior
  ([GitHub workflow syntax: `jobs.<job_id>.needs`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax-for-github-actions#jobsjob_idneeds)).
- The downstream job shares the original dispatch event and therefore the same
  `github.sha` and typed `inputs` context. GitHub documents that dispatch inputs are
  available throughout the manually triggered workflow
  ([GitHub Actions contexts: `inputs`](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#inputs-context)).
- Give the job only `contents: read`, which is enough to check out the private
  repository source; GitHub sets permissions omitted from an explicit permissions map
  to no access
  ([GitHub workflow syntax: permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax-for-github-actions#permissions)).
- Do not attach a protected environment to the probe job and do not pass any
  `secrets.*` expression. GitHub only makes a secret available to an action when the
  workflow explicitly supplies it as an input or environment variable
  ([GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets#about-secrets)).
- Do not use `workflow_run` for this first slice. A `workflow_run` job starts from the
  default branch context, fires regardless of the upstream conclusion unless filtered,
  and can access secrets and write tokens; GitHub explicitly warns about its privileged
  security boundary
  ([GitHub Actions events: `workflow_run`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)).

Keeping the probe in its own downstream job also separates recovery: if public
evidence fails after the Worker deploy succeeded, the release run is visibly failed
but the deploy job remains a completed prerequisite. The failure must not
automatically mutate D1 or roll back the Worker. The existing runbook already requires
an explicit recovery decision and warns against restoring D1 merely because an
application deploy failed
([`docs/DEPLOY_RUNBOOK.md`, lines 121-134](../DEPLOY_RUNBOOK.md#L121-L134)).

## Smallest implementation boundary

One implementation ticket is sufficient:

1. Add one shared, deterministic script such as
   `scripts/post-deploy-tracer.ts --site <site-id> --environment production` with
   injected-fetch unit tests. Reject unknown Sites and non-production environments.
2. Make only the three GET observations in the recommended journey, with a short
   timeout and a small bounded retry for deployment propagation. Reject cross-origin
   redirects and sitemap entries.
3. Emit one machine-readable JSON result and a concise GitHub step summary containing:
   Site ID, environment, source SHA, release mode, workflow-run URL, observation start
   and end times, selected Listing URL, response statuses/final URLs, canonical
   results, sitemap-membership result, and overall pass/fail. Do not include headers
   wholesale because they can add noisy or sensitive operational data.
4. Add a `post-deploy` job after SERP's `deploy` job and a production-only
   `post-deploy` job after PVD's `production` job. Hard-code the expected Site and
   environment at each call site, pass only non-secret GitHub context fields, and keep
   `permissions: contents: read` with no `environment:` stanza.
5. Add focused repository tests that prove job dependency, production-only selection,
   read-only permissions, absence of environment/secrets, explicit Site identity, and
   fail-loud command behavior. Run those tests plus the repository harness before the
   pull request is considered complete.

The JSON can be retained as a small Actions artifact if durable download beyond the
log/step-summary view is desired; artifact upload is evidence retention, not a Site or
D1 mutation. This is optional for the tracer's first pass. The governing issue should
decide the retention period rather than silently inheriting the D1 backup policy.

## Gaps and constraints that remain after this slice

- **No public revision attestation.** The workflow can correlate observations with the
  exact deploying SHA, but current public responses expose no documented commit or
  Worker-version marker. The deterministic Next build ID is derived from Site and
  source revision ([`configs/next/index.ts`, lines 7-37](../../configs/next/index.ts#L7-L37)),
  but it is not a documented public response contract. Adding a public deployment
  header or health endpoint is a separate security and product-interface decision.
- **Post-deploy failure occurs after mutation.** A red tracer result means the release
  needs investigation; it cannot prevent the deploy that made the live observation
  possible. It must not auto-rollback.
- **Propagation and external availability are nondeterministic.** A small bounded retry
  is justified; an unbounded wait, availability SLO, or scheduler would turn the slice
  into monitoring.
- **A dynamic representative Listing is intentional.** Selecting an actual product
  link from the deployed home page avoids hard-coded catalog counts and slugs becoming
  stale after an authorized publication. It proves existence and discoverability, not
  exact catalog parity; exact parity remains a D1 release concern.
- **The tracer does not satisfy D1 efficiency evidence.** Query counts, rows read,
  latency, index use, and writes still require the bounded operator procedure because
  analytics credentials are deliberately absent from the deploy workflow contract
  ([`docs/DEPLOY_RUNBOOK.md`, lines 154-177](../DEPLOY_RUNBOOK.md#L154-L177)).
- **SERP still has no preview target.** This work must not invent one. The established
  exception remains explicit in the runbook
  ([`docs/DEPLOY_RUNBOOK.md`, lines 65-76](../DEPLOY_RUNBOOK.md#L65-L76)).

## Decision checkpoint after the first real run

Do not add routes or a schedule merely because they are easy. After the tracer has run
on both Sites, review whether it produced actionable evidence, whether its retry and
metadata contract were stable, and whether any real failure mode justifies one more
invariant. Until then, continuous monitoring and full post-release runbook automation
remain out of scope.
