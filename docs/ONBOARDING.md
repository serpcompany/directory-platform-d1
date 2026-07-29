# Directory onboarding

- Checked-in site settings: `sites/site-config.default.ts` and
  `sites/<id>/site-config.ts`.
- Optional site-owned copy: `sites/<id>/site-content.ts`.
- Runtime listing/category source: the site's isolated Cloudflare D1 binding.
- Schema: `d1/migrations/`.
- Reviewed intake: `d1/proposals/`.
- Approved mutations: `d1/publications/`.
- Thin wrapper scaffold: `pnpm generate:site-wrapper -- --site <id>`.

`serp.software` is the only active deployable site. The default/starter wrapper remains
framework infrastructure. Historical listing JSON is not an authoring or runtime
contract; it is retained only as a versioned migration input until rollback and restore
acceptance.

Before promoting another site, define a separate D1 identity for local, preview, and
production, add a server-only repository boundary, validate the Worker configuration,
and complete runtime/SEO/visual parity without a JSON fallback.
