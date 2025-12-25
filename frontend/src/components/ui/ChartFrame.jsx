/**
 * ChartFrame - Canonical wrapper for Chart.js charts
 *
 * Enforces the flex layout contract so Chart.js fills its parent:
 * - flex-1 min-h-0: takes remaining height in flex column
 * - h-full w-full relative inner wrapper: Chart.js can fill this
 *
 * Usage:
 * <Card className="h-full flex flex-col">
 *   <Header className="shrink-0" />
 *   <ChartFrame>
 *     <Line options={options} data={data} />
 *   </ChartFrame>
 *   <Footer className="shrink-0" />
 * </Card>
 *
 * IMPORTANT: Chart.js options MUST include maintainAspectRatio: false
 * Use baseChartJsOptions from constants/chartOptions.js
 */
export function ChartFrame({ children, className = '' }) {
  return (
    <div className={`flex-1 min-h-0 ${className}`}>
      <div className="h-full w-full relative">
        {children}
      </div>
    </div>
  );
}

export default ChartFrame;
