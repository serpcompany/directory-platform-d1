import {
  generateDisabledRouteMetadata,
  isRouteFeatureEnabled,
  type RoutableSiteFeature
} from '@thedaviddias/web-core/route-feature-gates'
import { notFound } from 'next/navigation'

export function requireRouteFeature(feature: RoutableSiteFeature): void {
  if (!isRouteFeatureEnabled(feature)) {
    notFound()
  }
}

export { generateDisabledRouteMetadata, isRouteFeatureEnabled }
