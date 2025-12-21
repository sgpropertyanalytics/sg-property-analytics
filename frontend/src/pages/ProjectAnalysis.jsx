import React from 'react';
import { HotProjectsTable } from '../components/powerbi/HotProjectsTable';

/**
 * Project Analysis Page
 *
 * Features:
 * - Hot Projects table showing sales progress for new launches
 * - Individual project deep-dives (coming soon)
 * - Unit-level transaction history (coming soon)
 */
export function ProjectAnalysisContent() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Project Analysis
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Track new launch sales progress and market inventory
          </p>
        </div>

        {/* Hot Projects Table */}
        <HotProjectsTable height={500} />
      </div>
    </div>
  );
}

export default ProjectAnalysisContent;
