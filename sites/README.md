# Site configuration

`serp.software` is the only active site.

- `serp.software/site-config.ts` defines presentation, routes, features, social
  targets, and the OpenNext Worker deployment strategy.
- `serp.software/site-content.ts` defines optional site-owned presentation content.
- `serp.software/content/` contains site-authored non-catalog pages.

Catalog records and taxonomy do not belong under `sites/`. They are read from the D1
`DB` binding and changed through migrations or reviewed publication manifests.
