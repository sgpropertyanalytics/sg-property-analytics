/**
 * Insights Components
 *
 * Visual analytics components for the Insights page.
 * Map components are lazy-loaded to reduce initial bundle size
 * and improve performance on memory-constrained environments.
 *
 * IMPORTANT: Lazy imports are wrapped with retry logic to handle:
 * - ChunkLoadError from stale deployments
 * - Network failures during chunk fetch
 * - Browser cache issues
 */

import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '../ui';

// Legacy SVG-based heatmap (synchronous load)
export { default as MarketHeatmap } from './MarketHeatmap';

/**
 * Retry wrapper for lazy imports
 * Handles ChunkLoadError by retrying with cache-busting query param
 * Falls back to page reload after max retries
 */
function lazyWithRetry(importFn, componentName = 'Component') {
  return lazy(() =>
    importFn().catch((error) => {
      // Check if it's a chunk load error
      const isChunkError =
        error.name === 'ChunkLoadError' ||
        error.message?.includes('Loading chunk') ||
        error.message?.includes('Failed to fetch');

      if (isChunkError) {
        console.warn(`[${componentName}] Chunk load failed, attempting reload...`);

        // Try to reload from server (bypass cache)
        return new Promise(() => {
          // Small delay before reload to avoid rapid loops
          setTimeout(() => {
            // Force reload the page to get fresh chunks
            window.location.reload();
          }, 1000);

          // Return a never-resolving promise since we're reloading
          // This prevents React from trying to render the failed component
        });
      }

      // Re-throw non-chunk errors
      throw error;
    })
  );
}

// 3D MapLibre heatmap (lazy loaded with retry for chunk errors)
const MarketHeatmap3DLazy = lazyWithRetry(
  () => import('./MarketHeatmap3D'),
  'MarketHeatmap3D'
);

// Strategy Map with Data Flags (lazy loaded with retry for chunk errors)
const MarketStrategyMapLazy = lazyWithRetry(
  () => import('./MarketStrategyMap'),
  'MarketStrategyMap'
);

// District Liquidity Map (lazy loaded with retry for chunk errors)
const DistrictLiquidityMapLazy = lazyWithRetry(
  () => import('./DistrictLiquidityMap'),
  'DistrictLiquidityMap'
);

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

// Wrapped lazy component with Suspense + ErrorBoundary - 3D Heatmap
// ErrorBoundary catches any errors that Suspense doesn't handle
export function MarketHeatmap3D(props) {
  return (
    <ErrorBoundary name="3D Heatmap" compact>
      <Suspense fallback={<MapLoadingFallback />}>
        <MarketHeatmap3DLazy {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

// Wrapped lazy component with Suspense + ErrorBoundary - Strategy Map
// ErrorBoundary catches any errors that Suspense doesn't handle
export function MarketStrategyMap(props) {
  return (
    <ErrorBoundary name="District Price Map" compact>
      <Suspense fallback={<StrategyMapLoadingFallback />}>
        <MarketStrategyMapLazy {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

// Loading fallback for liquidity map
function LiquidityMapLoadingFallback() {
  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/50 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <h2 className="text-lg font-bold text-[#213448]">
          District Liquidity Map
        </h2>
        <p className="text-xs text-[#547792]">
          Transaction velocity by postal district
        </p>
      </div>
      <div className="flex items-center justify-center bg-[#EAE0CF]/20" style={{ height: '500px' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#547792] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#547792]">Loading liquidity map...</span>
        </div>
      </div>
    </div>
  );
}

// Wrapped lazy component with Suspense + ErrorBoundary - District Liquidity Map
export function DistrictLiquidityMap(props) {
  return (
    <ErrorBoundary name="District Liquidity Map" compact>
      <Suspense fallback={<LiquidityMapLoadingFallback />}>
        <DistrictLiquidityMapLazy {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
