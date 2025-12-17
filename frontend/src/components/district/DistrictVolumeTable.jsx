import React, { useState } from 'react';
import { getProjectsByDistrict } from '../../api/client';
import { DISTRICT_NAMES, formatPrice } from '../../constants';
import { Card } from '../ui/Card';

/**
 * Shared District Volume Table component
 * Used by both Dashboard and Districts pages
 */
export function DistrictVolumeTable({
  volumeData,
  selectedBedrooms,
  selectedSegment,
  title = '📋 District Summary (Volume & Liquidity)',
  minTransactions = 5, // Minimum transactions to include district
  showExcludedNote = true,
}) {
  const [sortBy, setSortBy] = useState('total');
  const [expandedDistricts, setExpandedDistricts] = useState({});
  const [districtProjects, setDistrictProjects] = useState({});
  const [loadingDistricts, setLoadingDistricts] = useState({});

  const toggleDistrict = (district) => {
    const isExpanded = !!expandedDistricts[district];
    setExpandedDistricts((prev) => ({
      ...prev,
      [district]: !isExpanded,
    }));

    if (!isExpanded && !districtProjects[district]) {
      fetchDistrictProjects(district);
    }
  };

  const fetchDistrictProjects = async (district) => {
    if (districtProjects[district]) return;

    setLoadingDistricts((prev) => ({ ...prev, [district]: true }));

    try {
      const bedroomParam = selectedBedrooms.map((b) => b.replace('b', '')).join(',');
      const res = await getProjectsByDistrict(district, {
        bedroom: bedroomParam,
        segment: selectedSegment || undefined,
      });
      const projects = res.data?.projects || [];

      const validatedProjects = projects.filter((project) => {
        if (!project.project_name) return false;
        return true;
      });

      setDistrictProjects((prev) => ({
        ...prev,
        [district]: validatedProjects,
      }));
    } catch (err) {
      console.error('Error fetching district projects:', err);
      setDistrictProjects((prev) => ({
        ...prev,
        [district]: [],
      }));
    } finally {
      setLoadingDistricts((prev) => ({ ...prev, [district]: false }));
    }
  };

  const getDistrictLabel = (district) =>
    DISTRICT_NAMES[district] ? `${district}: ${DISTRICT_NAMES[district]}` : district;

  if (!volumeData || volumeData.length === 0) {
    return null;
  }

  // Filter out districts with insufficient transactions
  const excludedDistricts = [];
  const filteredData = volumeData.filter((row) => {
    const totalQty = row.total_quantity || 0;
    if (totalQty < minTransactions) {
      excludedDistricts.push(row.district);
      return false;
    }
    return true;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (sortBy === 'total') return (b.total || 0) - (a.total || 0);
    if (sortBy === 'quantity') return (b.total_quantity || 0) - (a.total_quantity || 0);
    return a.district.localeCompare(b.district);
  });

  return (
    <Card title={title}>
      {/* Sort controls */}
      <div className="mb-4 p-3 md:p-4 bg-gray-50 rounded-lg flex flex-wrap items-center gap-3 md:gap-4">
        <span className="text-xs md:text-sm font-medium text-gray-700">Sort by:</span>
        <button
          type="button"
          onClick={() => setSortBy('total')}
          className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium border-none cursor-pointer transition-colors ${
            sortBy === 'total' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          Total Volume
        </button>
        <button
          type="button"
          onClick={() => setSortBy('quantity')}
          className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium border-none cursor-pointer transition-colors ${
            sortBy === 'quantity' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          Quantity
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px] md:text-xs lg:text-sm min-w-[720px]">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="p-2 text-left w-8" />
              <th className="p-2 text-left font-semibold">District</th>
              {selectedBedrooms.includes('2b') && (
                <>
                  <th className="p-2 text-right font-semibold text-blue-500">2B Volume</th>
                  <th className="p-2 text-right font-semibold text-blue-500">2B Qty</th>
                </>
              )}
              {selectedBedrooms.includes('3b') && (
                <>
                  <th className="p-2 text-right font-semibold text-emerald-500">3B Volume</th>
                  <th className="p-2 text-right font-semibold text-emerald-500">3B Qty</th>
                </>
              )}
              {selectedBedrooms.includes('4b') && (
                <>
                  <th className="p-2 text-right font-semibold text-amber-500">4B Volume</th>
                  <th className="p-2 text-right font-semibold text-amber-500">4B Qty</th>
                </>
              )}
              <th className="p-2 text-right font-semibold">Total Qty</th>
              <th className="p-2 text-right font-semibold">Total Volume</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => {
              const district = row.district;
              const isExpanded = !!expandedDistricts[district];
              const projects = districtProjects[district] || [];

              return (
                <React.Fragment key={district}>
                  <tr
                    className={`border-b border-gray-200 ${
                      idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                    } cursor-pointer`}
                    onClick={() => toggleDistrict(district)}
                  >
                    <td className="p-2 text-center text-gray-500">
                      <span
                        className={`inline-block transform text-xs transition-transform ${
                          isExpanded ? 'rotate-90' : 'rotate-0'
                        }`}
                      >
                        ▶
                      </span>
                    </td>
                    <td className="p-2 font-medium text-[11px] md:text-xs text-gray-800">
                      {getDistrictLabel(district)}
                    </td>
                    {selectedBedrooms.includes('2b') && (
                      <>
                        <td className="p-2 text-right text-gray-800">
                          {row['2b'] != null ? formatPrice(row['2b']) : '-'}
                        </td>
                        <td className="p-2 text-right text-gray-500">
                          {(row['2b_count'] || 0).toLocaleString()}
                        </td>
                      </>
                    )}
                    {selectedBedrooms.includes('3b') && (
                      <>
                        <td className="p-2 text-right text-gray-800">
                          {row['3b'] != null ? formatPrice(row['3b']) : '-'}
                        </td>
                        <td className="p-2 text-right text-gray-500">
                          {(row['3b_count'] || 0).toLocaleString()}
                        </td>
                      </>
                    )}
                    {selectedBedrooms.includes('4b') && (
                      <>
                        <td className="p-2 text-right text-gray-800">
                          {row['4b'] != null ? formatPrice(row['4b']) : '-'}
                        </td>
                        <td className="p-2 text-right text-gray-500">
                          {(row['4b_count'] || 0).toLocaleString()}
                        </td>
                      </>
                    )}
                    <td className="p-2 text-right font-semibold text-gray-800">
                      {(row.total_quantity || 0).toLocaleString()}
                    </td>
                    <td className="p-2 text-right font-semibold text-gray-900">
                      {row.total != null ? formatPrice(row.total) : '-'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td className="p-0 bg-gray-50" colSpan={2 + selectedBedrooms.length * 2 + 2}>
                        <div className="px-3 py-4 md:px-5 md:py-5 border-t border-gray-200">
                          {loadingDistricts[district] ? (
                            <div className="text-center text-gray-500 text-xs md:text-sm py-4">
                              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 mr-2"></div>
                              Loading projects...
                            </div>
                          ) : projects.length === 0 ? (
                            <div className="text-center text-gray-500 text-xs md:text-sm py-4">
                              No project data available
                            </div>
                          ) : (
                            <ProjectsTable
                              projects={projects}
                              selectedBedrooms={selectedBedrooms}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Excluded districts note */}
      {showExcludedNote && excludedDistricts.length > 0 && (
        <p className="mt-3 text-[11px] md:text-xs text-gray-500">
          Districts excluded due to fewer than {minTransactions} transactions:{' '}
          {excludedDistricts.sort().map((d, i) => (
            <span key={d}>
              {i > 0 ? ', ' : ''}
              {DISTRICT_NAMES[d] ? `${d}: ${DISTRICT_NAMES[d]}` : d}
            </span>
          ))}
          .
        </p>
      )}
    </Card>
  );
}

// Sub-component for expanded project rows
function ProjectsTable({ projects, selectedBedrooms }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px] md:text-xs lg:text-sm min-w-[640px]">
        <thead>
          <tr className="border-b-2 border-gray-200 bg-white">
            <th className="p-2 text-left font-semibold">Project Name</th>
            {selectedBedrooms.includes('2b') && (
              <>
                <th className="p-2 text-right font-semibold text-blue-500">2B Volume</th>
                <th className="p-2 text-right font-semibold text-blue-500">2B Qty</th>
              </>
            )}
            {selectedBedrooms.includes('3b') && (
              <>
                <th className="p-2 text-right font-semibold text-emerald-500">3B Volume</th>
                <th className="p-2 text-right font-semibold text-emerald-500">3B Qty</th>
              </>
            )}
            {selectedBedrooms.includes('4b') && (
              <>
                <th className="p-2 text-right font-semibold text-amber-500">4B Volume</th>
                <th className="p-2 text-right font-semibold text-amber-500">4B Qty</th>
              </>
            )}
            <th className="p-2 text-right font-semibold">Total Qty</th>
            <th className="p-2 text-right font-semibold">Total Volume</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project, idx) => (
            <tr
              key={idx}
              className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
            >
              <td className="p-2 font-medium text-[11px] md:text-xs text-gray-800">
                {project.project_name}
                {project.sale_type_label && (
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      project.sale_type_label === 'New Launch'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {project.sale_type_label}
                  </span>
                )}
              </td>
              {selectedBedrooms.includes('2b') && (
                <>
                  <td className="p-2 text-right text-gray-800">
                    {project['2b'] != null ? formatPrice(project['2b']) : '-'}
                  </td>
                  <td className="p-2 text-right text-gray-500">
                    {(project['2b_count'] || 0).toLocaleString()}
                  </td>
                </>
              )}
              {selectedBedrooms.includes('3b') && (
                <>
                  <td className="p-2 text-right text-gray-800">
                    {project['3b'] != null ? formatPrice(project['3b']) : '-'}
                  </td>
                  <td className="p-2 text-right text-gray-500">
                    {(project['3b_count'] || 0).toLocaleString()}
                  </td>
                </>
              )}
              {selectedBedrooms.includes('4b') && (
                <>
                  <td className="p-2 text-right text-gray-800">
                    {project['4b'] != null ? formatPrice(project['4b']) : '-'}
                  </td>
                  <td className="p-2 text-right text-gray-500">
                    {(project['4b_count'] || 0).toLocaleString()}
                  </td>
                </>
              )}
              <td className="p-2 text-right font-semibold text-gray-800">
                {(project.total_quantity || 0).toLocaleString()}
              </td>
              <td className="p-2 text-right font-semibold text-gray-900">
                {project.total != null ? formatPrice(project.total) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
