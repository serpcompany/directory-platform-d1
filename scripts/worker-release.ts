import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const environments = ['preview', 'production'] as const
type WorkerEnvironment = (typeof environments)[number]
type ProductionCommand = 'backup' | 'deploy' | 'import' | 'migrate' | 'upload' | 'verify'

const configPaths: Record<WorkerEnvironment, string> = {
  preview: 'wrangler.preview.jsonc',
  production: 'wrangler.production.jsonc'
}
const placeholders: Record<WorkerEnvironment, Record<string, string>> = {
  preview: {
    CLOUDFLARE_D1_PREVIEW_DATABASE_ID: '${CLOUDFLARE_D1_PREVIEW_DATABASE_ID}',
    CLOUDFLARE_D1_PREVIEW_DATABASE_NAME: '${CLOUDFLARE_D1_PREVIEW_DATABASE_NAME}',
    CLOUDFLARE_WORKER_PREVIEW_NAME: '${CLOUDFLARE_WORKER_PREVIEW_NAME}'
  },
  production: {
    CLOUDFLARE_D1_PRODUCTION_DATABASE_ID: '${CLOUDFLARE_D1_PRODUCTION_DATABASE_ID}',
    CLOUDFLARE_D1_PRODUCTION_DATABASE_NAME: '${CLOUDFLARE_D1_PRODUCTION_DATABASE_NAME}',
    CLOUDFLARE_WORKER_PRODUCTION_NAME: '${CLOUDFLARE_WORKER_PRODUCTION_NAME}'
  }
}

interface WorkerConfig {
  assets?: { binding?: string; directory?: string }
  compatibility_flags?: string[]
  d1_databases?: Array<{ binding?: string; database_id?: string; database_name?: string; migrations_dir?: string }>
  main?: string
  name?: string
  routes?: Array<{ pattern?: string; zone_name?: string }>
  vars?: { D1_RUNTIME_ENV?: string; NEXT_PUBLIC_SITE_ID?: string; SITE_ID?: string }
}

export interface WorkerReleaseProcessResult {
  status: number | null
  stderr?: string | Buffer
  stdout?: string | Buffer
}

export interface WorkerReleaseDependencies {
  readFile(path: string): Buffer
  run(command: string, args: string[], options: { encoding?: BufferEncoding; stdio?: 'inherit' }): WorkerReleaseProcessResult
}

const defaultDependencies: WorkerReleaseDependencies = {
  readFile: path => readFileSync(path),
  run: (command, args, options) => spawnSync(command, args, options)
}

function parseEnvironment(value: string | undefined): WorkerEnvironment {
  if (value === 'preview' || value === 'production') return value
  throw new Error('Worker environment must be "preview" or "production".')
}

function readTemplate(environment: WorkerEnvironment): { config: WorkerConfig; source: string } {
  const source = readFileSync(resolve(configPaths[environment]), 'utf8')
  return { config: JSON.parse(source) as WorkerConfig, source }
}

export function validateWorkerConfig(environment: WorkerEnvironment): void {
  const { config, source } = readTemplate(environment)
  const binding = config.d1_databases?.find(item => item.binding === 'DB')
  const expected = placeholders[environment]
  const upper = environment.toUpperCase()
  const otherEnvironment = environment === 'preview' ? 'production' : 'preview'
  if (config.name !== expected[`CLOUDFLARE_WORKER_${upper}_NAME`]) throw new Error('Unexpected Worker name placeholder.')
  if (config.main !== 'apps/serp.software/.open-next/worker.js') throw new Error('Unexpected Worker entrypoint.')
  if (config.assets?.directory !== 'apps/serp.software/.open-next/assets' || config.assets.binding !== 'ASSETS') throw new Error('Unexpected OpenNext assets contract.')
  if (!config.compatibility_flags?.includes('nodejs_compat')) throw new Error('nodejs_compat is required.')
  if (
    environment === 'production' &&
    !config.routes?.some(route => route.pattern === 'serp.software/*' && route.zone_name === 'serp.software')
  ) {
    throw new Error('Production Worker must own the serp.software apex route.')
  }
  if (config.vars?.D1_RUNTIME_ENV !== environment) throw new Error('D1_RUNTIME_ENV must match the template environment.')
  if (config.vars?.SITE_ID !== 'serp.software' || config.vars.NEXT_PUBLIC_SITE_ID !== 'serp.software') throw new Error('Worker templates must remain scoped to serp.software.')
  if (binding?.database_id !== expected[`CLOUDFLARE_D1_${upper}_DATABASE_ID`]) throw new Error('Unexpected D1 ID placeholder.')
  if (binding?.database_name !== expected[`CLOUDFLARE_D1_${upper}_DATABASE_NAME`]) throw new Error('Unexpected D1 name placeholder.')
  if (binding?.migrations_dir !== 'd1/migrations') throw new Error('Unexpected D1 migrations directory.')
  if (source.toLowerCase().includes(otherEnvironment)) throw new Error(`${configPaths[environment]} references ${otherEnvironment}.`)
}

function assertProductionWorkflow(env: NodeJS.ProcessEnv, dependencies: WorkerReleaseDependencies): void {
  const workflowRef = env.GITHUB_WORKFLOW_REF || ''
  const isDeployWorkflow = workflowRef.includes('/.github/workflows/build-and-deploy.yml@')
  const isPublicationWorkflow = workflowRef.includes('/.github/workflows/publish-d1.yml@')
  if (env.GITHUB_ACTIONS !== 'true' || env.CI !== 'true' || (!isDeployWorkflow && !isPublicationWorkflow)) {
    throw new Error('Production execution is authorized only by a protected production workflow in GitHub Actions.')
  }
  if (env.GITHUB_REF !== 'refs/heads/main' || !env.GITHUB_SHA) throw new Error('Production execution requires the main branch and a nonempty GitHub SHA.')
  const expectedConfirmation = isPublicationWorkflow ? 'publish-serp.software-production' : 'deploy-serp.software-production'
  if (env.WORKER_PRODUCTION_CONFIRM !== expectedConfirmation) throw new Error('Explicit production confirmation is required.')
  const status = dependencies.run('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' })
  if (status.status !== 0 || String(status.stdout ?? '').trim()) throw new Error('Production execution requires a clean source checkout.')
  const head = dependencies.run('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (head.status !== 0 || String(head.stdout ?? '').trim() !== env.GITHUB_SHA) throw new Error('Checked-out HEAD must match GITHUB_SHA.')
}

function materializeConfig(environment: WorkerEnvironment, env: NodeJS.ProcessEnv): { configPath: string; databaseName: string } {
  validateWorkerConfig(environment)
  let { source } = readTemplate(environment)
  for (const [name, placeholder] of Object.entries(placeholders[environment])) {
    const value = env[name]
    if (!value || value === placeholder) throw new Error(`Missing required environment value ${name}.`)
    source = source.replaceAll(placeholder, value)
  }
  if (source.includes('${CLOUDFLARE_')) throw new Error('Unresolved Cloudflare placeholder.')
  const configPath = resolve('.wrangler/generated', `wrangler.${environment}.jsonc`)
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, source)
  return { configPath, databaseName: env[`CLOUDFLARE_D1_${environment.toUpperCase()}_DATABASE_NAME`] as string }
}

function runChecked(dependencies: WorkerReleaseDependencies, command: string, args: string[], capture = false): WorkerReleaseProcessResult {
  const result = dependencies.run(command, args, capture ? { encoding: 'utf8' } : { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? 1}: ${String(result.stderr ?? '')}`)
  return result
}

function parseD1Rows(output: string): Array<Record<string, unknown>> {
  const payload = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>>; success?: boolean }>
  if (!Array.isArray(payload) || payload.some(result => result.success === false)) {
    throw new Error('D1 command returned an unsuccessful result.')
  }
  return payload.flatMap(result => result.results ?? [])
}

function readMigrationReport(): {
  parity: { exactSlugSet: string[]; importBatches: number }
  target: { checksum: string; listingCount: number }
} {
  return parse(readFileSync(resolve('d1/artifacts/serp-software-v1-parity.yaml'), 'utf8')) as {
    parity: { exactSlugSet: string[]; importBatches: number }
    target: { checksum: string; listingCount: number }
  }
}

function runProduction(command: ProductionCommand, env: NodeJS.ProcessEnv, dependencies: WorkerReleaseDependencies): void {
  assertProductionWorkflow(env, dependencies)
  const { configPath, databaseName } = materializeConfig('production', env)
  if (command === 'upload' || command === 'deploy') {
    runChecked(dependencies, 'pnpm', ['--filter', 'serp.software', 'exec', 'opennextjs-cloudflare', command, '--config', configPath])
    return
  }
  if (command === 'backup') {
    const backupPath = resolve('.wrangler/backups', `${env.GITHUB_SHA}.sql`)
    mkdirSync(dirname(backupPath), { recursive: true })
    runChecked(dependencies, 'pnpm', ['exec', 'wrangler', 'd1', 'export', databaseName, '--remote', '--config', configPath, '--output', backupPath])
    console.log(JSON.stringify({ backupPath, checksum: createHash('sha256').update(dependencies.readFile(backupPath)).digest('hex') }))
    return
  }
  if (command === 'migrate') {
    runChecked(dependencies, 'pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', databaseName, '--remote', '--config', configPath])
    return
  }
  const report = readMigrationReport()
  if (command === 'import') {
    const stateResult = runChecked(dependencies, 'pnpm', ['exec', 'wrangler', 'd1', 'execute', databaseName, '--remote', '--config', configPath, '--command', "SELECT checksum FROM publication_state WHERE site_id='serp.software'", '--json'], true)
    const stateRows = parseD1Rows(String(stateResult.stdout ?? ''))
    if (stateRows[0]?.checksum === report.target.checksum) {
      console.log(`Production D1 already matches ${report.target.checksum}; import is a no-op.`)
      return
    }
    if (stateRows.length > 0) throw new Error('Refusing to overwrite an existing production publication.')
    for (let index = 1; index <= report.parity.importBatches; index += 1) {
      const batchPath = `d1/artifacts/serp-software-v1-import/${String(index).padStart(4, '0')}.sql`
      runChecked(dependencies, 'pnpm', ['exec', 'wrangler', 'd1', 'execute', databaseName, '--remote', '--config', configPath, '--file', batchPath, '--yes'])
    }
    return
  }
  const query = "SELECT ps.version, ps.checksum, (SELECT COUNT(*) FROM listings l WHERE l.site_id='serp.software' AND l.status='approved' AND l.is_active=1 AND l.published_at IS NOT NULL AND datetime(l.published_at)<=datetime('now')) AS approved_count, (SELECT group_concat(slug, char(0)) FROM (SELECT slug FROM listings l WHERE l.site_id='serp.software' AND l.status='approved' AND l.is_active=1 AND l.published_at IS NOT NULL AND datetime(l.published_at)<=datetime('now') ORDER BY slug)) AS slugs FROM publication_state ps WHERE ps.site_id='serp.software'"
  const result = runChecked(dependencies, 'pnpm', ['exec', 'wrangler', 'd1', 'execute', databaseName, '--remote', '--config', configPath, '--command', query, '--json'], true)
  const output = String(result.stdout ?? '')
  if (!output.trim()) throw new Error('Production verification returned no result.')
  const rows = parseD1Rows(output)
  const row = rows[0]
  const actualSlugs = typeof row?.slugs === 'string' ? row.slugs.split('\0') : []
  if (
    rows.length !== 1 ||
    row?.checksum !== report.target.checksum ||
    row.version !== 1 ||
    row.approved_count !== report.target.listingCount ||
    actualSlugs.join('\0') !== report.parity.exactSlugSet.join('\0')
  ) {
    throw new Error('Production D1 does not match the reviewed migration report.')
  }
  console.log(JSON.stringify({ checksum: row.checksum, count: row.approved_count, version: row.version }))
}

function printRemotePlan(kind: 'migration' | 'verify', environment: WorkerEnvironment, env: NodeJS.ProcessEnv): void {
  if (env.D1_REMOTE_CONFIRM !== `plan-serp.software-${environment}`) throw new Error(`D1_REMOTE_CONFIRM must equal plan-serp.software-${environment}.`)
  validateWorkerConfig(environment)
  const migrations = readdirSync(resolve('d1/migrations')).filter(file => file.endsWith('.sql')).sort()
  const checksum = createHash('sha256').update(migrations.map(file => readFileSync(resolve('d1/migrations', file))).join('\n')).digest('hex')
  console.log(JSON.stringify({ dryRun: true, environment, kind, migrations, checksum, executesRemoteCommand: false }, null, 2))
}

export function runWorkerRelease(argv: string[], env: NodeJS.ProcessEnv = process.env, dependencies: WorkerReleaseDependencies = defaultDependencies): void {
  const [command, environmentValue] = argv
  const environment = parseEnvironment(environmentValue)
  if (command === 'validate') return validateWorkerConfig(environment)
  if (command === 'plan-migration' || command === 'plan-verify') return printRemotePlan(command === 'plan-migration' ? 'migration' : 'verify', environment, env)
  if (environment === 'production' && ['backup', 'deploy', 'import', 'migrate', 'upload', 'verify'].includes(command)) return runProduction(command as ProductionCommand, env, dependencies)
  throw new Error('Unsupported or unauthorized Worker release command.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) runWorkerRelease(process.argv.slice(2))
