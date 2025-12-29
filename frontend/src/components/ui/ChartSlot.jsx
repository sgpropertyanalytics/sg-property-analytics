import React from 'react';

/**
 * ChartSlot - Canonical wrapper for Chart.js charts
 *
 * CHART LAYOUT CONTRACT - DO NOT BYPASS
 *
 * This is the ONLY approved wrapper for Chart.js charts. No chart may render
 * outside this wrapper. This enforces:
 *
 * 1. flex-1 min-h-0: Takes remaining height in flex column container
 * 2. overflow-hidden: Prevents Chart.js from expanding the container
 * 3. px-4 pb-3: Standard horizontal padding and bottom padding (built-in)
 * 4. h-full w-full relative inner wrapper: Chart.js can fill this exactly
 *
 * Card Structure Contract:
 * <Card className="h-full flex flex-col overflow-hidden">
 *   <Header className="shrink-0" />
 *   <Note className="shrink-0" />  (optional)
 *   <ChartSlot>
 *     <Chart options={options} data={data} />
 *   </ChartSlot>
 *   <Footer className="shrink-0 h-11" />
 * </Card>
 *
 * IMPORTANT:
 * - Chart.js options MUST include maintainAspectRatio: false
 * - Use BASE_CHART_OPTIONS from constants/chartOptions.js
 * - Do NOT use style={{ height }} inside chart components
 * - Do NOT add extra wrappers around charts
 */
export const ChartSlot = React.memo(function ChartSlot({ children }) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden px-4 pb-3">
      <div className="h-full w-full relative">
        {children}
      </div>
    </div>
  );
});

export default ChartSlot;
