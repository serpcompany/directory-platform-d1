# Submission flow

The public `/submit` page queries active categories from D1 and renders a client-side
form. Submitting opens a prefilled issue in `serpcompany/serp.software`; it does not
write to D1.

The issue repository calls `.github/workflows/reusable-verify-badge.yml`. A successful
badge check creates a proposal PR in `serpcompany/directory-platform-d1` under
`d1/proposals/`. Proposals are review documents and cannot mutate production.

A maintainer converts an accepted proposal into a versioned manifest under
`d1/publications/`. The protected `publish-d1.yml` workflow:

1. requires the `publish-serp.software-production` confirmation and production
   environment approval;
2. retains a pre-change D1 export;
3. validates tenant, base version, prior checksum, records, and categories;
4. applies the reviewed manifest as one D1 batch;
5. records publication state and audit operations.

The public form is implemented in
`packages/web-core/src/forms/github-issue-submit-form.tsx`; the D1 publisher is
`scripts/d1-publisher.ts`.
