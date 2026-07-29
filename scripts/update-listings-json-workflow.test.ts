import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const activeListingSourcePaths = [
  'apps/serp.software/**',
  'd1/**',
  'scripts/d1-**',
  'wrangler*.jsonc'
]

interface WorkflowTrigger {
  branches?: string[]
  paths?: string[]
}

interface WorkflowDefinition {
  concurrency?: {
    group?: string
  }
  jobs: Record<
    string,
    {
      steps?: Array<{
        id?: string
        if?: string
        name?: string
        run?: string
        uses?: string
        with?: Record<string, string | number>
      }>
    }
  >
  on: {
    pull_request?: WorkflowTrigger
    push?: WorkflowTrigger
    workflow_dispatch?: Record<string, never>
  }
}

function loadWorkflow(): WorkflowDefinition {
  const workflowPath = resolve(process.cwd(), '.github/workflows/update-listings-json.yml')
  const raw = readFileSync(workflowPath, 'utf8')

  return yaml.load(raw) as WorkflowDefinition
}

describe('update-listings-json workflow', () => {
  it('validates active listing sources on pull requests as well as pushes to main', () => {
    const workflow = loadWorkflow()

    expect(workflow.on.pull_request).toMatchObject({
      branches: ['main'],
      paths: activeListingSourcePaths
    })
    expect(workflow.on.push).toMatchObject({
      branches: ['main'],
      paths: activeListingSourcePaths
    })
  })

  it('runs the listing-source validation steps for the current active surfaces', () => {
    const workflow = loadWorkflow()
    const validateJob = workflow.jobs['validate-listing-data']
    const configStep = validateJob.steps?.find(step => step.name === 'Validate Worker configuration contracts')
    const contractStep = validateJob.steps?.find(step => step.name === 'Run D1 contract tests')
    const buildStep = validateJob.steps?.find(step => step.name === 'Build OpenNext Worker')

    expect(configStep?.run).toBe('pnpm worker:config:validate')
    expect(contractStep?.run).toBe('pnpm test:d1')
    expect(buildStep?.run).toBe('pnpm worker:build')
  })

  it('uses a concurrency key that separates pull requests from branch refs', () => {
    const workflow = loadWorkflow()

    expect(workflow.concurrency?.group).toContain('github.event.pull_request.number')
    expect(workflow.concurrency?.group).toContain('github.ref')
  })
})
