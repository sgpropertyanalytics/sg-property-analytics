import { motion, useScroll, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Map,
  ShieldCheck,
  LineChart,
  TrendingUp,
} from 'lucide-react';
import YouVsMarketVisual from '../components/landing/YouVsMarketVisual';

/**
 * Landing Page - Editorial/Data Journalism Design
 *
 * Aesthetic: Bloomberg, The Economist, Financial Times
 * Typography: Fraunces (display) + Source Sans 3 (body)
 * Key: Bold headlines, asymmetric layout, data as hero
 */
const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen selection:bg-[#94B4C1]/30 text-[#213448] bg-[#FDFBF7] overflow-x-hidden">
      {/* Subtle texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04] z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Navigation */}
      <nav className="fixed w-full z-50 px-4 md:px-8 lg:px-12 py-4 backdrop-blur-md border-b border-[#213448]/5 bg-[#FDFBF7]/90">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#213448] rounded-lg flex items-center justify-center">
              <LineChart className="w-5 h-5 text-[#EAE0CF]" />
            </div>
            <span className="font-display font-semibold text-xl text-[#213448]">
              PropAnalytics
            </span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="px-5 py-2.5 text-sm font-semibold bg-[#213448] text-[#EAE0CF] rounded-lg hover:bg-[#547792] active:scale-[0.98] transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
          >
            Log In
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="relative z-10">
        <HeroSection navigate={navigate} />
        <FeaturesSection />
        <CTASection navigate={navigate} />
        <Footer />
      </div>
    </div>
  );
};

/**
 * Hero Section - Editorial asymmetric layout
 * Stats on left, content + data viz on right
 */
function HeroSection({ navigate }) {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);

  const stats = [
    { value: '103,379', label: 'Transactions Analyzed' },
    { value: '28', label: 'Districts Covered' },
    { value: '99.2%', label: 'Data Accuracy' },
  ];

  return (
    <section className="relative pt-24 md:pt-28 min-h-screen">
      {/* Warm gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#EAE0CF]/40 via-[#FDFBF7] to-[#FDFBF7]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 lg:px-12">
        {/* Mobile: Stacked layout */}
        <div className="lg:hidden pt-8 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Trust badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#94B4C1]/40 bg-white/60 mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-[#547792]">
                Official URA Data
              </span>
            </div>

            {/* Headline */}
            <h1 className="editorial-headline text-4xl sm:text-5xl text-[#213448] mb-4">
              Singapore Condo
              <br />
              <span className="text-[#547792]">Market Intelligence</span>
            </h1>

            <p className="text-lg text-[#547792] mb-8 max-w-lg leading-relaxed">
              Data-driven price benchmarking across projects, locations, and
              market segments.
            </p>

            {/* Stats row */}
            <div className="flex gap-6 mb-8">
              {stats.map((stat, i) => (
                <div key={i}>
                  <div className="font-display text-2xl font-light text-[#213448]">
                    {stat.value}
                  </div>
                  <div className="stat-label text-[10px]">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={() => navigate('/login')}
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-[#213448] text-[#EAE0CF] font-semibold hover:bg-[#547792] active:scale-[0.98] transition-all min-h-[48px] focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Explore Market Data</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>

          {/* Data visualization */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-12"
          >
            <YouVsMarketVisual />
          </motion.div>
        </div>

        {/* Desktop: Asymmetric 2-column layout */}
        <motion.div
          style={{ opacity }}
          className="hidden lg:grid lg:grid-cols-12 gap-8 pt-12 pb-24 min-h-[calc(100vh-7rem)]"
        >
          {/* Left column: Stats */}
          <div className="col-span-3 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="space-y-8"
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  className="border-l-2 border-[#C17F59] pl-4"
                >
                  <div className="stat-callout text-[#213448]">{stat.value}</div>
                  <div className="stat-label mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Right column: Content + Data viz */}
          <div className="col-span-9 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-2xl"
            >
              {/* Trust badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#94B4C1]/40 bg-white/60 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-[#547792]">
                  Official URA Data Source
                </span>
              </div>

              {/* Headline */}
              <h1 className="editorial-headline text-5xl xl:text-6xl text-[#213448] mb-6">
                Singapore Condo
                <br />
                <span className="text-[#547792]">Market Intelligence</span>
              </h1>

              <p className="text-xl text-[#547792] mb-8 leading-relaxed max-w-xl">
                Data-driven price benchmarking across projects, locations, and
                market segments — powered by 100,000+ private property
                transactions.
              </p>

              {/* CTA */}
              <button
                onClick={() => navigate('/login')}
                className="group inline-flex items-center gap-3 px-8 py-4 rounded-lg bg-[#213448] text-[#EAE0CF] font-semibold hover:bg-[#547792] active:scale-[0.98] transition-all min-h-[52px] focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
              >
                <TrendingUp className="w-5 h-5" />
                <span>Explore Market Data</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>

            {/* Data visualization card */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="mt-12 max-w-2xl"
            >
              <YouVsMarketVisual compact />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Features Section - Editorial card layout
 */
function FeaturesSection() {
  return (
    <section className="py-20 md:py-28 px-4 md:px-8 lg:px-12 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-16 max-w-2xl"
        >
          <h2 className="editorial-headline text-3xl md:text-4xl lg:text-5xl text-[#213448] mb-4">
            Everything you need to
            <br />
            underwrite a deal.
          </h2>
          <p className="text-lg text-[#547792] leading-relaxed">
            Move beyond simple PSF trends. Layer multiple datasets to find
            hidden value.
          </p>
        </motion.div>

        {/* Feature cards - editorial grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <FeatureCard
            icon={Map}
            title="District Heatmaps"
            description="Visualize rental yield and price compression across CCR, RCR, and OCR instantly."
            accent
            delay={0}
          />
          <FeatureCard
            icon={BarChart3}
            title="Supply Cliffs"
            description="Predict price impact based on upcoming project TOP dates and supply waves."
            delay={0.1}
          />
          <FeatureCard
            icon={Building2}
            title="Unit Mix Analysis"
            description="Compare profitability of different unit types within any project."
            delay={0.2}
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Cleaned Data"
            description="103,379 transactions with outliers automatically flagged and removed."
            delay={0.3}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Feature Card - Editorial style with subtle border
 */
function FeatureCard({ icon: Icon, title, description, accent, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay }}
      className={`group p-6 md:p-8 rounded-xl border transition-all duration-300 ${
        accent
          ? 'bg-[#FDFBF7] border-[#C17F59]/30 hover:border-[#C17F59]'
          : 'bg-[#FDFBF7] border-[#94B4C1]/30 hover:border-[#547792]'
      }`}
    >
      <div
        className={`w-12 h-12 rounded-lg flex items-center justify-center mb-5 transition-colors ${
          accent
            ? 'bg-[#C17F59]/10 text-[#C17F59] group-hover:bg-[#C17F59]/20'
            : 'bg-[#547792]/10 text-[#547792] group-hover:bg-[#547792]/20'
        }`}
      >
        <Icon className="w-6 h-6" />
      </div>

      <h3 className="font-display text-xl font-semibold text-[#213448] mb-2">
        {title}
      </h3>
      <p className="text-[#547792] leading-relaxed">{description}</p>
    </motion.div>
  );
}

/**
 * CTA Section - Clean, editorial
 */
function CTASection({ navigate }) {
  return (
    <section className="py-20 md:py-28 px-4 md:px-8 lg:px-12 bg-[#FDFBF7]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mx-auto text-center"
      >
        <h2 className="editorial-headline text-3xl md:text-4xl lg:text-5xl text-[#213448] mb-4">
          Ready to get started?
        </h2>
        <p className="text-lg text-[#547792] mb-10 leading-relaxed max-w-xl mx-auto">
          Join investors who use institutional-grade analytics to make
          data-driven property decisions.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="group inline-flex items-center gap-3 px-8 py-4 rounded-lg bg-[#213448] text-[#EAE0CF] font-semibold hover:bg-[#547792] active:scale-[0.98] transition-all min-h-[52px] focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus:outline-none"
        >
          <span>View Market Data</span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </motion.div>
    </section>
  );
}

/**
 * Footer - Minimal, editorial
 */
function Footer() {
  return (
    <footer className="py-10 px-4 md:px-8 lg:px-12 border-t border-[#94B4C1]/20 bg-white">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#213448] rounded-md flex items-center justify-center">
            <LineChart className="w-4 h-4 text-[#EAE0CF]" />
          </div>
          <span className="text-[#547792] text-sm">
            &copy; 2025 PropAnalytics.sg
          </span>
        </div>

        <div className="flex gap-8">
          {['Methodology', 'Pricing', 'Contact'].map((link) => (
            <a
              key={link}
              href="#"
              className="text-[#547792] hover:text-[#213448] text-sm font-medium transition-colors min-h-[44px] flex items-center focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:rounded focus:outline-none"
            >
              {link}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

export default LandingPage;
