import React, { useEffect, useState } from 'react';
import { FilterBar } from '../components/dashboard/FilterBar';
import { useFilters } from '../context/FilterContext';
import { getMarketStatsByDistrict, getPriceProjectsByDistrict, getTotalVolume, getProjectsByDistrict } from '../api/client';

// Reuse district names mapping for nicer labels
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

const BEDROOM_LABELS = {
  '2b': '2-Bedroom',
  '3b': '3-Bedroom',
  '4b': '4-Bedroom',
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

function Card({ title, children, subtitle, className }) {
  return (
    <div className={`bg-white rounded-xl p-4 md:p-6 mb-6 shadow-md ${className || ''}`}>
      {title && (
        <div className="mb-4">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-1">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// District Summary (Price) – now driven by global filters from FilterBar
function DistrictPriceAnalysis() {
  const { filters } = useFilters();
  const selectedBedrooms = filters?.bedrooms || ['2b', '3b', '4b'];
  const selectedSegment = filters?.segment === 'All Segments' ? null : filters?.segment;
  const selectedDistrict = filters?.district === 'All Districts' ? 'all' : filters?.district;

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

  // Fetch stats using global bedroom / segment / district filters
  useEffect(() => {
    const emptyStats = {
      short_term: { by_district: {} },
      long_term: { by_district: {} },
    };

    const fetchMarketStats = async () => {
      if (!selectedBedrooms || selectedBedrooms.length === 0) {
        setPriceStatsByDistrict(emptyStats);
        setPriceSectionLoading(false);
        return;
      }

      setPriceSectionLoading(true);
      try {
        const bedroomParam = selectedBedrooms.map((b) => b.replace('b', '')).join(',');

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
  }, [selectedBedrooms, selectedDistrict, selectedSegment]);

  // Fetch project-level price/psf stats for a district when expanded
  const fetchPriceDistrictProjects = async (district, monthsForView) => {
    const viewKey = monthsForView === 3 ? 'short_term' : 'long_term';
    const key = `${district}_${viewKey}`;
    if (priceDistrictProjects[key]) return;

    // Set loading state
    setPriceLoadingDistricts((prev) => ({ ...prev, [key]: true }));

    try {
      const bedroomParam = selectedBedrooms.map((b) => b.replace('b', '')).join(',');
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
      {/* Bedroom filter UI removed – this section now uses the global filters above */}

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

                const viewKeyRow = priceSortTimeframe === 'short_term' ? 'short_term' : 'long_term';
                const key = `${districtCode}_${viewKeyRow}`;
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
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
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
                                          <td className="p-2 text-center text-gray-800">
                                            {count.toLocaleString()}
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
      )}
    </Card>
  );
}

// District Summary (Volume & Liquidity) – driven by global filters
function DistrictVolumeAnalysis() {
  const { filters } = useFilters();
  const selectedBedrooms = filters?.bedrooms || ['2b', '3b', '4b'];
  const selectedSegment = filters?.segment === 'All Segments' ? null : filters?.segment;
  const selectedDistrict = filters?.district === 'All Districts' ? 'all' : filters?.district;

  const [sortBy, setSortBy] = useState('total'); // 'total' | 'quantity' | 'district'
  const [volumeData, setVolumeData] = useState([]);
  const [expandedDistricts, setExpandedDistricts] = useState({});
  const [districtProjects, setDistrictProjects] = useState({});
  const [loadingDistricts, setLoadingDistricts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVolume = async () => {
      setLoading(true);
      setError(null);
      const bedroomParam = selectedBedrooms.map((b) => b.replace('b', '')).join(',');
      const params = {
        bedroom: bedroomParam,
        districts: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        segment: selectedSegment || undefined,
        limit: 200000,
      };

      try {
        const res = await getTotalVolume(params);
        setVolumeData(res.data.data || []);
      } catch (err) {
        console.error('Error fetching volume data:', err);
        setError(err.message);
        setVolumeData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVolume();
  }, [selectedBedrooms, selectedDistrict, selectedSegment]);

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

    setLoadingDistricts((prev) => ({ ...prev, [district]: true }));

    try {
      const bedroomParam = selectedBedrooms.map((b) => b.replace('b', '')).join(',');
      const res = await getProjectsByDistrict(district, {
        bedroom: bedroomParam,
        segment: selectedSegment || undefined,
      });
      const projects = res.data?.projects || [];

      const validatedProjects = projects.filter((project) => {
        if (!project.project_name) return false;
        return true;
      });

      setDistrictProjects((prev) => ({
        ...prev,
        [district]: validatedProjects,
      }));
    } catch (err) {
      console.error('Error fetching district projects (volume & liquidity):', err);
      setDistrictProjects((prev) => ({
        ...prev,
        [district]: [],
      }));
    } finally {
      setLoadingDistricts((prev) => ({ ...prev, [district]: false }));
    }
  };

  const getDistrictLabel = (district) =>
    DISTRICT_NAMES[district] ? `${district}: ${DISTRICT_NAMES[district]}` : district;

  if (error) {
    return (
      <Card title="📋 District Summary (Volume & Liquidity)">
        <div className="text-center py-10 text-gray-500 text-sm md:text-base">
          <div className="text-2xl md:text-3xl mb-2">⚠️</div>
          <div>Unable to load volume data. Please try again.</div>
        </div>
      </Card>
    );
  }

  if (!volumeData || volumeData.length === 0) {
    return null;
  }

  const filteredVolumeData = [...volumeData];

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
                        <td className="p-0 bg-gray-50" colSpan={2 + selectedBedrooms.length * 2 + 2}>
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
                                    {projects.map((project, idx2) => (
                                      <tr
                                        key={idx2}
                                        className={`border-b border-gray-100 ${
                                          idx2 % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                        }`}
                                      >
                                        <td className="p-2 font-medium text-[11px] md:text-xs text-gray-800">
                                          {project.project_name}
                                        </td>
                                        {selectedBedrooms.includes('2b') && (
                                          <>
                                            <td className="p-2 text-right text-gray-800">
                                              {project['2b'] != null ? formatPrice(project['2b']) : '-'}
                                            </td>
                                            <td className="p-2 text-right text-gray-500">
                                              {(project['2b_count'] || 0).toLocaleString()}
                                            </td>
                                          </>
                                        )}
                                        {selectedBedrooms.includes('3b') && (
                                          <>
                                            <td className="p-2 text-right text-gray-800">
                                              {project['3b'] != null ? formatPrice(project['3b']) : '-'}
                                            </td>
                                            <td className="p-2 text-right text-gray-500">
                                              {(project['3b_count'] || 0).toLocaleString()}
                                            </td>
                                          </>
                                        )}
                                        {selectedBedrooms.includes('4b') && (
                                          <>
                                            <td className="p-2 text-right text-gray-800">
                                              {project['4b'] != null ? formatPrice(project['4b']) : '-'}
                                            </td>
                                            <td className="p-2 text-right text-gray-500">
                                              {(project['4b_count'] || 0).toLocaleString()}
                                            </td>
                                          </>
                                        )}
                                        <td className="p-2 text-right font-semibold text-gray-800">
                                          {(project.total_quantity || 0).toLocaleString()}
                                        </td>
                                        <td className="p-2 text-right font-semibold text-gray-900">
                                          {project.total != null ? formatPrice(project.total) : '-'}
                                        </td>
                                      </tr>
                                    ))}
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
    </Card>
  );
}

export function Districts() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 px-6">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
          Analyze by Districts
        </h1>
        <p className="text-slate-500 text-base font-medium">
          Deep dive into district-level market trends and statistics.
        </p>
      </div>

      <div className="px-6 space-y-6">
        <FilterBar />
        <DistrictVolumeAnalysis />
        <DistrictPriceAnalysis />
      </div>
    </div>
  );
}
