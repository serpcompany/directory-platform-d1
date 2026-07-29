import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('buildBadgeSubmissionInstructions', () => {
  afterEach(() => {
    delete process.env.SITE_ID
    delete process.env.NEXT_PUBLIC_SITE_ID
    vi.resetModules()
  })

  it('builds serp.software badge snippets for a D1 submission capability', async () => {
    process.env.SITE_ID = 'serp.software'
    vi.resetModules()

    const { buildBadgeSubmissionInstructions } = await import('./d1-submission-form')
    const instructions = buildBadgeSubmissionInstructions({
      submissionId: 'submission-id',
      token: 'capability-token',
      name: 'SERP AI',
      website: 'https://www.serp.ai/'
    })

    expect(instructions.submissionId).toBe('submission-id')
    expect(instructions.token).toBe('capability-token')
    expect(instructions.listingUrl).toBe('https://serp.software/products/serp.ai/')
    expect(instructions.badgePreviewPaths.light).toBe('/badge/featured-on-serp.software-light.svg')
    expect(instructions.badgePreviewPaths.dark).toBe('/badge/featured-on-serp.software-dark.svg')
    expect(
      instructions.badgeEmbeds.light
    ).toBe(`<a href="https://serp.software/products/serp.ai/" target="_blank" rel="noopener noreferrer" title="Featured on SERP Software">
  <img src="https://serp.software/badge/featured-on-serp.software-light.svg" alt="Featured on SERP Software" width="200" height="50" />
</a>`)
    expect(instructions.badgeEmbeds.dark).toContain(
      'https://serp.software/badge/featured-on-serp.software-dark.svg'
    )
  })

  it('tells the submitter that verification queues and notifies the admin', () => {
    const source = readFileSync('packages/web-core/src/forms/d1-submission-form.tsx', 'utf8')
    expect(source).toContain(
      'Your submission is saved in D1. Publish one badge on your site, then verify it to'
    )
    expect(source).toContain('Badge verification is required')
    expect(source).toContain('Your submission enters admin review')
    expect(source).toContain('enter the maintainer review queue.')
    expect(source).toContain('Badge verified — admin notified within a few minutes')
  })
})
