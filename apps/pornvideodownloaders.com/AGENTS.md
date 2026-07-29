# `pornvideodownloaders.com` application rules

This application is a Cloudflare Worker, not a filesystem-backed Next.js site.

- Keep catalog reads in `lib/catalog/repository.ts` and server-only modules.
- Client Components may consume serialized results or `/api/search`; they may not
  import D1 bindings, repositories, or Wrangler configuration.
- New public routes must preserve D1 eligibility rules and be represented in sitemap
  behavior where appropriate.
- Use the checked-in config from `sites/pornvideodownloaders.com/`; do not introduce
  defaults or another source-kind branch.
- Validate Worker compatibility with `pnpm worker:build`.
- Use `pnpm agent:pornvideodownloaders:dev` when runtime logs and isolated D1 state
  are needed.

See [Architecture](../../docs/ARCHITECTURE.md) and
[Harness](../../docs/HARNESS.md).
