/**
 * DealCheckerContent - Check if a buyer got a good deal
 *
 * Allows users to:
 * 1. Select their project (dropdown)
 * 2. Enter bedroom type, sqft, and price paid
 * 3. See price distribution histogram of nearby transactions (1km radius)
 * 4. See map with 1km radius and surrounding projects
 * 5. Get percentile rank showing how their deal compares
 */
import React, { useState, useEffect } from 'react';
import { getProjectNames, getDealCheckerNearbyTransactions } from '../../api/client';
import { PriceDistributionHeroChart } from '../PriceDistributionHeroChart';
import DealCheckerMap from './DealCheckerMap';

// Format price for display
const formatPrice = (value) => {
  if (value === null || value === undefined) return '-';
  if (value >= 1000000) {
    const millions = value / 1000000;
    return `$${millions.toFixed(2)}M`;
  }
  return `$${(value / 1000).toFixed(0)}K`;
};

// Format number with commas
const formatNumber = (value) => {
  if (value === null || value === undefined) return '';
  return value.toLocaleString();
};

// Parse formatted number back to number
const parseFormattedNumber = (str) => {
  if (!str) return '';
  return str.replace(/[^0-9]/g, '');
};

export default function DealCheckerContent() {
  // Form state
  const [projectName, setProjectName] = useState('');
  const [bedroom, setBedroom] = useState('');
  const [sqft, setSqft] = useState('');
  const [price, setPrice] = useState('');

  // Project search filter
  const [projectSearch, setProjectSearch] = useState('');

  // Data state
  const [projectOptions, setProjectOptions] = useState([]);
  const [projectOptionsLoading, setProjectOptionsLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load project names for dropdown
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await getProjectNames();
        setProjectOptions(response.data.projects || []);
      } catch (err) {
        console.error('Failed to load project names:', err);
      } finally {
        setProjectOptionsLoading(false);
      }
    };
    loadProjects();
  }, []);

  // Filter projects by search term
  const filteredProjects = projectOptions.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
    p.district?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  // Handle form submission
  const handleCheck = async (e) => {
    e.preventDefault();

    if (!projectName || !bedroom || !price) {
      setError('Please fill in Project, Bedroom, and Price fields');
      return;
    }

    const priceNum = parseFloat(parseFormattedNumber(price));
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Please enter a valid price');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = {
        project_name: projectName,
        bedroom: bedroom,
        price: priceNum,
        radius_km: 1.0
      };

      const sqftNum = parseFloat(parseFormattedNumber(sqft));
      if (!isNaN(sqftNum) && sqftNum > 0) {
        params.sqft = sqftNum;
      }

      const response = await getDealCheckerNearbyTransactions(params);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check deal');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle price input formatting
  const handlePriceChange = (e) => {
    const raw = parseFormattedNumber(e.target.value);
    if (raw === '') {
      setPrice('');
      return;
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setPrice(formatNumber(num));
    }
  };

  // Handle sqft input formatting
  const handleSqftChange = (e) => {
    const raw = parseFormattedNumber(e.target.value);
    if (raw === '') {
      setSqft('');
      return;
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setSqft(formatNumber(num));
    }
  };

  // Convert histogram bins to transactions format for PriceDistributionHeroChart
  // Each bin becomes multiple pseudo-transactions at the bin midpoint
  const histogramTransactions = result?.histogram?.bins
    ? result.histogram.bins.flatMap(bin =>
        Array(bin.count).fill({ price: (bin.start + bin.end) / 2 })
      )
    : [];

  // Get interpretation label and color
  const getInterpretation = () => {
    if (!result?.percentile) return null;
    const { rank, interpretation } = result.percentile;

    const configs = {
      excellent_deal: { label: 'Excellent Deal!', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: '🎉' },
      good_deal: { label: 'Good Deal', color: 'text-green-600', bg: 'bg-green-50', icon: '👍' },
      fair_deal: { label: 'Fair Deal', color: 'text-amber-600', bg: 'bg-amber-50', icon: '👌' },
      above_average: { label: 'Above Average', color: 'text-orange-600', bg: 'bg-orange-50', icon: '📊' },
      no_data: { label: 'Insufficient Data', color: 'text-slate-600', bg: 'bg-slate-50', icon: '❓' }
    };

    return configs[interpretation] || configs.no_data;
  };

  return (
    <div className="space-y-6">
      {/* Input Form Card */}
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#94B4C1]/30">
          <h3 className="font-semibold text-[#213448]">Check Your Deal</h3>
          <p className="text-xs text-[#547792] mt-0.5">
            See how your purchase compares to nearby {bedroom ? `${bedroom}-bedroom` : ''} transactions within 1km
          </p>
        </div>

        <form onSubmit={handleCheck} className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Project Name - with search */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-[#213448] mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-[#94B4C1]/50 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-[#547792] mb-1"
                />
                <select
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#94B4C1]/50 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-[#547792]"
                  disabled={projectOptionsLoading}
                  size={1}
                >
                  <option value="">Select project...</option>
                  {filteredProjects.slice(0, 100).map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.district})
                    </option>
                  ))}
                  {filteredProjects.length > 100 && (
                    <option disabled>...{filteredProjects.length - 100} more (refine search)</option>
                  )}
                </select>
                {projectOptionsLoading && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <svg className="w-4 h-4 animate-spin text-[#547792]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Bedroom */}
            <div>
              <label className="block text-sm font-medium text-[#213448] mb-1">
                Bedroom Type <span className="text-red-500">*</span>
              </label>
              <select
                value={bedroom}
                onChange={(e) => setBedroom(e.target.value)}
                className="w-full px-3 py-2 border border-[#94B4C1]/50 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-[#547792]"
              >
                <option value="">Select...</option>
                <option value="1">1 Bedroom</option>
                <option value="2">2 Bedroom</option>
                <option value="3">3 Bedroom</option>
                <option value="4">4 Bedroom</option>
                <option value="5">5+ Bedroom</option>
              </select>
            </div>

            {/* Square Footage */}
            <div>
              <label className="block text-sm font-medium text-[#213448] mb-1">
                Size (sqft)
              </label>
              <input
                type="text"
                value={sqft}
                onChange={handleSqftChange}
                placeholder="e.g., 1,200"
                className="w-full px-3 py-2 border border-[#94B4C1]/50 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-[#547792]"
              />
            </div>

            {/* Price Paid */}
            <div>
              <label className="block text-sm font-medium text-[#213448] mb-1">
                Price Paid ($) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={price}
                onChange={handlePriceChange}
                placeholder="e.g., 2,500,000"
                className="w-full px-3 py-2 border border-[#94B4C1]/50 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-[#547792]"
              />
            </div>

            {/* Submit Button */}
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-2 bg-[#213448] text-white rounded-md hover:bg-[#547792] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Checking...
                  </span>
                ) : (
                  'Check Deal'
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}
        </form>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Percentile Summary */}
          {result.percentile && result.percentile.rank !== null && (
            <div className={`p-4 rounded-lg border ${getInterpretation()?.bg} border-[#94B4C1]/30`}>
              <div className="flex items-center gap-4">
                <span className="text-3xl">{getInterpretation()?.icon}</span>
                <div>
                  <h4 className={`text-lg font-semibold ${getInterpretation()?.color}`}>
                    {getInterpretation()?.label}
                  </h4>
                  <p className="text-sm text-[#547792]">
                    <span className="font-medium text-[#213448]">{result.percentile.rank}%</span> of comparable {bedroom}-bedroom transactions in the area were priced higher than yours.
                    {result.percentile.total > 0 && (
                      <span className="ml-1">
                        ({result.percentile.transactions_above} of {result.percentile.total} transactions)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Histogram and Map Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Histogram */}
            <div>
              <PriceDistributionHeroChart
                buyerPrice={result.filters.buyer_price}
                transactions={histogramTransactions}
                loading={false}
                height={320}
                activeFilters={{
                  bedroom: `${bedroom}BR`,
                  district: result.project.district,
                }}
              />
              {result.histogram.total_count < 30 && (
                <p className="text-xs text-amber-600 mt-2 px-2">
                  Note: Only {result.histogram.total_count} comparable transactions found. Results may be less reliable with limited data.
                </p>
              )}
            </div>

            {/* Right: Map */}
            <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#94B4C1]/30">
                <h3 className="font-semibold text-[#213448]">
                  Nearby Projects (within 1km)
                </h3>
                <p className="text-xs text-[#547792]">
                  {result.nearby_projects.length} projects with {bedroom}-bedroom transactions
                </p>
              </div>
              <div style={{ height: 320 }}>
                <DealCheckerMap
                  centerProject={result.project}
                  nearbyProjects={result.nearby_projects}
                  radiusKm={result.filters.radius_km}
                />
              </div>
            </div>
          </div>

          {/* Nearby Projects Table */}
          {result.nearby_projects.length > 0 && (
            <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#94B4C1]/30">
                <h3 className="font-semibold text-[#213448]">Projects Within 1km</h3>
                <p className="text-xs text-[#547792]">
                  Sorted by distance from {result.project.name}
                </p>
              </div>
              <div className="overflow-x-auto" style={{ maxHeight: 300 }}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">Project</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">District</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 border-b">Distance</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 border-b">{bedroom}BR Txns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.nearby_projects.map((p, idx) => (
                      <tr key={p.project_name} className={idx === 0 ? 'bg-[#213448]/5' : 'hover:bg-slate-50'}>
                        <td className="px-3 py-2 border-b border-slate-100 font-medium text-[#213448]">
                          {p.project_name}
                          {p.project_name === result.project.name && (
                            <span className="ml-2 text-xs text-[#547792]">(your project)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">{p.district}</td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {p.distance_km === 0 ? '-' : `${(p.distance_km * 1000).toFixed(0)}m`}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {p.transaction_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Initial state */}
      {!result && !loading && (
        <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-8 text-center">
          <div className="max-w-md mx-auto">
            <svg className="w-16 h-16 mx-auto text-[#94B4C1] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3 className="text-lg font-semibold text-[#213448] mb-2">Check Your Property Deal</h3>
            <p className="text-sm text-[#547792]">
              Enter your project name, bedroom type, and price paid to see how your purchase compares
              to similar transactions within 1km of your project.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
