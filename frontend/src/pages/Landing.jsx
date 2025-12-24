import { motion, useScroll, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Database,
  Map,
  ShieldCheck,
  LineChart,
  TrendingUp
} from 'lucide-react';
import YouVsMarketVisual from '../components/landing/YouVsMarketVisual';

/**
 * Landing Page - "Warm Precision" Design System with Unified Texture
 *
 * Design Fixes Applied:
 * - Global noise texture with position: fixed for consistent paper grain
 * - Removed section backgrounds to inherit global texture
 * - Added secondary ambient glow at bottom for visual balance
 */
const LandingPage = () => {
  const navigate = useNavigate();

  return (
    // Master canvas with global background color
    <div className="relative min-h-screen font-sans selection:bg-[#94B4C1]/30 text-[#213448] bg-[#FDFBF7] overflow-x-hidden">

      {/* Global Noise Texture (Fixed Position)
          Ensures the 'paper feel' persists down the entire page */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.08] z-0 mix-blend-multiply"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      {/* Global Ambient Orbs
          Top orb for hero, bottom orb for visual balance */}
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-[#94B4C1]/20 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[800px] h-[600px] bg-[#EAE0CF]/40 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* === NAV === */}
      <nav className="fixed w-full z-50 px-4 md:px-6 py-3 md:py-4 backdrop-blur-md border-b border-[#94B4C1]/10 bg-[#FDFBF7]/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#213448] rounded-lg flex items-center justify-center shadow-lg shadow-[#213448]/20">
              <LineChart className="w-5 h-5 text-[#EAE0CF]" />
            </div>
            <span className="font-bold tracking-tighter text-lg md:text-xl text-[#213448]">
              PropAnalytics.sg
            </span>
          </div>
          <div className="flex gap-2 md:gap-4">
            <button
              onClick={() => navigate('/login')}
              className="px-4 md:px-5 py-2 text-sm font-medium bg-[#213448] text-[#EAE0CF] rounded-lg hover:bg-[#547792] hover:shadow-lg active:scale-[0.98] transition-all shadow-lg shadow-[#213448]/10 min-h-[44px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
            >
              Log In
            </button>
          </div>
        </div>
      </nav>

      {/* Content Layer - sits above background elements */}
      <div className="relative z-10">
        <HeroSection navigate={navigate} />

        {/* Bento Grid - Increased top padding to compensate for removed Trust Bar */}
        <section className="pt-24 md:pt-32 pb-16 md:pb-24 px-4 md:px-6 relative z-10">
          <div className="max-w-7xl mx-auto">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-[280px] md:auto-rows-[320px]">
              <HeatmapCard />
              <SupplyCliffCard />
              <UnitMixCard />
              <DataValidationCard />
            </div>
          </div>
        </section>

        {/* CTA Section - Removed bg color, glass card design */}
        <section className="py-16 md:py-24 px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center p-8 md:p-12 rounded-3xl bg-white/50 border border-white/50 backdrop-blur-sm shadow-xl shadow-[#94B4C1]/10">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#213448] mb-4 tracking-tight">
              Ready to get started?
            </h2>
            <p className="text-[#547792] text-base md:text-lg mb-8 max-w-xl mx-auto">
              Join investors who use institutional-grade analytics to make
              data-driven property decisions.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="group px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl bg-[#213448] text-[#EAE0CF] font-medium hover:bg-[#547792] hover:shadow-2xl active:scale-[0.98] transition-all shadow-xl shadow-[#213448]/20 flex items-center gap-2 mx-auto min-h-[48px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
            >
              View Market Data
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </section>

        {/* Footer - Transparent with subtle backdrop */}
        <footer className="py-8 md:py-12 border-t border-[#94B4C1]/20 bg-white/40 backdrop-blur-md relative z-10">
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
    </div>
  );
};

/**
 * Hero Section - Outcome-driven design
 * Addresses buyer fear: "Am I overpaying?"
 */
function HeroSection({ navigate }) {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    // Paper layering effect for dashboard to pop
    <section className="relative pt-28 sm:pt-32 overflow-hidden min-h-screen flex flex-col items-center bg-[#EAE0CF]/30">

      {/* Text Content with fade on scroll */}
      <motion.div style={{ opacity }} className="relative z-20 text-center max-w-4xl px-6 flex flex-col items-center mb-16">

        {/* Trust Badge - Emerald ping animation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 px-4 py-1.5 rounded-full border border-[#94B4C1]/50 bg-white/50 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold tracking-wide uppercase text-[#213448]">
              Official URA Data Source
            </span>
          </div>
        </motion.div>

        {/* Headline - Professional, data-focused */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center max-w-4xl mx-auto mb-4"
        >
          <span className="block text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-[#213448] tracking-tight leading-[1.1]">
            Singapore Condo{' '}
            <span className="text-[#547792] whitespace-nowrap">Market Intelligence</span>
          </span>
        </motion.h1>

        {/* Subtitle - describes the value prop */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-center max-w-2xl mx-auto mb-10 text-lg md:text-xl text-[#547792] leading-relaxed"
        >
          Data-driven price benchmarking across projects, locations, and market segments — based on 100,000+ private property transactions.
        </motion.p>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={() => navigate('/login')}
            className="group px-8 py-4 rounded-lg bg-[#213448] text-[#EAE0CF] font-semibold shadow-lg shadow-[#213448]/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-3 min-h-[48px] touch-action-manipulation focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
          >
            <Database className="w-4 h-4" />
            <span>View Market Data</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </motion.div>

      {/* Combined Visual: Dashboard + YouVsMarket Card */}
      <div className="w-full max-w-7xl px-4 sm:px-6 relative z-10 mt-8 sm:mt-12 mb-8">

        {/* Desktop: Side by side layout - aligned heights */}
        <div className="hidden lg:grid lg:grid-cols-5 gap-6 items-stretch">

          {/* Dashboard Screenshot - 3D perspective (3 cols) */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="col-span-3 flex"
            style={{ perspective: '2000px' }}
          >
            <div
              className="relative rounded-xl overflow-hidden shadow-2xl shadow-[#213448]/15 bg-white ring-1 ring-[#213448]/5 w-full"
              style={{
                transformStyle: 'preserve-3d',
                transform: 'rotateY(3deg) rotateX(1deg)',
                transformOrigin: 'center center'
              }}
            >
              <img
                src="/dashboard-screenshot.png"
                alt="PropAnalytics Dashboard"
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/20 pointer-events-none" />
            </div>
          </motion.div>

          {/* YouVsMarket Card (2 cols) - stretches to match */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="col-span-2 flex"
          >
            <YouVsMarketVisual compact fillHeight />
          </motion.div>
        </div>

        {/* Mobile/Tablet: Stacked layout with dashboard behind */}
        <div className="lg:hidden relative">
          {/* Dashboard Screenshot - background, partial view */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 0.4, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="absolute inset-x-0 top-0 -z-10"
          >
            <div className="rounded-xl overflow-hidden shadow-xl">
              <img
                src="/dashboard-screenshot.png"
                alt="PropAnalytics Dashboard"
                className="w-full h-auto object-cover opacity-60 blur-[1px]"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#EAE0CF]/50 to-[#EAE0CF]" />
            </div>
          </motion.div>

          {/* YouVsMarket Card - foreground */}
          <div className="relative pt-8">
            <YouVsMarketVisual />
          </div>
        </div>
      </div>

    </section>
  );
}

/**
 * District Heatmaps Card - White background to pop against global texture
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
      className="col-span-1 md:col-span-2 rounded-2xl md:rounded-3xl border border-[#94B4C1]/30 bg-white p-6 md:p-8 relative overflow-hidden transition-all duration-300 group"
    >
      <div className="absolute top-6 md:top-8 right-6 md:right-8 p-2 md:p-3 bg-[#FDFBF7] rounded-xl md:rounded-2xl shadow-sm border border-[#EAE0CF] z-10">
        <Map className="w-5 h-5 md:w-6 md:h-6 text-[#547792]" />
      </div>

      <h3 className="text-xl md:text-2xl font-bold text-[#213448] mb-2 tracking-tight pr-16">
        District Heatmaps
      </h3>
      <p className="text-[#547792] text-sm md:text-base max-w-sm">
        Visualize rental yield and price compression across CCR, RCR, and OCR instantly.
      </p>

      <div className="absolute bottom-4 md:bottom-6 right-4 md:right-6 bg-[#FDFBF7] rounded-xl md:rounded-2xl border border-[#94B4C1]/30 shadow-lg p-3 md:p-4 group-hover:scale-105 transition-transform duration-500">
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
 * Cleaned & Validated Data Card - White background for consistency
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
      className="col-span-1 md:col-span-2 rounded-2xl md:rounded-3xl border border-[#94B4C1]/30 bg-white p-6 md:p-8 relative overflow-hidden transition-all duration-300 group"
    >
      <div className="absolute top-6 md:top-8 right-6 md:right-8 p-2 md:p-3 bg-[#FDFBF7] rounded-xl md:rounded-2xl shadow-sm border border-[#EAE0CF] z-10">
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

      <div className="absolute bottom-6 md:bottom-8 left-6 md:left-8 right-6 md:right-8 flex flex-wrap gap-4 md:gap-8">
        <div className="min-w-0">
          <div className="text-[10px] md:text-xs text-[#94B4C1] uppercase tracking-wide">Records Processed</div>
          <div className="text-lg md:text-2xl font-bold text-[#213448] font-mono tabular-nums">103,379</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] md:text-xs text-[#94B4C1] uppercase tracking-wide">Outliers Removed</div>
          <div className="text-lg md:text-2xl font-bold text-[#213448] font-mono tabular-nums">789</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] md:text-xs text-[#94B4C1] uppercase tracking-wide">Accuracy</div>
          <div className="text-lg md:text-2xl font-bold text-[#547792] font-mono tabular-nums">99.2%</div>
        </div>
      </div>
    </motion.div>
  );
}

export default LandingPage;
