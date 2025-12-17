import React, { useEffect, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import { getMarketStatsByDistrict, getPriceProjectsByDistrict, getTotalVolume } from '../api/client';
import { DISTRICT_NAMES, formatPrice, formatPSF } from '../constants';
import { Card } from '../components/ui/Card';
import { DistrictVolumeTable } from '../components/district/DistrictVolumeTable';

// District Summary (Price) – now driven by global filters from FilterBar
function DistrictPriceAnalysis() {
  const { filters } = useFilters();
  const selectedBedrooms = filters?.bedrooms || ['2b', '3b', '4b'];
  const selectedSegment = filters?.segment === 'All Segments' ? null : filters?.segment;
  const selectedDistrict = filters?.district === 'All Districts' ? 'all' : filters?.district;

  const [priceSortBy, setPriceSortBy] = useState('median_price');
  const [priceSortTimeframe, setPriceSortTimeframe] = useState('short_term');
  const [priceSectionLoading, setPriceSectionLoading] = useState(false);
  const [priceStatsByDistrict, setPriceStatsByDistrict] = useState({
    short_term: { by_district: {} },
    long_term: { by_district: {} },
  });
  const [priceDistrictProjects, setPriceDistrictProjects] = useState({});
  const [priceExpandedDistricts, setPriceExpandedDistricts] = useState({});
  const [priceLoadingDistricts, setPriceLoadingDistricts] = useState({});
  const [excludedDistricts, setExcludedDistricts] = useState({});

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

  const fetchPriceDistrictProjects = async (district, monthsForView) => {
    const viewKey = monthsForView === 3 ? 'short_term' : 'long_term';
    const key = `${district}_${viewKey}`;
    if (priceDistrictProjects[key]) return;

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

      const validatedProjects = projects.filter((project) => {
        if (!project || !project.project_name) return false;
        if (!project.count || project.count < 3) return false;
        return true;
      });

      const totalCount = validatedProjects.reduce((sum, p) => sum + (p.count || 0), 0);

      if (totalCount < 5) {
        setExcludedDistricts((prev) => ({ ...prev, [district]: true }));
        setPriceDistrictProjects((prev) => ({ ...prev, [key]: [] }));
      } else {
        setPriceDistrictProjects((prev) => ({ ...prev, [key]: validatedProjects }));
      }
    } catch (err) {
      console.error('Error fetching price projects by district:', err);
      setPriceDistrictProjects((prev) => ({ ...prev, [`${district}_${monthsForView === 3 ? 'short_term' : 'long_term'}`]: [] }));
    } finally {
      setPriceLoadingDistricts((prev) => ({ ...prev, [`${district}_${monthsForView === 3 ? 'short_term' : 'long_term'}`]: false }));
    }
  };

  const togglePriceDistrict = (district) => {
    const isExpanded = !!priceExpandedDistricts[district];
    setPriceExpandedDistricts((prev) => ({ ...prev, [district]: !isExpanded }));

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
    sortedDistricts.sort((a, b) => (byDistrict[b]?.price?.median || 0) - (byDistrict[a]?.price?.median || 0));
  } else if (priceSortBy === 'median_psf') {
    sortedDistricts.sort((a, b) => (byDistrict[b]?.psf?.median || 0) - (byDistrict[a]?.psf?.median || 0));
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
      {/* Sort controls */}
      <div className="mb-4 p-3 md:p-4 bg-gray-50 rounded-lg flex flex-wrap items-center gap-3 md:gap-4">
        <span className="text-xs md:text-sm font-medium text-gray-700">Sort by:</span>
        <button
          type="button"
          onClick={() => setPriceSortBy((prev) => (prev === 'median_price' ? 'none' : 'median_price'))}
          className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium border-none cursor-pointer transition-colors ${
            priceSortBy === 'median_price' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          Median Price
        </button>
        <button
          type="button"
          onClick={() => setPriceSortBy((prev) => (prev === 'median_psf' ? 'none' : 'median_psf'))}
          className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium border-none cursor-pointer transition-colors ${
            priceSortBy === 'median_psf' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          Median PSF
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2 md:gap-3">
          <span className="text-[11px] md:text-xs text-gray-500">Sort timeframe:</span>
          <button
            type="button"
            onClick={() => setPriceSortTimeframe('short_term')}
            className={`px-2.5 py-1 rounded-md text-[11px] md:text-xs font-medium border-none cursor-pointer transition-colors ${
              priceSortTimeframe === 'short_term' ? 'bg-gray-700 text-gray-100' : 'bg-gray-200 text-gray-500'
            }`}
          >
            Last 3 Months (Pulse)
          </button>
          <button
            type="button"
            onClick={() => setPriceSortTimeframe('long_term')}
            className={`px-2.5 py-1 rounded-md text-[11px] md:text-xs font-medium border-none cursor-pointer transition-colors ${
              priceSortTimeframe === 'long_term' ? 'bg-gray-700 text-gray-100' : 'bg-gray-200 text-gray-500'
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
            {priceSortTimeframe === 'short_term' ? 'Last 3 months (Short-term view)' : 'Last 15 months (Long-term view)'}
          </div>
          <p className="text-[11px] md:text-xs text-gray-500 mb-3 text-center">
            *NA indicates insufficient sample size for reliable statistics.
          </p>

          <table className="w-full border-collapse text-[11px] md:text-xs lg:text-sm min-w-[640px]">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50">
                <th className="p-2 text-left font-semibold" />
                <th className="p-2 text-left font-semibold">District</th>
                <th className="p-2 text-center font-semibold border-r border-dotted border-gray-300" colSpan={3}>Price (SGD)</th>
                <th className="p-2 text-center font-semibold" colSpan={3}>PSF (SGD)</th>
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
                if (excludedDistricts[districtCode]) return null;
                const stats = byDistrict[districtCode];
                if (!stats) return null;

                const key = `${districtCode}_${viewKey}`;
                const isExpanded = !!priceExpandedDistricts[districtCode];
                const projects = priceDistrictProjects[key] || [];
                const label = DISTRICT_NAMES[districtCode] ? `${districtCode}: ${DISTRICT_NAMES[districtCode]}` : districtCode;

                return (
                  <React.Fragment key={districtCode}>
                    <tr
                      className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} cursor-pointer`}
                      onClick={() => togglePriceDistrict(districtCode)}
                    >
                      <td className="p-2 text-center text-gray-500">
                        <span className={`inline-block transform text-xs transition-transform ${isExpanded ? 'rotate-90' : 'rotate-0'}`}>▶</span>
                      </td>
                      <td className="p-2 font-medium text-[11px] md:text-xs text-gray-800">{label}</td>
                      <td className="p-2 text-center text-gray-600">{renderCell(stats.price, '25th', formatPrice)}</td>
                      <td className="p-2 text-center font-semibold text-gray-800">{renderCell(stats.price, 'median', formatPrice)}</td>
                      <td className="p-2 text-center text-gray-600 border-r border-dotted border-gray-300">{renderCell(stats.price, '75th', formatPrice)}</td>
                      <td className="p-2 text-center text-gray-600">{renderCell(stats.psf, '25th', formatPSF)}</td>
                      <td className="p-2 text-center font-semibold text-gray-800">{renderCell(stats.psf, 'median', formatPSF)}</td>
                      <td className="p-2 text-center text-gray-600">{renderCell(stats.psf, '75th', formatPSF)}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td className="p-0 bg-gray-50" colSpan={8}>
                          <div className="px-3 py-4 md:px-5 md:py-5 border-t border-gray-200">
                            {priceLoadingDistricts[key] ? (
                              <div className="text-center text-gray-500 text-xs md:text-sm py-4">
                                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 mr-2"></div>
                                Loading project breakdown...
                              </div>
                            ) : projects.length === 0 ? (
                              <div className="text-center text-gray-500 text-xs md:text-sm py-4">No project data available</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-[11px] md:text-xs lg:text-sm min-w-[640px]">
                                  <thead>
                                    <tr className="border-b-2 border-gray-200 bg-white">
                                      <th className="p-2 text-left font-semibold">Project</th>
                                      <th className="p-2 text-center font-semibold" colSpan={3}>Price (SGD)</th>
                                      <th className="p-2 text-center font-semibold" colSpan={3}>PSF (SGD)</th>
                                      <th className="p-2 text-center font-semibold">Count</th>
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
                                    {projects.map((project, idx2) => (
                                      <tr key={idx2} className={`border-b border-gray-100 ${idx2 % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                        <td className="p-2 font-medium text-[11px] md:text-xs text-gray-800">
                                          {project.project_name}
                                          {project.sale_type_label && (
                                            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                              project.sale_type_label === 'New Launch'
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                            }`}>
                                              {project.sale_type_label}
                                            </span>
                                          )}
                                        </td>
                                        <td className="p-2 text-center text-gray-600">{project.price_25th != null ? formatPrice(project.price_25th) : '-'}</td>
                                        <td className="p-2 text-center font-semibold text-gray-800">{project.price_median != null ? formatPrice(project.price_median) : '-'}</td>
                                        <td className="p-2 text-center text-gray-600">{project.price_75th != null ? formatPrice(project.price_75th) : '-'}</td>
                                        <td className="p-2 text-center text-gray-600">{project.psf_25th != null ? formatPSF(project.psf_25th) : '-'}</td>
                                        <td className="p-2 text-center font-semibold text-gray-800">{project.psf_median != null ? formatPSF(project.psf_median) : '-'}</td>
                                        <td className="p-2 text-center text-gray-600">{project.psf_75th != null ? formatPSF(project.psf_75th) : '-'}</td>
                                        <td className="p-2 text-center text-gray-800">{(project.count || 0).toLocaleString()}</td>
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
      )}
    </Card>
  );
}

// District Volume Analysis - wrapper using shared DistrictVolumeTable component
function DistrictVolumeAnalysis() {
  const { filters } = useFilters();
  const selectedBedrooms = filters?.bedrooms || ['2b', '3b', '4b'];
  const selectedSegment = filters?.segment === 'All Segments' ? null : filters?.segment;
  const selectedDistrict = filters?.district === 'All Districts' ? 'all' : filters?.district;

  const [volumeData, setVolumeData] = useState([]);
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

  if (loading) {
    return (
      <Card title="📋 District Summary (Volume & Liquidity)">
        <div className="text-center py-10 text-gray-500 text-sm md:text-base">
          <div className="text-2xl md:text-3xl mb-2">⏳</div>
          <div>Loading volume data...</div>
        </div>
      </Card>
    );
  }

  return (
    <DistrictVolumeTable
      volumeData={volumeData}
      selectedBedrooms={selectedBedrooms}
      selectedSegment={selectedSegment}
      minTransactions={0}
      showExcludedNote={false}
    />
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
        <DistrictVolumeAnalysis />
        <DistrictPriceAnalysis />
      </div>
    </div>
  );
}
