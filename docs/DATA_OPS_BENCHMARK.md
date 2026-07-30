# Shared catalog data-operations benchmark

Status: local source evidence  
Recorded: 2026-07-30  
Command: `pnpm --filter @serpdirectory/data-ops benchmark`

This benchmark compares frozen legacy hotspot query shapes with the shared
`packages/data-ops/` implementation on a deterministic two-site SQLite fixture. It
uses SQLite statement scan status as a safe local surrogate for D1 rows scanned.
These values are not Cloudflare billing data and do not claim post-deployment
production results.

The fixture contains two isolated sites, 320 eligible listings per site, three
categories, ordering ties, multi-category memberships, logos and other media,
resources, FAQs, redirects, and ineligible rows. The optimized operations always
receive an explicit site identity.

| Operation | Legacy scan rows | Shared scan rows | Local change |
| --- | ---: | ---: | ---: |
| Previous and next navigation | 1,281 | 4 | -99.7% |
| Related listings | 1,279 | 36 | -97.2% |
| Related listings, single-category index path | 1,279 | 38 | -97.0% |
| Shell counts, cold | n/a | 1,455 | n/a |
| Shell counts, warm | n/a | 0 | n/a |
| Shell counts, one cold plus 99 warm average | n/a | 14.55 | n/a |

Navigation uses bounded index seeks instead of materializing a full eligible-catalog
window. Related selection seeks the partial `listings_related_name_idx` in ranking
order and uses indexed membership existence checks, stopping after four matches at
each score. This applies to both single- and multi-category listings without a
temporary grouping tree. The catalog data cache reads the indexed publication
version on each request; warm published-summary, detail, and shell hits avoid their
stable query work.
Migration `0009_related_listing_name_index.sql` adds this one evidence-backed index;
it was later applied to both production databases through their protected
database-and-Worker workflows.

A local OpenNext/Miniflare route using 339 eligible SERP listings independently
reported genuine D1 metadata of 10 rows read for the single-category related query
plus four logo-index rows. Before the partial index, the same local operation
reported 1,015 rows read.

After the first preview deployment, live Cloudflare D1 metadata exposed a remaining
multi-category grouping path: it read 1,040 rows before hydration. A read-only
replacement query against the actual PVD preview database returned the identical
four ranked slugs in 25 rows and used `listings_related_name_idx` with no temporary
grouping tree. The shared implementation now uses that shape. Deployed after-evidence
is recorded in
[`docs/exec-plans/completed/d1-live-metrics-followup.md`](./exec-plans/completed/d1-live-metrics-followup.md),
not inferred
from this local benchmark.

The representative cold detail operation executes six D1 statements and the benchmark
finishes in under 0.4 seconds locally. Summary/card contracts assert that they do not
hydrate detail content, resource links, FAQs, or non-logo media.

The production baselines that motivated this work were approximately 2,004 rows
scanned per navigation execution, 2,293 per related-listing execution, and 1,565 per
active-category-count execution. Genuine D1 `rows_read`, route-level D1 call counts
from a deployed revision, and clean-runner CI timing are recorded in the relevant
ExecPlans rather than inferred from this local surrogate.
