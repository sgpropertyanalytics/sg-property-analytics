import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getGLSAll } from '../../api/client';

/**
 * GLS Data Table - Shows Government Land Sales tender details
 *
 * Displays:
 * - Date (month/year)
 * - Location (address)
 * - Market Segment (CCR/RCR/OCR)
 * - Developer Name
 * - Bidded PSF (psf_ppr)
 * - Status (Launched/Awarded)
 *
 * Two-phase model:
 * - SIGNAL (launched): Government intent, upcoming supply
 * - FACT (awarded): Capital committed, confirmed supply
 */
export function GLSDataTable({ height = 400 }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const isInitialLoad = useRef(true);
  const [filter, setFilter] = useState('all'); // 'all', 'launched', 'awarded'
  const [segmentFilter, setSegmentFilter] = useState(''); // '', 'CCR', 'RCR', 'OCR'
  const [sortConfig, setSortConfig] = useState({
    column: 'release_date',
    order: 'desc',
  });

  // Fetch data when filters change
  const fetchData = useCallback(async () => {
    // Show full loading skeleton only on initial load, subtle opacity change for updates
    if (isInitialLoad.current) {
      setLoading(true);
    } else {
      setUpdating(true);
    }
    setError(null);
    try {
      const params = {
        limit: 100,
        sort: sortConfig.column,
        order: sortConfig.order,
      };

      if (filter !== 'all') {
        params.status = filter;
      }

      if (segmentFilter) {
        params.market_segment = segmentFilter;
      }

      const response = await getGLSAll(params);
      setData(response.data.data || []);
    } catch (err) {
      console.error('Error fetching GLS data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setUpdating(false);
      isInitialLoad.current = false;
    }
  }, [filter, segmentFilter, sortConfig]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle sort
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Format date - show month and year
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'short',
    });
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    return `$${Math.round(value).toLocaleString()}`;
  };

  // Format large numbers (millions)
  const formatMillions = (value) => {
    if (value === null || value === undefined) return '-';
    return `$${(value / 1000000).toFixed(1)}M`;
  };

  // Segment-specific multipliers for implied launch PSF
  // Based on margin-based feasibility model: Selling PSF = Land PSF / (1 - margin)
  // CCR has lower multiplier (higher land cost proportion)
  // RCR/OCR have higher multipliers (lower land cost proportion)
  const SEGMENT_MULTIPLIERS = {
    CCR: { low: 1.45, high: 1.60 },
    RCR: { low: 1.70, high: 1.85 },
    OCR: { low: 1.70, high: 1.85 },
  };

  // Calculate implied launch PSF range
  const getImpliedLaunchPSF = (psf_ppr, market_segment) => {
    if (!psf_ppr || !market_segment) return null;
    const multipliers = SEGMENT_MULTIPLIERS[market_segment];
    if (!multipliers) return null;
    return {
      low: Math.round(psf_ppr * multipliers.low),
      high: Math.round(psf_ppr * multipliers.high),
    };
  };

  // Format implied launch PSF range
  const formatImpliedPSF = (psf_ppr, market_segment) => {
    const range = getImpliedLaunchPSF(psf_ppr, market_segment);
    if (!range) return '-';
    return `$${range.low.toLocaleString()} – $${range.high.toLocaleString()}`;
  };

  // Sort indicator
  const SortIcon = ({ column }) => {
    if (sortConfig.column !== column) {
      return (
        <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortConfig.order === 'asc' ? (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Column definitions
  const columns = [
    { key: 'release_date', label: 'Date', sortable: true, width: 'w-20' },
    { key: 'location_raw', label: 'Location', sortable: true, width: 'w-40' },
    { key: 'market_segment', label: 'Segment', sortable: true, width: 'w-16' },
    { key: 'successful_tenderer', label: 'Developer', sortable: true, width: 'w-40' },
    { key: 'psf_ppr', label: 'PSF (PPR)', sortable: true, width: 'w-24', align: 'right' },
    { key: 'implied_launch_psf', label: 'Implied Launch PSF', sortable: false, width: 'w-32', align: 'right' },
    { key: 'estimated_units', label: 'Supply Units', sortable: true, width: 'w-20', align: 'right' },
    { key: 'status', label: 'Status', sortable: true, width: 'w-20' },
  ];

  // Count by status
  const launchedCount = data.filter(t => t.status === 'launched').length;
  const awardedCount = data.filter(t => t.status === 'awarded').length;

  return (
    <div id="gls-data-table" className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden transition-opacity ${updating ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-[#213448]">Government Land Sales (GLS)</h3>
            <p className="text-xs text-[#547792]">
              {loading ? 'Loading...' : `${data.length} tenders`}
              {!loading && data.length > 0 && (
                <span className="ml-2">
                  (<span className="text-amber-600">{launchedCount} open</span>
                  {' / '}
                  <span className="text-green-600">{awardedCount} awarded</span>)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); fetchData(); }}
              className="p-1.5 text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF] rounded transition-colors"
              title="Refresh data"
              disabled={loading}
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-3">
          {/* Status filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[#547792]">Status:</span>
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded ${filter === 'all' ? 'bg-[#213448] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('launched')}
              className={`px-2 py-1 rounded ${filter === 'launched' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Open for Tender
            </button>
            <button
              onClick={() => setFilter('awarded')}
              className={`px-2 py-1 rounded ${filter === 'awarded' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Awarded
            </button>
          </div>

          {/* Segment filter */}
          <div className="flex items-center gap-1 text-xs ml-4">
            <span className="text-[#547792]">Segment:</span>
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="text-xs border border-[#94B4C1] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#547792] text-[#213448]"
            >
              <option value="">All</option>
              <option value="CCR">CCR</option>
              <option value="RCR">RCR</option>
              <option value="OCR">OCR</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-auto" style={{ maxHeight: height }}>
        {error ? (
          <div className="flex items-center justify-center h-40 text-red-500">
            Error: {error}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 text-left font-medium text-slate-600 border-b border-slate-200 ${col.width} ${
                      col.sortable ? 'cursor-pointer hover:bg-slate-100 select-none' : ''
                    } ${col.align === 'right' ? 'text-right' : ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                      <span>{col.label}</span>
                      {col.sortable && <SortIcon column={col.key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Loading skeleton
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {columns.map(col => (
                      <td key={col.key} className="px-3 py-2 border-b border-slate-100">
                        <div className="h-4 bg-slate-200 rounded w-full"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center">
                    <div className="text-slate-500">No GLS tenders found.</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Data will be available once synchronized from URA.
                    </p>
                  </td>
                </tr>
              ) : (
                data.map((tender, idx) => (
                  <tr
                    key={tender.id || idx}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                      {formatDate(tender.release_date)}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-800 truncate max-w-[200px]" title={tender.location_raw}>
                      {tender.location_raw || '-'}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100">
                      {tender.market_segment ? (
                        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                          tender.market_segment === 'CCR'
                            ? 'bg-purple-100 text-purple-700'
                            : tender.market_segment === 'RCR'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-teal-100 text-teal-700'
                        }`}>
                          {tender.market_segment}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 truncate max-w-[200px]" title={tender.successful_tenderer}>
                      {tender.successful_tenderer || <span className="text-slate-400 italic">TBD</span>}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-800 font-medium text-right">
                      {tender.psf_ppr ? formatCurrency(tender.psf_ppr) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-700 text-right text-xs">
                      {tender.psf_ppr && tender.market_segment ? (
                        <span title={`Based on ${tender.market_segment} margin assumptions`}>
                          {formatImpliedPSF(tender.psf_ppr, tender.market_segment)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                      {tender.estimated_units ? `~${tender.estimated_units.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        tender.status === 'awarded'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {tender.status === 'awarded' ? (
                          <span title="FACT: Confirmed supply - capital committed">Awarded</span>
                        ) : (
                          <span title="SIGNAL: Open for tender - not confirmed supply">Open</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with legend */}
      <div className="px-4 py-2 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30">
        <div className="flex items-center justify-between text-xs text-[#547792]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
              <span>Open = SIGNAL (upcoming supply)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>Awarded = FACT (confirmed supply)</span>
            </span>
          </div>
          <span className="text-[#547792]/70">
            PSF (PPR) = Price per sqft of Gross Floor Area
          </span>
        </div>
      </div>

      {/* Methodology footnote */}
      <div className="px-4 py-3 border-t border-[#94B4C1]/20 bg-slate-50/50">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <span className="font-medium text-slate-600">Methodology note:</span>{' '}
          Estimated selling prices are derived using a margin-based feasibility model applied to the
          government land bid PSF of gross floor area (PSF PPR). Segment-specific margin assumptions
          reflect differences in land cost and cost composition across market segments.
        </p>
        <p className="text-[10px] text-slate-500 mt-1">
          <span className="font-medium text-slate-600">Formula:</span>{' '}
          Estimated Selling PSF = Land Bid PSF (PPR) ÷ (1 − All-in Margin)
        </p>
      </div>
    </div>
  );
}

export default GLSDataTable;
