import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { resolveSiteTarget, type SiteTarget } from './site-targets'

const DEFAULT_STATE_PATH = '.wrangler/state'

interface WranglerConfig {
  d1_databases?: Array<{ binding?: string; database_id?: string; database_name?: string }>
  name?: string
  vars?: { D1_RUNTIME_ENV?: string }
}

function validateLocalConfig(target: SiteTarget): void {
  const config = JSON.parse(
    readFileSync(resolve(target.local.configPath), 'utf8')
  ) as WranglerConfig
  const binding = config.d1_databases?.find(candidate => candidate.binding === 'DB')
  if (config.name !== target.local.workerName || config.vars?.D1_RUNTIME_ENV !== 'local')
    throw new Error(`Wrangler config is not the dedicated local ${target.siteId} Worker.`)
  if (
    !binding ||
    binding.database_name !== target.local.databaseName ||
    binding.database_id !== target.local.databaseId
  )
    throw new Error('Refusing non-local, preview, or production D1 identity.')
}

function statePath(target: SiteTarget): string {
  const siteDirectory = target.siteId.replaceAll('.', '-')
  if (process.env.HARNESS_D1_STATE_DIRECTORY) {
    return resolve(process.env.HARNESS_D1_STATE_DIRECTORY, siteDirectory)
  }
  const manifestPath = resolve('.runtime/manifest.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      d1StateDirectory?: string
      repositoryPath?: string
    }
    if (resolve(manifest.repositoryPath || '') !== resolve('.')) {
      throw new Error('Runtime manifest belongs to another worktree.')
    }
    if (!manifest.d1StateDirectory) throw new Error('Runtime manifest has no D1 state directory.')
    return resolve(manifest.d1StateDirectory, siteDirectory)
  }
  return resolve(DEFAULT_STATE_PATH, siteDirectory)
}

function wrangler(target: SiteTarget, args: string[], capture = false): string {
  return (
    execFileSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        ...args,
        '--local',
        '--persist-to',
        statePath(target),
        '--config',
        target.local.configPath
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
      }
    ) || ''
  )
}

function query(target: SiteTarget, command: string): unknown[] {
  const output = wrangler(
    target,
    ['d1', 'execute', target.local.databaseName, '--command', command, '--json'],
    true
  )
  const parsed = JSON.parse(output) as Array<{ results?: unknown[] }>
  return parsed[0]?.results || []
}

function migrate(target: SiteTarget): void {
  wrangler(target, ['d1', 'migrations', 'apply', target.local.databaseName])
}

function importArtifact(target: SiteTarget): void {
  const report = parse(readFileSync(resolve(target.parityReportPath), 'utf8')) as {
    parity: { importBatches: number }
    target: { checksum: string }
  }
  const current = query(
    target,
    `SELECT
      (SELECT checksum FROM publication_state WHERE site_id='${target.siteId}') AS checksum,
      EXISTS(SELECT 1 FROM sites WHERE id='${target.siteId}') AS site_exists`
  ) as Array<{ checksum?: string | null; site_exists?: number }>
  if (current[0]?.checksum === report.target.checksum) {
    console.log(`Local D1 already matches ${report.target.checksum}; import is a no-op.`)
    return
  }
  if (current[0]?.checksum || current[0]?.site_exists)
    throw new Error(
      'Refusing a different or partial initial catalog; restore the clean pre-import state.'
    )
  for (let index = 1; index <= report.parity.importBatches; index += 1) {
    const batchPath = `${target.artifactBatchDirectory}/${String(index).padStart(4, '0')}.sql`
    wrangler(target, ['d1', 'execute', target.local.databaseName, '--file', batchPath, '--yes'])
    console.log(`Imported D1 batch ${index}/${report.parity.importBatches}`)
  }
}

function verify(target: SiteTarget): void {
  const report = parse(readFileSync(resolve(target.parityReportPath), 'utf8')) as {
    parity: {
      categories: Array<{ slug: string }>
      categoryMembershipCount: number
      exactSlugSet: string[]
      faqCount?: number
      featuredCount?: number
      featuredSlugs?: string[]
      mediaCount?: number
      primaryCategoryCount?: number
      resourceLinkCount?: number
    }
    target: { categoryCount: number; checksum: string; listingCount: number }
  }
  const state = query(
    target,
    `SELECT version, checksum FROM publication_state WHERE site_id = '${target.siteId}'`
  ) as Array<{ checksum?: string; version?: number }>
  const rows = query(
    target,
    `SELECT slug FROM listings WHERE site_id = '${target.siteId}' AND status = 'approved' AND is_active = 1 ORDER BY slug`
  ) as Array<{ slug: string }>
  const slugs = rows.map(row => row.slug)
  const counts = query(
    target,
    `SELECT
      (SELECT COUNT(*) FROM categories WHERE site_id='${target.siteId}' AND is_active=1) AS category_count,
      (SELECT COUNT(*) FROM listing_categories lc JOIN listings l ON l.id=lc.listing_id WHERE l.site_id='${target.siteId}') AS membership_count,
      (SELECT COUNT(*) FROM listing_categories lc JOIN listings l ON l.id=lc.listing_id WHERE l.site_id='${target.siteId}' AND lc.is_primary=1) AS primary_category_count,
      (SELECT COUNT(*) FROM listing_faqs f JOIN listings l ON l.id=f.listing_id WHERE l.site_id='${target.siteId}') AS faq_count,
      (SELECT COUNT(*) FROM listing_media m JOIN listings l ON l.id=m.listing_id WHERE l.site_id='${target.siteId}') AS media_count,
      (SELECT COUNT(*) FROM listing_resource_links r JOIN listings l ON l.id=r.listing_id WHERE l.site_id='${target.siteId}') AS resource_count,
      (SELECT COUNT(*) FROM listings WHERE site_id='${target.siteId}' AND is_featured=1) AS featured_count`
  ) as Array<Record<string, number>>
  const categories = query(
    target,
    `SELECT slug FROM categories WHERE site_id='${target.siteId}' AND is_active=1 ORDER BY sort_order, slug`
  ) as Array<{ slug: string }>
  const count = counts[0]
  const expectedFeaturedCount =
    report.parity.featuredCount ?? report.parity.featuredSlugs?.length ?? 0
  if (state[0]?.checksum !== report.target.checksum)
    throw new Error('D1 publication checksum does not match the migration report.')
  if (
    rows.length !== report.target.listingCount ||
    slugs.join('\0') !== report.parity.exactSlugSet.join('\0') ||
    categories.map(category => category.slug).join('\0') !==
      report.parity.categories.map(category => category.slug).join('\0') ||
    count?.category_count !== report.target.categoryCount ||
    count?.membership_count !== report.parity.categoryMembershipCount ||
    (report.parity.primaryCategoryCount !== undefined &&
      count?.primary_category_count !== report.parity.primaryCategoryCount) ||
    (report.parity.faqCount !== undefined && count?.faq_count !== report.parity.faqCount) ||
    (report.parity.mediaCount !== undefined && count?.media_count !== report.parity.mediaCount) ||
    (report.parity.resourceLinkCount !== undefined &&
      count?.resource_count !== report.parity.resourceLinkCount) ||
    count?.featured_count !== expectedFeaturedCount
  )
    throw new Error('D1 catalog does not match the reviewed migration report.')
  console.log(
    `Verified local D1 publication v${state[0]?.version}: ${rows.length} listings, checksum ${state[0]?.checksum}`
  )
}

function publish(target: SiteTarget, args: string[]): void {
  const manifestPath = args[0]
  if (!manifestPath) throw new Error('Usage: pnpm d1:local:publish -- <manifest.yaml>')
  const manifest = parse(readFileSync(resolve(manifestPath), 'utf8')) as { siteId?: string }
  if (manifest.siteId !== target.siteId)
    throw new Error(
      `Manifest site ${manifest.siteId || 'missing'} does not match ${target.siteId}.`
    )
  execFileSync('pnpm', ['tsx', 'scripts/d1-publisher.ts', manifestPath], { stdio: 'inherit' })
}

function preview(target: SiteTarget): void {
  execFileSync('pnpm', ['--filter', target.appPackageName, 'build:worker'], { stdio: 'inherit' })
  const result = spawnSync('pnpm', ['--filter', target.appPackageName, 'preview:worker'], {
    env: { ...process.env, HARNESS_D1_STATE_DIRECTORY: statePath(target) },
    stdio: 'inherit'
  })
  if (result.status) process.exitCode = result.status
}

export function runLocalD1Command(args: string[]): void {
  const [command, siteFlag, siteValue, ...rest] = args
  if (siteFlag !== '--site') {
    throw new Error(
      'Local D1 commands require an explicit --site pornvideodownloaders.com|serp.software.'
    )
  }
  const target = resolveSiteTarget(siteValue)
  validateLocalConfig(target)
  if (command === 'migrate') {
    migrate(target)
    return
  }
  if (command === 'import') {
    importArtifact(target)
    return
  }
  if (command === 'verify') {
    verify(target)
    return
  }
  if (command === 'publish') {
    publish(target, rest)
    return
  }
  if (command === 'preview') {
    preview(target)
    return
  }
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
