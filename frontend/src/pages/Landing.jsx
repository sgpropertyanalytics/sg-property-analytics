import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Map,
  ShieldCheck,
  TrendingUp,
  LineChart
} from 'lucide-react';

/**
 * Landing Page - "Warm Precision" Design System
 *
 * A premium landing page showcasing the Singapore Property Analytics platform.
 * Completely separate from the analytics dashboard routes.
 *
 * Design: Warm backgrounds (Sand/Cream) with Deep Navy typography
 * and Sky/Ocean Blue accents for a premium, distinctive feel.
 */
const LandingPage = () => {
  const navigate = useNavigate();

  // Color palette from ColorHunt
  const colors = {
    navy: '#213448',    // Deep Navy - headings, primary text
    ocean: '#547792',   // Ocean Blue - secondary text, labels
    sky: '#94B4C1',     // Sky Blue - borders, icons
    sand: '#EAE0CF',    // Sand/Cream - backgrounds, hover
    bg: '#FDFBF7',      // Light tint of Sand for background
  };

  // Animation variants for staggered reveal
  const heroVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
        ease: 'easeOut',
      },
    }),
  };

  // Feature cards data
  const features = [
    {
      title: 'District Heatmaps',
      description: 'Visualize rental yield and price compression across CCR, RCR, and OCR instantly.',
      icon: Map,
      span: 'col-span-1 md:col-span-2',
      variant: 'light',
    },
    {
      title: 'Supply Cliffs',
      description: 'Predict price impact based on upcoming project TOP dates.',
      icon: BarChart3,
      span: 'col-span-1',
      variant: 'dark',
    },
    {
      title: 'Unit Mix Analysis',
      description: 'Compare profitability of different unit types within a project.',
      icon: Building2,
      span: 'col-span-1',
      variant: 'light',
    },
    {
      title: 'Cleaned & Validated Data',
      description: 'We process thousands of transaction records, removing outliers to give you a true picture of the market.',
      icon: ShieldCheck,
      span: 'col-span-1 md:col-span-2',
      variant: 'light',
    },
  ];

  return (
    <div
      className="min-h-screen min-h-[100dvh] font-sans selection:bg-[#94B4C1]/30 text-[#213448] overflow-x-hidden"
      style={{ backgroundColor: colors.bg }}
    >
      {/* === NAV === */}
      <nav className="fixed w-full z-50 px-4 md:px-6 py-3 md:py-4 backdrop-blur-md border-b border-[#94B4C1]/20 bg-[#FDFBF7]/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#213448] rounded-lg flex items-center justify-center">
              <LineChart className="w-5 h-5 text-[#EAE0CF]" />
            </div>
            <span className="font-bold tracking-tight text-lg md:text-xl text-[#213448]">
              PropAnalytics.sg
            </span>
          </div>

          {/* Nav Actions */}
          <div className="flex gap-2 md:gap-4">
            <button
              onClick={() => navigate('/login')}
              className="hidden md:block px-4 py-2 text-sm font-medium text-[#547792] hover:text-[#213448] transition-colors min-h-[44px]"
            >
              Log In
            </button>
            <button
              onClick={() => navigate('/market-pulse')}
              className="px-4 md:px-5 py-2 text-sm font-medium bg-[#213448] text-[#EAE0CF] rounded-lg hover:bg-[#547792] active:scale-[0.98] transition-all shadow-lg shadow-[#213448]/10 min-h-[44px] touch-action-manipulation"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* === HERO SECTION === */}
      <section className="relative pt-24 md:pt-32 pb-12 md:pb-20 px-4 md:px-6 overflow-hidden">
        {/* Background blur blob */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-[#94B4C1]/20 rounded-full blur-[100px] md:blur-[120px] -z-10" />

        <div className="max-w-4xl mx-auto text-center">
          {/* Trust pill */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={heroVariants}
            className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 md:mb-8 rounded-full border border-[#94B4C1] bg-white/50 backdrop-blur-sm shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-[#547792] animate-pulse" />
            <span className="text-xs font-semibold text-[#547792] tracking-wide uppercase">
              Direct Connection to URA Data
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={heroVariants}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold tracking-tight text-[#213448] mb-4 md:mb-6 leading-[1.1]"
          >
            The new standard for{' '}
            <br className="hidden sm:block" />
            <span className="text-[#547792]">Singapore property analysis.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={heroVariants}
            className="text-base md:text-lg lg:text-xl text-[#547792] mb-8 md:mb-10 max-w-2xl mx-auto leading-relaxed px-2"
          >
            Institutional-grade tools for the modern investor. Visualize price
            gaps, model rental yields, and spot undervalued districts instantly.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={heroVariants}
            className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center items-center px-4"
          >
            <button
              onClick={() => navigate('/market-pulse')}
              className="group w-full sm:w-auto px-6 md:px-8 py-3 md:py-3.5 rounded-xl bg-[#213448] text-[#EAE0CF] font-medium hover:bg-[#547792] active:scale-[0.98] transition-all shadow-xl shadow-[#213448]/20 flex items-center justify-center gap-2 min-h-[48px] touch-action-manipulation"
            >
              Explore the Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/analytics-view')}
              className="w-full sm:w-auto px-6 md:px-8 py-3 md:py-3.5 rounded-xl bg-white border border-[#94B4C1]/50 text-[#547792] hover:bg-[#EAE0CF]/50 active:scale-[0.98] transition-all font-medium min-h-[48px] touch-action-manipulation"
            >
              View Analytics Demo
            </button>
          </motion.div>
        </div>

        {/* === TILTED DASHBOARD MOCKUP === */}
        <motion.div
          initial={{ opacity: 0, y: 60, rotateX: 15 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.8, delay: 0.4, type: 'spring', bounce: 0.3 }}
          className="mt-12 md:mt-20 max-w-6xl mx-auto"
          style={{ perspective: '1000px' }}
        >
          <div className="relative rounded-xl md:rounded-2xl border border-[#94B4C1]/40 bg-white/80 shadow-2xl shadow-[#213448]/10 overflow-hidden backdrop-blur-sm p-1.5 md:p-2">
            {/* Glass effect overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 pointer-events-none z-20" />

            {/* Dashboard Screenshot Placeholder */}
            <div className="aspect-[16/9] bg-[#FDFBF7] rounded-lg md:rounded-xl border border-[#EAE0CF] overflow-hidden relative">
              {/*
                PLACEHOLDER FOR DASHBOARD SCREENSHOT
                Replace this div with your actual dashboard image:
                <img
                  src="/dashboard-screenshot.png"
                  alt="Singapore Property Analytics Dashboard"
                  className="w-full h-full object-cover"
                />
              */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 md:p-8 bg-gradient-to-br from-[#FDFBF7] to-[#EAE0CF]/30">
                {/* Simulated Dashboard Header */}
                <div className="w-full max-w-4xl">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <div className="w-6 h-6 md:w-8 md:h-8 bg-[#213448] rounded-lg" />
                    <div className="h-4 md:h-5 w-32 md:w-48 bg-[#213448] rounded" />
                  </div>

                  {/* KPI Cards Row */}
                  <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-white rounded-lg p-2 md:p-4 border border-[#94B4C1]/30 shadow-sm">
                        <div className="h-2 md:h-3 w-12 md:w-16 bg-[#94B4C1]/50 rounded mb-1 md:mb-2" />
                        <div className="h-4 md:h-6 w-16 md:w-24 bg-[#213448] rounded" />
                      </div>
                    ))}
                  </div>

                  {/* Chart Area */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
                    {/* Main Chart */}
                    <div className="bg-white rounded-lg p-3 md:p-4 border border-[#94B4C1]/30 shadow-sm md:col-span-1">
                      <div className="h-2 md:h-3 w-20 md:w-28 bg-[#547792] rounded mb-2 md:mb-4" />
                      <div className="flex items-end gap-1 md:gap-2 h-16 md:h-32">
                        {[40, 60, 45, 80, 65, 90, 55, 70, 85, 50].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-gradient-to-t from-[#213448] to-[#547792] rounded-t transition-all"
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Secondary Chart */}
                    <div className="bg-white rounded-lg p-3 md:p-4 border border-[#94B4C1]/30 shadow-sm md:col-span-1">
                      <div className="h-2 md:h-3 w-20 md:w-24 bg-[#547792] rounded mb-2 md:mb-4" />
                      <div className="space-y-1 md:space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="h-4 md:h-8 bg-[#213448] rounded" style={{ width: '80%' }} />
                          <span className="text-[8px] md:text-xs text-[#547792]">OCR</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-4 md:h-8 bg-[#547792] rounded" style={{ width: '65%' }} />
                          <span className="text-[8px] md:text-xs text-[#547792]">RCR</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-4 md:h-8 bg-[#94B4C1] rounded" style={{ width: '45%' }} />
                          <span className="text-[8px] md:text-xs text-[#547792]">CCR</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Overlay Text */}
                <div className="absolute inset-0 flex items-center justify-center bg-[#213448]/5 backdrop-blur-[1px]">
                  <div className="text-center">
                    <TrendingUp className="w-8 h-8 md:w-12 md:h-12 text-[#547792] mx-auto mb-2" />
                    <p className="text-sm md:text-base text-[#547792] font-medium">
                      Dashboard Preview
                    </p>
                    <p className="text-xs text-[#94B4C1] mt-1">
                      Replace with actual screenshot
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

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
                className="text-xl md:text-2xl font-bold text-[#213448] tracking-tight"
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
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#213448] mb-3 md:mb-4">
              Everything you need to
              <br className="hidden sm:block" /> underwrite a deal.
            </h2>
            <p className="text-[#547792] text-base md:text-lg max-w-xl mx-auto">
              Move beyond simple PSF trends. Layer multiple datasets to find
              hidden value.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-[250px] md:auto-rows-[300px]">
            {features.map((feature, index) => (
              <FeatureCard key={index} feature={feature} />
            ))}
          </div>
        </div>
      </section>

      {/* === CTA SECTION === */}
      <section className="py-16 md:py-24 px-4 md:px-6 bg-[#FDFBF7]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#213448] mb-4">
            Ready to get started?
          </h2>
          <p className="text-[#547792] text-base md:text-lg mb-8 max-w-xl mx-auto">
            Join investors who use institutional-grade analytics to make
            data-driven property decisions.
          </p>
          <button
            onClick={() => navigate('/market-pulse')}
            className="group px-8 py-4 rounded-xl bg-[#213448] text-[#EAE0CF] font-medium hover:bg-[#547792] active:scale-[0.98] transition-all shadow-xl shadow-[#213448]/20 flex items-center gap-2 mx-auto min-h-[48px] touch-action-manipulation"
          >
            Access the Dashboard
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* === FOOTER === */}
      <footer className="py-8 md:py-12 border-t border-[#94B4C1]/20 bg-[#FDFBF7]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Logo & Copyright */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#213448] rounded-md flex items-center justify-center">
              <LineChart className="w-4 h-4 text-[#EAE0CF]" />
            </div>
            <p className="text-[#547792] text-sm">
              &copy; 2025 PropAnalytics.sg
            </p>
          </div>

          {/* Footer Links */}
          <div className="flex gap-6 md:gap-8">
            <a
              href="#"
              className="text-[#547792] hover:text-[#213448] text-sm font-medium transition-colors min-h-[44px] flex items-center"
            >
              Methodology
            </a>
            <a
              href="#"
              className="text-[#547792] hover:text-[#213448] text-sm font-medium transition-colors min-h-[44px] flex items-center"
            >
              Pricing
            </a>
            <a
              href="#"
              className="text-[#547792] hover:text-[#213448] text-sm font-medium transition-colors min-h-[44px] flex items-center"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

/**
 * Feature Card Component for Bento Grid
 */
function FeatureCard({ feature }) {
  const { title, description, icon: Icon, span, variant } = feature;

  if (variant === 'dark') {
    return (
      <motion.div
        whileHover={{ y: -5 }}
        className={`${span} rounded-2xl md:rounded-3xl bg-[#213448] p-6 md:p-8 relative overflow-hidden text-[#EAE0CF] flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-[#213448]/20`}
      >
        <div>
          <Icon className="w-6 h-6 md:w-8 md:h-8 mb-3 md:mb-4 text-[#94B4C1]" />
          <h3 className="text-xl md:text-2xl font-bold mb-2">{title}</h3>
          <p className="text-[#94B4C1]/80 text-sm md:text-base">
            {description}
          </p>
        </div>

        {/* Bar chart visualization */}
        <div className="w-full h-24 md:h-32 flex items-end gap-1 md:gap-2 mt-4">
          {[40, 60, 30, 80, 50].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-md transition-all ${
                i === 2
                  ? 'bg-[#EAE0CF] animate-pulse'
                  : 'bg-[#547792]'
              }`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </motion.div>
    );
  }

  // Light variant (default)
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className={`${span} rounded-2xl md:rounded-3xl border border-[#94B4C1]/30 bg-[#FDFBF7] p-6 md:p-8 relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-[#94B4C1]/10`}
    >
      {/* Icon badge */}
      <div className="absolute top-6 md:top-8 right-6 md:right-8 p-2 md:p-3 bg-white rounded-xl md:rounded-2xl shadow-sm border border-[#EAE0CF]">
        <Icon className="w-5 h-5 md:w-6 md:h-6 text-[#547792]" />
      </div>

      <h3 className="text-xl md:text-2xl font-bold text-[#213448] mb-2 pr-12">
        {title}
      </h3>
      <p className="text-[#547792] text-sm md:text-base max-w-sm">
        {description}
      </p>

      {/* Conditional visualization based on feature */}
      {title === 'District Heatmaps' && (
        <div className="absolute bottom-0 right-0 w-2/3 h-2/3 translate-x-8 md:translate-x-12 translate-y-8 md:translate-y-12 bg-white rounded-tl-2xl md:rounded-tl-3xl border-l border-t border-[#94B4C1]/30 shadow-lg p-3 md:p-4 group-hover:translate-x-8 group-hover:translate-y-8 transition-transform duration-500">
          <div className="w-full h-full bg-[#EAE0CF]/20 rounded-lg md:rounded-xl grid grid-cols-4 gap-1 md:gap-2 p-2">
            <div className="bg-[#213448] opacity-90 rounded-lg col-span-2 row-span-2" />
            <div className="bg-[#547792] opacity-70 rounded-lg" />
            <div className="bg-[#547792] opacity-60 rounded-lg" />
            <div className="bg-[#94B4C1] opacity-50 rounded-lg" />
            <div className="bg-[#94B4C1] opacity-30 rounded-lg" />
          </div>
        </div>
      )}

      {title === 'Unit Mix Analysis' && (
        <div className="mt-8 md:mt-10 space-y-2 md:space-y-3">
          <div className="w-full h-8 md:h-10 bg-[#FDFBF7] rounded-lg overflow-hidden flex border border-[#EAE0CF]">
            <div
              className="bg-[rgba(247,190,129,0.9)]"
              style={{ width: '30%' }}
              title="1 Bedroom"
            />
            <div
              className="bg-[rgba(79,129,189,0.9)]"
              style={{ width: '45%' }}
              title="2 Bedrooms"
            />
            <div
              className="bg-[rgba(40,82,122,0.9)]"
              style={{ width: '25%' }}
              title="3 Bedrooms"
            />
          </div>
          <div className="flex justify-between text-xs md:text-sm font-medium text-[#547792]">
            <span>1BR</span>
            <span>2BR</span>
            <span>3BR</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default LandingPage;
