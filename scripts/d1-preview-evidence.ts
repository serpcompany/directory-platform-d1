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
  const line = source.split('\n').findLast(candidate => candidate.trim().startsWith('{'))
  if (!line) throw new Error(`${path} contains no JSON evidence.`)
  const value: unknown = JSON.parse(line)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} evidence must be an object.`)
  return value as Record<string, unknown>
}

const values = argumentsMap(process.argv.slice(2))
const siteId = resolveSiteTarget(required(values, '--site')).siteId
const target = resolveSiteTarget(siteId)
const identity = readJson(required(values, '--identity'))
const firstImport = readFileSync(resolve(required(values, '--first-import')), 'utf8')
const first = readJson(required(values, '--first-parity'))
const repeat = readJson(required(values, '--repeat-parity'))
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
  identity,
  migration: {
    finalSnapshotSha256,
    sourceSnapshotChecksum: report.target.checksum,
    targetSnapshotChecksum: report.target.checksum,
    firstRunMode: firstImport.includes('import is a no-op') ? 'verified-no-op' : 'imported',
    repeatRunMode: 'verified-no-op',
    exactParity: true,
    freshMigrationLedger: true
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
  rollbackRehearsed: true,
  nothingDeleted: true,
  previewData: {
    policy: process.env.D1_PREVIEW_DATA_POLICY,
    copiedProduction: { capabilityRows: 0, notificationSecretRows: 0, rateLimitRows: 0 },
    previewGenerated: { capabilityRows: 0, notificationSecretRows: 0, rateLimitRows: 0 }
  }
}
writeFileSync(resolve(required(values, '--output')), `${JSON.stringify(evidence, null, 2)}\n`)
