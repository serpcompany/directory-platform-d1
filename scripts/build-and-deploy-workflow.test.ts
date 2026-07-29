import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

interface Step {
  env?: Record<string, string>
  name?: string
  run?: string
}
interface Job {
  env?: Record<string, string>
  environment?: { name?: string }
  if?: string
  steps?: Step[]
}
interface Workflow {
  on: {
    push?: unknown
    workflow_dispatch: { inputs: Record<string, { options?: string[]; required?: boolean }> }
  }
  jobs: Record<string, Job>
  permissions?: Record<string, string>
}

function loadWorkflow(): { raw: string; workflow: Workflow } {
  const raw = readFileSync('.github/workflows/build-and-deploy.yml', 'utf8')
  return { raw, workflow: yaml.load(raw) as Workflow }
}

function githubExpression(expression: string): string {
  return `$${`{{ ${expression} }}`}`
}

describe('production Worker workflow', () => {
  it('is manual, single-site, main-only, explicitly confirmed, and protected', () => {
    const { workflow } = loadWorkflow()
    expect(workflow.on.push).toBeUndefined()
    expect(workflow.on.workflow_dispatch.inputs.site_id.options).toEqual(['serp.software'])
    expect(workflow.on.workflow_dispatch.inputs.confirmation.required).toBe(true)
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs.deploy.environment?.name).toBe('production')
    expect(workflow.jobs.deploy.if).toContain("github.ref == 'refs/heads/main'")
  })

  it('orders backup, migration, verification, and guarded OpenNext deployment', () => {
    const { workflow } = loadWorkflow()
    const runs = workflow.jobs.deploy.steps?.map(step => step.run).filter(Boolean)
    expect(runs).toEqual([
      'pnpm worker:config:validate',
      'pnpm test:d1',
      'pnpm typecheck',
      'pnpm worker:build:serpsoftware',
      'pnpm d1:remote:migration:plan:production',
      'pnpm d1:remote:verify:plan:production',
      'pnpm worker:d1:backup:production',
      'pnpm worker:d1:migrate:production',
      'pnpm worker:d1:import:production',
      'pnpm worker:d1:verify:production',
      'pnpm worker:deploy:production'
    ])
  })

  it('scopes production secrets and operator confirmation only to production execution steps', () => {
    const { workflow } = loadWorkflow()
    expect(workflow.jobs.deploy.env).toBeUndefined()
    const steps = workflow.jobs.deploy.steps ?? []
    const productionStepNames = new Set([
      'Back up production D1',
      'Apply production D1 migrations',
      'Import deterministic production catalog',
      'Verify production D1',
      'Deploy production Worker'
    ])
    for (const step of steps.filter(step => !productionStepNames.has(step.name ?? ''))) {
      expect(step.env?.CLOUDFLARE_API_TOKEN).toBeUndefined()
      expect(step.env?.WORKER_PRODUCTION_CONFIRM).toBeUndefined()
    }
    for (const step of steps.filter(step => productionStepNames.has(step.name ?? ''))) {
      expect(step.env?.CLOUDFLARE_API_TOKEN).toBe(githubExpression('secrets.CLOUDFLARE_API_TOKEN'))
      expect(step.env?.WORKER_PRODUCTION_CONFIRM).toBe(githubExpression('inputs.confirmation'))
      expect(step.env?.GITHUB_REF).toBe(githubExpression('github.ref'))
      expect(step.env?.GITHUB_SHA).toBe(githubExpression('github.sha'))
    }
  })

  it('retains the pre-migration production backup', () => {
    const { workflow } = loadWorkflow()
    const backupStep = workflow.jobs.deploy.steps?.find(
      step => step.name === 'Retain production D1 backup'
    ) as Step & { uses?: string; with?: Record<string, unknown> }
    expect(backupStep.uses).toBe('actions/upload-artifact@v6')
    expect(backupStep.with?.path).toBe(
      `.wrangler/backups/serp-software/production/${githubExpression('github.sha')}.sql`
    )
    expect(backupStep.with?.['if-no-files-found']).toBe('error')
  })
})
