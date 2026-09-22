# Development

Install dependencies with Node 24 and `pnpm install`.

For the replacement-database Drizzle foundation, generate and exercise the isolated
fresh lineage with explicit Site commands:

```bash
pnpm d1:drizzle:local:generate
pnpm d1:drizzle:local:list
pnpm d1:drizzle:local:apply
pnpm d1:drizzle:local:verify
```

Use the `d1:drizzle:pornvideodownloaders:local:*` variants for the second Site. These
commands materialize ignored, local-only Wrangler configuration and state, point only
at `d1/drizzle/`, and never access Preview or Production. Generation is target-neutral
and credential-free. Review generated SQL—including D1 `STRICT`, trigger, check,
collation, and partial-index companion details—before committing it. Never use
`drizzle-kit push` for a shared environment.

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

Add public catalog queries once to `packages/data-ops/`, not to a site adapter or
Client Component. Keep `apps/<site-id>/lib/catalog/repository.ts` as the server-only
binding, site-identity, cache, observer, and request-deduplication adapter. A future
site must instantiate the shared operations rather than copy SQL.

Run the focused shared contract and scan benchmark with:

```bash
pnpm --filter @serpdirectory/data-ops test
pnpm --filter @serpdirectory/data-ops benchmark
```

Add justified schema changes to the shared schema and generate a reviewed fresh D1
migration. Do not edit the released legacy `d1/migrations/0001`-`0009` lineage. Use a
reviewed publication manifest for catalog changes. Do not add a default site selection
or a file-backed catalog path.

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
