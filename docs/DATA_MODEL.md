# D1 data model

The schema is versioned in `d1/migrations/`.

- `sites` identifies the tenant.
- `categories` stores active taxonomy rows and display order.
- `listings` stores public product fields, status, publication time, and stable IDs.
- `listing_categories` stores ordered many-to-many category membership.
- `listing_resources` and `listing_faqs` store repeatable detail content.
- `publication_state` records the current version and checksum.
- publication audit tables record applied manifests and operations.
- `listing_submissions` stores private pending, verified, approved, or rejected
  intake and only a digest of its public access capability.
- submission resource, FAQ, event, and rate-limit tables normalize repeatable data,
  state transitions, and abuse controls.
- `listing_submission_notifications` records the private GitHub review issue assigned
  for a badge-verified submission. It is an operational delivery ledger, not the
  submission source of truth.

Public queries require the `serp.software` site ID, approved status, active rows, and
a publication time that is not in the future.

Creating or badge-verifying a submission never satisfies those public predicates.
Only the protected submission approval workflow can promote a verified row into the
public tables, and that operation records publication provenance.

The scheduled notification workflow reads verified rows without a notification
ledger entry, creates or recovers one assigned issue in the private repository, and
records its number and URL in D1. Approving or declining still operates on the D1 row;
the issue is only the reviewer inbox.

Ongoing data changes use reviewed YAML manifests under `d1/publications/`. The D1
publisher validates the base version, prior checksum, IDs, slugs, URLs, categories,
and repeatable fields before sending one batch. YAML is a review envelope, not an
alternate runtime database.

`d1/artifacts/serp-software-v1.sql` and its batch/parity files preserve the initial
bootstrap. They are immutable release evidence and must not be treated as editable
catalog source.

Future initial site imports must follow [the migration SOP](./MIGRATION_SOP.md). The
presence of `site_id` columns does not by itself prove safe multisite runtime,
publication, backup, or deployment behavior.
