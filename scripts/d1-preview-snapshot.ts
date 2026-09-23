import { createHash } from 'node:crypto'
import { applicationColumnInventory, applicationTableNames } from './d1-replatform-inventory'

interface D1Result {
  results?: Array<Record<string, unknown>>
  success?: boolean
}
export interface ApplicationSnapshot {
  checksum: string
  migrationNames: unknown[]
  tables: Record<string, { checksum: string; count: number }>
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
    throw new Error('Read-only D1 snapshot failed.')
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

export async function readRemoteApplicationSnapshot(
  databaseId: string
): Promise<ApplicationSnapshot> {
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
  )
  return {
    checksum: createHash('sha256')
      .update(JSON.stringify(Object.entries(tables).sort()))
      .digest('hex'),
    tables,
    migrationNames: ledgerPresent ? (results.at(-1)?.results ?? []).map(row => row.name) : []
  }
}
