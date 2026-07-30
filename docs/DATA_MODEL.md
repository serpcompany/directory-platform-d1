# D1 data model

The schema is versioned in `d1/migrations/`.

- `sites` identifies the tenant.
- `categories` stores active taxonomy rows and display order.
- `listings` stores public product fields, status, publication time, and stable IDs.
- `listing_categories` stores ordered many-to-many category membership.
- `listing_resource_links` and `listing_faqs` store repeatable detail content.
- `publication_state` records the current version and checksum.
- publication audit tables record applied manifests and operations.
- `listing_submissions` stores private pending, verified, approved, or rejected
  intake and only a digest of its public access capability.
- submission resource, FAQ, event, and rate-limit tables normalize repeatable data,
  state transitions, and abuse controls.
- `listing_submission_notifications` records the private GitHub review issue assigned
  for a badge-verified submission and the SHA-256 digest of its private draft-preview
  capability. The raw capability is never stored in D1. This table is an operational
  delivery ledger, not the submission source of truth.

Public queries require the Worker-selected site ID, approved status, active rows, and
a publication time that is not in the future. `serp.software` and
`pornvideodownloaders.com` use separate local and production D1 databases as well as
tenant predicates, so an incorrect binding or site ID fails closed. PVD additionally
has an isolated preview database. SERP does not yet have a proper preview database.

Public catalog reads are implemented once in `packages/data-ops/`. Each application
adapter supplies its validated D1 binding and checked-in site identity explicitly.
List and card operations return lightweight summary projections; detail operations
alone hydrate full content, media, and resource links. Stable category and featured
counts use a site- and publication-version-keyed 60-second data cache, with live D1
fallback on cache failure. This does not enable public full-page caching.

`listings_related_name_idx` is a partial public-listing index used only to preserve
the exact `name, slug` related-card ranking while seeking through eligible rows.
Draft, inactive, and unpublished rows are omitted from that index. Its additional
write/storage cost is accepted for publication-time changes; it is not evidence of
ongoing public-site writes.

Creating or badge-verifying a submission never satisfies those public predicates.
Only the protected submission approval workflow can promote a verified row into the
public tables, and that operation records publication provenance.

The scheduled notification workflow reads verified rows without a notification
ledger entry, creates or recovers one assigned issue in the private repository, and
records its number and URL in D1. Approving or declining still operates on the D1 row;
the issue is only the reviewer inbox. Private draft reads join the notification
ledger to the staged submission and require both a matching capability digest and
`verified` status, so either approval or rejection revokes access automatically.

Ongoing data changes use reviewed YAML manifests under `d1/publications/`. The D1
publisher validates the base version, prior checksum, IDs, slugs, URLs, categories,
and repeatable fields before sending one batch. YAML is a review envelope, not an
alternate runtime database.

`d1/artifacts/serp-software-v1.sql`,
`d1/artifacts/pornvideodownloaders-com-v1.sql`, and their batch/parity files preserve
the initial bootstraps. They are immutable release evidence and must not be treated
as editable catalog source.

Future initial site imports must follow [the migration SOP](./MIGRATION_SOP.md). The
presence of `site_id` columns does not by itself prove safe multisite runtime,
publication, backup, or deployment behavior. The per-site target registry and
protected workflows are part of that proof.
