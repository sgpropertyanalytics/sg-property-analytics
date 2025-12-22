/**
 * Insights Components
 *
 * Visual analytics components for the Insights page.
 * MarketHeatmap3D is lazy-loaded to reduce initial bundle size
 * and improve performance on memory-constrained environments.
 */

import { lazy, Suspense } from 'react';

// Legacy SVG-based heatmap (synchronous load)
export { default as MarketHeatmap } from './MarketHeatmap';

// 3D MapLibre heatmap (lazy loaded for performance)
const MarketHeatmap3DLazy = lazy(() => import('./MarketHeatmap3D'));

// Loading fallback component
function MapLoadingFallback() {
  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-[#94B4C1]/20 shadow-lg overflow-hidden">
      <div className="px-4 py-3 md:px-6 md:py-4 border-b border-[#94B4C1]/20 bg-[#16162a]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-white">
              District PSF Heatmap
            </h2>
            <p className="text-xs md:text-sm text-[#94B4C1] mt-0.5">
              3D visualization of median price per sqft across Singapore
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center" style={{ height: '450px' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#94B4C1]">Loading 3D map...</span>
        </div>
      </div>
    </div>
  );
}

// Wrapped lazy component with Suspense
export function MarketHeatmap3D(props) {
  return (
    <Suspense fallback={<MapLoadingFallback />}>
      <MarketHeatmap3DLazy {...props} />
    </Suspense>
  );
}
