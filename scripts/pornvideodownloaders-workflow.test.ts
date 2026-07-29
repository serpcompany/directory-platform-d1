import { readFileSync } from 'node:fs'
import { resolveRuntimeSiteId } from '@thedaviddias/site-contract/active-site-ids'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { resolveSiteTarget, siteIds, siteTargets } from './site-targets'

interface Step {
  env?: Record<string, string>
  name?: string
  run?: string
  uses?: string
  with?: Record<string, string>
}

interface Job {
  environment: { name: string }
  if: string
  steps: Step[]
}

interface Workflow {
  jobs: { preview: Job; production: Job }
  on: {
    workflow_dispatch: {
      inputs: {
        confirmation: { required: boolean }
        environment: { options: string[] }
      }
    }
  }
  permissions: Record<string, string>
}

const raw = readFileSync('.github/workflows/deploy-pornvideodownloaders.yml', 'utf8')
const workflow = yaml.load(raw) as Workflow

describe('pornvideodownloaders.com deployment workflow', () => {
  it('keeps every executable identity distinct between active sites', () => {
    expect(siteIds).toEqual(['pornvideodownloaders.com', 'serp.software'])
    const pvd = siteTargets['pornvideodownloaders.com']
    const serp = siteTargets['serp.software']
    const pvdIdentities = [
      pvd.appPackageName,
      pvd.artifactBatchDirectory,
      pvd.parityReportPath,
      pvd.local.configPath,
      pvd.local.databaseId,
      pvd.local.databaseName,
      pvd.local.workerName,
      pvd.remote.previewConfigPath,
      pvd.remote.productionConfigPath,
      pvd.protectedEnvironment.preview,
      pvd.protectedEnvironment.production
    ]
    const serpIdentities = [
      serp.appPackageName,
      serp.artifactBatchDirectory,
      serp.parityReportPath,
      serp.local.configPath,
      serp.local.databaseId,
      serp.local.databaseName,
      serp.local.workerName,
      serp.remote.previewConfigPath,
      serp.remote.productionConfigPath,
      serp.protectedEnvironment.preview,
      serp.protectedEnvironment.production
    ]

    expect(pvdIdentities.every((value, index) => value !== serpIdentities[index])).toBe(true)
    expect(JSON.stringify(pvd.confirmation)).not.toContain('serp.software')
    expect(JSON.stringify(serp.confirmation)).not.toContain('pornvideodownloaders.com')
  })

  it('rejects missing, unknown, and mismatched site selection', () => {
    expect(() => resolveSiteTarget(undefined)).toThrow('Site must be one of')
    expect(() => resolveSiteTarget('example.com')).toThrow('Site must be one of')
    expect(() => resolveRuntimeSiteId({})).toThrow('site selection has no default')
    expect(() =>
      resolveRuntimeSiteId({
        NEXT_PUBLIC_SITE_ID: 'pornvideodownloaders.com',
        SITE_ID: 'serp.software'
      })
    ).toThrow('does not match')
  })

  it('exposes only explicit preview and production protected targets', () => {
    expect(workflow.on.workflow_dispatch.inputs.environment.options).toEqual([
      'preview',
      'production'
    ])
    expect(workflow.on.workflow_dispatch.inputs.confirmation.required).toBe(true)
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs.preview.environment.name).toBe('pornvideodownloaders-preview')
    expect(workflow.jobs.production.environment.name).toBe('pornvideodownloaders-production')
    expect(workflow.jobs.preview.if).toContain(
      "inputs.confirmation == 'deploy-pornvideodownloaders.com-preview'"
    )
    expect(workflow.jobs.production.if).toContain(
      "inputs.confirmation == 'deploy-pornvideodownloaders.com-production'"
    )
  })

  it.each(['preview', 'production'] as const)(
    'orders %s backup, migration, import, verification, and deployment',
    environment => {
      const steps = workflow.jobs[environment].steps
      const backupIndex = steps.findIndex(step => step.name === `Back up ${environment} D1`)
      const mutationIndex = steps.findIndex(
        step => step.name === `Apply migrations, import, and verify ${environment} D1`
      )
      const deployIndex = steps.findIndex(step => step.name === `Deploy ${environment} Worker`)
      expect([backupIndex, mutationIndex, deployIndex]).toEqual(
        [...[backupIndex, mutationIndex, deployIndex]].sort((left, right) => left - right)
      )
      const mutationSource = steps[mutationIndex]?.run || ''
      const orderedCommands = [
        `migrate ${environment} --site pornvideodownloaders.com`,
        `import ${environment} --site pornvideodownloaders.com`,
        `verify ${environment} --site pornvideodownloaders.com`
      ]
      const indexes = orderedCommands.map(command => mutationSource.indexOf(command))
      expect(indexes.every(index => index >= 0)).toBe(true)
      expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
    }
  )

  it.each(['preview', 'production'] as const)(
    'keeps %s credentials scoped to remote execution steps',
    environment => {
      const steps = workflow.jobs[environment].steps
      const secretSteps = steps.filter(step => step.env?.CLOUDFLARE_API_TOKEN)
      expect(secretSteps.map(step => step.name)).toEqual([
        `Back up ${environment} D1`,
        `Apply migrations, import, and verify ${environment} D1`,
        `Deploy ${environment} Worker`
      ])
      expect(
        steps
          .filter(step => !step.env?.CLOUDFLARE_API_TOKEN)
          .every(step => !step.env?.WORKER_PRODUCTION_CONFIRM)
      ).toBe(true)
    }
  )
})
