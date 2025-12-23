import React from 'react';

/**
 * PageSummaryBox - "What This Page Shows" component
 *
 * A prominent summary box for page-level explanations.
 * Use this at the top of dashboard pages to help users understand
 * what the page is about and what insights they can gain.
 *
 * Design Pattern:
 * - Gradient background (subtle, left-to-right)
 * - Icon + title header
 * - Plain English description with bold highlights
 * - Rounded corners with subtle border
 *
 * @example
 * <PageSummaryBox title="What This Page Shows">
 *   Analyze how <span className="font-semibold text-[#213448]">floor level affects price</span> in
 *   Singapore condos. Higher floors typically command a premium due to views and prestige.
 * </PageSummaryBox>
 *
 * @example Custom icon
 * <PageSummaryBox
 *   title="About This Analysis"
 *   icon={<MyCustomIcon />}
 * >
 *   Description text here...
 * </PageSummaryBox>
 */
export function PageSummaryBox({
  title = 'What This Page Shows',
  icon = null,
  children,
  className = ''
}) {
  const defaultIcon = (
    <svg className="w-4 h-4 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <div className={`p-4 bg-gradient-to-r from-[#213448]/5 via-white to-[#547792]/5 rounded-xl border border-[#94B4C1]/30 ${className}`}>
      <h2 className="text-sm font-bold text-[#213448] mb-2 flex items-center gap-2">
        {icon || defaultIcon}
        {title}
      </h2>
      <p className="text-sm text-[#547792] leading-relaxed">
        {children}
      </p>
    </div>
  );
}

/**
 * SectionHeader - Visual section divider with accent bar
 *
 * Use this to create visual hierarchy between chart sections.
 *
 * @example
 * <SectionHeader color="navy">Primary Analysis</SectionHeader>
 * <MyHeroChart />
 *
 * <SectionHeader color="blue">Detailed Breakdowns</SectionHeader>
 * <MySecondaryCharts />
 */
export function SectionHeader({
  children,
  color = 'navy', // 'navy' | 'blue' | 'light'
  className = ''
}) {
  const colors = {
    navy: {
      bar: 'bg-[#213448]',
      text: 'text-[#213448]',
    },
    blue: {
      bar: 'bg-[#547792]',
      text: 'text-[#547792]',
    },
    light: {
      bar: 'bg-[#94B4C1]',
      text: 'text-[#94B4C1]',
    },
  };

  const { bar, text } = colors[color] || colors.navy;

  return (
    <div className={`flex items-center gap-2 mb-3 ${className}`}>
      <div className={`w-1 h-5 ${bar} rounded`}></div>
      <span className={`text-sm font-semibold ${text} uppercase tracking-wide`}>
        {children}
      </span>
    </div>
  );
}

export default PageSummaryBox;
