import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { resolveSiteTarget, type SiteTarget } from './site-targets'

const environments = ['preview', 'production'] as const
type WorkerEnvironment = (typeof environments)[number]
type ReleaseCommand = 'backup' | 'deploy' | 'import' | 'migrate' | 'upload' | 'verify'

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
  $schema?: string
  assets?: { binding?: string; directory?: string }
  compatibility_flags?: string[]
  d1_databases?: Array<{
    binding?: string
    database_id?: string
    database_name?: string
    migrations_dir?: string
  }>
  main?: string
  name?: string
  routes?: Array<{ pattern?: string; zone_name?: string }>
  vars?: { D1_RUNTIME_ENV?: string; NEXT_PUBLIC_SITE_ID?: string; SITE_ID?: string }
}

function pathRelativeToConfig(configPath: string, targetPath: string): string {
  return relative(dirname(configPath), targetPath).replaceAll(sep, '/')
}

interface MigrationReport {
  parity: {
    categories: Array<{ slug: string }>
    categoryMembershipCount: number
    exactSlugSet: string[]
    faqCount?: number
    featuredCount?: number
    featuredSlugs?: string[]
    importBatches: number
    mediaCount?: number
    primaryCategoryCount?: number
    resourceLinkCount?: number
  }
  target: { checksum: string; listingCount: number }
}

export interface WorkerReleaseProcessResult {
  status: number | null
  stderr?: string | Buffer
  stdout?: string | Buffer
}

export interface WorkerReleaseDependencies {
  readFile(path: string): Buffer
  run(
    command: string,
    args: string[],
    options: { encoding?: BufferEncoding; stdio?: 'inherit' }
  ): WorkerReleaseProcessResult
}

const defaultDependencies: WorkerReleaseDependencies = {
  readFile: path => readFileSync(path),
  run: (command, args, options) => spawnSync(command, args, options)
}

function parseEnvironment(value: string | undefined): WorkerEnvironment {
  if (value === 'preview' || value === 'production') return value
  throw new Error('Worker environment must be "preview" or "production".')
}

function readTemplate(
  target: SiteTarget,
  environment: WorkerEnvironment
): { config: WorkerConfig; source: string } {
  const configPath =
    environment === 'preview' ? target.remote.previewConfigPath : target.remote.productionConfigPath
  const source = readFileSync(resolve(configPath), 'utf8')
  return { config: JSON.parse(source) as WorkerConfig, source }
}

export function validateWorkerConfig(environment: WorkerEnvironment, siteId: string): void {
  const target = resolveSiteTarget(siteId)
  const { config, source } = readTemplate(target, environment)
  const binding = config.d1_databases?.find(item => item.binding === 'DB')
  const expected = placeholders[environment]
  const upper = environment.toUpperCase()
  const otherEnvironment = environment === 'preview' ? 'production' : 'preview'
  const appPath = `apps/${target.appPackageName}/.open-next`
  const configPath =
    environment === 'preview' ? target.remote.previewConfigPath : target.remote.productionConfigPath
  const expectedSchemaPath = pathRelativeToConfig(
    configPath,
    'node_modules/wrangler/config-schema.json'
  )
  const expectedWorkerPath = pathRelativeToConfig(configPath, `${appPath}/worker.js`)
  const expectedAssetsPath = pathRelativeToConfig(configPath, `${appPath}/assets`)
  const expectedMigrationsPath = pathRelativeToConfig(configPath, 'd1/migrations')
  if (config.$schema !== expectedSchemaPath) throw new Error('Unexpected Wrangler schema path.')
  if (config.name !== expected[`CLOUDFLARE_WORKER_${upper}_NAME`])
    throw new Error('Unexpected Worker name placeholder.')
  if (config.main !== expectedWorkerPath) throw new Error('Unexpected Worker entrypoint.')
  if (config.assets?.directory !== expectedAssetsPath || config.assets.binding !== 'ASSETS')
    throw new Error('Unexpected OpenNext assets contract.')
  if (!config.compatibility_flags?.includes('nodejs_compat'))
    throw new Error('nodejs_compat is required.')
  if (
    environment === 'production' &&
    !config.routes?.some(
      route => route.pattern === `${target.siteId}/*` && route.zone_name === target.siteId
    )
  )
    throw new Error(`Production Worker must own the ${target.siteId} apex route.`)
  if (config.vars?.D1_RUNTIME_ENV !== environment)
    throw new Error('D1_RUNTIME_ENV must match the template environment.')
  if (config.vars?.SITE_ID !== target.siteId || config.vars.NEXT_PUBLIC_SITE_ID !== target.siteId)
    throw new Error(`Worker templates must remain scoped to ${target.siteId}.`)
  if (binding?.database_id !== expected[`CLOUDFLARE_D1_${upper}_DATABASE_ID`])
    throw new Error('Unexpected D1 ID placeholder.')
  if (binding?.database_name !== expected[`CLOUDFLARE_D1_${upper}_DATABASE_NAME`])
    throw new Error('Unexpected D1 name placeholder.')
  if (binding?.migrations_dir !== expectedMigrationsPath)
    throw new Error('Unexpected D1 migrations directory.')
  if (source.toLowerCase().includes(otherEnvironment))
    throw new Error(`${configPath} references ${otherEnvironment}.`)
}

function assertProtectedWorkflow(
  target: SiteTarget,
  environment: WorkerEnvironment,
  env: NodeJS.ProcessEnv,
  dependencies: WorkerReleaseDependencies
): void {
  const workflowRef = env.GITHUB_WORKFLOW_REF || ''
  const isDeployWorkflow =
    workflowRef.includes('/.github/workflows/build-and-deploy.yml@') ||
    workflowRef.includes('/.github/workflows/deploy-pornvideodownloaders.yml@')
  const isPublicationWorkflow = workflowRef.includes('/.github/workflows/publish-d1.yml@')
  const isSubmissionApprovalWorkflow = workflowRef.includes(
    '/.github/workflows/approve-d1-submission.yml@'
  )
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.CI !== 'true' ||
    (!isDeployWorkflow && !isPublicationWorkflow && !isSubmissionApprovalWorkflow)
  )
    throw new Error('Remote execution is authorized only by a protected GitHub Actions workflow.')
  if (env.GITHUB_REF !== 'refs/heads/main' || !env.GITHUB_SHA)
    throw new Error('Remote execution requires the main branch and a nonempty GitHub SHA.')
  if (environment === 'preview' && (isPublicationWorkflow || isSubmissionApprovalWorkflow))
    throw new Error('Publication and submission approval are production-only operations.')
  const expectedConfirmation = isPublicationWorkflow
    ? target.confirmation.publish
    : isSubmissionApprovalWorkflow
      ? target.confirmation.submission
      : target.confirmation.deploy[environment]
  if (env.WORKER_PRODUCTION_CONFIRM !== expectedConfirmation)
    throw new Error('Explicit protected-environment confirmation is required.')
  const status = dependencies.run('git', ['status', '--porcelain', '--untracked-files=normal'], {
    encoding: 'utf8'
  })
  if (status.status !== 0 || String(status.stdout ?? '').trim())
    throw new Error('Remote execution requires a clean source checkout.')
  const head = dependencies.run('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (head.status !== 0 || String(head.stdout ?? '').trim() !== env.GITHUB_SHA)
    throw new Error('Checked-out HEAD must match GITHUB_SHA.')
}

function materializeConfig(
  target: SiteTarget,
  environment: WorkerEnvironment,
  env: NodeJS.ProcessEnv
): { configPath: string; databaseName: string } {
  validateWorkerConfig(environment, target.siteId)
  let { source } = readTemplate(target, environment)
  for (const [name, placeholder] of Object.entries(placeholders[environment])) {
    const value = env[name]
    if (!value || value === placeholder)
      throw new Error(`Missing required environment value ${name}.`)
    source = source.replaceAll(placeholder, value)
  }
  if (source.includes('${CLOUDFLARE_')) throw new Error('Unresolved Cloudflare placeholder.')
  const config = JSON.parse(source) as WorkerConfig
  const appPath = `apps/${target.appPackageName}/.open-next`
  const configPath = resolve(
    '.wrangler/generated',
    `${target.siteId.replaceAll('.', '-')}.${environment}.jsonc`
  )
  config.$schema = pathRelativeToConfig(
    configPath,
    resolve('node_modules/wrangler/config-schema.json')
  )
  config.main = pathRelativeToConfig(configPath, resolve(`${appPath}/worker.js`))
  if (config.assets)
    config.assets.directory = pathRelativeToConfig(configPath, resolve(`${appPath}/assets`))
  const binding = config.d1_databases?.find(item => item.binding === 'DB')
  if (binding) binding.migrations_dir = pathRelativeToConfig(configPath, resolve('d1/migrations'))
  source = `${JSON.stringify(config, null, 2)}\n`
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, source)
  return {
    configPath,
    databaseName: env[`CLOUDFLARE_D1_${environment.toUpperCase()}_DATABASE_NAME`] as string
  }
}

function runChecked(
  dependencies: WorkerReleaseDependencies,
  command: string,
  args: string[],
  capture = false
): WorkerReleaseProcessResult {
  const result = dependencies.run(
    command,
    args,
    capture ? { encoding: 'utf8' } : { stdio: 'inherit' }
  )
  if (result.status !== 0)
    throw new Error(
      `${command} failed with exit code ${result.status ?? 1}: ${String(result.stderr ?? '')}`
    )
  return result
}

function parseD1Rows(output: string): Array<Record<string, unknown>> {
  const payload = JSON.parse(output) as Array<{
    results?: Array<Record<string, unknown>>
    success?: boolean
  }>
  if (!Array.isArray(payload) || payload.some(result => result.success === false))
    throw new Error('D1 command returned an unsuccessful result.')
  return payload.flatMap(result => result.results ?? [])
}

function readMigrationReport(target: SiteTarget): MigrationReport {
  return parse(readFileSync(resolve(target.parityReportPath), 'utf8')) as MigrationReport
}

function quotedSiteId(target: SiteTarget): string {
  return target.siteId.replaceAll("'", "''")
}

function verificationQuery(target: SiteTarget): string {
  const siteId = quotedSiteId(target)
  return `SELECT ps.version, ps.checksum,
    (SELECT COUNT(*) FROM listings l WHERE l.site_id='${siteId}' AND l.status='approved' AND l.is_active=1) AS listing_count,
    (SELECT COUNT(*) FROM categories c WHERE c.site_id='${siteId}' AND c.is_active=1) AS category_count,
    (SELECT COUNT(*) FROM listing_categories lc JOIN listings l ON l.id=lc.listing_id WHERE l.site_id='${siteId}') AS membership_count,
    (SELECT COUNT(*) FROM listing_categories lc JOIN listings l ON l.id=lc.listing_id WHERE l.site_id='${siteId}' AND lc.is_primary=1) AS primary_category_count,
    (SELECT COUNT(*) FROM listing_faqs f JOIN listings l ON l.id=f.listing_id WHERE l.site_id='${siteId}') AS faq_count,
    (SELECT COUNT(*) FROM listing_media m JOIN listings l ON l.id=m.listing_id WHERE l.site_id='${siteId}') AS media_count,
    (SELECT COUNT(*) FROM listing_resource_links r JOIN listings l ON l.id=r.listing_id WHERE l.site_id='${siteId}') AS resource_count,
    (SELECT COUNT(*) FROM listings l WHERE l.site_id='${siteId}' AND l.is_featured=1) AS featured_count,
    (SELECT group_concat(slug, char(0)) FROM (SELECT slug FROM listings WHERE site_id='${siteId}' AND status='approved' AND is_active=1 ORDER BY slug)) AS slugs,
    (SELECT group_concat(slug, char(0)) FROM (SELECT slug FROM categories WHERE site_id='${siteId}' AND is_active=1 ORDER BY sort_order, slug)) AS categories
  FROM publication_state ps WHERE ps.site_id='${siteId}'`
}

function verifyRows(target: SiteTarget, rows: Array<Record<string, unknown>>): void {
  const report = readMigrationReport(target)
  const row = rows[0]
  const exactCategories = report.parity.categories.map(category => category.slug)
  if (
    rows.length !== 1 ||
    row?.checksum !== report.target.checksum ||
    row.version !== 1 ||
    row.listing_count !== report.target.listingCount ||
    row.category_count !== exactCategories.length ||
    row.membership_count !== report.parity.categoryMembershipCount ||
    (report.parity.primaryCategoryCount !== undefined &&
      row.primary_category_count !== report.parity.primaryCategoryCount) ||
    (report.parity.faqCount !== undefined && row.faq_count !== report.parity.faqCount) ||
    (report.parity.mediaCount !== undefined && row.media_count !== report.parity.mediaCount) ||
    (report.parity.resourceLinkCount !== undefined &&
      row.resource_count !== report.parity.resourceLinkCount) ||
    row.featured_count !==
      (report.parity.featuredCount ?? report.parity.featuredSlugs?.length ?? 0) ||
    row.slugs !== report.parity.exactSlugSet.join('\0') ||
    row.categories !== exactCategories.join('\0')
  )
    throw new Error(`Remote ${target.siteId} D1 does not match the reviewed migration report.`)
}

function runRemote(
  target: SiteTarget,
  command: ReleaseCommand,
  environment: WorkerEnvironment,
  env: NodeJS.ProcessEnv,
  dependencies: WorkerReleaseDependencies
): void {
  assertProtectedWorkflow(target, environment, env, dependencies)
  const { configPath, databaseName } = materializeConfig(target, environment, env)
  if (command === 'upload' || command === 'deploy') {
    runChecked(dependencies, 'pnpm', [
      '--filter',
      target.appPackageName,
      'exec',
      'opennextjs-cloudflare',
      command,
      '--config',
      configPath
    ])
    return
  }
  if (command === 'backup') {
    const backupPath = resolve(
      '.wrangler/backups',
      target.siteId.replaceAll('.', '-'),
      environment,
      `${env.GITHUB_SHA}.sql`
    )
    mkdirSync(dirname(backupPath), { recursive: true })
    runChecked(dependencies, 'pnpm', [
      'exec',
      'wrangler',
      'd1',
      'export',
      databaseName,
      '--remote',
      '--config',
      configPath,
      '--output',
      backupPath
    ])
    console.log(
      JSON.stringify({
        backupPath,
        checksum: createHash('sha256').update(dependencies.readFile(backupPath)).digest('hex')
      })
    )
    return
  }
  if (command === 'migrate') {
    runChecked(dependencies, 'pnpm', [
      'exec',
      'wrangler',
      'd1',
      'migrations',
      'apply',
      databaseName,
      '--remote',
      '--config',
      configPath
    ])
    return
  }
  const report = readMigrationReport(target)
  if (command === 'import') {
    const stateResult = runChecked(
      dependencies,
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        'execute',
        databaseName,
        '--remote',
        '--config',
        configPath,
        '--command',
        `SELECT
          (SELECT checksum FROM publication_state WHERE site_id='${quotedSiteId(target)}') AS checksum,
          EXISTS(SELECT 1 FROM sites WHERE id='${quotedSiteId(target)}') AS site_exists`,
        '--json'
      ],
      true
    )
    const stateRows = parseD1Rows(String(stateResult.stdout ?? ''))
    if (stateRows[0]?.checksum === report.target.checksum) {
      console.log(`${environment} D1 already matches ${report.target.checksum}; import is a no-op.`)
      return
    }
    if (stateRows.length !== 1 || stateRows[0]?.checksum || stateRows[0]?.site_exists)
      throw new Error(
        `Refusing a different or partial ${environment} initial catalog; restore the pre-import backup.`
      )
    for (let index = 1; index <= report.parity.importBatches; index += 1) {
      const batchPath = `${target.artifactBatchDirectory}/${String(index).padStart(4, '0')}.sql`
      runChecked(dependencies, 'pnpm', [
        'exec',
        'wrangler',
        'd1',
        'execute',
        databaseName,
        '--remote',
        '--config',
        configPath,
        '--file',
        batchPath,
        '--yes'
      ])
    }
    return
  }
  const result = runChecked(
    dependencies,
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      '--remote',
      '--config',
      configPath,
      '--command',
      verificationQuery(target),
      '--json'
    ],
    true
  )
  const output = String(result.stdout ?? '')
  if (!output.trim()) throw new Error('Remote verification returned no result.')
  const rows = parseD1Rows(output)
  verifyRows(target, rows)
  console.log(
    JSON.stringify({
      checksum: rows[0]?.checksum,
      count: rows[0]?.listing_count,
      environment,
      siteId: target.siteId,
      version: rows[0]?.version
    })
  )
}

function printRemotePlan(
  target: SiteTarget,
  kind: 'migration' | 'verify',
  environment: WorkerEnvironment,
  env: NodeJS.ProcessEnv
): void {
  if (env.D1_REMOTE_CONFIRM !== target.confirmation.plan[environment])
    throw new Error(`D1_REMOTE_CONFIRM must equal ${target.confirmation.plan[environment]}.`)
  validateWorkerConfig(environment, target.siteId)
  const migrations = readdirSync(resolve('d1/migrations'))
    .filter(file => file.endsWith('.sql'))
    .sort()
  const checksum = createHash('sha256')
    .update(migrations.map(file => readFileSync(resolve('d1/migrations', file))).join('\n'))
    .digest('hex')
  console.log(
    JSON.stringify(
      {
        checksum,
        dryRun: true,
        environment,
        executesRemoteCommand: false,
        kind,
        migrations,
        siteId: target.siteId
      },
      null,
      2
    )
  )
}

function parseSiteArgument(args: string[]): {
  command: string
  environment: WorkerEnvironment
  target: SiteTarget
} {
  const [command, environmentValue, siteFlag, siteValue] = args
  if (siteFlag !== '--site')
    throw new Error('Worker release commands require an explicit --site argument.')
  return {
    command,
    environment: parseEnvironment(environmentValue),
    target: resolveSiteTarget(siteValue)
  }
}

export function runWorkerRelease(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: WorkerReleaseDependencies = defaultDependencies
): void {
  const { command, environment, target } = parseSiteArgument(argv)
  if (command === 'validate') {
    validateWorkerConfig(environment, target.siteId)
    return
  }
  if (command === 'plan-migration' || command === 'plan-verify') {
    printRemotePlan(target, command === 'plan-migration' ? 'migration' : 'verify', environment, env)
    return
  }
  if (['backup', 'deploy', 'import', 'migrate', 'upload', 'verify'].includes(command)) {
    runRemote(target, command as ReleaseCommand, environment, env, dependencies)
    return
  }
  throw new Error('Unsupported Worker release command.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  runWorkerRelease(process.argv.slice(2))
