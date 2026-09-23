function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

async function main(): Promise<void> {
  const [operation] = process.argv.slice(2)
  if (operation !== 'install' && operation !== 'delete')
    throw new Error('Usage: d1-preview-attestation-marker.ts <install|delete>')
  const statements =
    operation === 'install'
      ? [
          'CREATE TABLE IF NOT EXISTS _replatform_preview_attestation (id INTEGER PRIMARY KEY CHECK(id=1), nonce TEXT NOT NULL)',
          'INSERT INTO _replatform_preview_attestation (id,nonce) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce'
        ]
      : ['DROP TABLE IF EXISTS _replatform_preview_attestation']
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${required('CLOUDFLARE_ACCOUNT_ID')}/d1/database/${required('CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID')}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required('CLOUDFLARE_API_TOKEN')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        batch: statements.map((sql, index) => ({
          sql,
          params:
            operation === 'install' && index === 1
              ? [required('REPLATFORM_PREVIEW_BINDING_NONCE')]
              : []
        }))
      })
    }
  )
  const payload = (await response.json()) as {
    result?: Array<{ success?: boolean }>
    success?: boolean
  }
  if (
    !response.ok ||
    payload.success === false ||
    !payload.result ||
    payload.result.some(item => item.success === false)
  )
    throw new Error('Preview attestation marker operation failed.')
}
void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
