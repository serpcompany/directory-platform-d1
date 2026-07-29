import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const DATABASE_NAME = 'serp-software-local'
const DATABASE_ID = '00000000-0000-0000-0000-000000000002'
const CONFIG_PATH = 'wrangler.jsonc'
const STATE_PATH = '.wrangler/state'
const ARTIFACT_PATH = 'd1/artifacts/serp-software-v1.sql'
const ARTIFACT_BATCH_DIRECTORY = 'd1/artifacts/serp-software-v1-import'
const REPORT_PATH = 'd1/artifacts/serp-software-v1-parity.yaml'

interface WranglerConfig {
  d1_databases?: Array<{ binding?: string; database_id?: string; database_name?: string }>
  name?: string
  vars?: { D1_RUNTIME_ENV?: string }
}

function validateLocalConfig(): void {
  const config = JSON.parse(readFileSync(resolve(CONFIG_PATH), 'utf8')) as WranglerConfig
  const binding = config.d1_databases?.find(candidate => candidate.binding === 'DB')
  if (config.name !== DATABASE_NAME || config.vars?.D1_RUNTIME_ENV !== 'local') throw new Error('Wrangler config is not the dedicated local serp.software Worker.')
  if (!binding || binding.database_name !== DATABASE_NAME || binding.database_id !== DATABASE_ID) throw new Error('Refusing non-local, preview, or production D1 identity.')
}

function wrangler(args: string[], capture = false): string {
  return execFileSync('pnpm', ['exec', 'wrangler', ...args, '--local', '--persist-to', STATE_PATH, '--config', CONFIG_PATH], {
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  }) || ''
}

function query(command: string): unknown[] {
  const output = wrangler(['d1', 'execute', DATABASE_NAME, '--command', command, '--json'], true)
  const parsed = JSON.parse(output) as Array<{ results?: unknown[] }>
  return parsed[0]?.results || []
}

function migrate(): void {
  wrangler(['d1', 'migrations', 'apply', DATABASE_NAME])
}

function importArtifact(): void {
  const report = parse(readFileSync(resolve(REPORT_PATH), 'utf8')) as { parity: { importBatches: number }; target: { checksum: string } }
  const current = query("SELECT checksum FROM publication_state WHERE site_id = 'serp.software'") as Array<{ checksum?: string }>
  if (current[0]?.checksum === report.target.checksum) {
    console.log(`Local D1 already matches ${report.target.checksum}; import is a no-op.`)
    return
  }
  if (current[0]?.checksum) throw new Error('Refusing to overwrite a different published catalog; publish a manifest instead.')
  for (let index = 1; index <= report.parity.importBatches; index += 1) {
    const batchPath = `${ARTIFACT_BATCH_DIRECTORY}/${String(index).padStart(4, '0')}.sql`
    wrangler(['d1', 'execute', DATABASE_NAME, '--file', batchPath, '--yes'])
    console.log(`Imported D1 batch ${index}/${report.parity.importBatches}`)
  }
}

function verify(): void {
  const report = parse(readFileSync(resolve(REPORT_PATH), 'utf8')) as { parity: { exactSlugSet: string[] }; target: { checksum: string; listingCount: number } }
  const state = query("SELECT version, checksum FROM publication_state WHERE site_id = 'serp.software'") as Array<{ checksum?: string; version?: number }>
  const rows = query("SELECT slug FROM listings WHERE site_id = 'serp.software' AND status = 'approved' AND is_active = 1 ORDER BY slug") as Array<{ slug: string }>
  const slugs = rows.map(row => row.slug)
  if (state[0]?.checksum !== report.target.checksum) throw new Error('D1 publication checksum does not match the migration report.')
  if (rows.length !== report.target.listingCount || slugs.join('\0') !== report.parity.exactSlugSet.join('\0')) throw new Error('D1 listing count or exact slug set does not match the migration report.')
  console.log(`Verified local D1 publication v${state[0]?.version}: ${rows.length} listings, checksum ${state[0]?.checksum}`)
}

function publish(args: string[]): void {
  const manifestPath = args[0]
  if (!manifestPath) throw new Error('Usage: pnpm d1:local:publish -- <manifest.yaml>')
  execFileSync('pnpm', ['tsx', 'scripts/d1-publisher.ts', manifestPath], { stdio: 'inherit' })
}

function preview(): void {
  execFileSync('pnpm', ['--filter', 'serp.software', 'build:worker'], { stdio: 'inherit' })
  const result = spawnSync('pnpm', ['--filter', 'serp.software', 'preview:worker'], { stdio: 'inherit' })
  if (result.status) process.exitCode = result.status
}

export function runLocalD1Command(args: string[]): void {
  validateLocalConfig()
  const [command, ...rest] = args
  if (command === 'migrate') return migrate()
  if (command === 'import') return importArtifact()
  if (command === 'verify') return verify()
  if (command === 'publish') return publish(rest)
  if (command === 'preview') return preview()
  throw new Error(`Unknown local D1 command: ${command || 'missing'}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runLocalD1Command(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
