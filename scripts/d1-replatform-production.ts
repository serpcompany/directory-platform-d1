import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CUTOVER_LOCK_ID_PREFIX } from '../packages/data-ops/src/cutover-lock'
import {
  cloudflareProductionIdentityDependencies,
  downloadTrustedPreviewReceipt,
  githubPreviewArtifactDependencies,
  type ProductionIdentityProof,
  verifyProductionIdentityPreflight
} from './d1-replatform-production-preflight'
import {
  captureFrozenSourceSnapshot,
  type FrozenSourceSnapshot,
  type IdentifiedSnapshotTransport,
  materializeFrozenSnapshot,
  type SnapshotTransferTransport,
  verifyMaterializedSnapshot
} from './d1-replatform-snapshot-transfer'
import { parseSiteId, resolveSiteTarget, type SiteId } from './site-targets'

type Json = Record<string, unknown>
const repository = 'serpcompany/directory-platform-d1'
const evidenceVersion = 1

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Json)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function exactKeys(value: Json, keys: readonly string[], label: string): void {
  if (Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0'))
    throw new Error(`${label} has missing or unexpected fields.`)
}

function object(value: unknown, label: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`)
  return value as Json
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be nonempty text.`)
  return value
}

function digest(value: unknown, label: string): string {
  const result = text(value, label)
  if (!/^[0-9a-f]{64}$/u.test(result)) throw new Error(`${label} must be a lowercase SHA-256.`)
  return result
}

function output(path: string, value: unknown): void {
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), 'utf8'))
}

interface D1Envelope {
  result?: Array<{ results?: Json[]; success?: boolean }>
  success?: boolean
}

export function remoteD1Transport(
  databaseId: string
): SnapshotTransferTransport & IdentifiedSnapshotTransport {
  const accountId = required('CLOUDFLARE_ACCOUNT_ID')
  const token = required('CLOUDFLARE_API_TOKEN')
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`
  const execute = async (body: unknown): Promise<D1Envelope> => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000)
    })
    const payload = (await response.json()) as D1Envelope
    if (
      !response.ok ||
      payload.success === false ||
      !payload.result?.length ||
      payload.result.some(item => item.success === false)
    )
      throw new Error('Bounded remote D1 operation failed.')
    return payload
  }
  return {
    async observeDatabaseIdentity() {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000)
        }
      )
      const payload = object(await response.json(), 'D1 identity response')
      const result = object(payload.result, 'D1 identity result')
      if (!response.ok || payload.success !== true || result.uuid !== databaseId)
        throw new Error('Observed D1 identity differs from the requested database.')
      return { databaseId }
    },
    async query(statement) {
      return (await execute(statement)).result?.[0]?.results ?? []
    },
    async batch(statements) {
      const result = await execute({ batch: statements })
      if (result.result?.length !== statements.length)
        throw new Error('Remote D1 batch result is incomplete.')
    }
  }
}

export interface ProductionCutoverReceipt {
  evidence: {
    authorityRemoved: true
    commitSha: string
    cutoverId: string
    frozenSnapshotChecksum: string
    identity: ProductionIdentityProof
    preview: { artifactId: number; artifactName: string; receiptSha256: string; runId: number }
    rollback: {
      sourceVersionId: string
      sourceVerified: true
      targetRestored: true
      targetVersionId: string
    }
    siteId: SiteId
    sourceBackupSha256: string
    status: 'locked-target-active'
    targetBackupSha256: string
    transfer: { mode: string; receiptId: string; snapshotChecksum: string; totalRows: number }
    version: 1
  }
  sha256: string
}

const evidenceKeys = [
  'authorityRemoved',
  'commitSha',
  'cutoverId',
  'frozenSnapshotChecksum',
  'identity',
  'preview',
  'rollback',
  'siteId',
  'sourceBackupSha256',
  'status',
  'targetBackupSha256',
  'transfer',
  'version'
] as const

export function sealProductionEvidence(raw: unknown): ProductionCutoverReceipt {
  const evidence = object(raw, 'Production evidence')
  exactKeys(evidence, evidenceKeys, 'Production evidence')
  if (
    evidence.version !== evidenceVersion ||
    evidence.status !== 'locked-target-active' ||
    evidence.authorityRemoved !== true
  )
    throw new Error('Production evidence is not a completed locked cutover.')
  const siteId = parseSiteId(text(evidence.siteId, 'siteId'))
  const commitSha = text(evidence.commitSha, 'commitSha')
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) throw new Error('commitSha must be a full lowercase SHA.')
  const cutoverId = text(evidence.cutoverId, 'cutoverId')
  if (cutoverId.includes(':')) throw new Error('cutoverId is malformed.')
  digest(evidence.frozenSnapshotChecksum, 'frozenSnapshotChecksum')
  digest(evidence.sourceBackupSha256, 'sourceBackupSha256')
  digest(evidence.targetBackupSha256, 'targetBackupSha256')
  const identity = object(evidence.identity, 'identity')
  if (identity.siteId !== siteId || identity.currentDatabaseId !== identity.sourceDatabaseId)
    throw new Error('Initial Production identity is not source-bound for this Site.')
  const preview = object(evidence.preview, 'preview')
  exactKeys(preview, ['artifactId', 'artifactName', 'receiptSha256', 'runId'], 'preview')
  digest(preview.receiptSha256, 'preview.receiptSha256')
  if (!Number.isSafeInteger(preview.artifactId) || !Number.isSafeInteger(preview.runId))
    throw new Error('Preview IDs are invalid.')
  const transfer = object(evidence.transfer, 'transfer')
  exactKeys(transfer, ['mode', 'receiptId', 'snapshotChecksum', 'totalRows'], 'transfer')
  if (
    transfer.snapshotChecksum !== evidence.frozenSnapshotChecksum ||
    !['imported', 'resumed', 'verified-no-op'].includes(String(transfer.mode))
  )
    throw new Error('Transfer evidence does not match the frozen snapshot.')
  const rollback = object(evidence.rollback, 'rollback')
  exactKeys(
    rollback,
    ['sourceVersionId', 'sourceVerified', 'targetRestored', 'targetVersionId'],
    'rollback'
  )
  if (
    rollback.sourceVerified !== true ||
    rollback.targetRestored !== true ||
    rollback.sourceVersionId === rollback.targetVersionId
  )
    throw new Error('Rollback rehearsal evidence is incomplete.')
  return {
    evidence: evidence as ProductionCutoverReceipt['evidence'],
    sha256: sha256(canonical(evidence))
  }
}

export function validateProductionReceipt(
  raw: unknown,
  expectedDigest: string
): ProductionCutoverReceipt {
  const receipt = object(raw, 'Production receipt')
  exactKeys(receipt, ['evidence', 'sha256'], 'Production receipt')
  const sealed = sealProductionEvidence(receipt.evidence)
  if (
    sealed.sha256 !== digest(receipt.sha256, 'receipt.sha256') ||
    sealed.sha256 !== digest(expectedDigest, 'expected digest')
  )
    throw new Error('Production receipt digest does not match sealed protected evidence.')
  return sealed
}

export async function acquireCutoverLock(
  databaseId: string,
  siteValue: string,
  cutoverId: string,
  now: string
): Promise<string> {
  const siteId = parseSiteId(siteValue)
  if (!cutoverId || cutoverId.includes(':')) throw new Error('Cutover identity is malformed.')
  const id = `${CUTOVER_LOCK_ID_PREFIX}${siteId}:${cutoverId}`
  const transport = remoteD1Transport(databaseId)
  await transport.batch([
    {
      sql: `INSERT INTO migration_runs (id,site_id,schema_version,manifest_identity,input_checksum,target_checksum,affected_records,outcome,error,started_at,completed_at)
      SELECT ?,?,'cutover-v1','production-cutover-lock','','',0,'started',NULL,?,NULL
      WHERE NOT EXISTS (SELECT 1 FROM migration_runs WHERE site_id=? AND id LIKE ? ESCAPE '\\' AND outcome='started')`,
      params: [
        id,
        siteId,
        now,
        siteId,
        `${CUTOVER_LOCK_ID_PREFIX.replaceAll('_', '\\_')}${siteId}:%`
      ]
    }
  ])
  const rows = await transport.query({
    sql: "SELECT id FROM migration_runs WHERE site_id=? AND id LIKE ? AND outcome='started' ORDER BY id",
    params: [siteId, `${CUTOVER_LOCK_ID_PREFIX}${siteId}:%`]
  })
  if (rows.length !== 1 || rows[0]?.id !== id)
    throw new Error('Unable to prove the sole exact immutable Production cutover lock.')
  return id
}

export async function finalizeActiveLock(
  databaseId: string,
  siteValue: string,
  cutoverId: string,
  now: string
): Promise<void> {
  const siteId = parseSiteId(siteValue)
  const id = `${CUTOVER_LOCK_ID_PREFIX}${siteId}:${cutoverId}`
  const transport = remoteD1Transport(databaseId)
  await transport.batch([
    {
      sql: "UPDATE migration_runs SET outcome='succeeded',completed_at=? WHERE id=? AND site_id=? AND outcome='started'",
      params: [now, id, siteId]
    },
    { sql: "SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('', '$') END", params: [] }
  ])
  const rows = await transport.query({
    sql: 'SELECT outcome,completed_at FROM migration_runs WHERE id=? AND site_id=?',
    params: [id, siteId]
  })
  if (rows.length !== 1 || rows[0]?.outcome !== 'succeeded' || rows[0]?.completed_at !== now)
    throw new Error('Active database lock finalization was not exact.')
}

export async function assertLocked(
  databaseId: string,
  siteValue: string,
  cutoverId: string
): Promise<void> {
  const siteId = parseSiteId(siteValue)
  const id = `${CUTOVER_LOCK_ID_PREFIX}${siteId}:${cutoverId}`
  const rows = await remoteD1Transport(databaseId).query({
    sql: "SELECT id FROM migration_runs WHERE id=? AND site_id=? AND outcome='started'",
    params: [id, siteId]
  })
  if (rows.length !== 1) throw new Error('Database does not retain the exact active cutover lock.')
}

async function activeDeployment(
  expectedDatabaseId: string,
  expectedVersionId?: string
): Promise<Json> {
  const account = required('CLOUDFLARE_ACCOUNT_ID')
  const worker = required('CLOUDFLARE_WORKER_PRODUCTION_NAME')
  const headers = { Authorization: `Bearer ${required('CLOUDFLARE_API_TOKEN')}` }
  const get = async (path: string) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      headers,
      signal: AbortSignal.timeout(15_000)
    })
    const envelope = object(await response.json(), 'Cloudflare response')
    if (!response.ok || envelope.success !== true) throw new Error('Cloudflare observation failed.')
    return envelope.result
  }
  const history = object(
    await get(`/accounts/${account}/workers/scripts/${encodeURIComponent(worker)}/deployments`),
    'deployments'
  )
  if (!Array.isArray(history.deployments) || history.deployments.length < 1)
    throw new Error('Deployment history is missing.')
  const deployment = object(history.deployments[0], 'active deployment')
  if (!Array.isArray(deployment.versions) || deployment.versions.length !== 1)
    throw new Error('Active deployment is ambiguous.')
  const active = object(deployment.versions[0], 'active version')
  if (active.percentage !== 100)
    throw new Error('Active deployment is not sole 100 percent traffic.')
  const versionId = text(active.version_id, 'version id')
  if (expectedVersionId && versionId !== expectedVersionId)
    throw new Error('Active version differs from the recorded immutable version.')
  const version = object(
    await get(
      `/accounts/${account}/workers/scripts/${encodeURIComponent(worker)}/versions/${versionId}`
    ),
    'version'
  )
  const resources = object(version.resources, 'version resources')
  if (!Array.isArray(resources.bindings)) throw new Error('Version bindings are missing.')
  const db = resources.bindings
    .map(value => object(value, 'binding'))
    .filter(value => value.type === 'd1' && value.name === 'DB')
  if (db.length !== 1 || (db[0]?.database_id ?? db[0]?.id) !== expectedDatabaseId)
    throw new Error('Active version has the wrong or ambiguous DB binding.')
  return { deploymentId: deployment.id, versionId, databaseId: expectedDatabaseId }
}

async function preflight(siteId: SiteId): Promise<{
  identity: ProductionIdentityProof
  preview: Awaited<ReturnType<typeof downloadTrustedPreviewReceipt>>
}> {
  const head = required('GITHUB_SHA')
  const preview = await downloadTrustedPreviewReceipt(
    {
      checkedOutHeadSha: head,
      expectedReceiptSha256: required('TRUSTED_PREVIEW_RECEIPT_SHA256'),
      repository,
      runId: Number(required('TRUSTED_PREVIEW_RUN_ID')),
      siteId
    },
    githubPreviewArtifactDependencies(required('GITHUB_TOKEN'))
  )
  const target = resolveSiteTarget(siteId)
  const identity = await verifyProductionIdentityPreflight(
    {
      accountId: required('CLOUDFLARE_ACCOUNT_ID'),
      allowedSiteIds: required('D1_CUTOVER_ALLOWED_SITE_IDS').split(','),
      checkedOutHeadSha: head,
      eventName: required('GITHUB_EVENT_NAME'),
      expectedAccountId: required('CLOUDFLARE_EXPECTED_ACCOUNT_ID'),
      githubRef: required('GITHUB_REF'),
      githubSha: head,
      protectedEnvironment: required('D1_CUTOVER_PROTECTED_ENVIRONMENT'),
      repository,
      replacementDatabaseId: required('CLOUDFLARE_D1_REPLACEMENT_PRODUCTION_DATABASE_ID'),
      replacementDatabaseName: required('CLOUDFLARE_D1_REPLACEMENT_PRODUCTION_DATABASE_NAME'),
      sourceDatabaseId: required('CLOUDFLARE_D1_PRODUCTION_DATABASE_ID'),
      sourceDatabaseName: required('CLOUDFLARE_D1_PRODUCTION_DATABASE_NAME'),
      siteId,
      workerName: required('CLOUDFLARE_WORKER_PRODUCTION_NAME')
    },
    cloudflareProductionIdentityDependencies(required('CLOUDFLARE_API_TOKEN'))
  )
  if (identity.protectedEnvironment !== target.protectedEnvironment.production)
    throw new Error('Protected environment mismatch.')
  return { identity, preview }
}

async function main(argv: string[]): Promise<void> {
  const [command, siteFlag, siteValue, ...rest] = argv
  if (siteFlag !== '--site') throw new Error('An explicit --site is required.')
  const siteId = parseSiteId(siteValue)
  const arg = (name: string) => {
    const index = rest.indexOf(name)
    if (index < 0 || !rest[index + 1]) throw new Error(`Missing ${name}.`)
    return rest[index + 1]!
  }
  if (command === 'preflight') {
    const result = await preflight(siteId)
    output(arg('--output'), result)
  } else if (command === 'acquire-lock') {
    const id = await acquireCutoverLock(
      required('CLOUDFLARE_D1_PRODUCTION_DATABASE_ID'),
      siteId,
      arg('--cutover-id'),
      new Date().toISOString()
    )
    output(arg('--output'), { id, siteId })
  } else if (command === 'capture') {
    const snapshot = await captureFrozenSourceSnapshot(
      remoteD1Transport(required('CLOUDFLARE_D1_PRODUCTION_DATABASE_ID')),
      {
        capturedAt: new Date().toISOString(),
        cutoverId: arg('--cutover-id'),
        siteId,
        sourceDatabaseId: required('CLOUDFLARE_D1_PRODUCTION_DATABASE_ID')
      }
    )
    output(arg('--output'), snapshot)
  } else if (command === 'materialize') {
    const source = readJson(arg('--snapshot')) as FrozenSourceSnapshot
    const result = await materializeFrozenSnapshot(
      remoteD1Transport(required('CLOUDFLARE_D1_REPLACEMENT_PRODUCTION_DATABASE_ID')),
      source
    )
    output(arg('--output'), result)
  } else if (command === 'verify-transfer') {
    const result = await verifyMaterializedSnapshot(
      remoteD1Transport(required('CLOUDFLARE_D1_REPLACEMENT_PRODUCTION_DATABASE_ID')),
      readJson(arg('--snapshot')) as FrozenSourceSnapshot
    )
    output(arg('--output'), result)
  } else if (command === 'observe') {
    output(
      arg('--output'),
      await activeDeployment(
        arg('--database-id'),
        rest.includes('--version-id') ? arg('--version-id') : undefined
      )
    )
  } else if (command === 'assert-locked') {
    await assertLocked(arg('--database-id'), siteId, arg('--cutover-id'))
  } else if (command === 'finalize') {
    await finalizeActiveLock(
      arg('--database-id'),
      siteId,
      arg('--cutover-id'),
      new Date().toISOString()
    )
  } else if (command === 'seal') {
    output(arg('--output'), sealProductionEvidence(readJson(arg('--evidence'))))
  } else if (command === 'assemble') {
    const preflightResult = object(readJson(arg('--preflight')), 'preflight result')
    const identity = object(
      preflightResult.identity,
      'preflight identity'
    ) as unknown as ProductionIdentityProof
    const preview = object(preflightResult.preview, 'preflight preview')
    const snapshot = readJson(arg('--snapshot')) as FrozenSourceSnapshot
    const transfer = object(readJson(arg('--transfer')), 'transfer')
    const sourceObservation = object(readJson(arg('--source-observation')), 'source observation')
    const targetObservation = object(readJson(arg('--target-observation')), 'target observation')
    const rollbackSource = object(readJson(arg('--rollback-source')), 'rollback source')
    const rollbackTarget = object(readJson(arg('--rollback-target')), 'rollback target')
    if (
      rollbackSource.versionId !== sourceObservation.versionId ||
      rollbackSource.databaseId !== identity.sourceDatabaseId
    )
      throw new Error(
        'Rollback source observation does not match the recorded immutable source version.'
      )
    if (
      rollbackTarget.versionId !== targetObservation.versionId ||
      rollbackTarget.databaseId !== identity.replacementDatabaseId
    )
      throw new Error(
        'Restoration observation does not match the recorded immutable target version.'
      )
    const evidence = {
      authorityRemoved: true,
      commitSha: required('GITHUB_SHA'),
      cutoverId: arg('--cutover-id'),
      frozenSnapshotChecksum: snapshot.snapshot.checksum,
      identity,
      preview: {
        artifactId: preview.artifactId,
        artifactName: preview.artifactName,
        receiptSha256: object(preview.receipt, 'preview receipt').sha256,
        runId: preview.runId
      },
      rollback: {
        sourceVersionId: sourceObservation.versionId,
        sourceVerified: true,
        targetRestored: true,
        targetVersionId: targetObservation.versionId
      },
      siteId,
      sourceBackupSha256: sha256(readFileSync(resolve(arg('--source-backup')))),
      status: 'locked-target-active',
      targetBackupSha256: sha256(readFileSync(resolve(arg('--target-backup')))),
      transfer: {
        mode: transfer.mode,
        receiptId: transfer.receiptId,
        snapshotChecksum: transfer.snapshotChecksum,
        totalRows: transfer.totalRows
      },
      version: evidenceVersion
    }
    output(arg('--output'), evidence)
  } else if (command === 'validate-receipt') {
    const receipt = validateProductionReceipt(
      readJson(arg('--receipt')),
      required('TRUSTED_PRODUCTION_RECEIPT_SHA256')
    )
    if (receipt.evidence.siteId !== siteId) throw new Error('Production receipt Site mismatch.')
    output(arg('--output'), receipt)
  } else throw new Error('Unsupported Production cutover command.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
