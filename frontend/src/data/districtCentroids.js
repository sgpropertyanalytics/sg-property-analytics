/**
 * Precomputed District Centroids
 *
 * This file precomputes district polygon centroids at module load time,
 * avoiding expensive polylabel calculations on every component render.
 *
 * Used by: MarketStrategyMap, DistrictLiquidityMap
 */

import { singaporeDistrictsGeoJSON } from './singaporeDistrictsGeoJSON';

// =============================================================================
// POLYLABEL ALGORITHM
// =============================================================================

/**
 * Calculate the centroid of a polygon using the "polylabel" algorithm.
 * Returns the visual center suitable for label placement.
 */
function polylabel(polygon) {
  const ring = polygon[0];
  if (!ring || ring.length < 4) return null;

  let sumX = 0;
  let sumY = 0;
  let sumArea = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    const cross = x1 * y2 - x2 * y1;
    sumX += (x1 + x2) * cross;
    sumY += (y1 + y2) * cross;
    sumArea += cross;
  }

  if (sumArea === 0) {
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    return {
      lng: (Math.min(...xs) + Math.max(...xs)) / 2,
      lat: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }

  sumArea *= 3;
  return { lng: sumX / sumArea, lat: sumY / sumArea };
}

// =============================================================================
// MARKER POSITIONING OFFSETS
// =============================================================================

// Manual marker offsets for crowded central districts
const MARKER_OFFSETS = {
  D09: { lng: -0.008, lat: 0.006 },
  D10: { lng: 0.008, lat: 0.003 },
  D11: { lng: 0.005, lat: -0.006 },
  D01: { lng: -0.003, lat: 0.004 },
  D02: { lng: 0.004, lat: -0.003 },
};

// =============================================================================
// PRECOMPUTED CENTROIDS
// =============================================================================

/**
 * Pre-computed district centroids with offsets applied.
 * Computed once at module load time (not on every render).
 *
 * Shape: Array<{ district: string, name: string, region: string, centroid: { lng, lat } }>
 */
export const DISTRICT_CENTROIDS = singaporeDistrictsGeoJSON.features
  .map((feature) => {
    const centroid = polylabel(feature.geometry.coordinates);
    const districtId = feature.properties.district;
    const offset = MARKER_OFFSETS[districtId] || { lng: 0, lat: 0 };

    return {
      district: districtId,
      name: feature.properties.name,
      region: feature.properties.region,
      centroid: centroid
        ? {
            lng: centroid.lng + offset.lng,
            lat: centroid.lat + offset.lat,
          }
        : null,
    };
  })
  .filter((d) => d.centroid !== null);

export default DISTRICT_CENTROIDS;
