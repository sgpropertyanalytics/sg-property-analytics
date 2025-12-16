import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import {
  getPriceTrends,
  getTotalVolume,
  getAvgPsf,
  getSaleTypeTrends,
  getPriceTrendsBySaleType,
  getPriceTrendsByRegion,
  getPsfTrendsByRegion,
  getMarketStats,
  getMarketStatsByDistrict,
  getComparableValueAnalysis,
  getProjectsByDistrict,
  getPriceProjectsByDistrict,
} from '../api/client';
import LineChart from '../components/LineChart';
import BarChart from '../components/BarChart';
import RegionChart from '../components/RegionChart';
import SaleTypeChart from '../components/SaleTypeChart';

const COLORS = {
  '2b': '#3B82F6',
  '3b': '#10B981',
  '4b': '#F59E0B',
};

const BEDROOM_LABELS = {
  '2b': '2-Bedroom',
  '3b': '3-Bedroom',
  '4b': '4-Bedroom',
};

const DISTRICT_NAMES = {
  'D01': 'Boat Quay / Raffles Place / Marina Downtown / Suntec City',
  'D02': 'Shenton Way / Tanjong Pagar',
  'D03': 'Queenstown / Alexandra / Tiong Bahru',
  'D04': 'Harbourfront / Keppel / Telok Blangah',
  'D05': 'Buona Vista / Dover / Pasir Panjang',
  'D06': 'City Hall / Fort Canning',
  'D07': 'Bugis / Rochor',
  'D08': 'Little India / Farrer Park',
  'D09': 'Orchard / Somerset / River Valley',
  'D10': 'Tanglin / Bukit Timah / Holland',
  'D11': 'Newton / Novena / Dunearn / Watten',
  'D12': 'Balestier / Whampoa / Toa Payoh / Boon Keng / Bendemeer / Kampong Bugis',
  'D13': 'Potong Pasir / Bidadari / MacPherson / Upper Aljunied',
  'D14': 'Geylang / Dakota / Paya Lebar Central / Eunos / Ubi / Aljunied',
  'D15': 'Tanjong Rhu / Amber / Meyer / Katong / Dunman / Joo Chiat / Marine Parade',
  'D16': 'Bedok / Upper East Coast / Eastwood / Kew Drive',
  'D17': 'Loyang / Changi',
  'D18': 'Tampines / Pasir Ris',
  'D19': 'Serangoon Garden / Hougang / Sengkang / Punggol',
  'D20': 'Bishan / Ang Mo Kio',
  'D21': 'Upper Bukit Timah / Clementi Park / Ulu Pandan',
  'D22': 'Jurong / Boon Lay / Tuas',
  'D23': 'Bukit Batok / Bukit Panjang / Choa Chu Kang',
  'D24': 'Lim Chu Kang / Tengah',
  'D25': 'Kranji / Woodlands',
  'D26': 'Upper Thomson / Springleaf',
  'D27': 'Yishun / Sembawang',
  'D28': 'Seletar / Yio Chu Kang',
};

const formatPrice = (value) => {
  if (!value) return '-';
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(2)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatPSF = (value) => {
  if (!value) return '-';
  return `$${value.toLocaleString()}`;
};

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl p-4 md:p-6 mb-6 shadow-md">
      {title && (
        <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4 md:mb-5">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}

// District Summary (Volume & Liquidity) - global filters + expandable per-district breakdown
function DistrictSummaryVolumeLiquidity({
  selectedBedrooms,
  selectedSegment,
  volumeData,
}) {
  const [sortBy, setSortBy] = useState('total'); // 'total' | 'quantity' | 'district'
  const [expandedDistricts, setExpandedDistricts] = useState({});
  const [districtProjects, setDistrictProjects] = useState({});
  const [loadingDistricts, setLoadingDistricts] = useState({}); // Track loading state per district

  const toggleDistrict = (district) => {
    const isExpanded = !!expandedDistricts[district];
    setExpandedDistricts((prev) => ({
      ...prev,
      [district]: !isExpanded,
    }));

    if (!isExpanded && !districtProjects[district]) {
      fetchDistrictProjects(district);
    }
  };

  const fetchDistrictProjects = async (district) => {
    if (districtProjects[district]) return;
    
    // Set loading state
    setLoadingDistricts((prev) => ({ ...prev, [district]: true }));
    
    try {
      const bedroomParam = selectedBedrooms.map((b) => b.replace('b', '')).join(',');
      const res = await getProjectsByDistrict(district, {
        bedroom: bedroomParam,
        segment: selectedSegment || undefined,
      });
      
      // Data validation and completeness check
      // Axios wraps responses, so res.data is the actual response body from Flask
      // Flask returns { projects: [...] }, so res.data.projects should be the array
      const projects = res.data?.projects || [];
      
      // Debug: Log the raw response structure
      console.log(`[DEBUG] District ${district} API response:`, {
        hasData: !!res.data,
        dataKeys: res.data ? Object.keys(res.data) : [],
        hasProjects: !!res.data?.projects,
        projectCount: projects.length,
        firstProject: projects[0] || null,
        firstProjectKeys: projects[0] ? Object.keys(projects[0]) : [],
      });
      
      if (!Array.isArray(projects)) {
        console.error(`[ERROR] District ${district}: Expected projects array, got:`, typeof projects, projects);
        setDistrictProjects((prev) => ({
          ...prev,
          [district]: [],
        }));
        return;
      }
      
      // Validate each project has required fields and log sample data
      const validatedProjects = projects.filter((project) => {
        if (!project.project_name) {
          console.warn(`Skipping project with missing name in district ${district}`);
          return false;
        }
        // Debug: Log first project's data structure
        if (projects.indexOf(project) === 0) {
          console.log(`[DEBUG] Sample project data for ${district}:`, {
            name: project.project_name,
            '2b': project['2b'],
            '2b_count': project['2b_count'],
            '3b': project['3b'],
            '3b_count': project['3b_count'],
            '4b': project['4b'],
            '4b_count': project['4b_count'],
            total: project.total,
            total_quantity: project.total_quantity,
            allKeys: Object.keys(project),
          });
        }
        return true;
      });
      
      // Log completeness metrics
      if (validatedProjects.length !== projects.length) {
        console.warn(
          `District ${district}: Filtered out ${projects.length - validatedProjects.length} invalid projects`
        );
      }
      
      console.log(
        `District ${district}: Loaded ${validatedProjects.length} projects (bedrooms: ${bedroomParam}, segment: ${selectedSegment || 'all'})`
      );
      
      setDistrictProjects((prev) => ({
        ...prev,
        [district]: validatedProjects,
      }));
    } catch (err) {
      console.error('Error fetching district projects (volume & liquidity):', err);
      console.error('Error details:', err.response?.data || err.message);
      setDistrictProjects((prev) => ({
        ...prev,
        [district]: [],
      }));
    } finally {
      // Clear loading state
      setLoadingDistricts((prev) => ({ ...prev, [district]: false }));
    }
  };

  // Helper to label district with description
  const getDistrictLabel = (district) =>
    DISTRICT_NAMES[district] ? `${district}: ${DISTRICT_NAMES[district]}` : district;

  if (!volumeData || volumeData.length === 0) {
    return null;
  }

  // Exclude districts with fewer than 5 transactions (data integrity guardrail)
  const excludedVolumeDistricts = [];

  const filteredVolumeData = [...volumeData].filter((row) => {
    const totalQty = row.total_quantity || 0;
    if (totalQty < 5) {
      excludedVolumeDistricts.push(row.district);
      return false;
    }
    return true;
  });

  return (
    <Card title="📋 District Summary (Volume & Liquidity)">
      {/* Sort controls */}
      <div className="mb-4 p-3 md:p-4 bg-gray-50 rounded-lg flex flex-wrap items-center gap-3 md:gap-4">
        <span className="text-xs md:text-sm font-medium text-gray-700">
          Sort by:
        </span>
        <button
          type="button"
          onClick={() => setSortBy('total')}
          className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium border-none cursor-pointer transition-colors ${
            sortBy === 'total' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          Total Volume
        </button>
        <button
          type="button"
          onClick={() => setSortBy('quantity')}
          className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium border-none cursor-pointer transition-colors ${
            sortBy === 'quantity'
              ? 'bg-emerald-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          Quantity
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px] md:text-xs lg:text-sm min-w-[720px]">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="p-2 text-left w-8" />
              <th className="p-2 text-left font-semibold">District</th>
              {selectedBedrooms.includes('2b') && (
                <>
                  <th className="p-2 text-right font-semibold text-blue-500">2B Volume</th>
                  <th className="p-2 text-right font-semibold text-blue-500">2B Qty</th>
                </>
              )}
              {selectedBedrooms.includes('3b') && (
                <>
                  <th className="p-2 text-right font-semibold text-emerald-500">3B Volume</th>
                  <th className="p-2 text-right font-semibold text-emerald-500">3B Qty</th>
                </>
              )}
              {selectedBedrooms.includes('4b') && (
                <>
                  <th className="p-2 text-right font-semibold text-amber-500">4B Volume</th>
                  <th className="p-2 text-right font-semibold text-amber-500">4B Qty</th>
                </>
              )}
              <th className="p-2 text-right font-semibold">Total Qty</th>
              <th className="p-2 text-right font-semibold">Total Volume</th>
            </tr>
          </thead>
          <tbody>
            {filteredVolumeData
              .sort((a, b) => {
                if (sortBy === 'total') {
                  return (b.total || 0) - (a.total || 0);
                }
                if (sortBy === 'quantity') {
                  return (b.total_quantity || 0) - (a.total_quantity || 0);
                }
                return a.district.localeCompare(b.district);
              })
              .map((row, idx) => {
                const district = row.district;
                const isExpanded = !!expandedDistricts[district];
                const projects = districtProjects[district] || [];

                return (
                  <React.Fragment key={district}>
                    <tr
                      className={`border-b border-gray-200 ${
                        idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                      } cursor-pointer`}
                      onClick={() => toggleDistrict(district)}
                    >
                      <td className="p-2 text-center text-gray-500">
                        <span
                          className={`inline-block transform text-xs transition-transform ${
                            isExpanded ? 'rotate-90' : 'rotate-0'
                          }`}
                        >
                          ▶
                        </span>
                      </td>
                      <td className="p-2 font-medium text-[11px] md:text-xs text-gray-800">
                        {getDistrictLabel(district)}
                      </td>
                      {selectedBedrooms.includes('2b') && (
                        <>
                          <td className="p-2 text-right text-gray-800">
                            {row['2b'] != null ? formatPrice(row['2b']) : '-'}
                          </td>
                          <td className="p-2 text-right text-gray-500">
                            {(row['2b_count'] || 0).toLocaleString()}
                          </td>
                        </>
                      )}
                      {selectedBedrooms.includes('3b') && (
                        <>
                          <td className="p-2 text-right text-gray-800">
                            {row['3b'] != null ? formatPrice(row['3b']) : '-'}
                          </td>
                          <td className="p-2 text-right text-gray-500">
                            {(row['3b_count'] || 0).toLocaleString()}
                          </td>
                        </>
                      )}
                      {selectedBedrooms.includes('4b') && (
                        <>
                          <td className="p-2 text-right text-gray-800">
                            {row['4b'] != null ? formatPrice(row['4b']) : '-'}
                          </td>
                          <td className="p-2 text-right text-gray-500">
                            {(row['4b_count'] || 0).toLocaleString()}
                          </td>
                        </>
                      )}
                      <td className="p-2 text-right font-semibold text-gray-800">
                        {(row.total_quantity || 0).toLocaleString()}
                      </td>
                      <td className="p-2 text-right font-semibold text-gray-900">
                        {row.total != null ? formatPrice(row.total) : '-'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td
                          className="p-0 bg-gray-50"
                          colSpan={
                            2 + selectedBedrooms.length * 2 + 2
                          }
                        >
                          <div className="px-3 py-4 md:px-5 md:py-5 border-t border-gray-200">
                            {loadingDistricts[district] ? (
                              <div className="text-center text-gray-500 text-xs md:text-sm py-4">
                                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 mr-2"></div>
                                Loading projects...
                              </div>
                            ) : projects.length === 0 ? (
                              <div className="text-center text-gray-500 text-xs md:text-sm py-4">
                                No project data available
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-[11px] md:text-xs lg:text-sm min-w-[640px]">
                                  <thead>
                                    <tr className="border-b-2 border-gray-200 bg-white">
                                      <th className="p-2 text-left font-semibold">
                                        Project Name
                                      </th>
                                      {selectedBedrooms.includes('2b') && (
                                        <>
                                          <th className="p-2 text-right font-semibold text-blue-500">
                                            2B Volume
                                          </th>
                                          <th className="p-2 text-right font-semibold text-blue-500">
                                            2B Qty
                                          </th>
                                        </>
                                      )}
                                      {selectedBedrooms.includes('3b') && (
                                        <>
                                          <th className="p-2 text-right font-semibold text-emerald-500">
                                            3B Volume
                                          </th>
                                          <th className="p-2 text-right font-semibold text-emerald-500">
                                            3B Qty
                                          </th>
                                        </>
                                      )}
                                      {selectedBedrooms.includes('4b') && (
                                        <>
                                          <th className="p-2 text-right font-semibold text-amber-500">
                                            4B Volume
                                          </th>
                                          <th className="p-2 text-right font-semibold text-amber-500">
                                            4B Qty
                                          </th>
                                        </>
                                      )}
                                      <th className="p-2 text-right font-semibold">
                                        Total Qty
                                      </th>
                                      <th className="p-2 text-right font-semibold">
                                        Total Volume
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {projects.length === 0 && (
                                      <tr>
                                        <td colSpan={2 + selectedBedrooms.length * 2 + 2} className="p-4 text-center text-gray-500 text-xs md:text-sm">
                                          No project data available
                                        </td>
                                      </tr>
                                    )}
                                    {projects.map((project, idx2) => {
                                      // Debug: Log first project's data structure when rendering
                                      if (idx2 === 0) {
                                        console.log(`[DEBUG RENDER] First project in ${district}:`, {
                                          name: project.project_name,
                                          '2b': project['2b'],
                                          '2b_count': project['2b_count'],
                                          '3b': project['3b'],
                                          '3b_count': project['3b_count'],
                                          '4b': project['4b'],
                                          '4b_count': project['4b_count'],
                                          total: project.total,
                                          total_quantity: project.total_quantity,
                                          allKeys: Object.keys(project),
                                        });
                                      }
                                      return (
                                      <tr
                                        key={idx2}
                                        className={`border-b border-gray-100 ${
                                          idx2 % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                        }`}
                                      >
                                        <td className="p-2 font-medium text-[11px] md:text-xs text-gray-800">
                                          {project.project_name}
                                          {project.sale_type_label && (
                                            <span
                                              className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                project.sale_type_label === 'New Launch'
                                                  ? 'bg-blue-100 text-blue-700'
                                                  : 'bg-emerald-100 text-emerald-700'
                                              }`}
                                            >
                                              {project.sale_type_label}
                                            </span>
                                          )}
                                        </td>
                                        {selectedBedrooms.includes('2b') && (
                                          <>
                                            <td className="p-2 text-right text-gray-800">
                                              {project['2b'] != null && project['2b'] !== undefined
                                                ? formatPrice(project['2b'])
                                                : '-'}
                                            </td>
                                            <td className="p-2 text-right text-gray-500">
                                              {project['2b_count'] != null && project['2b_count'] !== undefined
                                                ? project['2b_count'].toLocaleString()
                                                : '0'}
                                            </td>
                                          </>
                                        )}
                                        {selectedBedrooms.includes('3b') && (
                                          <>
                                            <td className="p-2 text-right text-gray-800">
                                              {project['3b'] != null && project['3b'] !== undefined
                                                ? formatPrice(project['3b'])
                                                : '-'}
                                            </td>
                                            <td className="p-2 text-right text-gray-500">
                                              {project['3b_count'] != null && project['3b_count'] !== undefined
                                                ? project['3b_count'].toLocaleString()
                                                : '0'}
                                            </td>
                                          </>
                                        )}
                                        {selectedBedrooms.includes('4b') && (
                                          <>
                                            <td className="p-2 text-right text-gray-800">
                                              {project['4b'] != null && project['4b'] !== undefined
                                                ? formatPrice(project['4b'])
                                                : '-'}
                                            </td>
                                            <td className="p-2 text-right text-gray-500">
                                              {project['4b_count'] != null && project['4b_count'] !== undefined
                                                ? project['4b_count'].toLocaleString()
                                                : '0'}
                                            </td>
                                          </>
                                        )}
                                        <td className="p-2 text-right font-semibold text-gray-800">
                                          {project.total_quantity != null && project.total_quantity !== undefined
                                            ? project.total_quantity.toLocaleString()
                                            : '0'}
                                        </td>
                                        <td className="p-2 text-right font-semibold text-gray-900">
                                          {project.total != null && project.total !== undefined
                                            ? formatPrice(project.total)
                                            : '-'}
                                        </td>
                                      </tr>
                                    );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
      {/* Note about excluded districts due to low transaction counts */}
      {excludedVolumeDistricts.length > 0 && (
        <p className="mt-3 text-[11px] md:text-xs text-gray-500">
          The following districts were excluded from this table due to fewer than 5
          transactions in the underlying data:{' '}
          {excludedVolumeDistricts
            .sort()
            .map((d, i) => {
              const name = DISTRICT_NAMES[d]
                ? `${d}: ${DISTRICT_NAMES[d]}`
                : d;
              return (
                <span key={d}>
                  {i > 0 ? ', ' : ''}
                  {name}
                </span>
              );
            })}
          .
        </p>
      )}
    </Card>
  );
}
// Global filter bar (page-level filters)
function GlobalFilterBar({
  selectedBedrooms,
  setSelectedBedrooms,
  selectedSegment,
  setSelectedSegment,
  selectedDistrict,
  setSelectedDistrict,
  availableDistricts,
}) {
  return (
    <div className="flex flex-col md:flex-row flex-wrap gap-4 md:gap-4 items-start md:items-center">
      {/* Bedroom Types (multi-select) */}
      <div className="w-full md:w-auto">
        <label className="block mb-2 text-xs md:text-sm font-medium text-gray-700">
          Bedroom Types
        </label>
        <div className="flex flex-wrap gap-2">
          {['2b', '3b', '4b'].map((bedroom) => (
            <button
              key={bedroom}
              type="button"
              onClick={() => {
                if (selectedBedrooms.includes(bedroom)) {
                  // Ensure at least one bedroom remains selected
                  if (selectedBedrooms.length > 1) {
                    setSelectedBedrooms(selectedBedrooms.filter((b) => b !== bedroom));
                  }
                } else {
                  setSelectedBedrooms([...selectedBedrooms, bedroom]);
                }
              }}
              className={`px-3 md:px-4 py-2 rounded-md border-none font-medium text-xs md:text-sm cursor-pointer transition-colors ${
                selectedBedrooms.includes(bedroom)
                  ? `text-white ${
                      bedroom === '2b'
                        ? 'bg-blue-500'
                        : bedroom === '3b'
                        ? 'bg-green-500'
                        : 'bg-amber-500'
                    }`
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {BEDROOM_LABELS[bedroom]}
            </button>
          ))}
        </div>
      </div>

      {/* Market Segment (global) */}
      <div className="w-full md:w-auto">
        <label className="block mb-2 text-xs md:text-sm font-medium text-gray-700">
          Market Segment
        </label>
        <select
          value={selectedSegment || 'all'}
          onChange={(e) =>
            setSelectedSegment(e.target.value === 'all' ? null : e.target.value)
          }
          className="w-full md:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[120px] md:min-w-[150px]"
        >
          <option value="all">All Segments</option>
          <option value="CCR">CCR</option>
          <option value="RCR">RCR</option>
          <option value="OCR">OCR</option>
        </select>
      </div>

      {/* District (global) */}
      <div className="w-full md:w-auto">
        <label className="block mb-2 text-xs md:text-sm font-medium text-gray-700">
          District
        </label>
        <select
          value={selectedDistrict}
          onChange={(e) => setSelectedDistrict(e.target.value)}
          className="w-full md:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[120px] md:min-w-[200px]"
        >
          <option value="all">All Districts</option>
          {availableDistricts.map((district) => (
            <option key={district} value={district}>
              {district}: {DISTRICT_NAMES[district] ? `(${DISTRICT_NAMES[district]})` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// District Summary (Price) - local filters & table view
function DistrictSummaryPrice({ selectedSegment, selectedDistrict }) {
  const [priceSectionBedrooms, setPriceSectionBedrooms] = useState(['2b', '3b', '4b']);
  const [priceSortBy, setPriceSortBy] = useState('median_price'); // 'none' | 'median_price' | 'median_psf'
  const [priceSortTimeframe, setPriceSortTimeframe] = useState('short_term'); // 'short_term' | 'long_term'
  const [priceSectionLoading, setPriceSectionLoading] = useState(false);
  const [priceStatsByDistrict, setPriceStatsByDistrict] = useState({
    short_term: { by_district: {} },
    long_term: { by_district: {} },
  });
  const [priceDistrictProjects, setPriceDistrictProjects] = useState({});
  const [priceExpandedDistricts, setPriceExpandedDistricts] = useState({});
  const [priceLoadingDistricts, setPriceLoadingDistricts] = useState({}); // Track loading state per district
  const [excludedDistricts, setExcludedDistricts] = useState({});

  // Localized market stats by district – independent bedroom filter
  useEffect(() => {
    const emptyStats = {
      short_term: { by_district: {} },
      long_term: { by_district: {} },
    };

    const fetchMarketStats = async () => {
      if (priceSectionBedrooms.length === 0) {
        setPriceStatsByDistrict(emptyStats);
        setPriceSectionLoading(false);
        return;
      }

      setPriceSectionLoading(true);
      try {
        const bedroomParam = priceSectionBedrooms.map((b) => b.replace('b', '')).join(',');

        const params = {
          bedroom: bedroomParam,
          districts: selectedDistrict !== 'all' ? selectedDistrict : undefined,
          segment: selectedSegment || undefined,
          short_months: 3,
          long_months: 15,
        };

        const res = await getMarketStatsByDistrict(params);
        setPriceStatsByDistrict(res.data || emptyStats);
      } catch (err) {
        console.error('Error fetching market stats by district (price section):', err);
        setPriceStatsByDistrict(emptyStats);
      } finally {
        setPriceSectionLoading(false);
      }
    };

    fetchMarketStats();
  }, [priceSectionBedrooms, selectedDistrict, selectedSegment]);

  // Fetch project-level price/psf stats for a district when expanded
  const fetchPriceDistrictProjects = async (district, monthsForView) => {
    const viewKey = monthsForView === 3 ? 'short_term' : 'long_term';
    const key = `${district}_${viewKey}`;
    if (priceDistrictProjects[key]) return;

    // Set loading state
    setPriceLoadingDistricts((prev) => ({ ...prev, [key]: true }));

    try {
      const bedroomParam = priceSectionBedrooms.map((b) => b.replace('b', '')).join(',');
      const params = {
        bedroom: bedroomParam,
        months: monthsForView,
        segment: selectedSegment || undefined,
      };
      const res = await getPriceProjectsByDistrict(district, params);
      const projects = res.data?.projects || [];

      // Data validation and completeness check
      const validatedProjects = projects.filter((project) => {
        if (!project || !project.project_name) {
          console.warn(`Skipping price project with missing name in district ${district}`);
          return false;
        }
        if (!project.count || project.count < 3) {
          console.warn(
            `Skipping project ${project.project_name} in district ${district}: insufficient sample (count: ${project.count})`
          );
          return false;
        }
        return true;
      });

      // Log completeness metrics
      if (validatedProjects.length !== projects.length) {
        console.warn(
          `District ${district} (${viewKey}): Filtered out ${projects.length - validatedProjects.length} projects with insufficient data`
        );
      }

      console.log(
        `District ${district} (${viewKey}): Loaded ${validatedProjects.length} valid projects (bedrooms: ${bedroomParam}, segment: ${selectedSegment || 'all'})`
      );

      // Sum transactions across projects for this district/timeframe
      const totalCount = validatedProjects.reduce(
        (sum, p) => sum + (p.count || 0),
        0
      );

      // If fewer than 5 transactions, mark district as excluded
      if (totalCount < 5) {
        setExcludedDistricts((prev) => ({
          ...prev,
          [district]: true,
        }));
        setPriceDistrictProjects((prev) => ({
          ...prev,
          [key]: [],
        }));
      } else {
        setPriceDistrictProjects((prev) => ({
          ...prev,
          [key]: validatedProjects,
        }));
      }
    } catch (err) {
      console.error('Error fetching price projects by district:', err);
      console.error('Error details:', err.response?.data || err.message);
      const viewKey = monthsForView === 3 ? 'short_term' : 'long_term';
      const key = `${district}_${viewKey}`;
      setPriceDistrictProjects((prev) => ({
        ...prev,
        [key]: [],
      }));
    } finally {
      // Clear loading state
      const viewKey = monthsForView === 3 ? 'short_term' : 'long_term';
      const key = `${district}_${viewKey}`;
      setPriceLoadingDistricts((prev) => ({ ...prev, [key]: false }));
    }
  };

  const togglePriceDistrict = (district) => {
    const isExpanded = !!priceExpandedDistricts[district];
    setPriceExpandedDistricts((prev) => ({
      ...prev,
      [district]: !isExpanded,
    }));

    if (!isExpanded) {
      const monthsForView = priceSortTimeframe === 'short_term' ? 3 : 15;
      fetchPriceDistrictProjects(district, monthsForView);
    }
  };

  const viewKey = priceSortTimeframe === 'short_term' ? 'short_term' : 'long_term';
  const byDistrict = priceStatsByDistrict?.[viewKey]?.by_district || {};
  const districts = Object.keys(byDistrict);

  let sortedDistricts = [...districts];
  if (priceSortBy === 'median_price') {
    sortedDistricts.sort((a, b) => {
      const statsA = byDistrict[a];
      const statsB = byDistrict[b];
      const medianA = statsA?.price?.median || 0;
      const medianB = statsB?.price?.median || 0;
      return medianB - medianA;
    });
  } else if (priceSortBy === 'median_psf') {
    sortedDistricts.sort((a, b) => {
      const statsA = byDistrict[a];
      const statsB = byDistrict[b];
      const medianA = statsA?.psf?.median || 0;
      const medianB = statsB?.psf?.median || 0;
      return medianB - medianA;
    });
  } else {
    sortedDistricts.sort();
  }

  const renderCell = (obj, field, formatter) => {
    if (!obj) return '-';
    if (obj.insufficient) return 'NA*';
    const val = obj[field];
    if (val == null) return '-';
    return formatter(val);
  };

  return (
    <Card title="📊 District Summary (Price)">
      {/* Local bedroom filter (for this section only) */}
      <div className="mb-4 p-3 md:p-4 bg-gray-50 rounded-lg flex flex-wrap items-center gap-3 md:gap-4">
        <span className="text-xs md:text-sm font-medium text-gray-700">
          Filter by Bedroom (this section only):
        </span>
        <div className="flex flex-wrap gap-2">
          {['2b', '3b', '4b'].map((opt) => (
            <label
              key={opt}
              className="inline-flex items-center gap-2 text-xs md:text-sm text-gray-700 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={priceSectionBedrooms.includes(opt)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setPriceSectionBedrooms([...priceSectionBedrooms, opt]);
                  } else {
                    // keep at least one bedroom selected
                    if (priceSectionBedrooms.length > 1) {
                      setPriceSectionBedrooms(
                        priceSectionBedrooms.filter((b) => b !== opt)
                      );
                    }
                  }
                }}
                className="w-4 h-4 cursor-pointer"
              />
              {BEDROOM_LABELS[opt]}
            </label>
          ))}
        </div>
      </div>

      {/* Sort controls */}
      <div className="mb-4 p-3 md:p-4 bg-gray-50 rounded-lg flex flex-wrap items-center gap-3 md:gap-4">
        <span className="text-xs md:text-sm font-medium text-gray-700">
          Sort by:
        </span>
        <button
          type="button"
          onClick={() =>
            setPriceSortBy((prev) => (prev === 'median_price' ? 'none' : 'median_price'))
          }
          className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium border-none cursor-pointer transition-colors ${
            priceSortBy === 'median_price'
              ? 'bg-emerald-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          Median Price
        </button>
        <button
          type="button"
          onClick={() =>
            setPriceSortBy((prev) => (prev === 'median_psf' ? 'none' : 'median_psf'))
          }
          className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium border-none cursor-pointer transition-colors ${
            priceSortBy === 'median_psf'
              ? 'bg-emerald-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          Median PSF
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2 md:gap-3">
          <span className="text-[11px] md:text-xs text-gray-500">
            Sort timeframe:
          </span>
          <button
            type="button"
            onClick={() => setPriceSortTimeframe('short_term')}
            className={`px-2.5 py-1 rounded-md text-[11px] md:text-xs font-medium border-none cursor-pointer transition-colors ${
              priceSortTimeframe === 'short_term'
                ? 'bg-gray-700 text-gray-100'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            Last 3 Months (Pulse)
          </button>
          <button
            type="button"
            onClick={() => setPriceSortTimeframe('long_term')}
            className={`px-2.5 py-1 rounded-md text-[11px] md:text-xs font-medium border-none cursor-pointer transition-colors ${
              priceSortTimeframe === 'long_term'
                ? 'bg-gray-700 text-gray-100'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            Last 15 Months (Baseline)
          </button>
        </div>
      </div>

      {priceSectionLoading ? (
        <div className="text-center py-10 text-gray-500 text-sm md:text-base">
          <div className="text-2xl md:text-3xl mb-2">⏳</div>
          Updating district price data...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="text-center mb-2 px-3 py-2 rounded-md bg-gray-800 text-gray-50 text-xs md:text-sm font-semibold">
            {priceSortTimeframe === 'short_term'
              ? 'Last 3 months (Short-term view)'
              : 'Last 15 months (Long-term view)'}
          </div>
          <p className="text-[11px] md:text-xs text-gray-500 mb-3 text-center">
            *NA indicates insufficient sample size for reliable statistics.
          </p>

          <table className="w-full border-collapse text-[11px] md:text-xs lg:text-sm min-w-[640px]">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50">
                <th className="p-2 text-left font-semibold" />
                <th className="p-2 text-left font-semibold">District</th>
                <th className="p-2 text-center font-semibold border-r border-dotted border-gray-300" colSpan={3}>
                  Price (SGD)
                </th>
                <th className="p-2 text-center font-semibold" colSpan={3}>
                  PSF (SGD)
                </th>
              </tr>
              <tr className="border-b border-gray-200 bg-gray-50 text-[10px] md:text-[11px] text-gray-500">
                <th className="p-2 text-left" />
                <th className="p-2 text-left" />
                <th className="p-2 text-center">25th</th>
                <th className="p-2 text-center">Median</th>
                <th className="p-2 text-center border-r border-dotted border-gray-300">75th</th>
                <th className="p-2 text-center">25th</th>
                <th className="p-2 text-center">Median</th>
                <th className="p-2 text-center">75th</th>
              </tr>
            </thead>
            <tbody>
              {sortedDistricts.map((districtCode, idx) => {
                // Skip districts that have been flagged as having insufficient data
                if (excludedDistricts[districtCode]) {
                  return null;
                }
                const stats = byDistrict[districtCode];
                if (!stats) return null;

                const viewKey = priceSortTimeframe === 'short_term' ? 'short_term' : 'long_term';
                const key = `${districtCode}_${viewKey}`;
                const isExpanded = !!priceExpandedDistricts[districtCode];
                const projects = priceDistrictProjects[key] || [];

                const label =
                  DISTRICT_NAMES[districtCode]
                    ? `${districtCode}: ${DISTRICT_NAMES[districtCode]}`
                    : districtCode;

                return (
                  <React.Fragment key={districtCode}>
                    <tr
                      className={`border-b border-gray-200 ${
                        idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                      } cursor-pointer`}
                      onClick={() => togglePriceDistrict(districtCode)}
                    >
                      <td className="p-2 text-center text-gray-500">
                        <span
                          className={`inline-block transform text-xs transition-transform ${
                            isExpanded ? 'rotate-90' : 'rotate-0'
                          }`}
                        >
                          ▶
                        </span>
                      </td>
                      <td className="p-2 font-medium text-[11px] md:text-xs text-gray-800">
                        {label}
                      </td>
                      <td className="p-2 text-center text-gray-600">
                        {renderCell(stats.price, '25th', formatPrice)}
                      </td>
                      <td className="p-2 text-center font-semibold text-gray-800">
                        {renderCell(stats.price, 'median', formatPrice)}
                      </td>
                      <td className="p-2 text-center text-gray-600 border-r border-dotted border-gray-300">
                        {renderCell(stats.price, '75th', formatPrice)}
                      </td>
                      <td className="p-2 text-center text-gray-600">
                        {renderCell(stats.psf, '25th', formatPSF)}
                      </td>
                      <td className="p-2 text-center font-semibold text-gray-800">
                        {renderCell(stats.psf, 'median', formatPSF)}
                      </td>
                      <td className="p-2 text-center text-gray-600">
                        {renderCell(stats.psf, '75th', formatPSF)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td
                          className="p-0 bg-gray-50"
                          colSpan={8}
                        >
                          <div className="px-3 py-4 md:px-5 md:py-5 border-t border-gray-200">
                            {priceLoadingDistricts[key] ? (
                              <div className="text-center text-gray-500 text-xs md:text-sm py-4">
                                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 mr-2"></div>
                                Loading project breakdown...
                              </div>
                            ) : projects.length === 0 ? (
                              <div className="text-center text-gray-500 text-xs md:text-sm py-4">
                                No project data available
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-[11px] md:text-xs lg:text-sm min-w-[640px]">
                                  <thead>
                                    <tr className="border-b-2 border-gray-200 bg-white">
                                      <th className="p-2 text-left font-semibold">
                                        Project
                                      </th>
                                      <th className="p-2 text-center font-semibold" colSpan={3}>
                                        Price (SGD)
                                      </th>
                                      <th className="p-2 text-center font-semibold" colSpan={3}>
                                        PSF (SGD)
                                      </th>
                                      <th className="p-2 text-center font-semibold">
                                        Count
                                      </th>
                                    </tr>
                                    <tr className="border-b border-gray-200 bg-gray-50 text-[10px] md:text-[11px] text-gray-500">
                                      <th className="p-2 text-left" />
                                      <th className="p-2 text-center">25th</th>
                                      <th className="p-2 text-center">Median</th>
                                      <th className="p-2 text-center">75th</th>
                                      <th className="p-2 text-center">25th</th>
                                      <th className="p-2 text-center">Median</th>
                                      <th className="p-2 text-center">75th</th>
                                      <th className="p-2 text-center">Txn</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {projects.map((project, idx2) => {
                                      // API returns: price_25th, price_median, price_75th, psf_25th, psf_median, psf_75th, count
                                      const price25th = project.price_25th;
                                      const priceMedian = project.price_median;
                                      const price75th = project.price_75th;
                                      const psf25th = project.psf_25th;
                                      const psfMedian = project.psf_median;
                                      const psf75th = project.psf_75th;
                                      const count = project.count || 0;

                                      return (
                                        <tr
                                          key={idx2}
                                          className={`border-b border-gray-100 ${
                                            idx2 % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                          }`}
                                        >
                                          <td className="p-2 font-medium text-[11px] md:text-xs text-gray-800">
                                            {project.project_name}
                                            {project.sale_type_label && (
                                              <span
                                                className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                  project.sale_type_label === 'New Launch'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-emerald-100 text-emerald-700'
                                                }`}
                                              >
                                                {project.sale_type_label}
                                              </span>
                                            )}
                                          </td>
                                          <td className="p-2 text-center text-gray-600">
                                            {price25th != null ? formatPrice(price25th) : '-'}
                                          </td>
                                          <td className="p-2 text-center font-semibold text-gray-800">
                                            {priceMedian != null ? formatPrice(priceMedian) : '-'}
                                          </td>
                                          <td className="p-2 text-center text-gray-600">
                                            {price75th != null ? formatPrice(price75th) : '-'}
                                          </td>
                                          <td className="p-2 text-center text-gray-600">
                                            {psf25th != null ? formatPSF(psf25th) : '-'}
                                          </td>
                                          <td className="p-2 text-center font-semibold text-gray-800">
                                            {psfMedian != null ? formatPSF(psfMedian) : '-'}
                                          </td>
                                          <td className="p-2 text-center text-gray-600">
                                            {psf75th != null ? formatPSF(psf75th) : '-'}
                                          </td>
                                          <td className="p-2 text-center text-gray-700">
                                            {count ? count.toLocaleString() : '-'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {/* Note about excluded districts */}
          {Object.keys(excludedDistricts).length > 0 && (
            <p className="mt-3 text-[11px] md:text-xs text-gray-500">
              The following districts were excluded from this view due to fewer than
              5 transactions in the selected timeframe:{' '}
              {Object.keys(excludedDistricts)
                .sort()
                .map((d, i) => {
                  const name = DISTRICT_NAMES[d]
                    ? `${d}: ${DISTRICT_NAMES[d]}`
                    : d;
                  return (
                    <span key={d}>
                      {i > 0 ? ', ' : ''}
                      {name}
                    </span>
                  );
                })}
              .
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Dashboard() {
  // Get centralized data from context (districts, metadata)
  const { availableDistricts, apiMetadata, loading: contextLoading } = useData();
  
  const [selectedBedrooms, setSelectedBedrooms] = useState(['2b', '3b', '4b']);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [priceTrends, setPriceTrends] = useState([]);
  const [volumeData, setVolumeData] = useState([]);
  const [psfData, setPsfData] = useState([]);
  const [saleTypeTrends, setSaleTypeTrends] = useState([]);
  const [priceTrendsBySaleType, setPriceTrendsBySaleType] = useState({});
  const [priceTrendsByRegion, setPriceTrendsByRegion] = useState([]);
  const [psfTrendsByRegion, setPsfTrendsByRegion] = useState([]);
  const [saleTypeSegment, setSaleTypeSegment] = useState(null);
  const [marketStats, setMarketStats] = useState(null);
  const [marketStatsByDistrict, setMarketStatsByDistrict] = useState(null);
  const [buyBoxResult, setBuyBoxResult] = useState(null);
  const [buyBoxLoading, setBuyBoxLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoize transaction count chart data
  const transactionCountData = useMemo(() => {
    if (!priceTrends || priceTrends.length === 0) return [];
    return priceTrends.map(d => ({
      month: d.month,
      '2b_count': d['2b_count'] || 0,
      '3b_count': d['3b_count'] || 0,
      '4b_count': d['4b_count'] || 0
    }));
  }, [priceTrends]);

  // Memoize PSF trends data
  const psfTrendsData = useMemo(() => {
    if (!priceTrends || priceTrends.length === 0) return [];
    return priceTrends.map(d => ({
      month: d.month || d.quarter || '',
      '2b_price': d['2b_psf'] != null ? d['2b_psf'] : null,
      '3b_price': d['3b_psf'] != null ? d['3b_psf'] : null,
      '4b_price': d['4b_psf'] != null ? d['4b_psf'] : null,
      '2b_count': d['2b_count'] || 0,
      '3b_count': d['3b_count'] || 0,
      '4b_count': d['4b_count'] || 0,
      '2b_low_sample': d['2b_low_sample'] || false,
      '3b_low_sample': d['3b_low_sample'] || false,
      '4b_low_sample': d['4b_low_sample'] || false
    }));
  }, [priceTrends]);

  // Fetch main data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const bedroomParam = selectedBedrooms.map(b => b.replace('b', '')).join(',');
      const params = {
        bedroom: bedroomParam,
        districts: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        segment: selectedSegment || undefined,
        limit: 200000
      };

      try {
        const [trendsRes, volumeRes, psfRes, saleTypeRes, priceRegionRes, psfRegionRes] = await Promise.all([
          getPriceTrends(params),
          getTotalVolume(params),
          getAvgPsf(params),
          getSaleTypeTrends(params).catch(() => ({ data: { trends: [] } })),
          getPriceTrendsByRegion(params).catch(() => ({ data: { trends: [] } })),
          getPsfTrendsByRegion(params).catch(() => ({ data: { trends: [] } }))
        ]);

        setPriceTrends(trendsRes.data.trends || []);
        setVolumeData(volumeRes.data.data || []);
        setPsfData(psfRes.data.data || []);
        setSaleTypeTrends(saleTypeRes.data.trends || []);
        setPriceTrendsByRegion(priceRegionRes.data.trends || []);
        setPsfTrendsByRegion(psfRegionRes.data.trends || []);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedBedrooms, selectedDistrict, selectedSegment]);

  // Fetch market-wide stats once (pre-computed dual-view analytics)
  useEffect(() => {
    const fetchMarketStats = async () => {
      try {
        const [marketRes, marketDistRes] = await Promise.all([
          getMarketStats().catch(() => ({ data: null })),
          getMarketStatsByDistrict().catch(() => ({ data: null }))
        ]);
        setMarketStats(marketRes.data || null);
        setMarketStatsByDistrict(marketDistRes.data || null);
      } catch (err) {
        console.error('Error fetching market stats:', err);
      }
    };
    fetchMarketStats();
  }, []);

  // Fetch price trends by sale type separately
  useEffect(() => {
    const fetchSaleTypePriceTrends = async () => {
      const bedroomParam = selectedBedrooms.map(b => b.replace('b', '')).join(',');
      const params = {
        bedroom: bedroomParam,
        districts: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        segment: saleTypeSegment || undefined
      };

      try {
        const res = await getPriceTrendsBySaleType(params);
        setPriceTrendsBySaleType(res.data.trends || {});
      } catch (err) {
        console.error('Error fetching price trends by sale type:', err);
        setPriceTrendsBySaleType({});
      }
    };
    fetchSaleTypePriceTrends();
  }, [selectedBedrooms, selectedDistrict, saleTypeSegment]);

  const runBuyBoxAnalysis = async () => {
    setBuyBoxLoading(true);
    try {
      const params = {
        target_price: 2500000,
        band: 100000,
        bedroom: selectedBedrooms.map(b => b.replace('b', '')).join(','),
        districts: selectedDistrict !== 'all' ? selectedDistrict : undefined
      };
      const res = await getComparableValueAnalysis(params);
      setBuyBoxResult(res.data || null);
    } catch (err) {
      console.error('Error running comparable value analysis:', err);
      setBuyBoxResult(null);
    } finally {
      setBuyBoxLoading(false);
    }
  };

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-red-600 font-semibold mb-3 text-lg">⚠️ Connection Error</h2>
          <p className="text-red-800 mb-4 text-sm md:text-base">
            Cannot connect to API. Please start the Flask backend:
          </p>
          <code className="block bg-red-100 p-3 rounded-md text-red-900 text-xs md:text-sm">
            cd backend && python app.py
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-8 max-w-7xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
          Singapore Private Condo Resale Statistics
        </h1>
        <p className="text-sm md:text-base text-gray-600">
          Transaction data breakdown by postal district and bedroom type
        </p>
        {apiMetadata && (
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            {apiMetadata.row_count?.toLocaleString?.() || apiMetadata.row_count} transactions ·
            {' '}last updated {apiMetadata.last_updated || 'n/a'}
          </p>
        )}
      </div>

      {/* Filters */}
      <Card>
        <GlobalFilterBar
          selectedBedrooms={selectedBedrooms}
          setSelectedBedrooms={setSelectedBedrooms}
          selectedSegment={selectedSegment}
          setSelectedSegment={setSelectedSegment}
          selectedDistrict={selectedDistrict}
          setSelectedDistrict={setSelectedDistrict}
          availableDistricts={availableDistricts}
        />
      </Card>

      {(loading || contextLoading) ? (
        <div className="text-center py-12 md:py-16 text-gray-500">
          <div className="text-3xl md:text-4xl mb-3">⏳</div>
          <div className="text-sm md:text-base">Loading data...</div>
        </div>
      ) : (
        <>
          {/* Chart 1: Price Trends */}
          <Card title="📈 Price Trend by Quarter (Median Price & Median Price by Region)">
            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-2 md:overflow-visible md:snap-none">
              <div className="snap-center min-w-[90vw] md:min-w-0 md:snap-none">
                <div className="bg-white p-2 md:p-4 rounded-lg">
                  <LineChart
                    data={priceTrends}
                    selectedBedrooms={selectedBedrooms}
                    valueFormatter={formatPrice}
                    title="Median Price"
                  />
                </div>
              </div>
              {priceTrendsByRegion && priceTrendsByRegion.length > 0 && (
                <div className="snap-center min-w-[90vw] md:min-w-0 md:snap-none">
                  <div className="bg-white p-2 md:p-4 rounded-lg">
                    <RegionChart
                      data={priceTrendsByRegion}
                      valueFormatter={formatPrice}
                      title="Median Price by Region"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Chart 2: PSF Trends */}
          <Card title="📊 PSF Trend by Quarter (Median PSF & Median PSF by Region)">
            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-2 md:overflow-visible md:snap-none">
              <div className="snap-center min-w-[90vw] md:min-w-0 md:snap-none">
                <div className="bg-white p-2 md:p-4 rounded-lg">
                  <LineChart
                    data={psfTrendsData}
                    selectedBedrooms={selectedBedrooms}
                    valueFormatter={formatPSF}
                    title="Median PSF"
                  />
                </div>
              </div>
              {psfTrendsByRegion && psfTrendsByRegion.length > 0 && (
                <div className="snap-center min-w-[90vw] md:min-w-0 md:snap-none">
                  <div className="bg-white p-2 md:p-4 rounded-lg">
                    <RegionChart
                      data={psfTrendsByRegion}
                      valueFormatter={formatPSF}
                      title="Median PSF by Region"
                      isPSF={true}
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Chart: Transaction Count by Bedroom Type */}
          {transactionCountData && transactionCountData.length > 0 && (
            <Card title="📊 Transaction Count by Bedroom Type">
              <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory md:block md:overflow-visible md:snap-none">
                <div className="snap-center min-w-[90vw] md:min-w-0 md:snap-none">
                  <div className="min-w-[400px] md:min-w-0">
                    <BarChart
                      data={transactionCountData}
                      selectedBedrooms={selectedBedrooms}
                      title="Transaction Count"
                      beginAtZero={true}
                    />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Chart: New Sale vs Resale Transaction Count */}
          {saleTypeTrends.length > 0 && (
            <Card title="📊 Transaction Count: New Sale vs Resale">
              <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory md:block md:overflow-visible md:snap-none">
                <div className="snap-center min-w-[90vw] md:min-w-0 md:snap-none">
                  <div className="min-w-[400px] md:min-w-0">
                    <SaleTypeChart data={saleTypeTrends} />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* District Summary (Volume & Liquidity) */}
          <DistrictSummaryVolumeLiquidity
            selectedBedrooms={selectedBedrooms}
            selectedSegment={selectedSegment}
            volumeData={volumeData}
          />

          {/* Chart: Median Price by Sale Type */}
          {Object.keys(priceTrendsBySaleType).length > 0 && (
            <Card title="📈 Median Price: New Sale vs Resale by Bedroom Type">
              <div className="mb-4">
                <label className="block mb-2 text-xs md:text-sm font-medium text-gray-700">
                  Market Segment (for this chart only)
                </label>
                <select
                  value={saleTypeSegment || 'all'}
                  onChange={(e) => setSaleTypeSegment(e.target.value === 'all' ? null : e.target.value)}
                  className="w-full md:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[120px] md:min-w-[150px]"
                >
                  <option value="all">All Segments</option>
                  <option value="CCR">CCR</option>
                  <option value="RCR">RCR</option>
                  <option value="OCR">OCR</option>
                </select>
              </div>
              <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-2 md:overflow-visible md:snap-none">
                {selectedBedrooms.map(bedroom => {
                  // Backend keys are '2b', '3b', '4b', so use the bedroom code directly
                  const saleTypeData = priceTrendsBySaleType[bedroom];

                  // Backend returns: { trends: { '2b': [ { quarter, new_sale, resale }, ... ], ... } }
                  // After API call we store res.data.trends directly, so saleTypeData is an array of points.
                  if (!saleTypeData || !Array.isArray(saleTypeData) || saleTypeData.length === 0) {
                    return null;
                  }

                  return (
                    <div key={bedroom} className="snap-center min-w-[90vw] md:min-w-0 md:snap-none">
                      <div className="bg-white p-2 md:p-4 rounded-lg">
                        <h3 className="text-xs md:text-sm text-gray-600 mb-3">
                          {BEDROOM_LABELS[bedroom]}
                        </h3>
                        <LineChart
                          data={saleTypeData.map(d => ({
                            month: d.quarter,
                            // Map New Sale to "2b" line and Resale to "3b" line for legend consistency
                            '2b_price': d.new_sale,
                            '3b_price': d.resale,
                            '4b_price': null,
                          }))}
                          selectedBedrooms={['2b', '3b']}
                          valueFormatter={formatPrice}
                          title=""
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* District Summary (Price) with local filters */}
          <DistrictSummaryPrice
            selectedSegment={selectedSegment}
            selectedDistrict={selectedDistrict}
          />

          {/* Comparable Value Analysis (Buy Box) */}
          <Card title="🎯 Comparable Value Analysis (Buy Box)">
            <p className="text-xs md:text-sm text-gray-600 mb-3">
              Find transactions around a target price band for the selected bedroom types and (optionally) district.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 items-end mb-4">
              <div className="w-full sm:w-auto">
                <label className="block mb-1 text-xs md:text-sm font-medium text-gray-700">
                  Target Price (SGD)
                </label>
                <input
                  type="number"
                  defaultValue={2500000}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value || '0');
                    setBuyBoxResult(prev => prev ? { ...prev, _target_price: value } : prev);
                  }}
                  className="w-full sm:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[140px] md:min-w-[160px]"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="block mb-1 text-xs md:text-sm font-medium text-gray-700">
                  Band (± SGD)
                </label>
                <input
                  type="number"
                  defaultValue={100000}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value || '0');
                    setBuyBoxResult(prev => prev ? { ...prev, _band: value } : prev);
                  }}
                  className="w-full sm:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[120px] md:min-w-[140px]"
                />
              </div>
              <button
                type="button"
                onClick={runBuyBoxAnalysis}
                disabled={buyBoxLoading}
                className={`w-full sm:w-auto px-4 md:px-5 py-2 md:py-2.5 rounded-md border-none bg-blue-600 text-white font-medium text-xs md:text-sm cursor-pointer transition-opacity ${
                  buyBoxLoading ? 'opacity-70 cursor-default' : 'hover:bg-blue-700'
                }`}
              >
                {buyBoxLoading ? 'Running analysis...' : 'Run Analysis'}
              </button>
            </div>

            {buyBoxResult && (
              <>
                <p className="text-xs md:text-sm text-gray-600 mb-2">
                  Found <strong>{buyBoxResult.summary?.count ?? 0}</strong> comparable transactions.
                </p>
                {buyBoxResult.points && buyBoxResult.points.length > 0 && (
                  <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs md:text-sm min-w-[500px]">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="text-left p-2 border-b border-gray-200">Project</th>
                            <th className="text-right p-2 border-b border-gray-200">District</th>
                            <th className="text-right p-2 border-b border-gray-200">Price</th>
                            <th className="text-right p-2 border-b border-gray-200">PSF</th>
                            <th className="text-right p-2 border-b border-gray-200">Bedrooms</th>
                          </tr>
                        </thead>
                        <tbody>
                          {buyBoxResult.points.slice(0, 50).map((p, idx) => (
                            <tr key={idx}>
                              <td className="p-2 border-b border-gray-200">{p.project_name}</td>
                              <td className="p-2 border-b border-gray-200 text-right">
                                {p.district
                                  ? `${p.district}${
                                      DISTRICT_NAMES[p.district]
                                        ? `: ${DISTRICT_NAMES[p.district]}`
                                        : ''
                                    }`
                                  : '-'}
                              </td>
                              <td className="p-2 border-b border-gray-200 text-right">
                                {p.price ? formatPrice(p.price) : '-'}
                              </td>
                              <td className="p-2 border-b border-gray-200 text-right">
                                {p.psf ? formatPSF(p.psf) : '-'}
                              </td>
                              <td className="p-2 border-b border-gray-200 text-right">{p.bedroom_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default Dashboard;
