# Development

Install dependencies with Node 24 and `pnpm install`.

Initialize and verify the isolated local database:

```bash
pnpm d1:local:migrate
pnpm d1:local:import
pnpm d1:local:verify
```

Start the local OpenNext Worker:

```bash
pnpm dev
```

The local guard pins the local Worker name, D1 name, D1 ID, Wrangler config, and
`--local` mode. It refuses to overwrite a catalog with a different publication
checksum.

For code changes, run:

```bash
pnpm test:repo
pnpm test:d1
pnpm typecheck
pnpm worker:build
```

Add application queries to the catalog repository, not client components. Add a D1
migration for schema changes and a reviewed publication manifest for catalog changes.
Do not create a second site/default config or a file-backed catalog path.
