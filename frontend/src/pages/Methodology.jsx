/**
 * Methodology Page
 *
 * Documents all assumptions, classifications, and data sources used in the application.
 * Helps users understand how metrics are calculated and data is categorized.
 */

import { PageHeader } from '../components/ui';

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

function SectionCard({ title, children, id }) {
  return (
    <div id={id} className="bg-white rounded-xl border border-[#94B4C1]/30 shadow-sm overflow-hidden scroll-mt-4">
      <div className="px-4 py-3 bg-[#EAE0CF]/30 border-b border-[#94B4C1]/20">
        <h2 className="text-lg font-semibold text-[#213448]">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function DataTable({ headers, rows, className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#94B4C1]/30">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-semibold text-[#213448] whitespace-nowrap"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#94B4C1]/20 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-[#547792]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MethodologyContent() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6 max-w-5xl mx-auto">
        <PageHeader
          title="Methodology"
          subtitle="Classification systems, assumptions, and data sources"
        />

        <div className="space-y-6 mt-6">
          {/* Bedroom Classification */}
          <SectionCard title="Bedroom Classification">
            <p className="text-sm text-[#547792] mb-4">
              URA data does not include bedroom count. We estimate bedroom types based on unit floor
              area (sqft) using a three-tier classification system that accounts for changing unit
              sizes over time.
            </p>

            <div className="space-y-4">
              {Object.entries(BEDROOM_THRESHOLDS).map(([key, tier]) => (
                <div key={key} className="bg-[#EAE0CF]/20 rounded-lg p-3">
                  <div className="flex flex-wrap items-baseline gap-2 mb-2">
                    <span className="font-semibold text-[#213448]">{tier.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-[#547792]/10 text-[#547792] rounded">
                      {tier.date}
                    </span>
                  </div>
                  <p className="text-xs text-[#547792] mb-3">{tier.description}</p>
                  <DataTable
                    headers={['Bedroom Type', 'Floor Area Range']}
                    rows={tier.thresholds.map((t) => [t.bedroom, t.range])}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-800">
                <strong>Note:</strong> The June 2023 &quot;harmonization date&quot; refers to BCA&apos;s
                directive excluding AC ledges from Gross Floor Area calculations, resulting in
                smaller reported unit sizes for new launches.
              </p>
            </div>
          </SectionCard>

          {/* Floor Level Classification */}
          <SectionCard title="Floor Level Classification">
            <p className="text-sm text-[#547792] mb-4">
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
            <p className="text-sm text-[#547792] mb-4">
              Properties are categorized by age to help compare similar market segments. Age is
              calculated from the project&apos;s TOP (Temporary Occupation Permit) date.
            </p>
            <DataTable
              headers={['Category', 'Age Range', 'Description']}
              rows={PROPERTY_AGE_BUCKETS.map((p) => [p.bucket, p.years, p.description])}
            />
            <div className="mt-4 p-3 bg-sky-50 rounded-lg border border-sky-200">
              <p className="text-xs text-sky-800">
                <strong>Note:</strong> &quot;New Sale&quot; and &quot;Freehold&quot; are not age-based categories.
                New Sale refers to projects with no resale history, while Freehold refers to tenure
                type (perpetual ownership).
              </p>
            </div>
          </SectionCard>

          {/* Market Regions */}
          <SectionCard title="Market Regions (URA Segments)">
            <p className="text-sm text-[#547792] mb-4">
              Singapore&apos;s private residential market is divided into three regions by the Urban
              Redevelopment Authority (URA). These segments reflect location value and pricing
              tiers.
            </p>
            <div className="space-y-4">
              {REGIONS.map((region) => (
                <div
                  key={region.code}
                  className="bg-[#EAE0CF]/20 rounded-lg p-3 border-l-4"
                  style={{
                    borderLeftColor:
                      region.code === 'CCR'
                        ? '#213448'
                        : region.code === 'RCR'
                          ? '#547792'
                          : '#94B4C1',
                  }}
                >
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        region.code === 'CCR'
                          ? 'bg-[#213448] text-white'
                          : region.code === 'RCR'
                            ? 'bg-[#547792] text-white'
                            : 'bg-[#94B4C1] text-[#213448]'
                      }`}
                    >
                      {region.code}
                    </span>
                    <span className="font-semibold text-[#213448]">{region.name}</span>
                  </div>
                  <p className="text-xs text-[#547792] mb-2">{region.description}</p>
                  <div className="text-xs">
                    <span className="text-[#547792]">Districts: </span>
                    <span className="text-[#213448] font-medium">{region.districts.join(', ')}</span>
                  </div>
                  <div className="text-xs mt-1">
                    <span className="text-[#547792]">Areas: </span>
                    <span className="text-[#213448]">{region.areas}</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Key Metrics */}
          <SectionCard title="Key Metrics Explained">
            <div className="space-y-3">
              <div className="p-3 bg-[#EAE0CF]/20 rounded-lg">
                <h4 className="font-semibold text-[#213448] text-sm mb-1">PSF ($ per square foot)</h4>
                <p className="text-xs text-[#547792]">
                  Transaction price divided by floor area in square feet. The primary metric for
                  comparing property values across different unit sizes.
                </p>
              </div>
              <div className="p-3 bg-[#EAE0CF]/20 rounded-lg">
                <h4 className="font-semibold text-[#213448] text-sm mb-1">Median vs Average</h4>
                <p className="text-xs text-[#547792]">
                  We primarily use <strong>median</strong> values as they are more robust to
                  outliers. A few extremely high or low transactions can skew averages, but medians
                  represent the &quot;typical&quot; transaction better.
                </p>
              </div>
              <div className="p-3 bg-[#EAE0CF]/20 rounded-lg">
                <h4 className="font-semibold text-[#213448] text-sm mb-1">Liquidity Score</h4>
                <p className="text-xs text-[#547792]">
                  A composite score (0-100) measuring how easily you can exit a property. Combines:
                  Exit Safety (60%) - velocity, breadth, concentration; and Market Health (40%) -
                  volume, diversity, stability. Based on <strong>resale only</strong> to measure
                  organic demand.
                </p>
              </div>
              <div className="p-3 bg-[#EAE0CF]/20 rounded-lg">
                <h4 className="font-semibold text-[#213448] text-sm mb-1">Outlier Exclusion</h4>
                <p className="text-xs text-[#547792]">
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
              <div className="flex items-start gap-3 p-3 bg-[#EAE0CF]/20 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-[#213448] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">URA</span>
                </div>
                <div>
                  <h4 className="font-semibold text-[#213448] text-sm">
                    Urban Redevelopment Authority
                  </h4>
                  <p className="text-xs text-[#547792] mt-0.5">
                    Primary source for private residential transaction data. Updated monthly with
                    caveats filed with the Singapore Land Authority.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-[#EAE0CF]/20 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-[#547792] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">HDB</span>
                </div>
                <div>
                  <h4 className="font-semibold text-[#213448] text-sm">
                    Housing & Development Board
                  </h4>
                  <p className="text-xs text-[#547792] mt-0.5">
                    Source for HDB resale transaction data (not included in this application -
                    private condos only).
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-600">
                <strong>Data Freshness:</strong> Transaction data is typically available 4-6 weeks
                after the actual transaction date, as it depends on when caveats are lodged with
                SLA.
              </p>
            </div>
          </SectionCard>

          {/* Disclaimers */}
          <SectionCard title="Disclaimers">
            <div className="space-y-2 text-xs text-[#547792]">
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
