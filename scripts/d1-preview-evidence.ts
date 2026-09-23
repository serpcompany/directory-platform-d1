import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { freshMigrationChecksum } from './d1-replatform-cutover'
import { resolveSiteTarget } from './site-targets'

function argumentsMap(args: string[]): Map<string, string> {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!flag?.startsWith('--') || !value) throw new Error('Every evidence flag needs a value.')
    values.set(flag, value)
  }
  return values
}

function required(values: Map<string, string>, flag: string): string {
  const value = values.get(flag)
  if (!value) throw new Error(`Missing ${flag}.`)
  return value
}

function readJson(path: string): Record<string, unknown> {
  const source = readFileSync(resolve(path), 'utf8').trim()
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    const line = source.split('\n').findLast(candidate => candidate.trim().startsWith('{'))
    if (!line) throw new Error(`${path} contains no JSON evidence.`)
    value = JSON.parse(line)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} evidence must be an object.`)
  return value as Record<string, unknown>
}

const values = argumentsMap(process.argv.slice(2))
const siteId = resolveSiteTarget(required(values, '--site')).siteId
const target = resolveSiteTarget(siteId)
const identity = readJson(required(values, '--identity'))
const workerAttestation = readJson(required(values, '--worker-attestation'))
const firstImport = readFileSync(resolve(required(values, '--first-import')), 'utf8')
const first = readJson(required(values, '--first-parity'))
const repeat = readJson(required(values, '--repeat-parity'))
const preflight = readJson(required(values, '--preflight'))
const measured = readJson(required(values, '--measurement'))
const repeatMeasured = readJson(required(values, '--repeat-measurement'))
const postJourneyMeasured = readJson(required(values, '--post-journey-measurement'))
const catalog = readJson(required(values, '--catalog-journeys'))
const submission = readJson(required(values, '--submission-journeys'))
const rollbackSource = readJson(required(values, '--rollback-source'))
const rollbackTarget = readJson(required(values, '--rollback-target'))
if (JSON.stringify(first) !== JSON.stringify(repeat))
  throw new Error('First and repeat Preview parity evidence differ.')
if (
  first.siteId !== siteId ||
  first.environment !== 'preview' ||
  typeof first.checksum !== 'string'
)
  throw new Error('Preview parity output is not bound to the selected Site.')
const report = parse(readFileSync(resolve(target.parityReportPath), 'utf8')) as {
  target: { checksum: string }
}
if (first.checksum !== report.target.checksum)
  throw new Error('Preview parity checksum does not match the reviewed controlled fixture.')
if (preflight.targetInitiallyEmpty !== true && preflight.trustedPriorReceipt !== true)
  throw new Error('Preview target had neither empty state nor a trusted prior receipt.')
if (
  measured.exactParity !== true ||
  measured.freshLedger !== true ||
  repeatMeasured.exactParity !== true ||
  repeatMeasured.freshLedger !== true ||
  postJourneyMeasured.exactParity !== true ||
  postJourneyMeasured.freshLedger !== true
)
  throw new Error('Measured exact parity or fresh migration ledger evidence failed.')
const measuredSource = measured.source as { checksum?: unknown }
const measuredTarget = measured.target as { checksum?: unknown }
const repeatedTarget = repeatMeasured.target as { checksum?: unknown }
const postJourneyTarget = postJourneyMeasured.target as { checksum?: unknown }
if (
  typeof measuredSource?.checksum !== 'string' ||
  measuredSource.checksum !== measuredTarget?.checksum ||
  measuredTarget.checksum !== repeatedTarget?.checksum ||
  measuredTarget.checksum !== postJourneyTarget?.checksum
)
  throw new Error('Measured source, target, and repeated target checksums differ.')
const allTrue = (record: Record<string, unknown>, label: string): void => {
  if (Object.values(record).some(value => value !== true)) throw new Error(`${label} did not pass.`)
}
allTrue(catalog, 'Catalog journeys')
for (const key of [
  'intake',
  'rateLimit',
  'badgeVerification',
  'privatePreview',
  'approval',
  'rejection',
  'sourceUnchanged'
])
  if (submission[key] !== true) throw new Error(`Submission journey ${key} did not pass.`)
const rateLimitEvidence = submission.rateLimitEvidence as Record<string, unknown>
if (
  !rateLimitEvidence ||
  rateLimitEvidence.status !== 429 ||
  typeof rateLimitEvidence.attempts !== 'number' ||
  rateLimitEvidence.attempts < 1 ||
  rateLimitEvidence.attempts > 12
)
  throw new Error('Submission rate-limit evidence is not a bounded real 429 result.')
allTrue(rollbackSource, 'Source rollback route gates')
allTrue(rollbackTarget, 'Replacement restoration route gates')
const copiedProduction = measured.privateCounts as Record<string, unknown>
if (!copiedProduction || Object.values(copiedProduction).some(value => Number(value) !== 0))
  throw new Error('Measured copied Production private-state counts must be zero.')
const previewGenerated = submission.previewGenerated as Record<string, unknown>
if (
  !previewGenerated ||
  Object.values(previewGenerated).some(value => !Number.isInteger(value) || Number(value) < 1)
)
  throw new Error('Measured Preview-generated private-state counts are invalid.')
const afterCleanup = submission.targetPrivateRowsAfterCleanup as Record<string, unknown>
if (!afterCleanup || Object.values(afterCleanup).some(value => Number(value) !== 0))
  throw new Error('Submission journey cleanup deleted or retained unexpected state.')
const artifactFiles = readdirSync(resolve(target.artifactBatchDirectory))
  .filter(file => file.endsWith('.sql'))
  .sort()
const finalSnapshotSha256 = createHash('sha256')
  .update(
    artifactFiles
      .map(file => `${file}\0${readFileSync(resolve(target.artifactBatchDirectory, file), 'utf8')}`)
      .join('\0')
  )
  .digest('hex')
const evidence = {
  siteId,
  environment: 'preview',
  commitSha: process.env.GITHUB_SHA,
  migrationChecksum: freshMigrationChecksum(),
  identity: { ...identity, attestation: workerAttestation },
  migration: {
    finalSnapshotSha256,
    sourceSnapshotChecksum: measuredSource.checksum,
    targetSnapshotChecksum: measuredTarget.checksum,
    firstRunMode: firstImport.includes('import is a no-op') ? 'verified-no-op' : 'imported',
    repeatRunMode: 'verified-no-op',
    exactParity: measured.exactParity,
    freshMigrationLedger: measured.freshLedger
  },
  catalogJourneys: ['home', 'category', 'detail', 'search', 'rss', 'sitemap', 'legacy-redirect'],
  submissionJourneys: [
    'intake',
    'rate-limit',
    'badge-verification',
    'private-review-preview',
    'approval',
    'rejection'
  ],
  rollbackRehearsed:
    Object.values(rollbackSource).every(value => value === true) &&
    Object.values(rollbackTarget).every(value => value === true),
  nothingDeleted:
    submission.sourceUnchanged === true &&
    Object.values(afterCleanup).every(value => Number(value) === 0),
  previewData: {
    policy: process.env.D1_PREVIEW_DATA_POLICY,
    copiedProduction,
    previewGenerated
  }
}
writeFileSync(resolve(required(values, '--output')), `${JSON.stringify(evidence, null, 2)}\n`)
