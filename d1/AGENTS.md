# D1 change rules

- Migrations are forward-only, ordered, idempotent where practical, and tested
  against a fresh local database.
- Never edit an artifact that has participated in a release.
- Initial import artifacts require source hashes, row counts, exact slug parity, and a
  publication checksum.
- Ongoing mutations use reviewed manifests under `publications/`; proposals do not
  mutate a database.
- Stable listing IDs survive slug changes.
- Production backup, migration, import, verification, and publication run only
  through protected workflows.

Read [the data model](../docs/DATA_MODEL.md), [migration SOP](../docs/MIGRATION_SOP.md),
and [deploy runbook](../docs/DEPLOY_RUNBOOK.md) before changing this directory.
