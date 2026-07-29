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
pnpm harness:fast
pnpm harness:check
```

Add application queries to the catalog repository, not client components. Add a D1
migration for schema changes and a reviewed publication manifest for catalog changes.
Do not create a second site/default config or a file-backed catalog path.

For an agent-readable isolated runtime:

```bash
pnpm worktree:init -- task-name
pnpm agent:manifest
pnpm agent:dev
```

See [HARNESS.md](./HARNESS.md) for worktree, log, evidence, and review workflows.
Inspecting another legacy site starts with [MIGRATION_SOP.md](./MIGRATION_SOP.md);
the preflight is read-only and does not make this runtime multisite.
