import { afterEach, describe, expect, it, vi } from 'vitest'
import { runPreviewHttpGates } from './d1-preview-http-gates.ts'

afterEach(() => vi.unstubAllGlobals())

function responseFor(pathname: string, legacyStatus = 308, legacyLocation?: string): Response {
  if (pathname === '/123movies-downloader/')
    return new Response(null, {
      status: legacyStatus,
      headers: { location: legacyLocation ?? '/products/123movies-downloader/' }
    })
  return new Response('ok', { status: 200 })
}

describe('Preview HTTP gates', () => {
  it('requires the legacy route to redirect to the exact canonical product path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo) => responseFor(new URL(String(input)).pathname))
    )
    await expect(
      runPreviewHttpGates('serp.software', 'https://serp-preview.example.test/')
    ).resolves.toBeUndefined()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo) => responseFor(new URL(String(input)).pathname, 200))
    )
    await expect(
      runPreviewHttpGates('serp.software', 'https://serp-preview.example.test/')
    ).rejects.toThrow('not a redirect')

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo) => responseFor(new URL(String(input)).pathname, 304))
    )
    await expect(
      runPreviewHttpGates('serp.software', 'https://serp-preview.example.test/')
    ).rejects.toThrow('not a redirect')

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo) =>
        responseFor(new URL(String(input)).pathname, 308, '/products/wrong/')
      )
    )
    await expect(
      runPreviewHttpGates('serp.software', 'https://serp-preview.example.test/')
    ).rejects.toThrow('did not redirect')

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo) =>
        responseFor(
          new URL(String(input)).pathname,
          308,
          'https://other-host.example/products/123movies-downloader/'
        )
      )
    )
    await expect(
      runPreviewHttpGates('serp.software', 'https://serp-preview.example.test/')
    ).rejects.toThrow('did not redirect')
  })
})
