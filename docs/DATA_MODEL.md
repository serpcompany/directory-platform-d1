# D1 data model

The schema is versioned in `d1/migrations/`.

- `sites` identifies the tenant.
- `categories` stores active taxonomy rows and display order.
- `listings` stores public product fields, status, publication time, and stable IDs.
- `listing_categories` stores ordered many-to-many category membership.
- `listing_resources` and `listing_faqs` store repeatable detail content.
- `publication_state` records the current version and checksum.
- publication audit tables record applied manifests and operations.

Public queries require the `serp.software` site ID, approved status, active rows, and
a publication time that is not in the future.

Ongoing data changes use reviewed YAML manifests under `d1/publications/`. The D1
publisher validates the base version, prior checksum, IDs, slugs, URLs, categories,
and repeatable fields before sending one batch. YAML is a review envelope, not an
alternate runtime database.

`d1/artifacts/serp-software-v1.sql` and its batch/parity files preserve the initial
bootstrap. They are immutable release evidence and must not be treated as editable
catalog source.
