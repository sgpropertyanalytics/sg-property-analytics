import React, { useState, useMemo } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { useSupplyData } from '../../context/SupplyDataContext';
import { useAbortableQuery } from '../../hooks';
import apiClient from '../../api/client';
import { DISTRICT_NAMES, getRegionForDistrict, getRegionBadgeClass } from '../../constants';

/**
 * DistrictLeaderboard - Ranked district table by selected metric
 *
 * Shows different columns based on metric:
 * - Price: District, Median PSF, Tx Count, YoY%
 * - Volume: District, Tx Count, % of Total, MoM%
 * - Supply: District, Unsold, Upcoming, Total Supply
 */
export function DistrictLeaderboard({ metric, saleType }) {
  const { filters, debouncedFilterKey } = usePowerBIFilters();
  const [sortConfig, setSortConfig] = useState({ column: null, order: 'desc' });

  // Fetch price/volume data from district-psf endpoint
  const { data: priceVolumeData, loading: priceLoading } = useAbortableQuery(
    async (signal) => {
      if (metric === 'supply') return [];

      const params = { sale_type: saleType };
      if (filters.bedroomTypes?.length > 0) {
        params.bed = filters.bedroomTypes.map(b => b.replace(/\D/g, '') || '5').join(',');
      }
      if (filters.dateRange?.start) params.date_from = filters.dateRange.start;
      if (filters.dateRange?.end) params.date_to = filters.dateRange.end;

      const response = await apiClient.get('/insights/district-psf', { params, signal });
      return response.data?.districts || [];
    },
    [metric, saleType, debouncedFilterKey],
    { initialData: [], keepPreviousData: true }
  );

  // Get supply data from shared context
  const { data: supplyData, loading: supplyLoading } = useSupplyData();

  // Process data based on metric
  const tableData = useMemo(() => {
    if (metric === 'supply') {
      if (!supplyData?.byDistrict) return [];
      return Object.entries(supplyData.byDistrict)
        .map(([districtId, data]) => ({
          district: districtId,
          name: DISTRICT_NAMES[districtId] || districtId,
          region: getRegionForDistrict(districtId),
          unsold: data.unsoldInventory || 0,
          upcoming: data.upcomingLaunches || 0,
          total: data.totalEffectiveSupply || 0,
        }))
        .filter(d => d.total > 0);
    }

    // Price or Volume metric
    return priceVolumeData
      .filter(d => d.has_data)
      .map(d => ({
        district: d.district_id,
        name: DISTRICT_NAMES[d.district_id] || d.district_id,
        region: getRegionForDistrict(d.district_id),
        medianPsf: d.median_psf || 0,
        txCount: d.tx_count || 0,
        yoyPct: d.yoy_pct,
      }));
  }, [metric, priceVolumeData, supplyData]);

  // Calculate total for percentage calculations
  const totalTxCount = useMemo(() => {
    return tableData.reduce((sum, d) => sum + (d.txCount || 0), 0);
  }, [tableData]);

  // Sort data
  const sortedData = useMemo(() => {
    const defaultSort = {
      price: 'medianPsf',
      volume: 'txCount',
      supply: 'total',
    };

    const sortColumn = sortConfig.column || defaultSort[metric];
    const order = sortConfig.order;

    return [...tableData].sort((a, b) => {
      const aVal = a[sortColumn] ?? 0;
      const bVal = b[sortColumn] ?? 0;
      return order === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [tableData, sortConfig, metric]);

  // Handle sort
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  };

  // Get sort indicator
  const getSortIndicator = (column) => {
    if (sortConfig.column !== column) return '';
    return sortConfig.order === 'desc' ? ' ↓' : ' ↑';
  };

  const loading = metric === 'supply' ? supplyLoading : priceLoading;

  // Column headers based on metric
  const getHeaders = () => {
    switch (metric) {
      case 'price':
        return [
          { key: 'rank', label: '#', sortable: false },
          { key: 'district', label: 'District', sortable: false },
          { key: 'medianPsf', label: 'Median PSF', sortable: true },
          { key: 'txCount', label: 'Transactions', sortable: true },
          { key: 'yoyPct', label: 'YoY %', sortable: true },
        ];
      case 'volume':
        return [
          { key: 'rank', label: '#', sortable: false },
          { key: 'district', label: 'District', sortable: false },
          { key: 'txCount', label: 'Transactions', sortable: true },
          { key: 'pctTotal', label: '% of Total', sortable: false },
          { key: 'medianPsf', label: 'Median PSF', sortable: true },
        ];
      case 'supply':
        return [
          { key: 'rank', label: '#', sortable: false },
          { key: 'district', label: 'District', sortable: false },
          { key: 'unsold', label: 'Unsold', sortable: true },
          { key: 'upcoming', label: 'Upcoming', sortable: true },
          { key: 'total', label: 'Total Supply', sortable: true },
        ];
      default:
        return [];
    }
  };

  const headers = getHeaders();
  const metricLabels = {
    price: 'Most Expensive Districts',
    volume: 'Most Active Districts',
    supply: 'Highest Supply Districts',
  };

  return (
    <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <h3 className="text-sm font-semibold text-[#213448]">
          {metricLabels[metric]}
        </h3>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="p-8 text-center">
          <div className="animate-spin w-6 h-6 border-2 border-[#547792] border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-sm text-[#547792]">Loading...</p>
        </div>
      )}

      {/* Table */}
      {!loading && sortedData.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#EAE0CF]/30 border-b border-[#94B4C1]/30">
                {headers.map(header => (
                  <th
                    key={header.key}
                    onClick={() => header.sortable && handleSort(header.key)}
                    className={`
                      px-3 py-2 text-left text-xs font-semibold text-[#547792] uppercase tracking-wider
                      ${header.sortable ? 'cursor-pointer hover:bg-[#94B4C1]/20' : ''}
                    `}
                  >
                    {header.label}{header.sortable && getSortIndicator(header.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedData.slice(0, 10).map((row, index) => (
                <tr
                  key={row.district}
                  className="border-b border-[#94B4C1]/20 hover:bg-[#94B4C1]/10 transition-colors"
                >
                  {/* Rank */}
                  <td className="px-3 py-2 text-[#213448] font-semibold">
                    {index + 1}
                  </td>

                  {/* District */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#213448]">{row.district}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${getRegionBadgeClass(row.region)}`}>
                        {row.region}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#547792] truncate max-w-[150px]">
                      {row.name}
                    </div>
                  </td>

                  {/* Metric-specific columns */}
                  {metric === 'price' && (
                    <>
                      <td className="px-3 py-2 font-bold text-[#213448]">
                        ${row.medianPsf?.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-[#547792]">
                        {row.txCount?.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {row.yoyPct !== null && row.yoyPct !== undefined ? (
                          <span className={row.yoyPct >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {row.yoyPct >= 0 ? '↑' : '↓'}{Math.abs(row.yoyPct).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </>
                  )}

                  {metric === 'volume' && (
                    <>
                      <td className="px-3 py-2 font-bold text-[#213448]">
                        {row.txCount?.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-[#547792]">
                        {totalTxCount > 0 ? ((row.txCount / totalTxCount) * 100).toFixed(1) : 0}%
                      </td>
                      <td className="px-3 py-2 text-[#547792]">
                        ${row.medianPsf?.toLocaleString()}
                      </td>
                    </>
                  )}

                  {metric === 'supply' && (
                    <>
                      <td className="px-3 py-2 font-bold text-[#213448]">
                        {row.unsold?.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-[#547792]">
                        {row.upcoming?.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-semibold text-[#213448]">
                        {row.total?.toLocaleString()}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && sortedData.length === 0 && (
        <div className="p-8 text-center text-[#547792]">
          No data available for selected filters
        </div>
      )}
    </div>
  );
}

export default DistrictLeaderboard;
