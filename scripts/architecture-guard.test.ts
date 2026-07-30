import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8'
  })
    .split('\n')
    .filter(Boolean)
}

const forbiddenExactCatalogPaths = [
  ['data', 'listings.json'].join('/'),
  ['apps', 'serp.software', 'public', 'search', 'search-index.json'].join('/'),
  ['apps', 'pornvideodownloaders.com', 'public', 'search', 'search-index.json'].join('/')
]

const guardedSourceRoots = [
  'apps/serp.software/',
  'apps/pornvideodownloaders.com/',
  'packages/site-contract/',
  'packages/web-core/',
  'sites/',
  '.github/workflows/'
]

describe('D1-only repository architecture', () => {
  it('contains no checked-in or generated catalog files', () => {
    const files = trackedFiles()
    const forbidden = files.filter(
      file =>
        forbiddenExactCatalogPaths.includes(file) ||
        /^sites\/[^/]+\/(?:products|categories)\.json$/u.test(file)
    )

    expect(forbidden).toEqual([])
    for (const file of forbiddenExactCatalogPaths) {
      expect(existsSync(resolve(file)), `${file} must not exist`).toBe(false)
    }
  })

  it('contains no file-backed catalog or static-directory runtime source kinds', () => {
    const forbiddenTokens = [
      ['listing', 'json'].join('-'),
      ['trial', 'products', 'json'].join('-'),
      ['github', 'pages', 'repo', 'sync'].join('-'),
      ['static', 'directory'].join('-')
    ]
    const violations: string[] = []

    for (const file of trackedFiles()) {
      if (
        !guardedSourceRoots.some(root => file.startsWith(root)) ||
        !/\.(?:jsonc?|mdx?|mjs|ts|tsx|ya?ml)$/u.test(file)
      ) {
        continue
      }
      if (!existsSync(resolve(file))) continue

      const source = readFileSync(resolve(file), 'utf8')
      for (const token of forbiddenTokens) {
        if (source.includes(token)) violations.push(`${file}: ${token}`)
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps catalog access server-only and bound to D1', () => {
    for (const siteId of ['pornvideodownloaders.com', 'serp.software']) {
      const repository = readFileSync(resolve(`apps/${siteId}/lib/catalog/repository.ts`), 'utf8')
      const config = readFileSync(resolve(`sites/${siteId}/site-config.ts`), 'utf8')

      expect(repository).toContain("import 'server-only'")
      expect(repository).toContain('getCloudflareContext')
      expect(repository).toContain('env.DB')
      expect(repository).not.toMatch(/node:fs|readFile|writeFile/u)
      expect(config).toContain("kind: 'd1-listings'")
      expect(config).toContain("binding: 'DB'")
    }
  })

  it('keeps retired public static repositories out of live application links', () => {
    const pornVideoDownloadersConfig = readFileSync(
      resolve('sites/pornvideodownloaders.com/site-config.ts'),
      'utf8'
    )
    const pornVideoDownloadersNotFound = readFileSync(
      resolve('apps/pornvideodownloaders.com/app/not-found.tsx'),
      'utf8'
    )
    const serpCookiePolicy = readFileSync(
      resolve('packages/content/data/legal/cookies.mdx'),
      'utf8'
    )

    expect(pornVideoDownloadersConfig).toContain('githubIssueOwner: null')
    expect(pornVideoDownloadersConfig).toContain('githubIssueRepo: null')
    expect(pornVideoDownloadersConfig).toContain('githubIssuesUrl: null')
    expect(pornVideoDownloadersConfig).not.toContain(
      'github.com/serpcompany/pornvideodownloaders.com'
    )
    expect(pornVideoDownloadersNotFound).not.toMatch(/GitHub|githubIssuesUrl/u)
    expect(serpCookiePolicy).not.toContain('github.com/serpcompany/serp.software')
  })
})
