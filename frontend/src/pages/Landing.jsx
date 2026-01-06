import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Database,
  Map,
  ShieldCheck,
} from 'lucide-react';
import YouVsMarketVisual from '../components/landing/YouVsMarketVisual';
import { IndustrialCard } from '../components/landing/IndustrialCard';
import { StencilLabel } from '../components/landing/StencilLabel';

/**
 * Landing Page - "Analog Industrial" / "Technical Brutalism" Design System
 *
 * Aesthetic: 1970s-80s Engineering Manual / Hardware Packaging
 * - Graph paper backgrounds
 * - No rounded corners (hard edges)
 * - Monospace typography (Space Mono + IBM Plex Mono)
 * - Vermillion accent (warning label orange)
 * - Hard offset shadows
 * - Mechanical/instant animations
 */

// Industrial animation presets
const industrialTransition = {
  duration: 0.15,
  ease: 'linear',
};

const industrialStagger = {
  staggerChildren: 0.05,
  delayChildren: 0.1,
};

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen font-brand selection:bg-[var(--color-vermillion)]/20 text-[var(--color-ink)] bg-graph-paper overflow-x-hidden">

      {/* Cross-hatch overlay for texture */}
      <div className="pattern-crosshatch fixed inset-0 pointer-events-none z-0" />

      {/* === NAV === */}
      <nav className="fixed w-full z-50 px-4 md:px-6 py-3 md:py-4 border-b-2 border-[var(--color-ink)]/10 bg-[var(--color-paper)]">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo - Industrial monospace */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[var(--color-ink)] flex items-center justify-center">
              <span className="text-[var(--color-paper)] font-brand font-bold text-sm">PA</span>
            </div>
            <span className="font-brand font-bold tracking-tight text-lg md:text-xl text-[var(--color-ink)]">
              PROPANALYTICS<span className="text-[var(--color-vermillion)]">.SG</span>
            </span>
          </div>

          {/* Login - Hard edge button */}
          <button
            onClick={() => navigate('/login')}
            className="btn-industrial text-sm shadow-hard-sm min-h-[44px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[var(--color-vermillion)] focus-visible:ring-offset-2 focus:outline-none"
          >
            LOG IN
          </button>
        </div>
      </nav>

      {/* Content Layer */}
      <div className="relative z-10">
        <HeroSection navigate={navigate} />

        {/* Bento Grid Section */}
        <section className="pt-24 md:pt-32 pb-16 md:pb-24 px-4 md:px-6 relative z-10 bg-ruled-paper">
          <div className="max-w-7xl mx-auto">
            <div className="mb-10 md:mb-16 text-center">
              <StencilLabel variant="ink" className="mb-4">CAPABILITIES</StencilLabel>
              <h2 className="font-brand text-2xl md:text-3xl lg:text-4xl font-bold text-[var(--color-ink)] mb-3 md:mb-4 tracking-tight uppercase">
                Everything you need to
                <br className="hidden sm:block" /> underwrite a deal.
              </h2>
              <p className="font-data-dense text-[var(--color-ink-light)] text-base md:text-lg max-w-xl mx-auto">
                Move beyond simple PSF trends. Layer multiple datasets to find hidden value.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-[280px] md:auto-rows-[320px]">
              <HeatmapCard />
              <SupplyCliffCard />
              <UnitMixCard />
              <DataValidationCard />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24 px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto">
            {/* Technical border frame */}
            <div className="relative border-2 border-[var(--color-ink)]/15 p-8 md:p-12 text-center registration-mark">
              <StencilLabel className="mb-6">ACTION REQUIRED</StencilLabel>

              <h2 className="font-brand text-2xl md:text-3xl lg:text-4xl font-bold text-[var(--color-ink)] mb-4 tracking-tight uppercase">
                Ready to get started?
              </h2>
              <p className="font-data-dense text-[var(--color-ink-light)] text-base md:text-lg mb-8 max-w-xl mx-auto">
                Join investors who use institutional-grade analytics to make data-driven property decisions.
              </p>

              <button
                onClick={() => navigate('/login')}
                className="btn-industrial-vermillion text-sm shadow-hard-lg min-h-[48px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[var(--color-ink)] focus-visible:ring-offset-2 focus:outline-none inline-flex items-center gap-2"
              >
                VIEW MARKET DATA
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 md:py-12 border-t-2 border-[var(--color-ink)]/10 bg-[var(--color-paper-dark)]">
          <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[var(--color-ink)] flex items-center justify-center">
                <span className="text-[var(--color-paper)] font-brand font-bold text-[10px]">PA</span>
              </div>
              <p className="font-brand text-[var(--color-ink-light)] text-sm uppercase tracking-wider">
                &copy; 2025 PROPANALYTICS.SG
              </p>
            </div>

            {/* Links */}
            <div className="flex gap-6 md:gap-8">
              {['METHODOLOGY', 'PRICING', 'CONTACT'].map((link) => (
                <a
                  key={link}
                  href="#"
                  className="font-brand text-[var(--color-ink-light)] text-sm font-medium uppercase tracking-wider
                    hover:text-[var(--color-ink)] hover:underline hover:decoration-dashed
                    transition-colors duration-100 min-h-[44px] flex items-center"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

/**
 * Hero Section - Industrial technical drawing aesthetic
 */
function HeroSection({ navigate }) {
  return (
    <section className="relative pt-28 sm:pt-32 overflow-hidden min-h-screen flex flex-col items-center">

      {/* Text Content */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: industrialStagger }}
        className="relative z-20 text-center max-w-4xl px-6 flex flex-col items-center mb-16"
      >
        {/* Trust Badge - Stencil style */}
        <motion.div
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: industrialTransition } }}
          className="mb-6"
        >
          <StencilLabel variant="ink">
            REF: OFFICIAL URA DATA SOURCE
          </StencilLabel>
        </motion.div>

        {/* Headline - Industrial typography */}
        <motion.h1
          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: industrialTransition } }}
          className="font-brand text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-[var(--color-ink)] tracking-tight text-center max-w-4xl uppercase leading-[1.1]"
        >
          Singapore Condo<br/>
          <span className="text-[var(--color-vermillion)]">Market Intelligence</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: industrialTransition } }}
          className="mt-6 text-lg md:text-xl text-[var(--color-ink-light)] font-data-dense max-w-2xl text-center leading-relaxed"
        >
          Data-driven price benchmarking across projects, locations, and market segments.
        </motion.p>

        {/* Stats line */}
        <motion.div
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: industrialTransition } }}
          className="mt-4 font-brand text-sm text-[var(--color-ink)] uppercase tracking-wider"
        >
          <span className="border-b-2 border-dashed border-[var(--color-vermillion)]">103,000+ TRANSACTIONS ANALYZED</span>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: industrialTransition } }}
          className="mt-10"
        >
          <button
            onClick={() => navigate('/login')}
            className="btn-industrial text-sm shadow-hard-lg min-h-[48px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[var(--color-vermillion)] focus-visible:ring-offset-2 focus:outline-none flex items-center gap-3"
          >
            <Database className="w-4 h-4" />
            ACCESS MARKET DATA
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </motion.div>

      {/* Dashboard + YouVsMarket Visual */}
      <div className="w-full max-w-7xl px-4 sm:px-6 relative z-10 mt-8 sm:mt-12 mb-8">

        {/* Desktop: Side by side layout */}
        <div className="hidden lg:grid lg:grid-cols-5 gap-6 items-stretch">

          {/* Dashboard Screenshot - Industrial frame */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: 0.2 }}
            className="col-span-3 flex"
          >
            <div className="relative w-full border-2 border-[var(--color-ink)]/15 shadow-hard-lg registration-mark overflow-hidden">
              <img
                src="/dashboard-screenshot.png"
                alt="PropAnalytics Dashboard"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </motion.div>

          {/* YouVsMarket Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: 0.3 }}
            className="col-span-2 flex"
          >
            <YouVsMarketVisual compact fillHeight />
          </motion.div>
        </div>

        {/* Mobile/Tablet: Stacked layout */}
        <div className="lg:hidden relative">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0.3, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="absolute inset-x-0 top-0 -z-10"
          >
            <div className="border border-[var(--color-ink)]/10 overflow-hidden">
              <img
                src="/dashboard-screenshot.png"
                alt="PropAnalytics Dashboard"
                className="w-full h-auto object-cover opacity-50"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--color-paper)]" />
            </div>
          </motion.div>

          <div className="relative pt-8">
            <YouVsMarketVisual />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * District Heatmaps Card - Industrial style
 */
function HeatmapCard() {
  const heatmapData = [
    [0.9, 0.8, 0.5, 0.3, 0.2, 0.3, 0.4],
    [0.7, 0.9, 0.6, 0.4, 0.3, 0.2, 0.3],
    [0.5, 0.7, 0.8, 0.6, 0.4, 0.3, 0.2],
    [0.3, 0.5, 0.6, 0.7, 0.5, 0.4, 0.3],
    [0.2, 0.3, 0.4, 0.5, 0.6, 0.5, 0.4],
  ];

  return (
    <IndustrialCard
      label="SPEC: DISTRICT VISUALIZATION"
      className="col-span-1 md:col-span-2 shadow-hard hover:shadow-hard-lg transition-shadow duration-100"
    >
      <div className="relative h-full">
        <div className="absolute top-0 right-0 p-2 border border-dashed border-[var(--color-ink)]/20">
          <Map className="w-5 h-5 md:w-6 md:h-6 text-[var(--color-ink-muted)]" />
        </div>

        <h3 className="font-brand text-xl md:text-2xl font-bold text-[var(--color-ink)] mb-2 tracking-tight uppercase pr-16">
          District Heatmaps
        </h3>
        <p className="font-data-dense text-[var(--color-ink-light)] text-sm md:text-base max-w-sm">
          Visualize rental yield and price compression across CCR, RCR, and OCR.
        </p>

        {/* Heatmap visualization - Hard edge squares */}
        <div className="absolute bottom-0 right-0 p-3 border border-dashed border-[var(--color-ink)]/20">
          <div className="flex gap-1">
            {heatmapData[0].map((_, colIndex) => (
              <div key={colIndex} className="flex flex-col gap-1">
                {heatmapData.map((row, rowIndex) => {
                  const intensity = row[colIndex];
                  return (
                    <div
                      key={rowIndex}
                      className="w-4 h-4 md:w-5 md:h-5"
                      style={{
                        backgroundColor: `rgba(26, 26, 26, ${0.15 + intensity * 0.7})`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 font-brand text-[8px] text-[var(--color-ink-muted)] uppercase tracking-wider">
            <span>LOW</span>
            <span>HIGH</span>
          </div>
        </div>
      </div>
    </IndustrialCard>
  );
}

/**
 * Supply Cliffs Card - Dark variant
 */
function SupplyCliffCard() {
  const barData = [
    { height: 65, label: '2024' },
    { height: 80, label: '2025' },
    { height: 45, label: '2026', isCliff: true },
    { height: 70, label: '2027' },
    { height: 55, label: '2028' },
  ];
  const avgHeight = 60;

  return (
    <IndustrialCard
      label="DATA: SUPPLY FORECAST"
      variant="dark"
      className="col-span-1 shadow-hard hover:shadow-hard-lg transition-shadow duration-100"
    >
      <div className="h-full flex flex-col">
        <div>
          <BarChart3 className="w-6 h-6 md:w-8 md:h-8 mb-3 md:mb-4 text-[var(--color-paper)]/60" />
          <h3 className="font-brand text-xl md:text-2xl font-bold mb-2 tracking-tight uppercase">
            Supply Cliffs
          </h3>
          <p className="font-data-dense text-[var(--color-paper)]/60 text-sm md:text-base">
            Predict price impact based on upcoming project TOP dates.
          </p>
        </div>

        {/* Bar chart - Hard edge bars */}
        <div className="relative flex-1 mt-4 min-h-[100px]">
          {/* Average line - dashed */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-[var(--color-paper)]/30 z-10"
            style={{ bottom: `${avgHeight}%` }}
          >
            <span className="absolute -top-3 right-0 font-brand text-[8px] text-[var(--color-paper)]/50 uppercase">
              AVG SUPPLY
            </span>
          </div>

          <div className="absolute inset-0 flex items-end gap-2">
            {barData.map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div
                  className={bar.isCliff ? 'bg-[var(--color-vermillion)]' : 'bg-[var(--color-paper)]/70'}
                  style={{ height: `${bar.height}%`, width: '100%' }}
                />
                <span className="font-brand text-[8px] text-[var(--color-paper)]/50 mt-1">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </IndustrialCard>
  );
}

/**
 * Unit Mix Analysis Card
 */
function UnitMixCard() {
  return (
    <IndustrialCard
      label="REF: UNIT BREAKDOWN"
      className="col-span-1 shadow-hard hover:shadow-hard-lg transition-shadow duration-100"
    >
      <div className="h-full flex flex-col">
        <div className="absolute top-4 right-4 p-2 border border-dashed border-[var(--color-ink)]/20">
          <Building2 className="w-5 h-5 md:w-6 md:h-6 text-[var(--color-ink-muted)]" />
        </div>

        <h3 className="font-brand text-xl md:text-2xl font-bold text-[var(--color-ink)] mb-2 tracking-tight uppercase pr-14">
          Unit Mix Analysis
        </h3>
        <p className="font-data-dense text-[var(--color-ink-light)] text-sm md:text-base">
          Compare profitability of different unit types within a project.
        </p>

        {/* Stacked bar - Hard edges, no gradients */}
        <div className="mt-auto pt-6 space-y-3">
          <div className="w-full h-10 md:h-12 flex border border-[var(--color-ink)]/10">
            <div className="h-full bg-[var(--color-vermillion)]" style={{ width: '28%' }} />
            <div className="h-full bg-[var(--color-ink)]/60" style={{ width: '47%' }} />
            <div className="h-full bg-[var(--color-ink)]" style={{ width: '25%' }} />
          </div>

          <div className="flex justify-between font-brand text-xs font-medium text-[var(--color-ink-light)] uppercase">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[var(--color-vermillion)]" />
              <span>1BR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[var(--color-ink)]/60" />
              <span>2BR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[var(--color-ink)]" />
              <span>3BR</span>
            </div>
          </div>
        </div>
      </div>
    </IndustrialCard>
  );
}

/**
 * Cleaned & Validated Data Card
 */
function DataValidationCard() {
  const logEntries = [
    { id: 'TXN_9918', status: 'VALID' },
    { id: 'TXN_9919', status: 'VALID' },
    { id: 'TXN_9920', status: 'VALID' },
    { id: 'TXN_9921', status: 'EXCLUDED', reason: 'Outlier' },
    { id: 'TXN_9922', status: 'VALID' },
    { id: 'TXN_9923', status: 'VALID' },
    { id: 'TXN_9924', status: 'EXCLUDED', reason: 'Non-market' },
    { id: 'TXN_9925', status: 'VALID' },
  ];

  return (
    <IndustrialCard
      label="REF: DATA INTEGRITY"
      className="col-span-1 md:col-span-2 shadow-hard hover:shadow-hard-lg transition-shadow duration-100"
    >
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="absolute top-4 right-4 p-2 border border-dashed border-[var(--color-ink)]/20">
              <ShieldCheck className="w-5 h-5 md:w-6 md:h-6 text-[var(--color-ink-muted)]" />
            </div>

            <h3 className="font-brand text-xl md:text-2xl font-bold text-[var(--color-ink)] mb-2 tracking-tight uppercase pr-16">
              Cleaned & Validated Data
            </h3>
            <p className="font-data-dense text-[var(--color-ink-light)] text-sm md:text-base max-w-md">
              We automatically flag and remove non-market outliers from{' '}
              <span className="font-bold text-[var(--color-ink)]">103,379</span> transaction records.
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-6 mb-4">
          <div>
            <div className="font-brand text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wider">RECORDS</div>
            <div className="font-data-dense text-lg md:text-2xl font-bold text-[var(--color-ink)]">103,379</div>
          </div>
          <div>
            <div className="font-brand text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wider">EXCLUDED</div>
            <div className="font-data-dense text-lg md:text-2xl font-bold text-[var(--color-vermillion)]">789</div>
          </div>
          <div>
            <div className="font-brand text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wider">ACCURACY</div>
            <div className="font-data-dense text-lg md:text-2xl font-bold text-[var(--color-olive)]">99.2%</div>
          </div>
        </div>

        {/* Terminal log */}
        <div className="mt-auto p-3 bg-[var(--color-ink)] text-[var(--color-paper)] font-data-dense text-[10px] leading-relaxed max-h-20 overflow-hidden">
          {logEntries.map((entry, i) => (
            <div key={i} className={entry.status === 'EXCLUDED' ? 'text-[var(--color-vermillion)]' : 'opacity-60'}>
              [{entry.id}] {entry.status} {entry.reason ? `(${entry.reason})` : ''}
            </div>
          ))}
        </div>
      </div>
    </IndustrialCard>
  );
}

export default LandingPage;
