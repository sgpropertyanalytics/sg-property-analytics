import React, { useState, useEffect, useMemo } from 'react';
import { useFilters } from '../context/FilterContext';
import {
  getPriceTrends,
  getPriceTrendsByRegion,
  getPsfTrendsByRegion,
} from '../api/client';
import LineChart from '../components/LineChart';
import RegionChart from '../components/RegionChart';
import { FilterBar } from '../components/dashboard/FilterBar';
import { formatPrice, formatPSF } from '../constants';

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

export function PriceAnalysis() {
  const { filters } = useFilters();
  const selectedBedrooms = filters?.bedrooms || ['2b', '3b', '4b'];
  const selectedSegment = filters?.segment === 'All Segments' ? null : filters?.segment;
  const selectedDistrict = filters?.district === 'All Districts' ? 'all' : filters?.district;

  const [priceTrends, setPriceTrends] = useState([]);
  const [priceTrendsByRegion, setPriceTrendsByRegion] = useState([]);
  const [psfTrendsByRegion, setPsfTrendsByRegion] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        const [trendsRes, priceRegionRes, psfRegionRes] = await Promise.all([
          getPriceTrends(params),
          getPriceTrendsByRegion(params).catch(() => ({ data: { trends: [] } })),
          getPsfTrendsByRegion(params).catch(() => ({ data: { trends: [] } }))
        ]);

        setPriceTrends(trendsRes.data.trends || []);
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

  if (error) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
            Price/PSF Analysis
          </h1>
          <p className="text-slate-500 text-base font-medium">
            Analyze price trends and price per square foot across different segments and regions.
          </p>
        </div>

        {/* Filter (non-sticky here because container handles scroll) */}
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
          Price/PSF Analysis
        </h1>
        <p className="text-slate-500 text-base font-medium">
          Analyze price trends and price per square foot across different segments and regions.
        </p>
      </div>

      {/* Filter */}
      <div className="px-6 pb-4">
        <FilterBar isSticky={false} />
      </div>

      {/* Scrollable main container for visuals (header + filter stay fixed within page) */}
      <div className="px-6 pb-8 flex-1 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-6">
          {loading ? (
            <div className="text-center py-12 md:py-16 text-gray-500">
              <div className="text-3xl md:text-4xl mb-3">⏳</div>
              <div className="text-sm md:text-base">Loading data...</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Price Trend Chart */}
              <Card 
                title="Price Trend by Quarter" 
                subtitle={`Median Price for ${selectedSegment || 'All Segments'} • ${selectedBedrooms.map(b => b.replace('b', 'BR')).join(', ')}`}
              >
                {priceTrends && priceTrends.length > 0 ? (
                  <LineChart
                    data={priceTrends}
                    selectedBedrooms={selectedBedrooms}
                    valueFormatter={formatPrice}
                    title=""
                  />
                ) : (
                  <div className="h-[350px] bg-slate-50/50 rounded-xl flex items-center justify-center border border-dashed border-slate-200 text-slate-400">
                    No data available
                  </div>
                )}
              </Card>

              {/* PSF Trend Chart */}
              {psfTrendsData && psfTrendsData.length > 0 && (
                <Card 
                  title="PSF Trend by Quarter" 
                  subtitle={`Median PSF for ${selectedSegment || 'All Segments'} • ${selectedBedrooms.map(b => b.replace('b', 'BR')).join(', ')}`}
                >
                  <LineChart
                    data={psfTrendsData}
                    selectedBedrooms={selectedBedrooms}
                    valueFormatter={formatPSF}
                    title=""
                  />
                </Card>
              )}

              {/* Price Trends by Region */}
              {priceTrendsByRegion && priceTrendsByRegion.length > 0 && (
                <Card 
                  title="Price Trends by Region" 
                  subtitle="Median Price by CCR, RCR, and OCR"
                >
                  <RegionChart
                    data={priceTrendsByRegion}
                    valueFormatter={formatPrice}
                    title=""
                  />
                </Card>
              )}

              {/* PSF Trends by Region */}
              {psfTrendsByRegion && psfTrendsByRegion.length > 0 && (
                <Card 
                  title="PSF Trends by Region" 
                  subtitle="Median PSF by CCR, RCR, and OCR"
                >
                  <RegionChart
                    data={psfTrendsByRegion}
                    valueFormatter={formatPSF}
                    title=""
                    isPSF={true}
                  />
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
