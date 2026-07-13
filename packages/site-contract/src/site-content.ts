import { serpSoftwareSiteContent } from '../../../sites/serp.software/site-content'
import { assertSiteIdIsNotRemoved } from './active-site-ids'
import { defaultSiteConfig } from './default-site-config'
import { defaultSiteContent } from './default-site-content'
import type { SiteOwnedContent } from './types'

const siteContentById: Record<string, SiteOwnedContent> = {
  'serp.software': serpSoftwareSiteContent
}

export function resolveSiteContent(siteId?: string): SiteOwnedContent {
  if (!siteId || siteId === defaultSiteConfig.id) {
    return defaultSiteContent
  }

  assertSiteIdIsNotRemoved(siteId)

  return siteContentById[siteId] ?? defaultSiteContent
}

export { defaultSiteContent }
