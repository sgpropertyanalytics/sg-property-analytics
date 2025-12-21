import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Map,
  ShieldCheck,
  LineChart
} from 'lucide-react';

/**
 * Landing Page - "Warm Precision" Design System with Midday Hero
 *
 * Structure:
 * - Hero Section: Isometric tilted dashboard showcase
 * - Trust Bar: Data source logos
 * - Bento Grid: Feature cards
 * - CTA Section: Final call to action
 * - Footer
 */
const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen min-h-[100dvh] font-sans selection:bg-[#94B4C1]/30 text-[#213448] bg-[#FDFBF7] overflow-x-hidden">
      {/* === NAV === */}
      <nav className="fixed w-full z-50 px-4 md:px-6 py-3 md:py-4 backdrop-blur-md border-b border-[#94B4C1]/20 bg-[#FDFBF7]/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#213448] rounded-lg flex items-center justify-center">
              <LineChart className="w-5 h-5 text-[#EAE0CF]" />
            </div>
            <span className="font-bold tracking-tighter text-lg md:text-xl text-[#213448]">
              PropAnalytics.sg
            </span>
          </div>

          {/* Nav Actions */}
          <div className="flex gap-2 md:gap-4">
            <button
              onClick={() => navigate('/login')}
              className="px-4 md:px-5 py-2 text-sm font-medium bg-[#213448] text-[#EAE0CF] rounded-lg hover:bg-[#547792] hover:shadow-lg active:scale-[0.98] transition-all shadow-lg shadow-[#213448]/10 min-h-[44px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* === HERO SECTION - Isometric Tilted Dashboard === */}
      <HeroSection navigate={navigate} />

      {/* === TRUST BAR === */}
      <section className="py-8 md:py-12 border-y border-[#94B4C1]/20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
          <p className="text-[#547792] text-xs md:text-sm font-medium mb-4 md:mb-6 uppercase tracking-wider">
            Powered by official data sources
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 opacity-60 hover:opacity-80 transition-opacity">
            {['URA', 'REALIS', 'HDB', 'SLA'].map((source) => (
              <div
                key={source}
                className="text-xl md:text-2xl font-bold text-[#213448] tracking-tighter"
              >
                {source}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === BENTO GRID FEATURE SECTION === */}
      <section className="py-16 md:py-24 px-4 md:px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="mb-10 md:mb-16 text-center">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#213448] mb-3 md:mb-4 tracking-tight">
              Everything you need to
              <br className="hidden sm:block" /> underwrite a deal.
            </h2>
            <p className="text-[#547792] text-base md:text-lg max-w-xl mx-auto">
              Move beyond simple PSF trends. Layer multiple datasets to find
              hidden value.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-[280px] md:auto-rows-[320px]">
            <HeatmapCard />
            <SupplyCliffCard />
            <UnitMixCard />
            <DataValidationCard />
          </div>
        </div>
      </section>

      {/* === CTA SECTION === */}
      <section className="py-16 md:py-24 px-4 md:px-6 bg-[#FDFBF7]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#213448] mb-4 tracking-tight">
            Ready to get started?
          </h2>
          <p className="text-[#547792] text-base md:text-lg mb-8 max-w-xl mx-auto">
            Join investors who use institutional-grade analytics to make
            data-driven property decisions.
          </p>
          <button
            onClick={() => navigate('/market-pulse')}
            className="group px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl bg-[#213448] text-[#EAE0CF] font-medium hover:bg-[#547792] hover:shadow-2xl active:scale-[0.98] transition-all shadow-xl shadow-[#213448]/20 flex items-center gap-2 mx-auto min-h-[48px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
          >
            Access the Dashboard
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* === FOOTER === */}
      <footer className="py-8 md:py-12 border-t border-[#94B4C1]/20 bg-[#FDFBF7]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#213448] rounded-md flex items-center justify-center">
              <LineChart className="w-4 h-4 text-[#EAE0CF]" />
            </div>
            <p className="text-[#547792] text-sm">
              &copy; 2025 PropAnalytics.sg
            </p>
          </div>

          <div className="flex gap-6 md:gap-8">
            {['Methodology', 'Pricing', 'Contact'].map((link) => (
              <a
                key={link}
                href="#"
                className="text-[#547792] hover:text-[#213448] active:text-[#213448] text-sm font-medium transition-colors min-h-[44px] flex items-center touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:rounded focus:outline-none"
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

/**
 * Hero Section - "Midday" Style Dashboard Showcase
 * Collision-proof grid with enforced gap between text and image
 */
function HeroSection({ navigate }) {
  return (
    <section className="relative bg-[#FDFBF7] pt-28 sm:pt-32 lg:pt-28 pb-16 sm:pb-20 overflow-hidden min-h-[600px] lg:min-h-[90vh] flex items-center">
      {/* Background Gradients */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#94B4C1]/10 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-0 left-20 w-[600px] h-[600px] bg-[#547792]/5 rounded-full blur-[100px] -z-10" />

      {/* Grid Container - gap-8 on mobile, gap-16 on desktop for collision prevention */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full relative z-10 grid lg:grid-cols-12 gap-8 lg:gap-16 items-center h-full">

        {/* --- LEFT CONTENT (Cols 1-5) --- */}
        <div className="lg:col-span-5 relative z-20 flex flex-col justify-center">
          {/* Trust Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="self-start inline-flex items-center gap-2 px-3 py-1.5 mb-6 sm:mb-8 rounded-full border border-[#94B4C1]/40 bg-white/60 backdrop-blur-md shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-[#547792] animate-pulse" />
            <span className="text-xs font-bold text-[#213448] tracking-wide uppercase">
              Live Market Sync
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-[4.5rem] font-bold tracking-tight text-[#213448] mb-6 sm:mb-8 leading-[1]"
          >
            Property data, <br />
            <span className="text-[#547792]">clarified.</span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-base sm:text-lg text-[#547792] mb-8 sm:mb-10 max-w-md leading-relaxed"
          >
            Stop relying on outdated spreadsheets. Access institutional-grade transaction records and supply cliffs in real-time.
          </motion.p>

          {/* Buttons - Platform agnostic with touch targets */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-12 sm:mb-16"
          >
            <button
              onClick={() => navigate('/market-pulse')}
              className="group px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl bg-[#213448] text-[#EAE0CF] font-medium hover:bg-[#324b66] active:scale-[0.98] transition-all shadow-xl shadow-[#213448]/20 flex items-center justify-center gap-2 min-h-[48px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
            >
              Explore Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform opacity-80" />
            </button>
            <button
              onClick={() => navigate('/analytics-view')}
              className="px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl bg-white/80 border border-[#EAE0CF] text-[#547792] font-medium hover:bg-white active:scale-[0.98] active:bg-[#EAE0CF]/30 transition-all flex items-center justify-center gap-2 backdrop-blur-sm shadow-sm min-h-[48px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
            >
              View Demo
            </button>
          </motion.div>

          {/* Metrics */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex gap-8 sm:gap-12 border-t border-[#213448]/10 pt-6 sm:pt-8"
          >
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[#213448] font-mono tabular-nums tracking-tight">$2.8B+</div>
              <div className="text-[10px] sm:text-[11px] text-[#94B4C1] uppercase tracking-wider mt-1 font-bold">Value Analyzed</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[#213448] font-mono tabular-nums tracking-tight">103k</div>
              <div className="text-[10px] sm:text-[11px] text-[#94B4C1] uppercase tracking-wider mt-1 font-bold">Records</div>
            </div>
          </motion.div>

          {/* Mobile Dashboard Preview - Shows on tablet/mobile */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="lg:hidden mt-8 sm:mt-12"
          >
            <div className="rounded-xl overflow-hidden shadow-xl shadow-[#213448]/10 border border-[#94B4C1]/20 bg-white">
              <div className="h-6 sm:h-8 bg-[#FDFBF7] border-b border-[#EAE0CF] flex items-center px-3 sm:px-4 gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#EAE0CF] border border-[#d6cbb6]"></div>
                  <div className="w-2 h-2 rounded-full bg-[#EAE0CF] border border-[#d6cbb6]"></div>
                  <div className="w-2 h-2 rounded-full bg-[#EAE0CF] border border-[#d6cbb6]"></div>
                </div>
              </div>
              <img
                src="/dashboard-screenshot.png"
                alt="Dashboard Preview"
                className="w-full h-auto bg-gray-50"
              />
            </div>
          </motion.div>
        </div>

        {/* --- RIGHT VISUAL (Cols 6-12) - Collision-proof placement --- */}
        {/* Image starts at Column 6's edge - physically cannot overlap text in Column 5 */}
        <div className="hidden lg:block lg:col-span-7 relative h-[800px] flex items-center">
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute left-4 w-[140%]"
            style={{ perspective: '2000px' }}
          >
            {/* Left edge fade mask */}
            <div className="absolute inset-y-0 left-0 z-20 bg-gradient-to-r from-[#FDFBF7] via-[#FDFBF7]/40 to-transparent w-[15%]" />

            {/* Dashboard Transform - translateX pushes deeper right for extra air */}
            <div
              className="w-full rounded-xl overflow-hidden shadow-2xl shadow-[#213448]/20"
              style={{
                transform: 'rotateY(-12deg) rotateX(6deg) rotateZ(2deg) translateX(40px) scale(1)',
                transformOrigin: 'center left',
                backgroundColor: 'white'
              }}
            >
              <img
                src="/dashboard-screenshot.png"
                alt="Dashboard Preview"
                className="w-full h-auto object-cover"
              />

              {/* Gloss Overlay */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/30 pointer-events-none mix-blend-overlay" />
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  );
}

/**
 * District Heatmaps Card - GitHub-style contribution grid
 */
function HeatmapCard() {
  const generateHeatmapData = () => {
    const intensities = [
      [0.9, 0.8, 0.5, 0.3, 0.2, 0.3, 0.4],
      [0.7, 0.9, 0.6, 0.4, 0.3, 0.2, 0.3],
      [0.5, 0.7, 0.8, 0.6, 0.4, 0.3, 0.2],
      [0.3, 0.5, 0.6, 0.7, 0.5, 0.4, 0.3],
      [0.2, 0.3, 0.4, 0.5, 0.6, 0.5, 0.4],
    ];
    return intensities;
  };

  const heatmapData = generateHeatmapData();

  return (
    <motion.div
      whileHover={{ y: -5, boxShadow: '0 25px 50px -12px rgba(148, 180, 193, 0.25)' }}
      className="col-span-1 md:col-span-2 rounded-2xl md:rounded-3xl border border-[#94B4C1]/30 bg-[#FDFBF7] p-6 md:p-8 relative overflow-hidden transition-all duration-300 group"
    >
      <div className="absolute top-6 md:top-8 right-6 md:right-8 p-2 md:p-3 bg-white rounded-xl md:rounded-2xl shadow-sm border border-[#EAE0CF] z-10">
        <Map className="w-5 h-5 md:w-6 md:h-6 text-[#547792]" />
      </div>

      <h3 className="text-xl md:text-2xl font-bold text-[#213448] mb-2 tracking-tight pr-16">
        District Heatmaps
      </h3>
      <p className="text-[#547792] text-sm md:text-base max-w-sm">
        Visualize rental yield and price compression across CCR, RCR, and OCR instantly.
      </p>

      <div className="absolute bottom-4 md:bottom-6 right-4 md:right-6 bg-white rounded-xl md:rounded-2xl border border-[#94B4C1]/30 shadow-lg p-3 md:p-4 group-hover:scale-105 transition-transform duration-500">
        <div className="flex gap-0.5 md:gap-1">
          {heatmapData[0].map((_, colIndex) => (
            <div key={colIndex} className="flex flex-col gap-0.5 md:gap-1">
              {heatmapData.map((row, rowIndex) => {
                const intensity = row[colIndex];
                const bgColor = intensity > 0.7
                  ? 'bg-[#213448]'
                  : intensity > 0.5
                    ? 'bg-[#547792]'
                    : intensity > 0.3
                      ? 'bg-[#94B4C1]'
                      : 'bg-[#EAE0CF]';
                return (
                  <div
                    key={rowIndex}
                    className={`w-4 h-4 md:w-5 md:h-5 rounded-sm ${bgColor} transition-all duration-300`}
                    style={{ opacity: 0.3 + intensity * 0.7 }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2 text-[8px] md:text-[10px] text-[#94B4C1]">
          <span>Low</span>
          <div className="flex gap-0.5">
            <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-sm bg-[#EAE0CF]" />
            <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-sm bg-[#94B4C1]" />
            <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-sm bg-[#547792]" />
            <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-sm bg-[#213448]" />
          </div>
          <span>High</span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Supply Cliffs Card - Dark card with 3D bars and average line
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
    <motion.div
      whileHover={{ y: -5, boxShadow: '0 25px 50px -12px rgba(33, 52, 72, 0.4)' }}
      className="col-span-1 rounded-2xl md:rounded-3xl bg-[#213448] p-6 md:p-8 relative overflow-hidden text-[#EAE0CF] flex flex-col justify-between transition-all duration-300"
    >
      <div>
        <BarChart3 className="w-6 h-6 md:w-8 md:h-8 mb-3 md:mb-4 text-[#94B4C1]" />
        <h3 className="text-xl md:text-2xl font-bold mb-2 tracking-tight">Supply Cliffs</h3>
        <p className="text-[#94B4C1]/80 text-sm md:text-base">
          Predict price impact based on upcoming project TOP dates.
        </p>
      </div>

      <div className="relative w-full h-28 md:h-36 mt-4">
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-[#94B4C1]/50 z-10"
          style={{ bottom: `${avgHeight}%` }}
        >
          <span className="absolute -top-3 right-0 text-[8px] md:text-[10px] text-[#94B4C1]">
            Avg Supply
          </span>
        </div>

        <div className="absolute inset-0 flex items-end gap-1.5 md:gap-2">
          {barData.map((bar, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div
                className={`w-full rounded-t-md transition-all duration-300 ${
                  bar.isCliff
                    ? 'bg-gradient-to-t from-[#EAE0CF] to-[#d4c5ad] animate-pulse'
                    : 'bg-gradient-to-t from-[#547792] to-[#6b8da8]'
                }`}
                style={{
                  height: `${bar.height}%`,
                  boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.1)',
                }}
              />
              <span className="text-[8px] md:text-[10px] text-[#94B4C1] mt-1">{bar.label}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Unit Mix Analysis Card
 */
function UnitMixCard() {
  return (
    <motion.div
      whileHover={{ y: -5, boxShadow: '0 25px 50px -12px rgba(148, 180, 193, 0.25)' }}
      className="col-span-1 rounded-2xl md:rounded-3xl border border-[#94B4C1]/30 bg-white p-6 md:p-8 relative overflow-hidden transition-all duration-300"
    >
      <div className="absolute top-6 md:top-8 right-6 md:right-8 p-2 md:p-3 bg-[#FDFBF7] rounded-xl md:rounded-2xl border border-[#EAE0CF]">
        <Building2 className="w-5 h-5 md:w-6 md:h-6 text-[#547792]" />
      </div>

      <h3 className="text-xl md:text-2xl font-bold text-[#213448] mb-2 tracking-tight pr-14">
        Unit Mix Analysis
      </h3>
      <p className="text-[#547792] text-sm md:text-base">
        Compare profitability of different unit types within a project.
      </p>

      <div className="mt-8 md:mt-12 space-y-3">
        <div className="w-full h-10 md:h-12 bg-[#FDFBF7] rounded-lg overflow-hidden flex border border-[#EAE0CF] shadow-inner">
          <div
            className="h-full bg-gradient-to-b from-[rgba(247,190,129,0.95)] to-[rgba(237,170,100,0.95)]"
            style={{ width: '28%' }}
          />
          <div
            className="h-full bg-gradient-to-b from-[rgba(79,129,189,0.95)] to-[rgba(60,105,160,0.95)]"
            style={{ width: '47%' }}
          />
          <div
            className="h-full bg-gradient-to-b from-[rgba(40,82,122,0.95)] to-[rgba(30,62,95,0.95)]"
            style={{ width: '25%' }}
          />
        </div>

        <div className="flex justify-between text-xs md:text-sm font-medium text-[#547792]">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[rgba(247,190,129,0.9)]" />
            <span>1BR</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[rgba(79,129,189,0.9)]" />
            <span>2BR</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[rgba(40,82,122,0.9)]" />
            <span>3BR</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Cleaned & Validated Data Card - Matrix terminal effect
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
    { id: 'TXN_9926', status: 'VALID' },
    { id: 'TXN_9927', status: 'VALID' },
    { id: 'TXN_9928', status: 'VALID' },
    { id: 'TXN_9929', status: 'EXCLUDED', reason: 'Outlier' },
    { id: 'TXN_9930', status: 'VALID' },
  ];

  return (
    <motion.div
      whileHover={{ y: -5, boxShadow: '0 25px 50px -12px rgba(148, 180, 193, 0.25)' }}
      className="col-span-1 md:col-span-2 rounded-2xl md:rounded-3xl border border-[#94B4C1]/30 bg-[#FDFBF7] p-6 md:p-8 relative overflow-hidden transition-all duration-300 group"
    >
      <div className="absolute top-6 md:top-8 right-6 md:right-8 p-2 md:p-3 bg-white rounded-xl md:rounded-2xl shadow-sm border border-[#EAE0CF] z-10">
        <ShieldCheck className="w-5 h-5 md:w-6 md:h-6 text-[#547792]" />
      </div>

      <div className="relative z-10">
        <h3 className="text-xl md:text-2xl font-bold text-[#213448] mb-2 tracking-tight pr-16">
          Cleaned & Validated Data
        </h3>
        <p className="text-[#547792] text-sm md:text-base max-w-md">
          We automatically flag and remove non-market outliers from{' '}
          <span className="font-semibold text-[#213448]">103,379</span> transaction records.
        </p>
      </div>

      <div className="absolute right-0 top-0 w-1/2 md:w-2/5 h-full opacity-40 group-hover:opacity-60 transition-opacity pointer-events-none select-none overflow-hidden font-mono text-[9px] md:text-[10px] leading-relaxed text-[#213448] p-4 text-right">
        <div className="animate-scroll-up space-y-1">
          {[...logEntries, ...logEntries].map((entry, i) => (
            <p
              key={i}
              className={
                entry.status === 'EXCLUDED'
                  ? 'text-red-600/80 font-semibold'
                  : 'text-[#547792]/60'
              }
            >
              {entry.id}...{' '}
              {entry.status === 'EXCLUDED' ? (
                <span>EXCLUDED ({entry.reason})</span>
              ) : (
                'VALID'
              )}
            </p>
          ))}
        </div>
      </div>

      <div className="absolute bottom-6 md:bottom-8 left-6 md:left-8 right-6 md:right-8 flex gap-4 md:gap-8">
        <div>
          <div className="text-[10px] md:text-xs text-[#94B4C1] uppercase tracking-wide">Records Processed</div>
          <div className="text-lg md:text-2xl font-bold text-[#213448] font-mono">103,379</div>
        </div>
        <div>
          <div className="text-[10px] md:text-xs text-[#94B4C1] uppercase tracking-wide">Outliers Removed</div>
          <div className="text-lg md:text-2xl font-bold text-[#213448] font-mono">789</div>
        </div>
        <div>
          <div className="text-[10px] md:text-xs text-[#94B4C1] uppercase tracking-wide">Accuracy</div>
          <div className="text-lg md:text-2xl font-bold text-[#547792] font-mono">99.2%</div>
        </div>
      </div>
    </motion.div>
  );
}

export default LandingPage;
