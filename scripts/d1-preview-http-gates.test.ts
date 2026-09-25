import { afterEach, describe, expect, it, vi } from 'vitest'
import { runHttpGates, runPreviewHttpGates } from './d1-preview-http-gates.ts'

afterEach(() => vi.unstubAllGlobals())

const sampleSlugByHost: Record<string, string> = {
  'pornvideodownloaders.com': '321tube-downloader',
  'serp.software': '123movies-downloader'
}

function successfulResponse(url: URL, redirectLocation?: string, emptyBody = false): Response {
  const slug = sampleSlugByHost[url.hostname] ?? '123movies-downloader'
  if (url.pathname === `/${slug}/`)
    return new Response(null, {
      status: 308,
      headers: { location: redirectLocation ?? `/products/${slug}/` }
    })
  return new Response(emptyBody ? '' : 'ok', { status: 200 })
}

function installSuccessfulFetch(redirectLocation?: string, emptyBody = false) {
  const urls: URL[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input))
      urls.push(url)
      return successfulResponse(url, redirectLocation, emptyBody)
    })
  )
  return urls
}

describe('environment-specific HTTP gates', () => {
  it.each([
    ['serp.software', 'https://serp.software'],
    ['pornvideodownloaders.com', 'https://pornvideodownloaders.com']
  ])('passes exact Production origin and route contracts for %s', async (siteId, origin) => {
    const urls = installSuccessfulFetch()
    await expect(runHttpGates('production', siteId, origin)).resolves.toBeUndefined()
    expect(urls).toHaveLength(8)
    expect(urls.every(url => url.origin === origin)).toBe(true)
    expect(urls.some(url => url.pathname === '/api/search' && url.search.startsWith('?q='))).toBe(
      true
    )
  })

  it('keeps Preview mode isolated from the Production hostname', async () => {
    installSuccessfulFetch()
    await expect(
      runPreviewHttpGates('serp.software', 'https://serp-preview.example.test')
    ).resolves.toBeUndefined()
    await expect(runHttpGates('preview', 'serp.software', 'https://serp.software')).rejects.toThrow(
      'reject the Production hostname'
    )
    await expect(
      runHttpGates('production', 'serp.software', 'https://serp-preview.example.test')
    ).rejects.toThrow('exact https://serp.software origin')
  })

  it.each([
    'http://serp.software',
    'https://serp.software:8443',
    'https://user:pass@serp.software',
    'https://serp.software/path',
    'https://serp.software/?query=1',
    'https://serp.software/#hash'
  ])('rejects unsafe or non-origin Production base URL %s', async baseUrl => {
    await expect(runHttpGates('production', 'serp.software', baseUrl)).rejects.toThrow(
      'clean HTTPS origin'
    )
  })

  it('requires nonempty successful route bodies', async () => {
    installSuccessfulFetch(undefined, true)
    await expect(
      runHttpGates('production', 'serp.software', 'https://serp.software')
    ).rejects.toThrow('empty body')
  })

  it('requires successful route statuses and a real redirect status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo) => {
        const url = new URL(String(input))
        if (url.pathname === '/rss.xml') return new Response('failed', { status: 500 })
        return successfulResponse(url)
      })
    )
    await expect(
      runHttpGates('production', 'serp.software', 'https://serp.software')
    ).rejects.toThrow('returned 500')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 }))
    )
    await expect(
      runHttpGates('production', 'serp.software', 'https://serp.software')
    ).rejects.toThrow('not a redirect')
  })

  it.each([
    ['https://other-host.example/products/123movies-downloader/', 'did not redirect'],
    ['/products/wrong/', 'did not redirect'],
    ['/products/123movies-downloader/?unexpected=1', 'did not redirect'],
    ['/products/123movies-downloader/#unexpected', 'did not redirect']
  ])('rejects wrong redirect destination %s', async (location, message) => {
    installSuccessfulFetch(location)
    await expect(
      runHttpGates('production', 'serp.software', 'https://serp.software')
    ).rejects.toThrow(message)
  })

  it('rejects unknown modes before making requests', async () => {
    await expect(runHttpGates('staging', 'serp.software', 'https://serp.software')).rejects.toThrow(
      'exactly preview or production'
    )
  })

  it('makes every protected workflow select its environment mode explicitly', () => {
    const cutover = readFileSync('.github/workflows/cutover-d1-replatform-production.yml', 'utf8')
    const finalize = readFileSync('.github/workflows/finalize-d1-replatform-production.yml', 'utf8')
    const preview = readFileSync('.github/workflows/rehearse-d1-replatform-preview.yml', 'utf8')
    expect(cutover.match(/d1-preview-http-gates\.ts production/gu)).toHaveLength(2)
    expect(finalize.match(/d1-preview-http-gates\.ts production/gu)).toHaveLength(1)
    expect(preview.match(/d1-preview-http-gates\.ts preview/gu)).toHaveLength(3)
  })
})

import { readFileSync } from 'node:fs'
