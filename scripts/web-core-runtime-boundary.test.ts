import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { globSync } from 'glob'

const repoRoot = process.cwd()
const webCoreSrcRoot = join(repoRoot, 'packages/web-core/src')

function readWebCoreSources(): Array<{ path: string; source: string }> {
  return globSync('**/*.{ts,tsx}', {
    cwd: webCoreSrcRoot,
    absolute: true,
    ignore: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
  }).map(filePath => ({
    path: relative(repoRoot, filePath),
    source: readFileSync(filePath, 'utf8'),
  }))
}

describe('web-core runtime boundary', () => {
  it('does not import app-owned auth runtime bindings', () => {
    const offenders = readWebCoreSources()
      .filter(file => file.source.includes('next-auth/react'))
      .map(file => file.path)

    expect(offenders).toEqual([])
  })

  it('keeps the public search route contract isolated to the search client', () => {
    const offenders = readWebCoreSources()
      .filter(file => file.source.includes('/api/'))
      .map(file => file.path)

    expect(offenders).toEqual(['packages/web-core/src/search-index.ts'])
    expect(
      readWebCoreSources().find(file => file.path === 'packages/web-core/src/search-index.ts')?.source
    ).toContain("const SEARCH_INDEX_PUBLIC_PATH = '/api/search'")
  })
})
