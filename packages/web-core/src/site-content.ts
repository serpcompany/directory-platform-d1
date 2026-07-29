import {
  resolveSiteContent as resolveCheckedInSiteContent,
  resolveRuntimeSiteId
} from '@thedaviddias/site-contract'
import type { SiteOwnedContent } from '@thedaviddias/site-contract/types'

export function resolveSiteContent(siteId = resolveRuntimeSiteId()): SiteOwnedContent {
  return resolveCheckedInSiteContent(siteId)
}

export const siteContent: SiteOwnedContent = resolveSiteContent()
