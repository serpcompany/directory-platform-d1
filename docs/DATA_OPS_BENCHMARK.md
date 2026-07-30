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
| Related listings | 1,279 | 648 | -49.3% |
| Related listings, single-category index path | 1,279 | 38 | -97.0% |
| Shell counts, cold | n/a | 1,456 | n/a |
| Shell counts, warm | n/a | 1 | n/a |
| Shell counts, one cold plus 99 warm average | n/a | 15.55 | n/a |

Navigation uses bounded index seeks instead of materializing a full eligible-catalog
window. Related selection enters through category membership indexes, ranks
candidates deterministically, then hydrates only selected summary cards and logos.
Single-category listings seek the partial `listings_related_name_idx` in ranking
order and stop after four eligible category matches. The shell-count cache reads the
indexed publication version on every request; a warm hit avoids the aggregate query.
Migration `0009_related_listing_name_index.sql` adds this one evidence-backed index;
no remote migration was applied.

A local OpenNext/Miniflare route using 339 eligible SERP listings independently
reported genuine D1 metadata of 10 rows read for the single-category related query
plus four logo-index rows. Before the partial index, the same local operation
reported 1,015 rows read. This is local runtime evidence, not a deployed-production
measurement.

The representative detail operation executes seven D1 statements and the benchmark
finishes in under 0.4 seconds locally. Summary/card contracts assert that they do not
hydrate detail content, resource links, FAQs, or non-logo media.

The production baselines that motivated this work were approximately 2,004 rows
scanned per navigation execution, 2,293 per related-listing execution, and 1,565 per
active-category-count execution. Genuine D1 `rows_read`, route-level D1 call counts
from a deployed revision, and clean-runner CI timing remain post-publication evidence;
they are intentionally not fabricated or collected through a remote mutation here.
