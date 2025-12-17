import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useFilters } from '../context/FilterContext';
import {
  getPriceTrends,
  getTotalVolume,
  getMarketStats,
  getMarketStatsByDistrict,
  getComparableValueAnalysis,
} from '../api/client';
import { FilterBar } from '../components/dashboard/FilterBar';
import { KPICards } from '../components/dashboard/KPICards';
import { TopDistricts } from '../components/dashboard/TopDistricts';
import { DistrictSummaryTable } from '../components/dashboard/DistrictSummaryTable';
import { DISTRICT_NAMES, formatPrice, formatPSF } from '../constants';
import { Card } from '../components/ui/Card';

function Dashboard() {
  // Get centralized data from context (districts, metadata)
  const { availableDistricts, apiMetadata, loading: contextLoading } = useData();
  
  // Use FilterContext for filter state
  const { filters } = useFilters();
  
  // Convert FilterContext format to Dashboard format
  const selectedBedrooms = filters.bedrooms || ['2b', '3b', '4b'];
  const selectedSegment = filters.segment === 'All Segments' ? null : filters.segment;
  const selectedDistrict = filters.district === 'All Districts' ? 'all' : filters.district;
  const [priceTrends, setPriceTrends] = useState([]);
  const [volumeData, setVolumeData] = useState([]);
  const [marketStats, setMarketStats] = useState(null);
  const [marketStatsByDistrict, setMarketStatsByDistrict] = useState(null);
  const [buyBoxResult, setBuyBoxResult] = useState(null);
  const [buyBoxLoading, setBuyBoxLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        const [trendsRes, volumeRes] = await Promise.all([
          getPriceTrends(params),
          getTotalVolume(params),
        ]);

        setPriceTrends(trendsRes.data.trends || []);
        setVolumeData(volumeRes.data.data || []);
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
    <div className="space-y-8">
      {/* Header Section */}
      {/* Added mb-6 to separate title from filters */}
      <div className="flex flex-col gap-1 px-6" id="overview-macro">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
          Market Overview
        </h1>
        <p className="text-slate-500 text-base font-medium">
          Real-time analysis of the Singapore private condo market.
        </p>
        {apiMetadata && (
          <p className="mt-2 text-xs text-slate-500 italic">
            Data source from URA | {apiMetadata.row_count?.toLocaleString() || '0'} transactions records found
            {apiMetadata.min_date && apiMetadata.max_date && (
              <> from {new Date(apiMetadata.min_date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short'
              })} to {new Date(apiMetadata.max_date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short'
              })}
              </>
            )}
            {apiMetadata.last_updated && (
              <> | Database last updated at {new Date(apiMetadata.last_updated).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
              })}
              </>
            )}
          </p>
        )}
      </div>

      {/* Filter Bar + main dashboard content, aligned with charts via shared padding */}
      <div className="px-6 space-y-6">
        <FilterBar />

        {(loading || contextLoading) ? (
          <div className="text-center py-12 md:py-16 text-gray-500">
            <div className="text-3xl md:text-4xl mb-3">⏳</div>
            <div className="text-sm md:text-base">Loading data...</div>
          </div>
        ) : (
          <>
            {/* 1. Macro Overview Section - KPI Cards Only */}
            <div id="overview-macro" className="scroll-mt-32">
              <KPICards
                marketStats={marketStats}
                priceTrends={priceTrends}
                volumeData={volumeData}
              />
            </div>

            {/* Analyze by Districts Section */}
            <div id="district-analysis" className="scroll-mt-32">
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-xl font-bold text-slate-800">Analyze by Districts</h2>
              </div>
              
              <div className="space-y-6">
                {/* Top Districts Widget */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1">
                    <TopDistricts marketStatsByDistrict={marketStatsByDistrict} />
                  </div>
                </div>

                {/* District Summary Table */}
                <Card 
                  title="District Summary" 
                  subtitle="Detailed view of volume and pricing by district"
                >
                  <DistrictSummaryTable
                    marketStatsByDistrict={marketStatsByDistrict}
                    onDistrictClick={(district) => {
                      setSelectedDistrict(district);
                    }}
                  />
                </Card>

              </div>
            </div>

            {/* 7. Budget Comparison Section */}
            <div id="budget-comparison" className="scroll-mt-32">
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-xl font-bold text-slate-800">Budget Comparison</h2>
              </div>
              <Card 
                title="Comparable Value Analysis (Buy Box)" 
                subtitle="Find transactions around a target price band for the selected bedroom types and district"
              >
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
                className={`w-full sm:w-auto px-4 md:px-5 py-2 md:py-2.5 rounded-md border-none bg-[#FF6B4A] text-white font-medium text-xs md:text-sm cursor-pointer transition-opacity ${
                  buyBoxLoading ? 'opacity-70 cursor-default' : 'hover:bg-[#FF8C69]'
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
