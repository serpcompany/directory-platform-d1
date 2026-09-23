import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { freshMigrationNames } from './d1-drizzle-local'
import { applicationColumnInventory, applicationTableNames } from './d1-replatform-inventory'
import { resolveSiteTarget } from './site-targets'

interface D1Result {
  results?: Array<Record<string, unknown>>
  success?: boolean
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

async function query(databaseId: string, statements: string[]): Promise<D1Result[]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${required('CLOUDFLARE_ACCOUNT_ID')}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required('CLOUDFLARE_API_TOKEN')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ batch: statements.map(sql => ({ sql, params: [] })) })
    }
  )
  const payload = (await response.json()) as { result?: D1Result[]; success?: boolean }
  if (
    !response.ok ||
    payload.success === false ||
    !payload.result ||
    payload.result.some(item => item.success === false)
  )
    throw new Error('Read-only D1 measurement failed.')
  return payload.result
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}
function canonical(rows: Array<Record<string, unknown>>, columns: readonly string[]): string {
  return rows
    .map(row => JSON.stringify(columns.map(column => row[column] ?? null)))
    .sort()
    .join('\n')
}

async function snapshot(databaseId: string) {
  const inventory = await query(databaseId, [
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ])
  const names = (inventory[0]?.results ?? []).map(row => String(row.name))
  const present = applicationTableNames.filter(table => names.includes(table))
  if (present.length !== 0 && present.length !== applicationTableNames.length)
    throw new Error('D1 application table inventory is partial.')
  const ledgerPresent = names.includes('d1_migrations')
  const results =
    present.length === 0
      ? []
      : await query(databaseId, [
          ...applicationTableNames.map(
            table =>
              `SELECT ${applicationColumnInventory[table].map(quote).join(',')} FROM ${quote(table)}`
          ),
          ...(ledgerPresent ? ['SELECT name FROM d1_migrations ORDER BY name'] : [])
        ])
  const tables = Object.fromEntries(
    applicationTableNames.map((table, index) => {
      const rows = results[index]?.results ?? []
      const payload = canonical(rows, applicationColumnInventory[table])
      return [
        table,
        { count: rows.length, checksum: createHash('sha256').update(payload).digest('hex') }
      ]
    })
  ) as Record<string, { count: number; checksum: string }>
  const checksum = createHash('sha256')
    .update(JSON.stringify(Object.entries(tables).sort()))
    .digest('hex')
  return {
    checksum,
    tables,
    migrationNames: ledgerPresent ? (results.at(-1)?.results ?? []).map(row => row.name) : []
  }
}

async function main(): Promise<void> {
  const [phase, siteValue, output] = process.argv.slice(2)
  if ((phase !== 'preflight' && phase !== 'parity') || !siteValue || !output)
    throw new Error('Usage: d1-preview-measure.ts <preflight|parity> <site> <output.json>')
  const siteId = resolveSiteTarget(siteValue).siteId
  const source = await snapshot(required('CLOUDFLARE_D1_PREVIEW_DATABASE_ID'))
  const target = await snapshot(required('CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID'))
  const targetRows = Object.values(target.tables).reduce((sum, table) => sum + table.count, 0)
  const exactParity = source.checksum === target.checksum
  if (phase === 'preflight' && targetRows !== 0 && !exactParity)
    throw new Error(
      'Replacement Preview target is neither empty nor an exact trusted prior receipt.'
    )
  if (phase === 'parity' && !exactParity)
    throw new Error('Source and replacement Preview D1 parity differ.')
  const expectedLedger = freshMigrationNames()
  const freshLedger = target.migrationNames.join('\0') === expectedLedger.join('\0')
  if (phase === 'parity' && !freshLedger)
    throw new Error('Replacement Preview fresh migration ledger differs.')
  const privateCounts = {
    capabilityRows: target.tables.listing_submissions.count,
    notificationSecretRows: target.tables.listing_submission_notifications.count,
    rateLimitRows: target.tables.listing_submission_rate_limits.count
  }
  writeFileSync(
    resolve(output),
    `${JSON.stringify({ siteId, phase, source, target, targetInitiallyEmpty: targetRows === 0, trustedPriorReceipt: targetRows > 0 && exactParity, exactParity, freshLedger, privateCounts }, null, 2)}\n`
  )
}
void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
