/**
 * Singapore Postal Districts GeoJSON
 *
 * GeoJSON FeatureCollection for Singapore's 28 postal districts
 * with simplified polygon boundaries for MapLibre GL visualization.
 *
 * Coordinates are [longitude, latitude] per GeoJSON spec.
 * Singapore roughly spans: Lon 103.6-104.0°E, Lat 1.2-1.5°N
 */

export const SINGAPORE_CENTER = {
  lng: 103.8198,
  lat: 1.3521,
  zoom: 10.8
};

export const singaporeDistrictsGeoJSON = {
  type: "FeatureCollection",
  features: [
    // D01 - Boat Quay / Raffles Place / Marina (CCR)
    {
      type: "Feature",
      properties: {
        district: "D01",
        name: "Boat Quay / Raffles Place / Marina",
        region: "CCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.845, 1.275], [103.862, 1.275], [103.868, 1.285],
          [103.862, 1.295], [103.845, 1.295], [103.840, 1.285],
          [103.845, 1.275]
        ]]
      }
    },
    // D02 - Shenton Way / Tanjong Pagar (CCR)
    {
      type: "Feature",
      properties: {
        district: "D02",
        name: "Shenton Way / Tanjong Pagar",
        region: "CCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.830, 1.265], [103.845, 1.265], [103.848, 1.280],
          [103.845, 1.295], [103.828, 1.295], [103.822, 1.280],
          [103.830, 1.265]
        ]]
      }
    },
    // D03 - Queenstown / Alexandra / Tiong Bahru (RCR)
    {
      type: "Feature",
      properties: {
        district: "D03",
        name: "Queenstown / Alexandra / Tiong Bahru",
        region: "RCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.790, 1.280], [103.820, 1.280], [103.825, 1.300],
          [103.820, 1.315], [103.790, 1.315], [103.782, 1.298],
          [103.790, 1.280]
        ]]
      }
    },
    // D04 - Harbourfront / Keppel / Telok Blangah (RCR)
    {
      type: "Feature",
      properties: {
        district: "D04",
        name: "Harbourfront / Keppel / Telok Blangah",
        region: "RCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.800, 1.252], [103.830, 1.252], [103.832, 1.272],
          [103.822, 1.282], [103.795, 1.282], [103.788, 1.268],
          [103.800, 1.252]
        ]]
      }
    },
    // D05 - Buona Vista / Dover / Pasir Panjang (RCR)
    {
      type: "Feature",
      properties: {
        district: "D05",
        name: "Buona Vista / Dover / Pasir Panjang",
        region: "RCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.765, 1.272], [103.795, 1.272], [103.798, 1.292],
          [103.790, 1.310], [103.762, 1.310], [103.755, 1.292],
          [103.765, 1.272]
        ]]
      }
    },
    // D06 - City Hall / Fort Canning (CCR)
    {
      type: "Feature",
      properties: {
        district: "D06",
        name: "City Hall / Fort Canning",
        region: "CCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.845, 1.290], [103.860, 1.290], [103.862, 1.302],
          [103.858, 1.312], [103.842, 1.312], [103.838, 1.302],
          [103.845, 1.290]
        ]]
      }
    },
    // D07 - Bugis / Rochor (CCR)
    {
      type: "Feature",
      properties: {
        district: "D07",
        name: "Bugis / Rochor",
        region: "CCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.852, 1.300], [103.868, 1.300], [103.872, 1.315],
          [103.865, 1.325], [103.850, 1.325], [103.845, 1.312],
          [103.852, 1.300]
        ]]
      }
    },
    // D08 - Little India / Farrer Park (RCR)
    {
      type: "Feature",
      properties: {
        district: "D08",
        name: "Little India / Farrer Park",
        region: "RCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.848, 1.315], [103.865, 1.315], [103.868, 1.332],
          [103.862, 1.345], [103.845, 1.345], [103.840, 1.330],
          [103.848, 1.315]
        ]]
      }
    },
    // D09 - Orchard / Somerset / River Valley (CCR)
    {
      type: "Feature",
      properties: {
        district: "D09",
        name: "Orchard / Somerset / River Valley",
        region: "CCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.822, 1.295], [103.848, 1.295], [103.852, 1.315],
          [103.845, 1.332], [103.820, 1.332], [103.815, 1.315],
          [103.822, 1.295]
        ]]
      }
    },
    // D10 - Tanglin / Bukit Timah / Holland (CCR)
    {
      type: "Feature",
      properties: {
        district: "D10",
        name: "Tanglin / Bukit Timah / Holland",
        region: "CCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.785, 1.305], [103.825, 1.305], [103.830, 1.335],
          [103.820, 1.360], [103.785, 1.360], [103.775, 1.332],
          [103.785, 1.305]
        ]]
      }
    },
    // D11 - Newton / Novena (CCR)
    {
      type: "Feature",
      properties: {
        district: "D11",
        name: "Newton / Novena",
        region: "CCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.830, 1.318], [103.852, 1.318], [103.858, 1.340],
          [103.852, 1.360], [103.828, 1.360], [103.822, 1.340],
          [103.830, 1.318]
        ]]
      }
    },
    // D12 - Balestier / Toa Payoh (RCR)
    {
      type: "Feature",
      properties: {
        district: "D12",
        name: "Balestier / Toa Payoh",
        region: "RCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.840, 1.340], [103.868, 1.340], [103.875, 1.365],
          [103.865, 1.385], [103.838, 1.385], [103.830, 1.362],
          [103.840, 1.340]
        ]]
      }
    },
    // D13 - Potong Pasir / MacPherson (RCR)
    {
      type: "Feature",
      properties: {
        district: "D13",
        name: "Potong Pasir / MacPherson",
        region: "RCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.858, 1.325], [103.885, 1.325], [103.892, 1.348],
          [103.885, 1.368], [103.858, 1.368], [103.850, 1.348],
          [103.858, 1.325]
        ]]
      }
    },
    // D14 - Geylang / Paya Lebar / Eunos (RCR)
    {
      type: "Feature",
      properties: {
        district: "D14",
        name: "Geylang / Paya Lebar / Eunos",
        region: "RCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.875, 1.305], [103.910, 1.305], [103.918, 1.328],
          [103.910, 1.350], [103.875, 1.350], [103.868, 1.328],
          [103.875, 1.305]
        ]]
      }
    },
    // D15 - East Coast / Marine Parade / Katong (RCR)
    {
      type: "Feature",
      properties: {
        district: "D15",
        name: "East Coast / Marine Parade / Katong",
        region: "RCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.885, 1.285], [103.925, 1.285], [103.932, 1.302],
          [103.925, 1.318], [103.885, 1.318], [103.878, 1.302],
          [103.885, 1.285]
        ]]
      }
    },
    // D16 - Bedok / Upper East Coast (OCR)
    {
      type: "Feature",
      properties: {
        district: "D16",
        name: "Bedok / Upper East Coast",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.920, 1.305], [103.960, 1.305], [103.968, 1.335],
          [103.958, 1.360], [103.918, 1.360], [103.908, 1.335],
          [103.920, 1.305]
        ]]
      }
    },
    // D17 - Loyang / Changi (OCR)
    {
      type: "Feature",
      properties: {
        district: "D17",
        name: "Loyang / Changi",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.960, 1.335], [103.998, 1.335], [104.005, 1.360],
          [103.998, 1.385], [103.960, 1.385], [103.952, 1.360],
          [103.960, 1.335]
        ]]
      }
    },
    // D18 - Tampines / Pasir Ris (OCR)
    {
      type: "Feature",
      properties: {
        district: "D18",
        name: "Tampines / Pasir Ris",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.930, 1.355], [103.985, 1.355], [103.995, 1.385],
          [103.985, 1.415], [103.930, 1.415], [103.920, 1.385],
          [103.930, 1.355]
        ]]
      }
    },
    // D19 - Serangoon / Hougang / Punggol (OCR)
    {
      type: "Feature",
      properties: {
        district: "D19",
        name: "Serangoon / Hougang / Punggol",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.870, 1.360], [103.935, 1.360], [103.945, 1.400],
          [103.935, 1.430], [103.870, 1.430], [103.860, 1.398],
          [103.870, 1.360]
        ]]
      }
    },
    // D20 - Bishan / Ang Mo Kio (RCR)
    {
      type: "Feature",
      properties: {
        district: "D20",
        name: "Bishan / Ang Mo Kio",
        region: "RCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.830, 1.355], [103.875, 1.355], [103.882, 1.385],
          [103.875, 1.415], [103.830, 1.415], [103.822, 1.385],
          [103.830, 1.355]
        ]]
      }
    },
    // D21 - Upper Bukit Timah / Clementi (OCR)
    {
      type: "Feature",
      properties: {
        district: "D21",
        name: "Upper Bukit Timah / Clementi",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.755, 1.315], [103.790, 1.315], [103.798, 1.350],
          [103.790, 1.385], [103.755, 1.385], [103.745, 1.350],
          [103.755, 1.315]
        ]]
      }
    },
    // D22 - Jurong / Boon Lay (OCR)
    {
      type: "Feature",
      properties: {
        district: "D22",
        name: "Jurong / Boon Lay",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.685, 1.310], [103.745, 1.310], [103.755, 1.345],
          [103.745, 1.380], [103.685, 1.380], [103.675, 1.345],
          [103.685, 1.310]
        ]]
      }
    },
    // D23 - Bukit Batok / Bukit Panjang (OCR)
    {
      type: "Feature",
      properties: {
        district: "D23",
        name: "Bukit Batok / Bukit Panjang",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.740, 1.350], [103.790, 1.350], [103.798, 1.385],
          [103.790, 1.420], [103.740, 1.420], [103.730, 1.385],
          [103.740, 1.350]
        ]]
      }
    },
    // D24 - Lim Chu Kang / Tengah (OCR)
    {
      type: "Feature",
      properties: {
        district: "D24",
        name: "Lim Chu Kang / Tengah",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.690, 1.375], [103.745, 1.375], [103.755, 1.415],
          [103.745, 1.455], [103.690, 1.455], [103.680, 1.415],
          [103.690, 1.375]
        ]]
      }
    },
    // D25 - Kranji / Woodlands (OCR)
    {
      type: "Feature",
      properties: {
        district: "D25",
        name: "Kranji / Woodlands",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.750, 1.415], [103.805, 1.415], [103.815, 1.448],
          [103.805, 1.475], [103.750, 1.475], [103.740, 1.448],
          [103.750, 1.415]
        ]]
      }
    },
    // D26 - Upper Thomson / Springleaf (OCR)
    {
      type: "Feature",
      properties: {
        district: "D26",
        name: "Upper Thomson / Springleaf",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.810, 1.385], [103.850, 1.385], [103.858, 1.418],
          [103.850, 1.448], [103.810, 1.448], [103.800, 1.418],
          [103.810, 1.385]
        ]]
      }
    },
    // D27 - Yishun / Sembawang (OCR)
    {
      type: "Feature",
      properties: {
        district: "D27",
        name: "Yishun / Sembawang",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.818, 1.415], [103.875, 1.415], [103.885, 1.450],
          [103.875, 1.478], [103.818, 1.478], [103.808, 1.450],
          [103.818, 1.415]
        ]]
      }
    },
    // D28 - Seletar / Yio Chu Kang (OCR)
    {
      type: "Feature",
      properties: {
        district: "D28",
        name: "Seletar / Yio Chu Kang",
        region: "OCR"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [103.855, 1.395], [103.905, 1.395], [103.915, 1.425],
          [103.905, 1.455], [103.855, 1.455], [103.845, 1.425],
          [103.855, 1.395]
        ]]
      }
    }
  ]
};

export default singaporeDistrictsGeoJSON;
