import { notFound, permanentRedirect } from 'next/navigation'
import { getWebsiteBySlug } from '@/lib/content-loader'

interface LegacyListingRouteProps {
  params: Promise<{ slug: string }>
}

export default async function LegacyListingRoute({ params }: LegacyListingRouteProps) {
  const { slug } = await params
  const listing = await getWebsiteBySlug(slug)

  if (!listing) notFound()

  permanentRedirect(`/products/${listing.slug}/`)
}
