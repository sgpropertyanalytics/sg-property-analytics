import React, { useEffect, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import SaleTypeChart from '../components/SaleTypeChart';
import LineChart from '../components/LineChart';
import { getSaleTypeTrends, getPriceTrendsBySaleType } from '../api/client';

const BEDROOM_LABELS = {
  '2b': '2-Bedroom',
  '3b': '3-Bedroom',
  '4b': '4-Bedroom',
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

const formatPrice = (value) => {
  if (!value) return '-';
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(2)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

export function SaleType() {
  const { filters } = useFilters();
  const selectedBedrooms = filters?.bedrooms || ['2b', '3b', '4b'];
  const selectedSegment = filters?.segment === 'All Segments' ? null : filters?.segment;
  const selectedDistrict = filters?.district === 'All Districts' ? 'all' : filters?.district;

  const [saleTypeTrends, setSaleTypeTrends] = useState([]);
  const [priceTrendsBySaleType, setPriceTrendsBySaleType] = useState({});
  const [saleTypeSegment, setSaleTypeSegment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const bedroomParam = selectedBedrooms.map(b => b.replace('b', '')).join(',');
      const paramsForTrends = {
        bedroom: bedroomParam,
        districts: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        segment: selectedSegment || undefined,
      };

      const paramsForPriceTrends = {
        bedroom: bedroomParam,
        districts: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        segment: saleTypeSegment || undefined,
      };

      try {
        const [trendsRes, priceTrendsRes] = await Promise.all([
          getSaleTypeTrends(paramsForTrends).catch(() => ({ data: { trends: [] } })),
          getPriceTrendsBySaleType(paramsForPriceTrends).catch(() => ({ data: { trends: {} } })),
        ]);

        setSaleTypeTrends(trendsRes.data.trends || []);
        setPriceTrendsBySaleType(priceTrendsRes.data.trends || {});
      } catch (err) {
        console.error('Error fetching sale type data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedBedrooms, selectedDistrict, selectedSegment, saleTypeSegment]);

  const header = (
    <div className="px-6 pt-6 pb-4">
      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
        New Sale vs Resale
      </h1>
      <p className="text-slate-500 text-base font-medium">
        Compare new sale and resale market trends.
      </p>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-4 pb-8">
        <div className="flex flex-col gap-1 px-6 pt-6">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight mb-2">
            New Sale vs Resale
          </h1>
          <p className="text-slate-500 text-base font-medium mb-4">
            Compare new sale and resale market trends.
          </p>
        </div>
        <div className="px-6">
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
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-1 px-6 pt-6">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
          New Sale vs Resale
        </h1>
        <p className="text-slate-500 text-base font-medium">
          Compare new sale and resale market trends.
        </p>
      </div>

      <div className="px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-6">
        {loading ? (
          <div className="text-center py-12 md:py-16 text-gray-500">
            <div className="text-3xl md:text-4xl mb-3">⏳</div>
            <div className="text-sm md:text-base">Loading data...</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* New Sale vs Resale Transaction Count */}
            {saleTypeTrends.length > 0 && (
              <Card 
                title="New Sale vs Resale Transaction Count" 
                subtitle="Market Composition"
              >
                <SaleTypeChart data={saleTypeTrends} />
              </Card>
            )}

            {/* Price Trends by Sale Type (New Sale vs Resale) – single chart */}
            {Object.keys(priceTrendsBySaleType).length > 0 && (() => {
              // Prefer 3BR, then 2BR, then 4BR, else first available
              const keys = Object.keys(priceTrendsBySaleType);
              const preferredOrder = ['3b', '2b', '4b'];
              const bedroom =
                preferredOrder.find(b => keys.includes(b) && Array.isArray(priceTrendsBySaleType[b]) && saleTypeTrends.length > 0) ||
                keys[0];
              const saleTypeData = priceTrendsBySaleType[bedroom];

              if (!saleTypeData || !Array.isArray(saleTypeData) || saleTypeData.length === 0) {
                return null;
              }

              return (
                <Card title="Price Trends: New Sale vs Resale">
                  <div className="bg-white p-2 md:p-4 rounded-lg">
                    <h3 className="text-xs md:text-sm text-gray-600 mb-3">
                      {BEDROOM_LABELS[bedroom] || 'All Bedrooms'}
                    </h3>
                    <LineChart
                      data={saleTypeData.map(d => ({
                        month: d.quarter,
                        '2b_price': d.new_sale,
                        '3b_price': d.resale,
                        '4b_price': null,
                      }))}
                      selectedBedrooms={['2b', '3b']}
                      valueFormatter={formatPrice}
                      title=""
                    />
                  </div>
                </Card>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
