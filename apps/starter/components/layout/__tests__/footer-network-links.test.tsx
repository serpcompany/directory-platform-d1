import { render, screen } from '@/test/test-utils'

jest.mock('@thedaviddias/web-core/mode-toggle', () => ({
  ModeToggle: () => <button type="button">Toggle theme</button>
}))

describe('Footer network links', () => {
  const originalNextPublicSiteId = process.env.NEXT_PUBLIC_SITE_ID
  const originalSiteId = process.env.SITE_ID

  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_SITE_ID = 'serp.software'
    process.env.SITE_ID = 'serp.software'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_ID = originalNextPublicSiteId
    process.env.SITE_ID = originalSiteId
  })

  it('renders SERP Software social links as footer icon links', async () => {
    const { Footer } = await import('@thedaviddias/web-core/layout/footer')

    render(<Footer />)

    const expectedIconLinks = [
      ['GitHub', 'https://github.com/serpcompany'],
      ['Reddit', 'https://www.reddit.com/r/serpapps/'],
      ['X (Twitter)', 'https://x.com/serpapps']
    ] as const

    for (const [label, href] of expectedIconLinks) {
      const link = screen.getByRole('link', { name: label })

      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveClass('inline-flex', 'size-9')
      expect(link.querySelector('svg')).toBeInTheDocument()
    }
  })
})
