import { resolveSiteContent as resolveCheckedInSiteContent } from '@thedaviddias/site-contract'
import type { SiteOwnedContent } from '@thedaviddias/site-contract/types'

export function resolveSiteContent(
  siteId = process.env.NEXT_PUBLIC_SITE_ID || process.env.SITE_ID || 'serp.software'
): SiteOwnedContent {
  return resolveCheckedInSiteContent(siteId)
}

export const siteContent: SiteOwnedContent = resolveSiteContent()
