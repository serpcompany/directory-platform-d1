import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configuredFreshD1StateRoot } from './d1-local-state'
import { applicationTableNames } from './d1-replatform-inventory'
import { resolveSiteTarget, type SiteTarget } from './site-targets'

export { applicationTableNames } from './d1-replatform-inventory'

export const freshMigrationsDirectory = resolve('d1/drizzle')

export const d1TriggerNames = [
  'listing_categories_prevent_primary_demote',
  'listing_categories_prevent_primary_removal',
  'listing_categories_same_site_insert',
  'listing_categories_same_site_update',
  'listings_require_primary_on_insert',
  'listings_require_primary_on_publication'
] as const

export const requiredIndexNames = [
  'categories_public_idx',
  'listing_categories_category_idx',
  'listing_categories_listing_order_idx',
  'listing_categories_one_primary_idx',
  'listing_faqs_listing_idx',
  'listing_faqs_listing_order_unique',
  'listing_media_listing_idx',
  'listing_media_listing_kind_order_unique',
  'listing_resource_links_listing_idx',
  'listing_resource_links_listing_order_unique',
  'listing_slug_redirects_listing_idx',
  'listing_slug_redirects_site_old_slug_unique',
  'listing_submission_events_submission_idx',
  'listing_submission_faqs_submission_order_unique',
  'listing_submission_notifications_channel_external_unique',
  'listing_submission_notifications_preview_token_idx',
  'listing_submission_notifications_recipient_idx',
  'listing_submission_resource_links_submission_order_unique',
  'listing_submissions_active_slug_idx',
  'listing_submissions_review_queue_idx',
  'listing_submissions_site_token_unique',
  'listings_featured_idx',
  'listings_name_idx',
  'listings_publication_idx',
  'listings_related_name_idx',
  'listings_site_slug_unique',
  'listings_slug_lookup_idx',
  'migration_runs_site_manifest_unique',
  'migration_runs_site_time_idx',
  'publication_runs_site_manifest_unique',
  'publication_runs_site_time_idx'
] as const

interface SchemaObject {
  name: string
  sql: string | null
  type: 'index' | 'table' | 'trigger'
}

export const freshDatabaseIds = {
  'pornvideodownloaders.com': '00000000-0000-0000-0000-000000000168',
  'serp.software': '00000000-0000-0000-0000-000000000068'
} as const

function pathRelativeToConfig(configPath: string, targetPath: string): string {
  return relative(dirname(configPath), targetPath).replaceAll(sep, '/')
}

function statePath(target: SiteTarget): string {
  return configuredFreshD1StateRoot(target.siteId)
}

export function materializeFreshLocalConfig(target: SiteTarget): {
  configPath: string
  databaseName: string
} {
  const configPath = resolve(
    '.wrangler/generated',
    `${target.siteId.replaceAll('.', '-')}.drizzle-local.jsonc`
  )
  const databaseName = `${target.local.databaseName}-drizzle`
  const config = {
    $schema: pathRelativeToConfig(configPath, resolve('node_modules/wrangler/config-schema.json')),
    compatibility_date: '2026-07-13',
    compatibility_flags: ['nodejs_compat'],
    d1_databases: [
      {
        binding: 'DB',
        database_id: freshDatabaseIds[target.siteId],
        database_name: databaseName,
        migrations_dir: pathRelativeToConfig(configPath, freshMigrationsDirectory)
      }
    ],
    name: `${target.local.workerName}-drizzle`,
    vars: {
      D1_RUNTIME_ENV: 'local',
      NEXT_PUBLIC_SITE_ID: target.siteId,
      SITE_ID: target.siteId
    }
  }
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  return { configPath, databaseName }
}

function wrangler(target: SiteTarget, args: string[], capture = false): string {
  const { configPath, databaseName } = materializeFreshLocalConfig(target)
  return (
    execFileSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        ...args.map(value => (value === '$DATABASE' ? databaseName : value)),
        '--local',
        '--persist-to',
        statePath(target),
        '--config',
        configPath
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
      }
    ) || ''
  )
}

function query(target: SiteTarget, command: string): SchemaObject[] {
  const output = wrangler(target, ['execute', '$DATABASE', '--command', command, '--json'], true)
  const parsed = JSON.parse(output) as Array<{ results?: SchemaObject[]; success?: boolean }>
  if (parsed.length !== 1 || parsed[0]?.success !== true || !Array.isArray(parsed[0].results)) {
    throw new Error('Local D1 returned an unsuccessful or malformed schema result.')
  }
  return parsed[0].results
}

export function freshMigrationNames(): string[] {
  return readdirSync(freshMigrationsDirectory)
    .filter(name => name.endsWith('.sql'))
    .sort()
}

function assertExactNames(actual: string[], expected: readonly string[], label: string): void {
  const sortedActual = [...actual].sort()
  const sortedExpected = [...expected].sort()
  if (sortedActual.join('\0') !== sortedExpected.join('\0')) {
    throw new Error(
      `Fresh D1 ${label} mismatch. Expected ${sortedExpected.join(', ')}; received ${sortedActual.join(', ')}.`
    )
  }
}

function verify(target: SiteTarget): void {
  const objects = query(
    target,
    `SELECT type, name, sql FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
     ORDER BY type, name`
  )
  const applicationTables = objects.filter(
    object => object.type === 'table' && object.name !== 'd1_migrations'
  )
  assertExactNames(
    applicationTables.map(object => object.name),
    applicationTableNames,
    'application tables'
  )
  const nonStrict = applicationTables.filter(object => !object.sql?.trimEnd().endsWith('STRICT'))
  if (nonStrict.length > 0) {
    throw new Error(
      `Fresh D1 tables are not STRICT: ${nonStrict.map(object => object.name).join(', ')}.`
    )
  }
  assertExactNames(
    objects.filter(object => object.type === 'trigger').map(object => object.name),
    d1TriggerNames,
    'triggers'
  )
  const indexes = objects.filter(object => object.type === 'index').map(object => object.name)
  const missingIndexes = requiredIndexNames.filter(name => !indexes.includes(name))
  if (missingIndexes.length > 0) {
    throw new Error(`Fresh D1 is missing indexes: ${missingIndexes.join(', ')}.`)
  }
  const ledger = query(target, 'SELECT name FROM d1_migrations ORDER BY name') as Array<{
    name: string
  }>
  assertExactNames(
    ledger.map(row => row.name),
    freshMigrationNames(),
    'migration ledger'
  )
  console.log(
    JSON.stringify({
      database: `${target.local.databaseName}-drizzle`,
      migrations: freshMigrationNames(),
      siteId: target.siteId,
      status: 'verified',
      tables: applicationTables.length
    })
  )
}

export function runDrizzleLocalCommand(args: string[]): void {
  const [command, siteFlag, siteValue] = args
  if (siteFlag !== '--site') {
    throw new Error('Fresh Drizzle D1 commands require an explicit --site argument.')
  }
  const target = resolveSiteTarget(siteValue)
  if (command === 'generate') {
    execFileSync('pnpm', ['exec', 'drizzle-kit', 'generate', '--config', 'drizzle.config.ts'], {
      env: process.env,
      stdio: 'inherit'
    })
    return
  }
  if (command === 'list') {
    wrangler(target, ['migrations', 'list', '$DATABASE'])
    return
  }
  if (command === 'apply') {
    wrangler(target, ['migrations', 'apply', '$DATABASE'])
    return
  }
  if (command === 'verify') {
    verify(target)
    return
  }
  throw new Error(`Unknown fresh Drizzle D1 command: ${command || 'missing'}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runDrizzleLocalCommand(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
