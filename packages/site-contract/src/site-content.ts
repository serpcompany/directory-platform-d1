import { serpSoftwareSiteContent } from '../../../sites/serp.software/site-content'
import { assertSiteIdIsSupported } from './active-site-ids'
import type { SiteOwnedContent } from './types'

const siteContentById: Record<string, SiteOwnedContent> = {
  'serp.software': serpSoftwareSiteContent
}

export function resolveSiteContent(siteId = 'serp.software'): SiteOwnedContent {
  assertSiteIdIsSupported(siteId)
  return siteContentById[siteId]
}
