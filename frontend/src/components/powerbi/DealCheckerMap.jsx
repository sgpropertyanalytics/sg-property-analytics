/**
 * DealCheckerMap - MapLibre GL map showing project location and nearby projects
 *
 * Features:
 * - Center marker for selected project
 * - 1km radius circle overlay
 * - Nearby project markers with tooltips
 * - CartoDB Positron basemap (light, clean style)
 */
import React, { useMemo, useState } from 'react';
import Map, { Marker, Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

// CartoDB Positron - clean, light basemap
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/**
 * Creates a GeoJSON circle polygon around a point.
 * Used to visualize the search radius.
 *
 * @param {Object} center - { latitude, longitude }
 * @param {number} radiusKm - Radius in kilometers
 * @param {number} points - Number of points for the polygon (default 64)
 * @returns {Object} GeoJSON Feature with Polygon geometry
 */
function createCircle(center, radiusKm, points = 64) {
  const coords = [];
  const earthRadius = 6371; // km

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);

    // Convert dx/dy to lat/lng offset
    const lat = center.latitude + (dy / earthRadius) * (180 / Math.PI);
    const lng = center.longitude + (dx / earthRadius) * (180 / Math.PI) / Math.cos(center.latitude * Math.PI / 180);

    coords.push([lng, lat]);
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    }
  };
}

export default function DealCheckerMap({ centerProject, nearbyProjects = [], radiusKm = 1.0 }) {
  const [popupInfo, setPopupInfo] = useState(null);

  // Create circle GeoJSON for radius visualization
  const circleGeoJSON = useMemo(() => {
    if (!centerProject?.latitude || !centerProject?.longitude) return null;
    return createCircle(centerProject, radiusKm);
  }, [centerProject, radiusKm]);

  // Calculate initial view state centered on the project
  const initialViewState = useMemo(() => {
    if (!centerProject?.latitude) {
      // Default to Singapore center if no project
      return { latitude: 1.3521, longitude: 103.8198, zoom: 14 };
    }
    return {
      latitude: centerProject.latitude,
      longitude: centerProject.longitude,
      zoom: 14.5 // Good zoom level to see 1km radius
    };
  }, [centerProject]);

  // Filter out the center project from nearby list (it will have its own marker)
  const otherProjects = nearbyProjects.filter(
    p => p.project_name !== centerProject?.name
  );

  // No location data available
  if (!centerProject?.latitude) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-[#94B4C1] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm text-[#547792]">Location data not available</p>
        </div>
      </div>
    );
  }

  return (
    <Map
      initialViewState={initialViewState}
      style={{ width: '100%', height: '100%' }}
      mapStyle={MAP_STYLE}
      attributionControl={false}
    >
      {/* 1km radius circle */}
      {circleGeoJSON && (
        <Source id="radius-circle" type="geojson" data={circleGeoJSON}>
          {/* Fill */}
          <Layer
            id="radius-fill"
            type="fill"
            paint={{
              'fill-color': '#547792',
              'fill-opacity': 0.08
            }}
          />
          {/* Border */}
          <Layer
            id="radius-line"
            type="line"
            paint={{
              'line-color': '#547792',
              'line-width': 2,
              'line-dasharray': [4, 2]
            }}
          />
        </Source>
      )}

      {/* Nearby project markers (smaller dots) */}
      {otherProjects.map((project) => (
        <Marker
          key={project.project_name}
          latitude={project.latitude}
          longitude={project.longitude}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            setPopupInfo(project);
          }}
        >
          <div
            className="w-3 h-3 bg-[#547792] rounded-full border-2 border-white shadow-md cursor-pointer hover:bg-[#213448] transition-colors"
            title={`${project.project_name} (${(project.distance_km * 1000).toFixed(0)}m)`}
          />
        </Marker>
      ))}

      {/* Center project marker (prominent) */}
      <Marker
        latitude={centerProject.latitude}
        longitude={centerProject.longitude}
        anchor="bottom"
      >
        <div className="flex flex-col items-center animate-bounce-subtle">
          {/* Label */}
          <div className="px-2 py-1 bg-[#213448] text-white text-xs font-semibold rounded shadow-lg whitespace-nowrap max-w-[200px] truncate">
            {centerProject.name}
          </div>
          {/* Arrow */}
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#213448]" />
          {/* Pin */}
          <div className="w-4 h-4 bg-[#213448] rounded-full border-2 border-white shadow-lg -mt-1" />
        </div>
      </Marker>

      {/* Popup for clicked nearby project */}
      {popupInfo && (
        <Popup
          latitude={popupInfo.latitude}
          longitude={popupInfo.longitude}
          anchor="bottom"
          onClose={() => setPopupInfo(null)}
          closeButton={true}
          closeOnClick={false}
          className="deal-checker-popup"
        >
          <div className="p-2 min-w-[150px]">
            <h4 className="font-semibold text-[#213448] text-sm mb-1">
              {popupInfo.project_name}
            </h4>
            <div className="text-xs text-[#547792] space-y-0.5">
              <p>District: {popupInfo.district}</p>
              <p>Distance: {(popupInfo.distance_km * 1000).toFixed(0)}m</p>
              {popupInfo.transaction_count > 0 && (
                <p>Transactions: {popupInfo.transaction_count}</p>
              )}
            </div>
          </div>
        </Popup>
      )}
    </Map>
  );
}
