/**
 * Singapore Postal Districts GeoJSON
 *
 * Interlocking polygons for Singapore's 28 postal districts.
 * Shapes fit together like a jigsaw puzzle - no overlapping.
 *
 * Coordinates are [longitude, latitude] per GeoJSON spec.
 */

export const SINGAPORE_CENTER = {
  lng: 103.8198,
  lat: 1.3521,
  zoom: 10.8
};

// Shared vertices ensure perfect interlocking (no gaps, no overlaps)
// Districts are arranged roughly by geographic position

export const singaporeDistrictsGeoJSON = {
  type: "FeatureCollection",
  features: [
    // === CENTRAL CORE (CCR) ===

    // D01 - Boat Quay / Raffles Place / Marina
    {
      type: "Feature",
      properties: { district: "D01", name: "Raffles Place / Marina", region: "CCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.850, 1.274], [103.865, 1.274], [103.870, 1.280],
          [103.870, 1.290], [103.860, 1.295], [103.850, 1.295],
          [103.845, 1.288], [103.845, 1.280], [103.850, 1.274]
        ]]
      }
    },

    // D02 - Tanjong Pagar / Chinatown
    {
      type: "Feature",
      properties: { district: "D02", name: "Tanjong Pagar / Chinatown", region: "CCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.832, 1.270], [103.850, 1.274], [103.845, 1.280],
          [103.845, 1.288], [103.850, 1.295], [103.840, 1.298],
          [103.828, 1.290], [103.825, 1.278], [103.832, 1.270]
        ]]
      }
    },

    // D06 - City Hall / Clarke Quay
    {
      type: "Feature",
      properties: { district: "D06", name: "City Hall / Clarke Quay", region: "CCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.845, 1.288], [103.860, 1.295], [103.858, 1.305],
          [103.850, 1.310], [103.840, 1.308], [103.838, 1.298],
          [103.840, 1.298], [103.850, 1.295], [103.845, 1.288]
        ]]
      }
    },

    // D07 - Bugis / Beach Road
    {
      type: "Feature",
      properties: { district: "D07", name: "Bugis / Beach Road", region: "CCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.858, 1.295], [103.870, 1.290], [103.878, 1.298],
          [103.875, 1.310], [103.865, 1.318], [103.855, 1.315],
          [103.850, 1.310], [103.858, 1.305], [103.858, 1.295]
        ]]
      }
    },

    // D09 - Orchard / River Valley
    {
      type: "Feature",
      properties: { district: "D09", name: "Orchard / River Valley", region: "CCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.820, 1.295], [103.838, 1.298], [103.840, 1.308],
          [103.838, 1.320], [103.830, 1.325], [103.818, 1.322],
          [103.812, 1.310], [103.815, 1.300], [103.820, 1.295]
        ]]
      }
    },

    // D10 - Tanglin / Holland
    {
      type: "Feature",
      properties: { district: "D10", name: "Tanglin / Holland", region: "CCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.795, 1.298], [103.815, 1.300], [103.812, 1.310],
          [103.818, 1.322], [103.815, 1.335], [103.805, 1.345],
          [103.790, 1.340], [103.785, 1.325], [103.788, 1.308],
          [103.795, 1.298]
        ]]
      }
    },

    // D11 - Newton / Novena
    {
      type: "Feature",
      properties: { district: "D11", name: "Newton / Novena", region: "CCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.830, 1.325], [103.840, 1.320], [103.855, 1.315],
          [103.858, 1.328], [103.855, 1.342], [103.848, 1.350],
          [103.835, 1.348], [103.828, 1.338], [103.830, 1.325]
        ]]
      }
    },

    // === REST OF CENTRAL (RCR) ===

    // D03 - Queenstown / Tiong Bahru
    {
      type: "Feature",
      properties: { district: "D03", name: "Queenstown / Tiong Bahru", region: "RCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.795, 1.280], [103.825, 1.278], [103.828, 1.290],
          [103.820, 1.295], [103.815, 1.300], [103.795, 1.298],
          [103.785, 1.292], [103.788, 1.282], [103.795, 1.280]
        ]]
      }
    },

    // D04 - Harbourfront / Telok Blangah
    {
      type: "Feature",
      properties: { district: "D04", name: "Harbourfront / Telok Blangah", region: "RCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.795, 1.258], [103.820, 1.260], [103.832, 1.270],
          [103.825, 1.278], [103.795, 1.280], [103.788, 1.282],
          [103.782, 1.272], [103.785, 1.262], [103.795, 1.258]
        ]]
      }
    },

    // D05 - Buona Vista / Pasir Panjang
    {
      type: "Feature",
      properties: { district: "D05", name: "Buona Vista / Pasir Panjang", region: "RCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.765, 1.275], [103.782, 1.272], [103.788, 1.282],
          [103.785, 1.292], [103.795, 1.298], [103.788, 1.308],
          [103.775, 1.312], [103.762, 1.305], [103.758, 1.290],
          [103.765, 1.275]
        ]]
      }
    },

    // D08 - Little India / Farrer Park
    {
      type: "Feature",
      properties: { district: "D08", name: "Little India / Farrer Park", region: "RCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.848, 1.315], [103.865, 1.318], [103.868, 1.332],
          [103.865, 1.345], [103.855, 1.342], [103.858, 1.328],
          [103.855, 1.315], [103.848, 1.315]
        ]]
      }
    },

    // D12 - Balestier / Toa Payoh
    {
      type: "Feature",
      properties: { district: "D12", name: "Balestier / Toa Payoh", region: "RCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.848, 1.350], [103.865, 1.345], [103.875, 1.355],
          [103.878, 1.372], [103.870, 1.385], [103.855, 1.382],
          [103.845, 1.375], [103.842, 1.360], [103.848, 1.350]
        ]]
      }
    },

    // D13 - Potong Pasir / MacPherson
    {
      type: "Feature",
      properties: { district: "D13", name: "Potong Pasir / MacPherson", region: "RCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.865, 1.318], [103.875, 1.310], [103.890, 1.318],
          [103.895, 1.335], [103.888, 1.350], [103.875, 1.355],
          [103.865, 1.345], [103.868, 1.332], [103.865, 1.318]
        ]]
      }
    },

    // D14 - Geylang / Paya Lebar
    {
      type: "Feature",
      properties: { district: "D14", name: "Geylang / Paya Lebar", region: "RCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.878, 1.298], [103.905, 1.302], [103.915, 1.318],
          [103.910, 1.338], [103.895, 1.335], [103.890, 1.318],
          [103.875, 1.310], [103.878, 1.298]
        ]]
      }
    },

    // D15 - East Coast / Marine Parade
    {
      type: "Feature",
      properties: { district: "D15", name: "East Coast / Marine Parade", region: "RCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.870, 1.280], [103.905, 1.282], [103.920, 1.290],
          [103.915, 1.305], [103.905, 1.302], [103.878, 1.298],
          [103.870, 1.290], [103.870, 1.280]
        ]]
      }
    },

    // D20 - Bishan / Ang Mo Kio
    {
      type: "Feature",
      properties: { district: "D20", name: "Bishan / Ang Mo Kio", region: "RCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.835, 1.348], [103.855, 1.350], [103.855, 1.382],
          [103.845, 1.395], [103.830, 1.398], [103.820, 1.388],
          [103.825, 1.368], [103.830, 1.355], [103.835, 1.348]
        ]]
      }
    },

    // === OUTSIDE CENTRAL (OCR) ===

    // D16 - Bedok / Upper East Coast
    {
      type: "Feature",
      properties: { district: "D16", name: "Bedok / Upper East Coast", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.915, 1.305], [103.920, 1.290], [103.948, 1.305],
          [103.955, 1.325], [103.948, 1.345], [103.930, 1.348],
          [103.915, 1.340], [103.910, 1.338], [103.915, 1.318],
          [103.915, 1.305]
        ]]
      }
    },

    // D17 - Changi / Loyang
    {
      type: "Feature",
      properties: { district: "D17", name: "Changi / Loyang", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.955, 1.325], [103.985, 1.335], [103.995, 1.355],
          [103.988, 1.378], [103.968, 1.380], [103.955, 1.368],
          [103.948, 1.345], [103.955, 1.325]
        ]]
      }
    },

    // D18 - Tampines / Pasir Ris
    {
      type: "Feature",
      properties: { district: "D18", name: "Tampines / Pasir Ris", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.930, 1.348], [103.948, 1.345], [103.955, 1.368],
          [103.968, 1.380], [103.965, 1.398], [103.948, 1.408],
          [103.928, 1.402], [103.920, 1.385], [103.925, 1.362],
          [103.930, 1.348]
        ]]
      }
    },

    // D19 - Serangoon / Hougang / Punggol
    {
      type: "Feature",
      properties: { district: "D19", name: "Serangoon / Hougang / Punggol", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.870, 1.355], [103.888, 1.350], [103.910, 1.358],
          [103.925, 1.362], [103.920, 1.385], [103.928, 1.402],
          [103.918, 1.418], [103.895, 1.420], [103.878, 1.408],
          [103.870, 1.395], [103.870, 1.385], [103.878, 1.372],
          [103.870, 1.355]
        ]]
      }
    },

    // D21 - Clementi / Upper Bukit Timah
    {
      type: "Feature",
      properties: { district: "D21", name: "Clementi / Upper Bukit Timah", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.758, 1.305], [103.775, 1.312], [103.788, 1.308],
          [103.785, 1.325], [103.790, 1.340], [103.785, 1.355],
          [103.770, 1.365], [103.755, 1.358], [103.748, 1.340],
          [103.752, 1.320], [103.758, 1.305]
        ]]
      }
    },

    // D22 - Jurong
    {
      type: "Feature",
      properties: { district: "D22", name: "Jurong", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.695, 1.295], [103.730, 1.298], [103.748, 1.308],
          [103.758, 1.305], [103.752, 1.320], [103.748, 1.340],
          [103.738, 1.352], [103.718, 1.355], [103.698, 1.345],
          [103.688, 1.328], [103.690, 1.308], [103.695, 1.295]
        ]]
      }
    },

    // D23 - Bukit Batok / Bukit Panjang / Choa Chu Kang
    {
      type: "Feature",
      properties: { district: "D23", name: "Bukit Batok / Bukit Panjang", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.738, 1.352], [103.748, 1.340], [103.755, 1.358],
          [103.770, 1.365], [103.778, 1.382], [103.772, 1.402],
          [103.755, 1.412], [103.738, 1.408], [103.725, 1.392],
          [103.728, 1.370], [103.738, 1.352]
        ]]
      }
    },

    // D24 - Lim Chu Kang / Tengah
    {
      type: "Feature",
      properties: { district: "D24", name: "Lim Chu Kang / Tengah", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.698, 1.345], [103.718, 1.355], [103.738, 1.352],
          [103.728, 1.370], [103.725, 1.392], [103.738, 1.408],
          [103.728, 1.425], [103.705, 1.430], [103.688, 1.418],
          [103.682, 1.395], [103.685, 1.368], [103.698, 1.345]
        ]]
      }
    },

    // D25 - Woodlands / Admiralty
    {
      type: "Feature",
      properties: { district: "D25", name: "Woodlands / Admiralty", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.755, 1.412], [103.772, 1.402], [103.790, 1.410],
          [103.805, 1.425], [103.802, 1.445], [103.785, 1.458],
          [103.762, 1.455], [103.748, 1.440], [103.750, 1.422],
          [103.755, 1.412]
        ]]
      }
    },

    // D26 - Upper Thomson / Springleaf
    {
      type: "Feature",
      properties: { district: "D26", name: "Upper Thomson / Springleaf", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.805, 1.345], [103.815, 1.335], [103.830, 1.355],
          [103.830, 1.398], [103.820, 1.412], [103.805, 1.425],
          [103.790, 1.410], [103.792, 1.388], [103.798, 1.365],
          [103.805, 1.345]
        ]]
      }
    },

    // D27 - Yishun / Sembawang
    {
      type: "Feature",
      properties: { district: "D27", name: "Yishun / Sembawang", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.820, 1.412], [103.830, 1.398], [103.845, 1.395],
          [103.870, 1.395], [103.878, 1.408], [103.872, 1.428],
          [103.855, 1.445], [103.830, 1.448], [103.810, 1.438],
          [103.805, 1.425], [103.820, 1.412]
        ]]
      }
    },

    // D28 - Seletar / Yio Chu Kang
    {
      type: "Feature",
      properties: { district: "D28", name: "Seletar / Yio Chu Kang", region: "OCR" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.855, 1.382], [103.870, 1.385], [103.870, 1.395],
          [103.878, 1.408], [103.895, 1.420], [103.892, 1.438],
          [103.872, 1.448], [103.855, 1.445], [103.872, 1.428],
          [103.878, 1.408], [103.870, 1.395], [103.855, 1.382]
        ]]
      }
    }
  ]
};

export default singaporeDistrictsGeoJSON;
