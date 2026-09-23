import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSiteTarget, type SiteId } from './site-targets'

export type CutoverEnvironment = 'preview' | 'production'

interface ReplatformWorkerConfig {
  $schema?: string
  assets?: { binding?: string; directory?: string }
  compatibility_date?: string
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
  vars?: Record<string, string>
}

export interface EvidenceTrust {
  commitSha: string
  previewReceiptSha256?: string
}

interface IdentityDependencies {
  fetchAccount(accountId: string, token: string): Promise<unknown>
  fetchWorker(accountId: string, workerName: string, token: string): Promise<unknown>
  fetchPreviewHostname(baseUrl: string): Promise<string>
  readD1Info(databaseName: string): unknown
  readGit(command: 'head' | 'status'): string
}

const defaultIdentityDependencies: IdentityDependencies = {
  async fetchAccount(accountId, token) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Cloudflare account identity request failed.')
    return response.json()
  },
  async fetchWorker(accountId, workerName, token) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/services/${encodeURIComponent(workerName)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!response.ok) throw new Error('Cloudflare Worker identity request failed.')
    return response.json()
  },
  async fetchPreviewHostname(baseUrl) {
    const response = await fetch(baseUrl, { method: 'HEAD', redirect: 'manual' })
    if (!response.ok) throw new Error('Preview hostname observation failed.')
    return new URL(response.url).hostname
  },
  readD1Info(databaseName) {
    const result = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'info', databaseName, '--json'], {
      encoding: 'utf8'
    })
    if (result.status !== 0) throw new Error('Cloudflare D1 identity request failed.')
    return JSON.parse(result.stdout)
  },
  readGit(command) {
    const args = command === 'head' ? ['rev-parse', 'HEAD'] : ['status', '--porcelain']
    const result = spawnSync('git', args, { encoding: 'utf8' })
    if (result.status !== 0) throw new Error('Unable to verify the checked-out commit.')
    return result.stdout.trim()
  }
}

const requiredCatalogJourneys = [
  'home',
  'category',
  'detail',
  'search',
  'rss',
  'sitemap',
  'legacy-redirect'
] as const
const requiredSubmissionJourneys = [
  'intake',
  'rate-limit',
  'badge-verification',
  'private-review-preview',
  'approval',
  'rejection'
] as const
const frozenMutationKinds = ['submission', 'publication', 'approval', 'notification'] as const
const identityFields = [
  'accountId',
  'sourceDatabaseId',
  'sourceDatabaseName',
  'targetDatabaseId',
  'targetDatabaseName',
  'workerName',
  'workerHostname'
] as const

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be nonempty text.`)
  return value
}

function exactArray(value: unknown, expected: readonly string[], label: string): void {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string'))
    throw new Error(`${label} must be a string array.`)
  if ([...value].sort().join('\0') !== [...expected].sort().join('\0'))
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}.`)
}

function bool(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must be true.`)
  return true
}

function sha256(value: unknown, label: string): string {
  const parsed = text(value, label)
  if (!/^[0-9a-f]{64}$/u.test(parsed)) throw new Error(`${label} must be a lowercase SHA-256.`)
  return parsed
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  exactArray(Object.keys(value), expected, `${label} keys`)
}

function pathRelativeToConfig(configPath: string, targetPath: string): string {
  return relative(dirname(configPath), targetPath).replaceAll(sep, '/')
}

export function validateReplatformTemplate(
  siteId: SiteId,
  environment: CutoverEnvironment,
  configPath?: string,
  sourceOverride?: string
): void {
  const target = resolveSiteTarget(siteId)
  const selectedPath =
    configPath ??
    (environment === 'preview'
      ? target.replatform.previewConfigPath
      : target.replatform.productionConfigPath)
  const source = sourceOverride ?? readFileSync(resolve(selectedPath), 'utf8')
  const config = JSON.parse(source) as ReplatformWorkerConfig
  const rootKeys = [
    '$schema',
    'name',
    'main',
    'compatibility_date',
    'compatibility_flags',
    ...(environment === 'production' ? ['routes'] : []),
    'assets',
    'vars',
    'd1_databases'
  ]
  exactKeys(config as Record<string, unknown>, rootKeys, 'Wrangler template')
  if (
    config.$schema !==
    pathRelativeToConfig(selectedPath, 'node_modules/wrangler/config-schema.json')
  )
    throw new Error('Unexpected Wrangler schema path.')
  const appRoot = `apps/${target.appPackageName}/.open-next`
  if (config.main !== pathRelativeToConfig(selectedPath, `${appRoot}/worker.js`))
    throw new Error('Unexpected Worker entrypoint.')
  if (config.compatibility_date !== '2026-07-13')
    throw new Error('Replatform templates must preserve the released compatibility date.')
  if (JSON.stringify(config.compatibility_flags) !== JSON.stringify(['nodejs_compat']))
    throw new Error('Unexpected compatibility flags.')
  if (!config.assets) throw new Error('Missing assets binding.')
  exactKeys(config.assets as Record<string, unknown>, ['directory', 'binding'], 'assets')
  if (
    config.assets.binding !== 'ASSETS' ||
    config.assets.directory !== pathRelativeToConfig(selectedPath, `${appRoot}/assets`)
  )
    throw new Error('Unexpected OpenNext assets contract.')
  if (!config.vars) throw new Error('Missing Worker vars.')
  exactKeys(
    config.vars,
    ['AUTH_TRUST_HOST', 'SITE_ID', 'NEXT_PUBLIC_SITE_ID', 'D1_RUNTIME_ENV'],
    'vars'
  )
  if (
    config.vars.AUTH_TRUST_HOST !== 'true' ||
    config.vars.SITE_ID !== siteId ||
    config.vars.NEXT_PUBLIC_SITE_ID !== siteId ||
    config.vars.D1_RUNTIME_ENV !== environment
  )
    throw new Error('Worker vars do not match the explicit Site and environment.')
  if (!Array.isArray(config.d1_databases) || config.d1_databases.length !== 1)
    throw new Error('Exactly one replacement D1 binding is required.')
  const binding = object(config.d1_databases[0], 'D1 binding')
  exactKeys(binding, ['binding', 'database_name', 'database_id', 'migrations_dir'], 'D1 binding')
  const upper = environment.toUpperCase()
  if (
    binding.binding !== 'DB' ||
    binding.database_name !== `\${CLOUDFLARE_D1_REPLACEMENT_${upper}_DATABASE_NAME}` ||
    binding.database_id !== `\${CLOUDFLARE_D1_REPLACEMENT_${upper}_DATABASE_ID}` ||
    binding.migrations_dir !== pathRelativeToConfig(selectedPath, 'd1/drizzle')
  )
    throw new Error('Replacement D1 binding does not match the fresh-history contract.')
  if (config.name !== `\${CLOUDFLARE_WORKER_${upper}_NAME}`)
    throw new Error('Unexpected Worker name placeholder.')
  if (environment === 'production') {
    if (
      !Array.isArray(config.routes) ||
      config.routes.length !== 1 ||
      config.routes[0]?.pattern !== `${siteId}/*` ||
      config.routes[0]?.zone_name !== siteId ||
      Object.keys(config.routes[0]).sort().join('\0') !== ['pattern', 'zone_name'].sort().join('\0')
    )
      throw new Error('Production route must exactly own the selected Site apex.')
  } else if (config.routes !== undefined) throw new Error('Preview templates must not own routes.')
  const otherSite = siteId === 'serp.software' ? 'pornvideodownloaders.com' : 'serp.software'
  if (source.includes(otherSite))
    throw new Error('Replacement template contains a cross-Site reference.')
  const otherEnvironment = environment === 'preview' ? 'PRODUCTION' : 'PREVIEW'
  if (source.includes(otherEnvironment))
    throw new Error('Replacement template contains a cross-environment placeholder.')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function previewReceiptSha256(evidence: unknown): string {
  return createHash('sha256').update(canonicalJson(evidence)).digest('hex')
}

function cloudflareResult(value: unknown, label: string): Record<string, unknown> {
  const envelope = object(value, label)
  if (envelope.success !== true) throw new Error(`${label} was not successful.`)
  return object(envelope.result, `${label}.result`)
}

export async function verifyPreviewRemoteIdentity(
  siteId: SiteId,
  env: NodeJS.ProcessEnv,
  dependencies: IdentityDependencies = defaultIdentityDependencies
): Promise<Record<string, unknown>> {
  const target = resolveSiteTarget(siteId)
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.CI !== 'true' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    !env.GITHUB_WORKFLOW_REF?.includes('/.github/workflows/rehearse-d1-replatform-preview.yml@')
  )
    throw new Error('Preview identity verification requires the protected rehearsal workflow.')
  const commitSha = text(env.GITHUB_SHA, 'GITHUB_SHA')
  if (dependencies.readGit('status'))
    throw new Error('Preview rehearsal requires a clean checkout.')
  if (dependencies.readGit('head') !== commitSha)
    throw new Error('GITHUB_SHA must match checked-out HEAD.')
  if (env.WORKER_PRODUCTION_CONFIRM !== target.confirmation.replatform.preview)
    throw new Error('Explicit Preview rehearsal confirmation is required.')
  const accountId = text(env.CLOUDFLARE_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID')
  const expectedAccountId = text(
    env.CLOUDFLARE_EXPECTED_ACCOUNT_ID,
    'CLOUDFLARE_EXPECTED_ACCOUNT_ID'
  )
  if (accountId !== expectedAccountId) throw new Error('Cloudflare account IDs do not match.')
  const token = text(env.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN')
  const account = cloudflareResult(
    await dependencies.fetchAccount(accountId, token),
    'Cloudflare account identity'
  )
  if (account.id !== expectedAccountId)
    throw new Error('Observed Cloudflare account does not match.')
  const sourceDatabaseId = text(
    env.CLOUDFLARE_D1_PREVIEW_DATABASE_ID,
    'CLOUDFLARE_D1_PREVIEW_DATABASE_ID'
  )
  const sourceDatabaseName = text(
    env.CLOUDFLARE_D1_PREVIEW_DATABASE_NAME,
    'CLOUDFLARE_D1_PREVIEW_DATABASE_NAME'
  )
  const targetDatabaseId = text(
    env.CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID,
    'CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID'
  )
  const targetDatabaseName = text(
    env.CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME,
    'CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME'
  )
  const sourceInfo = object(dependencies.readD1Info(sourceDatabaseName), 'Source D1 info')
  const targetInfo = object(dependencies.readD1Info(targetDatabaseName), 'Target D1 info')
  const expectedWorkerName = text(
    env.CLOUDFLARE_WORKER_PREVIEW_NAME,
    'CLOUDFLARE_WORKER_PREVIEW_NAME'
  )
  const worker = cloudflareResult(
    await dependencies.fetchWorker(accountId, expectedWorkerName, token),
    'Cloudflare Worker identity'
  )
  const previewBaseUrl = text(env.PREVIEW_BASE_URL, 'PREVIEW_BASE_URL')
  const expectedPreviewHostname = new URL(previewBaseUrl).hostname
  const observedPreviewHostname = await dependencies.fetchPreviewHostname(previewBaseUrl)
  const exactIdentity = {
    siteId,
    environment: 'preview',
    protectedEnvironment: target.protectedEnvironment.preview,
    allowedSiteIds: [siteId],
    accountId: expectedAccountId,
    sourceDatabaseId,
    sourceDatabaseName,
    targetDatabaseId,
    targetDatabaseName,
    workerName: expectedWorkerName,
    workerHostname: expectedPreviewHostname
  }
  const observed = {
    ...exactIdentity,
    sourceDatabaseId: sourceInfo.uuid,
    sourceDatabaseName: sourceInfo.name,
    targetDatabaseId: targetInfo.uuid,
    targetDatabaseName: targetInfo.name,
    workerName: worker.name ?? worker.id,
    workerHostname: observedPreviewHostname
  }
  const identity = { expected: exactIdentity, observed }
  assertRemoteIdentity(siteId, 'preview', identity)
  return identity
}

export function assertRemoteIdentity(
  siteId: SiteId,
  environment: CutoverEnvironment,
  input: unknown
): void {
  const target = resolveSiteTarget(siteId)
  const identity = object(input, 'identity')
  const expected = object(identity.expected, 'identity.expected')
  const observed = object(identity.observed, 'identity.observed')
  for (const [label, candidate] of [
    ['expected', expected],
    ['observed', observed]
  ] as const) {
    if (text(candidate.siteId, `identity.${label}.siteId`) !== siteId)
      throw new Error(`${label} Site does not match the selected Site.`)
    if (text(candidate.environment, `identity.${label}.environment`) !== environment)
      throw new Error(`${label} environment does not match the selected environment.`)
    if (
      text(candidate.protectedEnvironment, `identity.${label}.protectedEnvironment`) !==
      target.protectedEnvironment[environment]
    )
      throw new Error(`${label} protected environment is not registered for this target.`)
    exactArray(candidate.allowedSiteIds, [siteId], `identity.${label}.allowedSiteIds`)
    for (const key of identityFields) text(candidate[key], `identity.${label}.${key}`)
  }
  for (const key of identityFields) {
    if (observed[key] !== expected[key])
      throw new Error(`Observed ${key} does not match the protected expected identity.`)
  }
  if (
    expected.sourceDatabaseId === expected.targetDatabaseId ||
    expected.sourceDatabaseName === expected.targetDatabaseName
  )
    throw new Error('Source and replacement D1 identities must be distinct.')
}

export function freshMigrationChecksum(directory = resolve('d1/drizzle')): string {
  const names = readdirSync(directory)
    .filter(name => name.endsWith('.sql'))
    .sort()
  if (names.length === 0) throw new Error('Fresh Drizzle migration history is empty.')
  return createHash('sha256')
    .update(
      names.map(name => `${name}\0${readFileSync(resolve(directory, name), 'utf8')}`).join('\0')
    )
    .digest('hex')
}

export function buildCutoverPlan(siteId: SiteId, environment: CutoverEnvironment) {
  const target = resolveSiteTarget(siteId)
  return {
    executesRemoteCommand: false,
    siteId,
    environment,
    protectedEnvironment: target.protectedEnvironment[environment],
    configPath:
      environment === 'preview'
        ? target.replatform.previewConfigPath
        : target.replatform.productionConfigPath,
    migrationChecksum: freshMigrationChecksum(),
    previewDataPolicy:
      environment === 'preview'
        ? 'controlled-fixture-or-explicitly-sanitized; copied Production capability, notification-secret, and rate-limit counts must be zero; isolated Preview-generated counts are recorded separately'
        : undefined,
    orderedGates:
      environment === 'preview'
        ? [
            'verify-account-site-source-target-worker-identities',
            'retain-source-and-target-backups',
            'apply-fresh-schema-to-replacement-target',
            'import-controlled-or-sanitized-preview-snapshot',
            'verify-exact-parity-and-record-receipt',
            'deploy-the-same-commit',
            'run-critical-catalog-and-submission-browser-gates',
            'repeat-and-prove-verified-no-op',
            'rehearse-old-binding-rollback-without-deletion',
            'seal-evidence-for-site-commit-and-migration-checksum'
          ]
        : [
            'require-matching-sealed-preview-evidence',
            'verify-account-site-source-target-worker-identities',
            'obtain-separate-production-approval',
            'acquire-one-site-wide-mutation-lock',
            'freeze-submission-publication-approval-notification-writes',
            'capture-and-identify-final-source-snapshot',
            'apply-fresh-schema-and-import-that-exact-snapshot',
            'verify-exact-parity-before-binding-change',
            'switch-worker-binding-and-keep-old-database-read-only',
            'run-critical-browser-gates',
            'rehearse-nondestructive-binding-rollback',
            'retain-backup-old-database-and-responsible-maintainer-evidence'
          ]
  }
}

export function validateCutoverEvidence(input: unknown, trust: EvidenceTrust): void {
  const root = object(input, 'Evidence')
  const siteId = text(root.siteId, 'siteId') as SiteId
  resolveSiteTarget(siteId)
  const environment = text(root.environment, 'environment') as CutoverEnvironment
  if (environment !== 'preview' && environment !== 'production')
    throw new Error('environment must be preview or production.')
  const commitSha = text(root.commitSha, 'commitSha')
  if (!/^[0-9a-f]{40}$/u.test(commitSha))
    throw new Error('commitSha must be a full lowercase SHA-1.')
  if (commitSha !== trust.commitSha)
    throw new Error('Evidence commitSha does not match trusted GITHUB_SHA and checked-out HEAD.')
  const checksum = text(root.migrationChecksum, 'migrationChecksum')
  if (checksum !== freshMigrationChecksum())
    throw new Error('Evidence migration checksum does not match this checkout.')
  assertRemoteIdentity(siteId, environment, root.identity)
  const migration = object(root.migration, 'migration')
  sha256(migration.finalSnapshotSha256, 'migration.finalSnapshotSha256')
  sha256(migration.sourceSnapshotChecksum, 'migration.sourceSnapshotChecksum')
  sha256(migration.targetSnapshotChecksum, 'migration.targetSnapshotChecksum')
  if (migration.sourceSnapshotChecksum !== migration.targetSnapshotChecksum)
    throw new Error('Source and target snapshot checksums must match.')
  if (
    (migration.firstRunMode !== 'imported' && migration.firstRunMode !== 'verified-no-op') ||
    migration.repeatRunMode !== 'verified-no-op'
  )
    throw new Error(
      'Evidence must show an import or prior verified state followed by a verified no-op.'
    )
  bool(migration.exactParity, 'migration.exactParity')
  bool(migration.freshMigrationLedger, 'migration.freshMigrationLedger')
  exactArray(root.catalogJourneys, requiredCatalogJourneys, 'catalogJourneys')
  exactArray(root.submissionJourneys, requiredSubmissionJourneys, 'submissionJourneys')
  bool(root.rollbackRehearsed, 'rollbackRehearsed')
  bool(root.nothingDeleted, 'nothingDeleted')
  if (environment === 'preview') {
    const policy = object(root.previewData, 'previewData')
    if (policy.policy !== 'controlled-fixtures' && policy.policy !== 'sanitized-snapshot')
      throw new Error('Preview data must use controlled-fixtures or sanitized-snapshot.')
    const copied = object(policy.copiedProduction, 'previewData.copiedProduction')
    const generated = object(policy.previewGenerated, 'previewData.previewGenerated')
    for (const key of ['capabilityRows', 'notificationSecretRows', 'rateLimitRows']) {
      if (copied[key] !== 0) throw new Error(`Preview copied Production ${key} must be zero.`)
      if (
        typeof generated[key] !== 'number' ||
        !Number.isInteger(generated[key]) ||
        generated[key] < 0
      )
        throw new Error(`Preview-generated ${key} must be a nonnegative isolated-row count.`)
    }
    return
  }
  const receipt = object(root.previewReceipt, 'previewReceipt')
  const previewEvidence = object(receipt.evidence, 'previewReceipt.evidence')
  const receiptDigest = sha256(receipt.sha256, 'previewReceipt.sha256')
  if (!trust.previewReceiptSha256 || receiptDigest !== trust.previewReceiptSha256)
    throw new Error('Preview receipt digest does not match the protected trusted digest.')
  if (previewReceiptSha256(previewEvidence) !== receiptDigest)
    throw new Error('Preview receipt content does not match its digest.')
  validateCutoverEvidence(previewEvidence, { commitSha: trust.commitSha })
  if (
    previewEvidence.siteId !== siteId ||
    previewEvidence.commitSha !== commitSha ||
    previewEvidence.migrationChecksum !== checksum
  )
    throw new Error('Production evidence must bind to the complete exact Preview receipt.')
  bool(root.separateProductionApproval, 'separateProductionApproval')
  const production = object(root.production, 'production')
  bool(production.siteWideMutationLock, 'production.siteWideMutationLock')
  bool(production.finalSnapshotCapturedAfterLock, 'production.finalSnapshotCapturedAfterLock')
  bool(production.parityBeforeBindingChange, 'production.parityBeforeBindingChange')
  bool(production.oldDatabaseReadOnly, 'production.oldDatabaseReadOnly')
  if (production.replayProven !== true)
    exactArray(production.frozenMutations, frozenMutationKinds, 'production.frozenMutations')
  const retentionDays = production.retentionDays
  if (typeof retentionDays !== 'number' || !Number.isInteger(retentionDays) || retentionDays < 30)
    throw new Error('Old database retention must be at least 30 days.')
  text(production.backupArtifact, 'production.backupArtifact')
  text(production.rollbackCommand, 'production.rollbackCommand')
  text(production.responsibleMaintainer, 'production.responsibleMaintainer')
}

async function runCli(): Promise<void> {
  const [command, value, siteFlag, siteValue] = process.argv.slice(2)
  if (
    command === 'plan' &&
    (value === 'preview' || value === 'production') &&
    siteFlag === '--site'
  ) {
    console.log(
      JSON.stringify(buildCutoverPlan(resolveSiteTarget(siteValue).siteId, value), null, 2)
    )
  } else if (command === 'verify-preview-identity' && value === '--site') {
    console.log(
      JSON.stringify(
        await verifyPreviewRemoteIdentity(resolveSiteTarget(siteFlag).siteId, process.env)
      )
    )
  } else if (
    (command === 'seal-preview' || command === 'validate-evidence') &&
    value === '--file'
  ) {
    const evidence = JSON.parse(readFileSync(resolve(siteFlag), 'utf8')) as unknown
    const trustedCommit = text(process.env.GITHUB_SHA, 'GITHUB_SHA')
    if (defaultIdentityDependencies.readGit('status'))
      throw new Error('Evidence validation requires a clean checkout.')
    if (defaultIdentityDependencies.readGit('head') !== trustedCommit)
      throw new Error('GITHUB_SHA must match checked-out HEAD.')
    validateCutoverEvidence(evidence, {
      commitSha: trustedCommit,
      previewReceiptSha256: process.env.PREVIEW_RECEIPT_SHA256
    })
    console.log(
      JSON.stringify(
        command === 'seal-preview'
          ? { evidence, sha256: previewReceiptSha256(evidence) }
          : { status: 'valid' }
      )
    )
  } else {
    throw new Error(
      'Usage: d1-replatform-cutover.ts plan <preview|production> --site <site> | verify-preview-identity --site <site> | <seal-preview|validate-evidence> --file <json>'
    )
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
