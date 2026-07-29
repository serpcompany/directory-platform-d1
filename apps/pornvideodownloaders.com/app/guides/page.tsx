import { Breadcrumb } from '@thedaviddias/design-system/breadcrumb'
import { EmptyState } from '@thedaviddias/web-core/empty-state'
import {
  GuidesIndexPage,
  generateGuidesIndexMetadata
} from '@thedaviddias/web-core/guides/index-page'
import { JsonLd } from '@thedaviddias/web-core/json-ld'
import { getRoute } from '@thedaviddias/web-core/routes'
import { generateGuideSchema } from '@thedaviddias/web-core/schema'
import { GuideCardRoute as GuideCard } from '@thedaviddias/web-core/sections/guide-card-route'
import { SITE_PUBLIC_URL } from '@thedaviddias/web-core/seo-config'
import type { Metadata } from 'next'
import { type GuideMetadata, getGuides } from '@/lib/content-loader'
import {
  generateDisabledRouteMetadata,
  isRouteFeatureEnabled,
  requireRouteFeature
} from '@/lib/route-feature-gates'

export function generateMetadata(): Metadata {
  if (!isRouteFeatureEnabled('showGuides')) {
    return generateDisabledRouteMetadata()
  }

  return generateGuidesIndexMetadata()
}

export default async function GuidesPage() {
  requireRouteFeature('showGuides')

  const guides = await getGuides()

  return (
    <GuidesIndexPage
      breadcrumb={
        <Breadcrumb
          items={[{ name: 'Posts', href: getRoute('guides.list') }]}
          baseUrl={SITE_PUBLIC_URL}
        />
      }
      emptyState={
        <EmptyState
          title="No posts yet"
          description="Posts will appear here when this site publishes them."
        />
      }
      guideCard={(guide: GuideMetadata, index: number) => (
        <GuideCard key={guide.slug} guide={guide} index={index} />
      )}
      guides={guides}
      jsonLd={
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@graph': guides.map((guide: GuideMetadata) => generateGuideSchema(guide))
          }}
        />
      }
    />
  )
}
