import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSiteTarget, type SiteId } from './site-targets'

export type CutoverEnvironment = 'preview' | 'production'

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
  'workerName'
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
        ? 'controlled-fixture-or-explicitly-sanitized; private capabilities, notification secrets, and rate-limit rows must be zero'
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

export function validateCutoverEvidence(input: unknown): void {
  const root = object(input, 'Evidence')
  const siteId = text(root.siteId, 'siteId') as SiteId
  resolveSiteTarget(siteId)
  const environment = text(root.environment, 'environment') as CutoverEnvironment
  if (environment !== 'preview' && environment !== 'production')
    throw new Error('environment must be preview or production.')
  const commitSha = text(root.commitSha, 'commitSha')
  if (!/^[0-9a-f]{40}$/u.test(commitSha))
    throw new Error('commitSha must be a full lowercase SHA-1.')
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
  if (migration.firstRunMode !== 'imported' || migration.repeatRunMode !== 'verified-no-op')
    throw new Error('Evidence must show an import followed by a verified no-op.')
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
    for (const key of ['capabilityRows', 'notificationSecretRows', 'rateLimitRows'])
      if (policy[key] !== 0) throw new Error(`Preview ${key} must be zero.`)
    return
  }
  const preview = object(root.previewEvidence, 'previewEvidence')
  if (
    preview.siteId !== siteId ||
    preview.commitSha !== commitSha ||
    preview.migrationChecksum !== checksum
  )
    throw new Error(
      'Production evidence must bind to the exact Preview Site, commit, and migration checksum.'
    )
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

function parseArgs(args: string[]): { environment: CutoverEnvironment; siteId: SiteId } {
  const [command, environment, siteFlag, siteValue] = args
  if (
    command !== 'plan' ||
    (environment !== 'preview' && environment !== 'production') ||
    siteFlag !== '--site'
  )
    throw new Error('Usage: d1-replatform-cutover.ts plan <preview|production> --site <site>')
  return { environment, siteId: resolveSiteTarget(siteValue).siteId }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const parsed = parseArgs(process.argv.slice(2))
  console.log(JSON.stringify(buildCutoverPlan(parsed.siteId, parsed.environment), null, 2))
}
