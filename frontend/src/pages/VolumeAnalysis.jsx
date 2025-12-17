import React, { useState, useEffect, useMemo } from 'react';
import { useFilters } from '../context/FilterContext';
import {
  getPriceTrends,
} from '../api/client';
import BarChart from '../components/BarChart';
import { FilterBar } from '../components/dashboard/FilterBar';

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

export function VolumeAnalysis() {
  const { filters } = useFilters();
  const selectedBedrooms = filters?.bedrooms || ['2b', '3b', '4b'];
  const selectedSegment = filters?.segment === 'All Segments' ? null : filters?.segment;
  const selectedDistrict = filters?.district === 'All Districts' ? 'all' : filters?.district;

  const [priceTrends, setPriceTrends] = useState([]);
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

  // Fetch data
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
        const trendsRes = await getPriceTrends(params);
        setPriceTrends(trendsRes.data.trends || []);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedBedrooms, selectedDistrict, selectedSegment]);

  if (error) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
            Volume/Liquidity Analysis
          </h1>
          <p className="text-slate-500 text-base font-medium">
            Analyze transaction volume and market liquidity trends.
          </p>
        </div>

        {/* Filter */}
        <div className="px-6 pb-4">
          <FilterBar isSticky={false} />
        </div>

        {/* Scrollable main container for visuals */}
        <div className="px-6 pb-8 flex-1 overflow-y-auto">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 md:p-8 text-center">
            <h2 className="text-red-600 font-semibold mb-3 text-lg">⚠️ Connection Error</h2>
            <p className="text-red-800 mb-4 text-sm md:text-base">
              Cannot connect to API. Please start the Flask backend:
            </p>
            <code className="block bg-red-100 p-3 rounded-md text-red-900 text-xs md:text-sm">
              cd backend && python app.py
            </code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
          Volume/Liquidity Analysis
        </h1>
        <p className="text-slate-500 text-base font-medium">
          Analyze transaction volume and market liquidity trends.
        </p>
      </div>

      {/* Filter */}
      <div className="px-6 pb-4">
        <FilterBar isSticky={false} />
      </div>

      {/* Scrollable main container for visuals */}
      <div className="px-6 pb-8 flex-1 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-6">
          {loading ? (
            <div className="text-center py-12 md:py-16 text-gray-500">
              <div className="text-3xl md:text-4xl mb-3">⏳</div>
              <div className="text-sm md:text-base">Loading data...</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Transaction Count Chart */}
              {transactionCountData && transactionCountData.length > 0 && (
                <Card 
                  title="Transaction Volume" 
                  subtitle="Total units transacted over time"
                >
                  <BarChart
                    data={transactionCountData}
                    selectedBedrooms={selectedBedrooms}
                    title=""
                    beginAtZero={true}
                  />
                </Card>
              )}

              {/* Transaction Count by Bedroom Type */}
              {transactionCountData && transactionCountData.length > 0 && (
                <Card title="Transaction Count by Bedroom Type">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
