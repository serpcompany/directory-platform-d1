# Architecture

The public application is `apps/serp.software`, built by
`@opennextjs/cloudflare` and deployed as a Cloudflare Worker.

Each request reaches the Worker with a D1 database bound as `DB`. Server components
and route handlers call the server-only catalog repository. That repository performs
prepared SQL queries and maps relational rows into the existing website view model.
There is no filesystem fallback.

```text
Browser
  -> Cloudflare Worker / Next.js routes
     -> server-only catalog repository
        -> D1 binding (DB)
           -> listings, categories, listing_categories, publication_state
```

The same repository supplies home/category/product pages, `/api/search`, RSS, and
sitemap inputs. Site presentation settings remain checked in at
`sites/serp.software/site-config.ts`; they do not contain catalog records.

`D1_RUNTIME_ENV` must match the intended local, preview, or production environment.
Wrangler configuration keeps those identities separate. Production commands also
require a clean `main` checkout inside an approved GitHub Actions workflow.
