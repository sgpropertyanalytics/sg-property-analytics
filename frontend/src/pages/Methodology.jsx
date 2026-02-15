/**
 * Methodology Page
 *
 * Documents all assumptions, classifications, and data sources used in the application.
 * Helps users understand how metrics are calculated and data is categorized.
 */

import React from 'react';
import { PageHeader } from '../components/ui';
import { useData } from '../context/DataContext';
import { LocTrendChart } from '../components/LocTrendChart';

// Classification data from constants
const BEDROOM_THRESHOLDS = {
  tier1: {
    name: 'New Sale Post-Harmonization',
    date: '>= June 2023',
    description: 'After AC ledge removal rules, developers build more compact units',
    thresholds: [
      { bedroom: '1-Bedroom', range: '< 580 sqft' },
      { bedroom: '2-Bedroom', range: '580 - 780 sqft' },
      { bedroom: '3-Bedroom', range: '780 - 1,150 sqft' },
      { bedroom: '4-Bedroom', range: '1,150 - 1,450 sqft' },
      { bedroom: '5-Bedroom+', range: '>= 1,450 sqft' },
    ],
  },
  tier2: {
    name: 'New Sale Pre-Harmonization',
    date: '< June 2023',
    description: 'Modern units with AC ledges still counted in floor area',
    thresholds: [
      { bedroom: '1-Bedroom', range: '< 600 sqft' },
      { bedroom: '2-Bedroom', range: '600 - 850 sqft' },
      { bedroom: '3-Bedroom', range: '850 - 1,200 sqft' },
      { bedroom: '4-Bedroom', range: '1,200 - 1,500 sqft' },
      { bedroom: '5-Bedroom+', range: '>= 1,500 sqft' },
    ],
  },
  tier3: {
    name: 'Resale (Any Date)',
    date: 'All resale transactions',
    description: 'Older properties with larger typical unit sizes',
    thresholds: [
      { bedroom: '1-Bedroom', range: '< 600 sqft' },
      { bedroom: '2-Bedroom', range: '600 - 950 sqft' },
      { bedroom: '3-Bedroom', range: '950 - 1,350 sqft' },
      { bedroom: '4-Bedroom', range: '1,350 - 1,650 sqft' },
      { bedroom: '5-Bedroom+', range: '>= 1,650 sqft' },
    ],
  },
};

const FLOOR_LEVELS = [
  { level: 'Low', floors: '01-05', description: 'Ground to 5th floor' },
  { level: 'Mid-Low', floors: '06-10', description: '6th to 10th floor' },
  { level: 'Mid', floors: '11-20', description: '11th to 20th floor' },
  { level: 'Mid-High', floors: '21-30', description: '21st to 30th floor' },
  { level: 'High', floors: '31-40', description: '31st to 40th floor' },
  { level: 'Luxury', floors: '41+', description: '41st floor and above' },
];

const PROPERTY_AGE_BUCKETS = [
  { bucket: 'New Sale', years: 'N/A', description: 'No resale transactions yet (developer sales only)' },
  { bucket: 'Recently TOP', years: '4-7 years', description: 'Projects that recently obtained Temporary Occupation Permit' },
  { bucket: 'Young Resale', years: '8-15 years', description: 'Relatively new resale properties' },
  { bucket: 'Resale', years: '15-25 years', description: 'Established resale market properties' },
  { bucket: 'Mature Resale', years: '25+ years', description: 'Older properties, may have en-bloc potential' },
  { bucket: 'Freehold', years: 'N/A', description: 'Tenure-based (perpetual ownership), not age-based' },
];

const REGIONS = [
  {
    code: 'CCR',
    name: 'Core Central Region',
    description: 'Premium/prime districts in the city center',
    districts: ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11'],
    areas: 'Raffles Place, Shenton Way, City Hall, Bugis, Orchard, Tanglin, Newton',
  },
  {
    code: 'RCR',
    name: 'Rest of Central Region',
    description: 'City fringe areas with good accessibility',
    districts: ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20'],
    areas: 'Queenstown, Harbourfront, Little India, Toa Payoh, Geylang, Katong, Bishan',
  },
  {
    code: 'OCR',
    name: 'Outside Central Region',
    description: 'Suburban areas',
    districts: ['D16', 'D17', 'D18', 'D19', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28'],
    areas: 'Bedok, Tampines, Punggol, Jurong, Woodlands, Yishun',
  },
];

/**
 * @param {{ title: string, children: React.ReactNode, id?: string }} props
 */
function SectionCard({ title, children, id }) {
  return (
    <div id={id} className="min-w-0 bg-white rounded-xl border border-brand-sky/30 shadow-sm overflow-hidden scroll-mt-4">
      <div className="px-4 py-3 bg-brand-sand/30 border-b border-brand-sky/20">
        <h2 className="text-base sm:text-lg font-semibold text-brand-navy">{title}</h2>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

function DataTable({ headers, rows, className = '' }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <>
      {/* Desktop: table view */}
      <div className={`hidden sm:block overflow-x-auto max-w-full ${className}`}>
        <table className="min-w-[600px] w-full text-sm">
          <thead>
            <tr className="border-b border-brand-sky/30">
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-semibold text-brand-navy whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, i) => {
              const cells = Array.isArray(row) ? row : [];
              return (
              <tr key={i} className="border-b border-brand-sky/20 last:border-0">
                {cells.map((cell, j) => (
                  <td key={j} className="px-3 py-2 text-brand-blue break-words">
                    {cell}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: card view */}
      <div className={`sm:hidden space-y-2 ${className}`}>
        {safeRows.map((row, i) => {
          const cells = Array.isArray(row) ? row : [];
          return (
          <div key={i} className="p-3 bg-white rounded-lg border border-brand-sky/20">
            {cells.map((cell, j) => (
              <div key={j} className={j < cells.length - 1 ? 'mb-2' : ''}>
                <dt className="text-xs font-semibold text-brand-navy mb-0.5">
                  {headers[j]}
                </dt>
                <dd className="text-sm text-brand-blue">{cell}</dd>
              </div>
            ))}
          </div>
          );
        })}
      </div>
    </>
  );
}

export function MethodologyContent() {
  const { apiMetadata: metadata, loading } = useData();

  // Format date for display
  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleDateString('en-SG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  // Format number with commas
  const formatNumber = (num) => {
    if (num === null || num === undefined) return 'N/A';
    return num.toLocaleString();
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
        <PageHeader
          title="Methodology"
          subtitle="Classification systems, assumptions, and data sources"
        />

        <div className="space-y-6 mt-6">
          {/* Bedroom Classification */}
          <SectionCard title="Bedroom Classification">
            <p className="text-sm text-brand-blue mb-4">
              URA data does not include bedroom count. We estimate bedroom types based on unit floor
              area (sqft) using a three-tier classification system that accounts for changing unit
              sizes over time.
            </p>

            <div className="space-y-4">
              {Object.entries(BEDROOM_THRESHOLDS).map(([key, tier]) => (
                <div key={key} className="bg-brand-sand/20 rounded-lg p-3">
                  <div className="flex flex-wrap items-baseline gap-2 mb-2">
                    <span className="font-semibold text-brand-navy text-sm sm:text-base">{tier.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded">
                      {tier.date}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-brand-blue mb-3">{tier.description}</p>
                  <DataTable
                    headers={['Bedroom Type', 'Floor Area Range']}
                    rows={tier.thresholds.map((t) => [t.bedroom, t.range])}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs sm:text-sm text-amber-800">
                <strong>Note:</strong> The June 2023 &quot;harmonization date&quot; refers to BCA&apos;s
                directive excluding AC ledges from Gross Floor Area calculations, resulting in
                smaller reported unit sizes for new launches.
              </p>
            </div>
          </SectionCard>

          {/* Floor Level Classification */}
          <SectionCard title="Floor Level Classification">
            <p className="text-sm text-brand-blue mb-4">
              Units are classified into floor level tiers based on the floor number. Higher floors
              typically command a premium due to views, privacy, and reduced noise.
            </p>
            <DataTable
              headers={['Level', 'Floor Range', 'Description']}
              rows={FLOOR_LEVELS.map((f) => [f.level, f.floors, f.description])}
            />
          </SectionCard>

          {/* Property Age Buckets */}
          <SectionCard title="Property Age Classification">
            <p className="text-sm text-brand-blue mb-4">
              Properties are categorized by age to help compare similar market segments. Age is
              calculated from the project&apos;s TOP (Temporary Occupation Permit) date.
            </p>
            <DataTable
              headers={['Category', 'Age Range', 'Description']}
              rows={PROPERTY_AGE_BUCKETS.map((p) => [p.bucket, p.years, p.description])}
            />
            <div className="mt-4 p-3 bg-sky-50 rounded-lg border border-sky-200">
              <p className="text-xs sm:text-sm text-sky-800">
                <strong>Note:</strong> &quot;New Sale&quot; and &quot;Freehold&quot; are not age-based categories.
                New Sale refers to projects with no resale history, while Freehold refers to tenure
                type (perpetual ownership).
              </p>
            </div>
          </SectionCard>

          {/* Market Regions */}
          <SectionCard title="Market Regions (URA Segments)">
            <p className="text-sm text-brand-blue mb-4">
              Singapore&apos;s private residential market is divided into three regions by the Urban
              Redevelopment Authority (URA). These segments reflect location value and pricing
              tiers.
            </p>
            <div className="space-y-4">
              {REGIONS.map((region) => (
                <div
                  key={region.code}
                  className={`bg-brand-sand/20 rounded-lg p-3 border-l-4 ${
                    region.code === 'CCR'
                      ? 'border-l-[#0F172A]'
                      : region.code === 'RCR'
                        ? 'border-l-[#334155]'
                        : 'border-l-[#64748B]'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        region.code === 'CCR'
                          ? 'bg-brand-navy text-white'
                          : region.code === 'RCR'
                            ? 'bg-brand-blue text-white'
                            : 'bg-brand-sky text-brand-navy'
                      }`}
                    >
                      {region.code}
                    </span>
                    <span className="font-semibold text-brand-navy text-sm sm:text-base">{region.name}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-brand-blue mb-2">{region.description}</p>
                  <div className="text-xs sm:text-sm">
                    <span className="text-brand-blue">Districts: </span>
                    <span className="text-brand-navy font-medium">{region.districts.join(', ')}</span>
                  </div>
                  <div className="text-xs sm:text-sm mt-1">
                    <span className="text-brand-blue">Areas: </span>
                    <span className="text-brand-navy">{region.areas}</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Key Metrics */}
          <SectionCard title="Key Metrics Explained">
            <div className="space-y-3">
              <div className="p-3 bg-brand-sand/20 rounded-lg">
                <h4 className="font-semibold text-brand-navy text-sm sm:text-base mb-1">PSF ($ per square foot)</h4>
                <p className="text-xs sm:text-sm text-brand-blue">
                  Transaction price divided by floor area in square feet. The primary metric for
                  comparing property values across different unit sizes.
                </p>
              </div>
              <div className="p-3 bg-brand-sand/20 rounded-lg">
                <h4 className="font-semibold text-brand-navy text-sm sm:text-base mb-1">Median vs Average</h4>
                <p className="text-xs sm:text-sm text-brand-blue">
                  We primarily use <strong>median</strong> values as they are more robust to
                  outliers. A few extremely high or low transactions can skew averages, but medians
                  represent the &quot;typical&quot; transaction better.
                </p>
              </div>
              <div className="p-3 bg-brand-sand/20 rounded-lg">
                <h4 className="font-semibold text-brand-navy text-sm sm:text-base mb-1">Liquidity Score</h4>
                <p className="text-xs sm:text-sm text-brand-blue">
                  A composite score (0-100) measuring how easily you can exit a property. Combines:
                  Exit Safety (60%) - velocity, breadth, concentration; and Market Health (40%) -
                  volume, diversity, stability. Based on <strong>resale only</strong> to measure
                  organic demand.
                </p>
              </div>
              <div className="p-3 bg-brand-sand/20 rounded-lg">
                <h4 className="font-semibold text-brand-navy text-sm sm:text-base mb-1">Outlier Exclusion</h4>
                <p className="text-xs sm:text-sm text-brand-blue">
                  Transactions with PSF values more than 3 standard deviations from the mean are
                  flagged as outliers and excluded from aggregate calculations to prevent
                  distortion.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Data Sources */}
          <SectionCard title="Data Sources">
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-brand-sand/20 rounded-lg">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-brand-navy flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">URA</span>
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-brand-navy text-sm sm:text-base">
                    Urban Redevelopment Authority
                  </h4>
                  <p className="text-xs sm:text-sm text-brand-blue mt-0.5">
                    Primary source for private residential transaction data. Updated monthly with
                    caveats filed with the Singapore Land Authority.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-brand-sand/20 rounded-lg">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-brand-blue flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">HDB</span>
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-brand-navy text-sm sm:text-base">
                    Housing & Development Board
                  </h4>
                  <p className="text-xs sm:text-sm text-brand-blue mt-0.5">
                    Source for HDB resale transaction data (not included in this application -
                    private condos only).
                  </p>
                </div>
              </div>
            </div>

            {/* Dynamic Database Stats */}
            <div className="mt-4 p-4 bg-brand-navy rounded-lg text-white">
              <h4 className="font-semibold text-sm sm:text-base mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                Database Statistics
              </h4>
              {loading ? (
                <div className="grid grid-cols-2 gap-3 animate-pulse">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white/10 rounded p-2">
                      <div className="h-3 bg-white/20 rounded w-20 mb-1"></div>
                      <div className="h-5 bg-white/20 rounded w-16"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/10 rounded p-2">
                    <div className="text-[10px] sm:text-xs text-white/70">Data last updated</div>
                    <div className="text-sm sm:text-base font-semibold">{formatDate(metadata?.last_updated)}</div>
                  </div>
                  <div className="bg-white/10 rounded p-2">
                    <div className="text-[10px] sm:text-xs text-white/70">Records added (latest)</div>
                    <div className="text-sm sm:text-base font-semibold">{formatNumber(metadata?.records_added_last_ingestion)}</div>
                  </div>
                  <div className="bg-white/10 rounded p-2">
                    <div className="text-[10px] sm:text-xs text-white/70">Total records</div>
                    <div className="text-sm sm:text-base font-semibold">{formatNumber(metadata?.total_records)}</div>
                  </div>
                  <div className="bg-white/10 rounded p-2">
                    <div className="text-[10px] sm:text-xs text-white/70">Outliers excluded</div>
                    <div className="text-sm sm:text-base font-semibold">{formatNumber(metadata?.outliers_excluded)}</div>
                  </div>
                </div>
              )}
              <p className="text-[10px] sm:text-xs text-white/60 mt-3">
                Data is processed via automated ingestion and validation pipelines.
                Figures may differ from official releases due to timing and filtering.
              </p>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs sm:text-sm text-slate-600">
                <strong>Data Freshness:</strong> Transaction data is typically available 4-6 weeks
                after the actual transaction date, as it depends on when caveats are lodged with
                SLA.
              </p>
            </div>
          </SectionCard>

          {/* Codebase Statistics */}
          <SectionCard title="Codebase Statistics">
            <p className="text-sm text-brand-blue mb-4">
              Track the growth and evolution of the application codebase over time.
              This chart shows lines of code at different points in the development history.
            </p>
            <LocTrendChart height={280} />
          </SectionCard>

          {/* Disclaimers */}
          <SectionCard title="Disclaimers">
            <div className="space-y-2 text-xs sm:text-sm text-brand-blue">
              <p>
                This application provides data analytics and insights for informational purposes
                only. It does not constitute financial, investment, or real estate advice.
              </p>
              <p>
                Bedroom classifications are estimates based on floor area and may not reflect actual
                unit configurations. Always verify unit details with the developer or agent.
              </p>
              <p>
                Past transaction data and trends do not guarantee future performance. Property
                values can fluctuate based on market conditions, government policies, and other
                factors.
              </p>
              <p>
                While we strive for accuracy, we make no warranties about the completeness or
                reliability of the data. Users should conduct their own due diligence before making
                any property decisions.
              </p>
            </div>
          </SectionCard>
        </div>

        {/* Footer spacing */}
        <div className="h-8" />
      </div>
    </div>
  );
}

export default MethodologyContent;
