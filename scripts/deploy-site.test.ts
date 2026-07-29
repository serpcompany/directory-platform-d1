import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertDeploySourceStateAllowsPush,
  buildDeployPlan,
  type DeploySourceState,
  runDeploySite
} from './deploy-site.ts'

function deploySourceState(overrides: Partial<DeploySourceState> = {}): DeploySourceState {
  return {
    ahead: 0,
    behind: 0,
    branch: 'main',
    isDirty: false,
    upstream: 'origin/main',
    ...overrides
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildDeployPlan', () => {
  it('routes serp.software production releases through the protected Worker workflow', () => {
    expect(() => buildDeployPlan({ siteId: 'serp.software' })).toThrow(
      /production Worker releases are authorized only by \.github\/workflows\/build-and-deploy\.yml/
    )
  })

  it('throws when the selected site has no deploy target', () => {
    expect(() => buildDeployPlan({ siteId: 'default' })).toThrow(/does not define a deploy target/)
  })

  it('rejects normal deploy target overrides instead of bypassing checked-in config', () => {
    expect(() =>
      buildDeployPlan(
        { siteId: 'serp.software' },
        {
          env: {
            DEPLOY_REPO_URL: 'https://github.com/example/other.git'
          }
        }
      )
    ).toThrow(/Refusing deploy target override/)
  })

  it('does not let an emergency Pages override bypass the active Worker strategy', () => {
    expect(() =>
      buildDeployPlan(
        { siteId: 'serp.software' },
        {
          env: {
            ALLOW_DEPLOY_TARGET_OVERRIDE: 'true',
            DEPLOY_BRANCH: 'emergency',
            DEPLOY_REPO_URL: 'https://github.com/example/other.git'
          }
        }
      )
    ).toThrow(/production Worker releases are authorized only/)
  })

  it('enables GitHub Pages in the target deploy workflow', () => {
    const workflowSource = readFileSync(
      resolve(process.cwd(), 'scripts/templates/target-pages-deploy.yml'),
      'utf8'
    )

    expect(workflowSource).toContain('uses: actions/configure-pages@v5')
    expect(workflowSource).toContain('enablement: true')
  })
})

describe('deploy source guard', () => {
  it('refuses a local dry-run for the protected Worker release', () => {
    expect(() => runDeploySite({ siteId: 'serp.software' }, true)).toThrow(
      /\.github\/workflows\/build-and-deploy\.yml/
    )
  })

  it('allows real deploys from a clean branch synced with upstream', () => {
    expect(() => assertDeploySourceStateAllowsPush(deploySourceState(), {})).not.toThrow()
  })

  it('refuses real deploys when the source worktree is dirty', () => {
    expect(() =>
      assertDeploySourceStateAllowsPush(deploySourceState({ isDirty: true }), {})
    ).toThrow(/uncommitted or untracked changes/)
  })

  it('refuses real deploys when the branch has no upstream', () => {
    expect(() =>
      assertDeploySourceStateAllowsPush(
        deploySourceState({ branch: 'feature/sitemap-fix', upstream: null }),
        {}
      )
    ).toThrow(/has no upstream tracking branch/)
  })

  it('refuses real deploys when source commits have not been pushed', () => {
    expect(() => assertDeploySourceStateAllowsPush(deploySourceState({ ahead: 2 }), {})).toThrow(
      /2 commit\(s\) ahead of origin\/main/
    )
  })

  it('refuses real deploys when the local branch is behind upstream', () => {
    expect(() => assertDeploySourceStateAllowsPush(deploySourceState({ behind: 1 }), {})).toThrow(
      /1 commit\(s\) behind origin\/main/
    )
  })

  it('refuses real deploys when the local branch has diverged from upstream', () => {
    expect(() =>
      assertDeploySourceStateAllowsPush(deploySourceState({ ahead: 1, behind: 3 }), {})
    ).toThrow(/1 commit\(s\) ahead and 3 commit\(s\) behind origin\/main/)
  })

  it('allows GitHub Actions to deploy the checked-out source commit', () => {
    expect(() =>
      assertDeploySourceStateAllowsPush(
        deploySourceState({
          ahead: 2,
          behind: 1,
          isDirty: true,
          upstream: null
        }),
        {
          GITHUB_ACTIONS: 'true',
          GITHUB_SHA: '9c3f6d5'
        }
      )
    ).not.toThrow()
  })
})

describe('deploy guardrail docs', () => {
  it('documents production releases as protected workflow operations', () => {
    const source = readFileSync(resolve(process.cwd(), 'docs/BUILD_PIPELINE.md'), 'utf8')

    expect(source).toContain('.github/workflows/build-and-deploy.yml')
    expect(source).toContain('manual, main-only')
    expect(source).toContain('No production command is authorized from a dirty local worktree')
  })

  it('keeps the build pipeline on the D1-backed Worker path', () => {
    const source = readFileSync(resolve(process.cwd(), 'docs/BUILD_PIPELINE.md'), 'utf8')

    expect(source).toMatch(/queried from Cloudflare D1\s+at runtime/)
    expect(source).toContain('There is no JSON serving fallback')
    expect(source).toContain('pnpm worker:build')
  })
})
