import React, { useMemo } from 'react';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery } from '../../hooks';
import { getAggregate } from '../../api/client';
import { transformPriceRangeMatrix } from '../../adapters/aggregate';
import {
  getBedroomLabelShort,
  AGE_BAND_LABELS_SHORT,
} from '../../constants';
import { PriceCorridorCell, PriceCorridorLegend } from './PriceCorridorCell';
import { ChartFrame } from '../common/ChartFrame';

/**
 * PriceRangeMatrix - Fair Price Range by Bedroom x Property Age
 *
 * Shows price corridor (Q1-Q3) for each bedroom × age band combination,
 * helping users understand what's a "fair" price to pay.
 *
 * Uses /api/aggregate with:
 *   group_by=bedroom,age_band
 *   metrics=count,price_25th,price_75th,median_price,psf_25th,psf_75th,min_price,max_price
 *
 * @param {Object} props
 * @param {number} props.budget - User's target budget (for corridor position marker)
 * @param {number} props.tolerance - +/- range around budget (default $100K)
 * @param {string} props.region - Optional segment filter (CCR/RCR/OCR)
 * @param {string} props.district - Optional district filter (D01-D28)
 * @param {string} props.tenure - Optional tenure filter
 * @param {number} props.monthsLookback - Time window in months (default 24)
 */
export function PriceRangeMatrix({
  budget,
  tolerance = 100000,
  region = null,
  district = null,
  tenure = null,
  monthsLookback = 24,
}) {
  // Calculate date range based on months lookback
  const dateFrom = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsLookback);
    return d.toISOString().split('T')[0];
  }, [monthsLookback]);

  // Build API params
  const apiParams = useMemo(() => {
    const params = {
      group_by: 'bedroom,age_band',
      metrics: 'count,price_25th,price_75th,median_price,psf_25th,psf_75th,min_price,max_price',
      date_from: dateFrom,
    };

    // Price filter based on budget + tolerance
    if (budget) {
      params.price_min = budget - tolerance;
      params.price_max = budget + tolerance;
    }

    // Optional filters
    if (region) params.segment = region;
    if (district) params.district = district;
    if (tenure) params.tenure = tenure;

    return params;
  }, [budget, tolerance, region, district, tenure, dateFrom]);

  // Fetch data with abort handling - gates on appReady
  // Phase 4: Inline query key - no filterKey abstraction
  const { data, status, error, refetch, isFetching } = useAppQuery(
    async (signal) => {
      const response = await getAggregate(apiParams, { signal });
      return transformPriceRangeMatrix(response.data, { budget });
    },
    [JSON.stringify(apiParams)],
    { chartName: 'PriceRangeMatrix', keepPreviousData: true }
  );

  const { matrix, ageBands, bedrooms } = data || {};

  return (
    <ChartFrame
      status={status}
      isFiltering={isFetching && status === 'success'}
      error={error}
      onRetry={refetch}
      empty={!data || data.totalCount === 0}
      skeleton="grid"
      height={300}
    >
    <div className="bg-card rounded-lg shadow-sm border border-[#94B4C1]/50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#213448]">
              Fair Price Range
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Price corridors by bedroom and property age (Q1-Q3 = typical range)
            </p>
          </div>
          <PriceCorridorLegend />
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Property Age
              </th>
              {bedrooms.map((br) => (
                <th
                  key={br}
                  className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {getBedroomLabelShort(br)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ageBands.map((band) => (
              <tr key={band} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs font-medium text-gray-700 whitespace-nowrap">
                  {AGE_BAND_LABELS_SHORT[band] || band}
                </td>
                {bedrooms.map((br) => (
                  <td key={br} className="px-1 py-1 min-w-[140px]">
                    <div className="h-24">
                      <PriceCorridorCell
                        cellData={matrix[band]?.[br]}
                        budget={budget}
                        compact={false}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-500">
          Based on {data?.totalCount?.toLocaleString() || 0} transactions in the past{' '}
          {monthsLookback} months within your budget range.
        </p>
      </div>
    </div>
    </ChartFrame>
  );
}

export default PriceRangeMatrix;
