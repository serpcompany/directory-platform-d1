import { beforeEach, describe, expect, it, vi } from 'vitest'

type BoundStatement = {
  bind: (...values: unknown[]) => BoundStatement
  first: <T>() => Promise<T>
  sql: string
  values: unknown[]
}

const fake = vi.hoisted(() => ({
  row: {
    badge_verified_at: null as string | null,
    id: '11111111-1111-4111-8111-111111111111',
    last_verification_at: null as string | null,
    last_verification_error: null as string | null,
    name: 'Example',
    slug: 'example.com',
    status: 'pending_badge' as 'pending_badge' | 'verified',
    verification_attempts: 4,
    website: 'https://example.com/'
  }
}))

vi.mock('server-only', () => ({}))
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({
    env: {
      D1_RUNTIME_ENV: 'local',
      DB: {
        batch: async (statements: BoundStatement[]) => {
          const update = statements.find(statement =>
            statement.sql.includes('UPDATE listing_submissions SET status')
          )
          if (update) {
            const hasBoundIncrement = update.sql.includes('verification_attempts + ?')
            const increment = hasBoundIncrement ? Number(update.values[1]) : 1
            fake.row.status = update.values[0] as 'pending_badge' | 'verified'
            fake.row.verification_attempts += increment
            fake.row.last_verification_error = update.values[hasBoundIncrement ? 2 : 1] as
              | string
              | null
          }
          return statements.map(() => ({ success: true }))
        },
        prepare: (sql: string) => {
          const statement: BoundStatement = {
            bind: (...values: unknown[]) => {
              statement.values = values
              return statement
            },
            first: async <T>() => fake.row as T,
            sql,
            values: []
          }
          return statement
        }
      }
    }
  })
}))

describe('submission verification attempt policy', () => {
  beforeEach(() => {
    fake.row.badge_verified_at = null
    fake.row.last_verification_at = null
    fake.row.last_verification_error = null
    fake.row.status = 'pending_badge'
    fake.row.verification_attempts = 4
  })

  it('does not consume a content-verification attempt when the website is unreachable', async () => {
    const { finishVerification } = await import('./repository')

    const state = await finishVerification(fake.row.id, 'a'.repeat(43), {
      ok: false,
      code: 'site_unreachable'
    })

    expect(state.verificationAttempts).toBe(4)
    expect(state.lastVerificationError).toBe('site_unreachable')
  })

  it('does consume an attempt after fetching HTML that does not contain the badge', async () => {
    const { finishVerification } = await import('./repository')

    const state = await finishVerification(fake.row.id, 'a'.repeat(43), {
      ok: false,
      code: 'badge_missing'
    })

    expect(state.verificationAttempts).toBe(5)
    expect(state.lastVerificationError).toBe('badge_missing')
  })

  it('does not lock a legacy submission whose attempts came from transient fetch failures', async () => {
    const { beginVerification } = await import('./repository')
    fake.row.verification_attempts = 10
    fake.row.last_verification_error = 'fetch_failed'

    await expect(beginVerification(fake.row.id, 'a'.repeat(43))).resolves.toMatchObject({
      status: 'pending_badge',
      verificationAttempts: 10
    })

    fake.row.last_verification_error = 'badge_missing'
    await expect(beginVerification(fake.row.id, 'a'.repeat(43))).rejects.toMatchObject({
      code: 'attempt_limit',
      status: 429
    })
  })
})
