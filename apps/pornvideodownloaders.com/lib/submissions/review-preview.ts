import type { WebsiteDetailMetadata } from '@serpdirectory/web-core/content-query'
import { websiteEntrySchema } from '@serpdirectory/web-core/website-schema'
import { z } from 'zod'

const reviewPreviewTokenPattern = /^[A-Za-z0-9_-]{43}$/

export const reviewPreviewAccessSchema = z.object({
  id: z.string().uuid(),
  token: z.string().regex(reviewPreviewTokenPattern)
})

export interface SubmissionReviewPreviewRow {
  id: string
  slug: string
  name: string
  description: string
  website: string
  content: string
  category_slug: string
  logo_url: string
  video_url: string | null
  created_at: string
}

export interface SubmissionReviewPreviewResourceRow {
  label: string
  url: string
  sort_order: number
}

export function buildSubmissionReviewPreview(
  submission: SubmissionReviewPreviewRow,
  resources: SubmissionReviewPreviewResourceRow[]
): WebsiteDetailMetadata {
  const parsed = websiteEntrySchema.parse({
    categories: [submission.category_slug],
    category: submission.category_slug,
    content: submission.content,
    description: submission.description,
    media: {
      logo: submission.logo_url,
      ...(submission.video_url ? { video: submission.video_url } : {})
    },
    name: submission.name,
    publishedAt: submission.created_at.slice(0, 10),
    resourceLinks: resources.map(resource => ({
      label: resource.label,
      url: resource.url
    })),
    slug: submission.slug,
    website: submission.website
  })

  return {
    ...(parsed as WebsiteDetailMetadata),
    relatedWebsites: [],
    previousWebsite: null,
    nextWebsite: null
  }
}
