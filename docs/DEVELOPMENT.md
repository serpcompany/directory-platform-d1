# Development

Install dependencies with Node 24 and `pnpm install`.

Initialize and verify the isolated local database:

```bash
pnpm d1:local:migrate
pnpm d1:local:import
pnpm d1:local:verify
```

Those aliases target `serp.software`. For the second site:

```bash
pnpm d1:pornvideodownloaders:local:migrate
pnpm d1:pornvideodownloaders:local:import
pnpm d1:pornvideodownloaders:local:verify
```

The aliases call the canonical guard with an explicit registered site:

```bash
pnpm tsx scripts/d1-local-guard.ts <migrate|import|verify|publish> \
  --site <site-id>
```

The underlying command has no default tenant and rejects unknown site IDs.

Start the local OpenNext Worker:

```bash
pnpm dev
```

Use `pnpm preview:pornvideodownloaders` for the
`pornvideodownloaders.com` Worker.

The local guard pins the local Worker name, D1 name, D1 ID, Wrangler config, and
`--local` mode. It refuses to overwrite a catalog with a different publication
checksum. Checked-in Worker templates are grouped by site under
`configs/wrangler/<site-id>/`; generated state remains outside that source area.

For code changes, run:

```bash
pnpm harness:fast
pnpm harness:check
```

Add application queries to the catalog repository, not client components. Add a D1
migration for schema changes and a reviewed publication manifest for catalog changes.
Do not add a default site selection or a file-backed catalog path.

For an agent-readable isolated runtime:

```bash
pnpm worktree:init -- task-name
pnpm agent:manifest
pnpm agent:dev
```

The default aliases above are explicit `serp.software` commands. Use the
`agent:pornvideodownloaders:*` variants for the second Worker.

See [HARNESS.md](./HARNESS.md) for worktree, log, evidence, and review workflows.
Inspecting another legacy site starts with [MIGRATION_SOP.md](./MIGRATION_SOP.md);
the preflight is read-only; activation still requires the complete per-site runtime,
data, release, and isolation work.
