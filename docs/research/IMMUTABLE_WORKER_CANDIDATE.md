# Immutable Worker Candidate Research

Date: 2026-08-13  
Governing issue: [#58](https://github.com/serpcompany/directory-platform-d1/issues/58)  
Versions examined: `@opennextjs/cloudflare` 1.18.1 and Wrangler 4.110.0, as
locked by [`pnpm-lock.yaml`](../../pnpm-lock.yaml#L149-L151).

## Answer

Cloudflare can upload a Worker version without serving it, exercise that exact
version through a versioned preview URL, and later deploy that same version ID
without rebuilding. A Worker version contains the bundled code, static assets,
bindings, and compatibility settings; a deployment only selects which existing
version or versions receive traffic. D1, KV, R2, and Durable Object **state** is
not part of the version. [Cloudflare: Versions &
deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)

That capability does **not** mean one preview-bound version can be promoted into
a production-bound version:

- A version uploaded to the preview Worker with preview `DB` and
  `D1_RUNTIME_ENV=preview` keeps those bindings.
- Changing the Worker name, D1 database ID, variables, or compatibility
  configuration creates another version. Deploying an existing version does not
  rewrite it.
- Version IDs belong to a Worker. A version of the separate PVD preview Worker is
  not a deployable version of the PVD production Worker.
- Routes and cron triggers are deployment-level configuration, not part of the
  version selected by `wrangler versions deploy`; Wrangler 4.110 exposes the
  separate experimental `wrangler triggers deploy` command for applying them
  after `versions upload`. [Wrangler 4.110 source: trigger
  deployment](https://github.com/cloudflare/workers-sdk/blob/eced61097ea9772354f25b7f6dfde7eefad0154a/packages/wrangler/src/triggers/index.ts#L17-L87)

Therefore the exact answer to #58 is:

> **Yes within one Worker and one binding set; no across the repository's
> isolated preview and production Workers/D1 databases.**

The safe design is a two-level gate: prove the sealed application build against
the isolated preview stack, then upload a production-bound version from that
same build output and prove that exact production version before selecting its
ID for production traffic. The preview and production Cloudflare version IDs
will necessarily differ.

## What the platform guarantees

### Version and deployment identity

`wrangler versions upload` creates a version but does not deploy it. Wrangler
4.110 returns structured output containing the Worker name, version ID,
versioned preview URL, optional alias URL, and Wrangler environment. Its
`versions deploy` command accepts an existing version ID or tag and creates a
deployment selecting it. [Wrangler 4.110 source: version
upload](https://github.com/cloudflare/workers-sdk/blob/eced61097ea9772354f25b7f6dfde7eefad0154a/packages/wrangler/src/versions/upload.ts#L21-L100),
[Wrangler 4.110 source: version
deployment](https://github.com/cloudflare/workers-sdk/blob/eced61097ea9772354f25b7f6dfde7eefad0154a/packages/wrangler/src/versions/deploy.ts#L41-L111)

The non-interactive promotion primitive is consequently an existing ID, for
example `wrangler versions deploy <version-id>@100% -y`; it is not another
`wrangler deploy`. The latter uploads a new version and immediately sends it
traffic. [Cloudflare: Wrangler Workers
commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/#versions-deploy)

### Testing an uploaded version

When enabled, Cloudflare generates a stable, version-specific `workers.dev` URL
for each uploaded version. `wrangler versions upload` returns that URL. It can
test the exact version without making it the active production deployment.
[Cloudflare: Preview
URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)

Important limits:

- Preview URLs use `workers.dev`, not the production hostname, so they do not
  prove zone-level routing, WAF, redirects, or other hostname-specific behavior.
- Preview URLs are public when enabled unless protected with Cloudflare Access.
- Their default follows `workers_dev`; the repository does not currently set
  `preview_urls`, so the live setting must be inventoried before relying on them.
- Cloudflare currently does not expose logs for preview URLs.
- If custom-hostname behavior must be tested, Cloudflare's alternative is to add
  the candidate to the current deployment at 0% and send a request with the
  `Cloudflare-Workers-Version-Overrides` header. That tests the exact version on
  the production route, but it changes deployment metadata and uses production
  bindings; it is not an isolated preview environment.
- A version override can silently fall back to the deployment's normal traffic
  percentages when the header is invalid, the version is absent from the active
  deployment, or propagation has not completed. With a candidate at 0%, a tracer
  could therefore pass against the old 100% version unless it attests which
  version actually handled every request. The gate must compare an invoked
  version ID with the approved candidate ID through Observability or a narrowly
  exposed version-metadata response/header; HTTP success alone is not evidence.
  [Cloudflare: Version
  overrides](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/),
  [Cloudflare: Version metadata
  binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)

### Bindings, assets, routes, and state

The D1 database ID is a property of the version's `d1` binding. Cloudflare's
version API reports bindings, including the D1 `database_id`, while the version
overview states that static assets are captured with the version. [Cloudflare:
Worker Versions API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/),
[Cloudflare: Static Assets](https://developers.cloudflare.com/workers/static-assets/)

Routes are different: they map incoming URLs to a Worker. The repository's
production templates declare apex routes, while its preview templates do not:

- [`configs/wrangler/pornvideodownloaders.com/preview.jsonc`](../../configs/wrangler/pornvideodownloaders.com/preview.jsonc#L3-L23)
- [`configs/wrangler/pornvideodownloaders.com/production.jsonc`](../../configs/wrangler/pornvideodownloaders.com/production.jsonc#L3-L28)
- [`configs/wrangler/serp.software/preview.jsonc`](../../configs/wrangler/serp.software/preview.jsonc#L3-L23)
- [`configs/wrangler/serp.software/production.jsonc`](../../configs/wrangler/serp.software/production.jsonc#L3-L28)

The release design should keep routes as separately governed infrastructure and
must not apply route changes during ordinary version upload or promotion.
[Cloudflare: Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)

Storage state is outside Worker versions. Testing a version proves its code can
operate with the bound database's **current** schema and contents; it does not
version, promote, or roll back that database. D1 migrations are separate remote
operations recorded in `d1_migrations`. [Cloudflare D1:
Migrations](https://developers.cloudflare.com/d1/reference/migrations/)

## What OpenNext 1.18.1 does

OpenNext's `build` command builds the Next.js application and transforms it into
the `.open-next` Worker output. Its `upload` and `deploy` commands consume an
already-built application; neither invokes the build command.
[OpenNext: CLI](https://opennext.js.org/cloudflare/cli),
[OpenNext 1.18.1 source: build](https://github.com/opennextjs/opennextjs-cloudflare/blob/276edf0fc87bf584cf039630bb5bd332969e2ab4/packages/cloudflare/src/cli/commands/build.ts#L18-L57)

`opennextjs-cloudflare upload` first populates any configured remote cache and
then delegates to `wrangler versions upload`. `deploy` does the corresponding
cache operation and delegates to `wrangler deploy`, which creates a new version
and immediately serves it. [OpenNext 1.18.1 source:
upload](https://github.com/opennextjs/opennextjs-cloudflare/blob/276edf0fc87bf584cf039630bb5bd332969e2ab4/packages/cloudflare/src/cli/commands/upload.ts#L23-L69),
[OpenNext 1.18.1 source:
deploy](https://github.com/opennextjs/opennextjs-cloudflare/blob/276edf0fc87bf584cf039630bb5bd332969e2ab4/packages/cloudflare/src/cli/commands/deploy.ts#L23-L72)

Two consequences matter here:

1. A release workflow can build once and invoke `upload` against preview and
   production configurations without rebuilding the OpenNext output.
2. `upload` is not necessarily mutation-free beyond Worker version creation. If
   OpenNext remote caching is configured, it populates that cache first, and
   cache state is not captured by the Worker version. This repository currently
   uses the default `defineCloudflareConfig()` in both applications, but any
   future cache binding must be included explicitly in release safety analysis.

## Current repository behavior

The repository already exposes both `upload` and `deploy` in
[`scripts/worker-release.ts`](../../scripts/worker-release.ts#L353-L372), but the
active workflows call `deploy`:

- PVD builds independently in both its preview and production jobs and each job
  immediately deploys its new build. See
  [`.github/workflows/deploy-pornvideodownloaders.yml`](../../.github/workflows/deploy-pornvideodownloaders.yml#L47-L99)
  and its separate production build at
  [line 114](../../.github/workflows/deploy-pornvideodownloaders.yml#L114).
- SERP builds and immediately deploys only to production in
  [`.github/workflows/build-and-deploy.yml`](../../.github/workflows/build-and-deploy.yml#L46-L56)
  and [line 108](../../.github/workflows/build-and-deploy.yml#L108).

Thus neither workflow currently promotes an uploaded ID, preserves one build
output across gates, or proves the production-bound version before activation.

The repository also deliberately materializes different remote configurations.
Its validation requires the D1 ID, Worker name, and `D1_RUNTIME_ENV` to match the
selected environment, and requires the apex route only in production.
[`scripts/worker-release.ts`](../../scripts/worker-release.ts#L104-L147) That is
good isolation, but it is precisely why the preview version cannot itself become
the production version.

PVD has separate preview and production Worker/D1/protected-environment
identities in [`scripts/site-targets.ts`](../../scripts/site-targets.ts#L37-L68).
SERP has checked-in preview placeholders but no provisioned preview stack; the
runbook records that exception explicitly.
[`docs/DEPLOY_RUNBOOK.md`](../DEPLOY_RUNBOOK.md#L65-L76)

## D1 boundary

Candidate proof and database rollout must remain separate:

- For `worker-only`, the repository's existing read-only schema check is the
  minimum production-binding precondition. It compares the commit's required
  migrations with the bound database before Worker deployment.
- For `database-and-worker`, preview migration success proves the migration
  against preview D1 only. Production still needs its own retained backup,
  migration, and verification.
- Because D1 state is not in a Worker version, deploying or rolling back a
  Worker ID cannot undo a migration. Schema changes therefore need an
  expand/contract compatibility policy so the old and candidate Workers both
  work during the interval between database and Worker changes.
- The exact production candidate should be uploaded only after production
  schema compatibility is proven. Any pre-activation HTTP proof must be
  read-only unless separately authorized as a database operation.

The current runbook already keeps backup, migration, verification, and Worker
deployment ordered and fail-closed; the versioned-candidate design should retain
those gates rather than fold D1 into artifact promotion.
[`docs/DEPLOY_RUNBOOK.md`](../DEPLOY_RUNBOOK.md#L36-L63)

Two current constraints need their own follow-up before schema-changing releases
can use the same lifecycle safely:

- The workflow's `database-and-worker` mode always runs the immutable initial
  import and then requires publication version `1`. Once an ongoing catalog
  publication advances that state, a later schema-changing release will reject
  the non-bootstrap database before Worker promotion. The release vocabulary
  should separate `worker-only`, reusable `schema-and-worker`, and initial-only
  `bootstrap-and-worker` modes.
- Production Worker releases and production D1 publication/approval workflows
  use different concurrency groups. A publication can therefore change the
  database after candidate proof and before promotion. All production D1
  mutations and candidate promotions need one per-Site release lock.

Neither correction belongs in the first Worker-only tracer bullet, but both are
prerequisites for claiming that schema-and-Worker releases have the same
pre-production guarantee.

## Smallest safe release design

Implement this first for PVD:

1. From one reviewed `main` SHA, run the harness and build OpenNext exactly once.
   Record the SHA and a digest of the `.open-next` output.
2. Prepare preview D1 as the selected release mode requires. Upload the sealed
   output to the existing PVD preview Worker with preview bindings; do not use
   `wrangler deploy`.
3. Run the bounded Visitor/SEO tracer against that preview version. This proves
   the build against isolated Cloudflare and preview D1, but is not the exact
   production version.
4. Prove production D1 schema compatibility, then upload the same sealed output
   to the PVD production Worker with production bindings and no trigger change.
   Capture the resulting production Worker name and version ID.
5. Run the same read-only tracer against that production-bound version's preview
   URL. If production-host routing or zone behavior is essential, use the more
   invasive 0%-deployment/version-override method behind a distinct approval
   gate instead. In that mode, fail closed unless each response is attested to
   the expected candidate version ID; never accept a successful response that
   may have silently fallen back to the old version.
6. Require explicit production approval for that recorded SHA, build digest,
   Worker name, and version ID. Promote with `wrangler versions deploy` at 100%.
   Do not rebuild, re-upload, or run `opennextjs-cloudflare deploy` in this step.
7. Verify that the active deployment reports the approved version ID. A brief
   post-deployment check may confirm route activation, but it is evidence after
   the prevention gates, not the prevention mechanism.

This is the smallest design that preserves both properties we actually need:
isolated preview proof and exact-version production promotion. Calling the two
Cloudflare versions “the same candidate” would be inaccurate; the durable chain
of custody is the reviewed source SHA plus sealed build digest, followed by exact
promotion of the separately created production-bound version ID.

## Site-specific feasibility

### `pornvideodownloaders.com`

Feasible after workflow and release-tool changes. Its preview Worker, preview D1,
protected environment, templates, and confirmation gates already exist. No new
Cloudflare resource is required for the two-level design, although preview URL
and Access settings must be inventoried read-only before implementation.

### `serp.software`

The production-bound upload → preview-URL → exact-ID promotion portion is
technically feasible without a separate preview stack, but it would exercise
production D1 and would not satisfy the repository's isolated-preview goal.

Full parity requires explicit authorization and provisioning of:

- a separate SERP preview Worker;
- a separate SERP preview D1 database;
- the `preview` protected GitHub environment with scoped credentials;
- a non-production endpoint or enabled, access-controlled version preview URL;
- a preview workflow path with the same D1 backup/migration/verification gates.

The templates and site-target metadata already name these concepts, but they are
not evidence that the remote resources exist.

## Remaining Maintainer decisions

Only these product/operations choices remain after the technical research:

1. Whether the production-bound pre-activation tracer may make **read-only**
   requests to production D1 through a version preview URL.
2. Whether `workers.dev` fidelity is sufficient, or production-host behavior is
   important enough to authorize a 0% deployment plus version override.
3. Whether preview URLs should be public or protected by Cloudflare Access.
4. Whether to provision the missing SERP preview Worker, D1 database, protected
   environment, and endpoint now or implement the design for PVD first.

No deployment, upload, route change, resource provisioning, or D1 access was
performed for this research.
