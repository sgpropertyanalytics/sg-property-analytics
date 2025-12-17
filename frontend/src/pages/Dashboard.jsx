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
    <div className="space-y-6 pb-8">
      {/* Header Section */}
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

      {/* Main dashboard content, aligned with charts via shared padding */}
      <div className="px-6 space-y-6">
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

        </>
      )}
      </div>
    </div>
  );
}

export default Dashboard;
