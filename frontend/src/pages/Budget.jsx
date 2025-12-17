import { useFilters } from '../context/FilterContext';
import React, { useState } from 'react';
import { getComparableValueAnalysis } from '../api/client';

export function Budget() {
  const { filters } = useFilters();
  const selectedBedrooms = filters?.bedrooms || ['2b', '3b', '4b'];
  const selectedDistrict = filters?.district === 'All Districts' ? null : filters?.district;

  const [buyBoxResult, setBuyBoxResult] = useState(null);
  const [buyBoxLoading, setBuyBoxLoading] = useState(false);

  const runBuyBoxAnalysis = async () => {
    setBuyBoxLoading(true);
    try {
      const params = {
        target_price: 2500000,
        band: 100000,
        bedroom: selectedBedrooms.map(b => b.replace('b', '')).join(','),
        districts: selectedDistrict || undefined,
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

  return (
    <div className="flex flex-col h-full space-y-0">
      <div className="flex flex-col gap-1 px-6 pt-6 pb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
          Budget Comparison
        </h1>
        <p className="text-slate-500 text-base font-medium">
          Compare property options within your budget range.
        </p>
      </div>

      <div className="px-6 pb-8 flex-1 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 space-y-6">
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
                              {p.district}
                            </td>
                            <td className="p-2 border-b border-gray-200 text-right">
                              {p.price?.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' }) ?? '-'}
                            </td>
                            <td className="p-2 border-b border-gray-200 text-right">
                              {p.psf ? `$${p.psf.toLocaleString()}` : '-'}
                            </td>
                            <td className="p-2 border-b border-gray-200 text-right">
                              {p.bedroom_count}
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
        </div>
      </div>
    </div>
  );
}

