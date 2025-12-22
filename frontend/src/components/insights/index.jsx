/**
 * Insights Components
 *
 * Visual analytics components for the Insights page.
 * Map components are lazy-loaded to reduce initial bundle size
 * and improve performance on memory-constrained environments.
 */

import { lazy, Suspense } from 'react';

// Legacy SVG-based heatmap (synchronous load)
export { default as MarketHeatmap } from './MarketHeatmap';

// 3D MapLibre heatmap (lazy loaded for performance)
const MarketHeatmap3DLazy = lazy(() => import('./MarketHeatmap3D'));

// Strategy Map with Data Flags (lazy loaded for performance)
const MarketStrategyMapLazy = lazy(() => import('./MarketStrategyMap'));

// Loading fallback component for 3D map (light theme to match actual component)
function MapLoadingFallback() {
  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/50 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <h2 className="text-lg font-bold text-[#213448]">
          District PSF Heatmap
        </h2>
        <p className="text-xs text-[#547792]">
          3D visualization of median price per sqft across Singapore
        </p>
      </div>
      <div className="flex items-center justify-center bg-[#EAE0CF]/20" style={{ height: '450px' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#547792] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#547792]">Loading 3D map...</span>
        </div>
      </div>
    </div>
  );
}

// Loading fallback component for strategy map (light theme to match actual component)
function StrategyMapLoadingFallback() {
  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/50 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <h2 className="text-lg font-bold text-[#213448]">
          District Price Overview
        </h2>
        <p className="text-xs text-[#547792]">
          Median PSF by postal district
        </p>
      </div>
      <div className="flex items-center justify-center bg-[#EAE0CF]/20" style={{ height: '500px' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#547792] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#547792]">Loading map...</span>
        </div>
      </div>
    </div>
  );
}

// Wrapped lazy component with Suspense - 3D Heatmap
export function MarketHeatmap3D(props) {
  return (
    <Suspense fallback={<MapLoadingFallback />}>
      <MarketHeatmap3DLazy {...props} />
    </Suspense>
  );
}

// Wrapped lazy component with Suspense - Strategy Map
export function MarketStrategyMap(props) {
  return (
    <Suspense fallback={<StrategyMapLoadingFallback />}>
      <MarketStrategyMapLazy {...props} />
    </Suspense>
  );
}
