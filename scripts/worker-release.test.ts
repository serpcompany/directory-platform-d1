import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import {
  runWorkerRelease,
  validateWorkerConfig,
  type WorkerReleaseDependencies
} from './worker-release.ts'

const sha = 'a'.repeat(40)
const productionEnv = {
  CI: 'true',
  GITHUB_ACTIONS: 'true',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: sha,
  GITHUB_WORKFLOW_REF:
    'serpcompany/directory-platform-d1/.github/workflows/build-and-deploy.yml@refs/heads/main',
  WORKER_PRODUCTION_CONFIRM: 'deploy-serp.software-production',
  CLOUDFLARE_D1_PRODUCTION_DATABASE_ID: 'test-production-id',
  CLOUDFLARE_D1_PRODUCTION_DATABASE_NAME: 'test-production-name',
  CLOUDFLARE_WORKER_PRODUCTION_NAME: 'test-production-worker'
}

function dependencies(
  outputs: Array<{ status: number; stdout?: string }> = []
): WorkerReleaseDependencies & { run: ReturnType<typeof vi.fn> } {
  return {
    readFile: () => Buffer.from('backup'),
    run: vi.fn(() => outputs.shift() ?? { status: 0 })
  }
}

describe('Worker release guard', () => {
  it('validates isolated checked-in placeholder configs', () => {
    expect(() => validateWorkerConfig('preview', 'serp.software')).not.toThrow()
    expect(() => validateWorkerConfig('production', 'serp.software')).not.toThrow()
    expect(() => validateWorkerConfig('preview', 'pornvideodownloaders.com')).not.toThrow()
    expect(() => validateWorkerConfig('production', 'pornvideodownloaders.com')).not.toThrow()
    expect(readFileSync('wrangler.preview.jsonc', 'utf8')).not.toContain('PRODUCTION')
    expect(readFileSync('wrangler.production.jsonc', 'utf8')).not.toContain('PREVIEW')
    expect(readFileSync('wrangler.pornvideodownloaders.preview.jsonc', 'utf8')).not.toContain(
      'serp.software'
    )
  })

  it('uses a workerd-compatible Markdown renderer in both Workers', () => {
    for (const siteId of ['serp.software', 'pornvideodownloaders.com']) {
      const config = readFileSync(`apps/${siteId}/next.config.ts`, 'utf8')
      const packageJson = readFileSync(`apps/${siteId}/package.json`, 'utf8')
      expect(config).not.toContain('next-mdx-remote')
      expect(packageJson).not.toContain('next-mdx-remote')
    }
    expect(readFileSync('packages/web-core/package.json', 'utf8')).not.toContain('next-mdx-remote')
    expect(readFileSync('packages/web-core/src/static-pages/legal-page.tsx', 'utf8')).toContain(
      'ReactMarkdown'
    )
  })

  it('requires explicit confirmation for credential-free remote plans', () => {
    expect(() =>
      runWorkerRelease(['plan-migration', 'production', '--site', 'serp.software'], {})
    ).toThrow('D1_REMOTE_CONFIRM')
    expect(() =>
      runWorkerRelease(['plan-verify', 'preview', '--site', 'pornvideodownloaders.com'], {})
    ).toThrow('D1_REMOTE_CONFIRM')
    expect(() => runWorkerRelease(['validate', 'preview'], {})).toThrow('explicit --site')
  })

  it('rejects a non-main ref, missing confirmation, and dirty simulated CI checkout', () => {
    expect(() =>
      runWorkerRelease(
        ['deploy', 'production', '--site', 'serp.software'],
        { ...productionEnv, GITHUB_REF: 'refs/heads/topic' },
        dependencies()
      )
    ).toThrow('main branch')
    expect(() =>
      runWorkerRelease(
        ['deploy', 'production', '--site', 'serp.software'],
        { ...productionEnv, WORKER_PRODUCTION_CONFIRM: '' },
        dependencies()
      )
    ).toThrow('confirmation')
    expect(() =>
      runWorkerRelease(
        ['deploy', 'production', '--site', 'serp.software'],
        productionEnv,
        dependencies([{ status: 0, stdout: ' M package.json' }])
      )
    ).toThrow('clean source checkout')
  })

  it('rejects a checkout whose HEAD does not match GITHUB_SHA', () => {
    const process = dependencies([
      { status: 0, stdout: '' },
      { status: 0, stdout: 'b'.repeat(40) }
    ])
    expect(() =>
      runWorkerRelease(['deploy', 'production', '--site', 'serp.software'], productionEnv, process)
    ).toThrow('HEAD must match')
  })

  it('builds guarded remote backup, migration, verification, and OpenNext commands without executing them', () => {
    const commands = ['backup', 'migrate', 'verify', 'deploy'] as const
    for (const command of commands) {
      const outputs = [
        { status: 0, stdout: '' },
        { status: 0, stdout: sha }
      ]
      if (command === 'verify') {
        const report = parse(readFileSync('d1/artifacts/serp-software-v1-parity.yaml', 'utf8')) as {
          parity: {
            categories: Array<{ slug: string }>
            categoryMembershipCount: number
            exactSlugSet: string[]
            featuredSlugs: string[]
          }
          target: { categoryCount: number; checksum: string; listingCount: number }
        }
        outputs.push({
          status: 0,
          stdout: JSON.stringify([
            {
              success: true,
              results: [
                {
                  categories: report.parity.categories.map(category => category.slug).join('\0'),
                  category_count: report.target.categoryCount,
                  checksum: report.target.checksum,
                  featured_count: report.parity.featuredSlugs.length,
                  listing_count: report.target.listingCount,
                  membership_count: report.parity.categoryMembershipCount,
                  slugs: report.parity.exactSlugSet.join('\0'),
                  version: 1
                }
              ]
            }
          ])
        })
      } else outputs.push({ status: 0, stdout: '' })
      const process = dependencies(outputs)
      expect(() =>
        runWorkerRelease([command, 'production', '--site', 'serp.software'], productionEnv, process)
      ).not.toThrow()
      const invocation = process.run.mock.calls[2]
      expect(invocation?.[0]).toBe('pnpm')
      expect(invocation?.[1]).toContain(
        resolve('.wrangler.serp-software.production.generated.jsonc')
      )
      if (command === 'deploy') expect(invocation?.[1]).toContain('opennextjs-cloudflare')
      else {
        expect(invocation?.[1]).toContain('wrangler')
        expect(invocation?.[1]).toContain('--remote')
      }
    }
  })

  it('imports the deterministic catalog only into an empty production publication', () => {
    const process = dependencies([
      { status: 0, stdout: '' },
      { status: 0, stdout: sha },
      {
        status: 0,
        stdout: '[{"success":true,"results":[{"checksum":null,"site_exists":0}]}]'
      }
    ])
    expect(() =>
      runWorkerRelease(['import', 'production', '--site', 'serp.software'], productionEnv, process)
    ).not.toThrow()
    const remoteCalls = process.run.mock.calls.slice(3)
    expect(remoteCalls.length).toBeGreaterThan(1)
    expect(remoteCalls.every(call => call[1].includes('--remote'))).toBe(true)
    expect(remoteCalls.some(call => call[1].includes('--file'))).toBe(true)
  })

  it('refuses to replay an interrupted initial import over partial site rows', () => {
    const process = dependencies([
      { status: 0, stdout: '' },
      { status: 0, stdout: sha },
      {
        status: 0,
        stdout: '[{"success":true,"results":[{"checksum":null,"site_exists":1}]}]'
      }
    ])
    expect(() =>
      runWorkerRelease(['import', 'production', '--site', 'serp.software'], productionEnv, process)
    ).toThrow('restore the pre-import backup')
    expect(process.run.mock.calls.some(call => call[1].includes('--file'))).toBe(false)
  })

  it('binds preview release authority and commands to pornvideodownloaders.com', () => {
    const previewEnv = {
      ...productionEnv,
      GITHUB_WORKFLOW_REF:
        'serpcompany/directory-platform-d1/.github/workflows/deploy-pornvideodownloaders.yml@refs/heads/main',
      WORKER_PRODUCTION_CONFIRM: 'deploy-pornvideodownloaders.com-preview',
      CLOUDFLARE_D1_PREVIEW_DATABASE_ID: 'pvd-preview-id',
      CLOUDFLARE_D1_PREVIEW_DATABASE_NAME: 'pvd-preview-db',
      CLOUDFLARE_WORKER_PREVIEW_NAME: 'pvd-preview-worker'
    }
    const process = dependencies([
      { status: 0, stdout: '' },
      { status: 0, stdout: sha },
      { status: 0, stdout: '' }
    ])
    expect(() =>
      runWorkerRelease(
        ['deploy', 'preview', '--site', 'pornvideodownloaders.com'],
        previewEnv,
        process
      )
    ).not.toThrow()
    const invocation = process.run.mock.calls[2]
    expect(invocation?.[1]).toContain('pornvideodownloaders.com')
    expect(invocation?.[1]).toContain(
      resolve('.wrangler.pornvideodownloaders-com.preview.generated.jsonc')
    )
  })
})
