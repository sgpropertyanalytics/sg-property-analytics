import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LineChart, CheckCircle2, Database, Lock } from 'lucide-react';

/**
 * Landing Page - "Midday Style" Isometric Split
 *
 * Architecture:
 * - Left Panel (40%): Functional, Clean. Contains the Hero & CTA.
 * - Right Panel (60%): Immersive, Deep Navy. Contains the 3D Tilted Dashboard.
 */
const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full flex bg-[#FDFBF7] overflow-hidden">

      {/* --- LEFT PANEL: THE WORKSPACE (Hero & CTA) --- */}
      <div className="w-full lg:w-[480px] xl:w-[550px] flex flex-col justify-center p-8 lg:p-12 relative z-20 bg-[#FDFBF7] shadow-2xl shadow-[#213448]/5">

        <div className="max-w-sm mx-auto w-full">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-[#213448] rounded-xl flex items-center justify-center shadow-lg shadow-[#213448]/20">
              <LineChart className="w-6 h-6 text-[#EAE0CF]" />
            </div>
            <span className="font-bold text-2xl tracking-tight text-[#213448]">PropAnalytics.sg</span>
          </div>

          {/* Trust pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full border border-[#94B4C1] bg-white/50 backdrop-blur-sm shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#547792] animate-pulse" />
            <span className="text-xs font-semibold text-[#547792] tracking-wide uppercase">
              Direct URA Data Connection
            </span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl lg:text-4xl font-bold text-[#213448] tracking-tight mb-4 leading-[1.1]">
              The new standard for{' '}
              <span className="text-[#547792]">Singapore property analysis.</span>
            </h1>
            <p className="text-[#547792] leading-relaxed">
              Institutional-grade tools for the modern investor. Visualize price gaps, model rental yields, and spot undervalued districts instantly.
            </p>
          </div>

          {/* MAIN ACTIONS */}
          <div className="space-y-4">
            <button
              onClick={() => navigate('/market-pulse')}
              className="group w-full py-4 bg-[#213448] text-[#EAE0CF] font-medium rounded-xl hover:bg-[#324b66] active:scale-[0.98] transition-all shadow-xl shadow-[#213448]/10 flex items-center justify-center gap-2.5"
            >
              <Database className="w-4 h-4 opacity-80" />
              <span>Explore the Dashboard</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform opacity-80" />
            </button>

            <button
              onClick={() => navigate('/login')}
              className="w-full py-3.5 bg-white border border-[#EAE0CF] rounded-xl hover:border-[#94B4C1] hover:shadow-md transition-all flex items-center justify-center gap-3 text-[#547792] font-medium"
            >
              Get Started with Account
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Trust Signals */}
          <div className="mt-10 pt-8 border-t border-[#94B4C1]/20">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <div className="text-xl font-bold text-[#213448] font-mono">$2.8B+</div>
                <div className="text-[10px] text-[#94B4C1] uppercase tracking-wide">Value Analyzed</div>
              </div>
              <div>
                <div className="text-xl font-bold text-[#213448] font-mono">5 Years</div>
                <div className="text-[10px] text-[#94B4C1] uppercase tracking-wide">Historical Data</div>
              </div>
              <div>
                <div className="text-xl font-bold text-[#213448] font-mono">28</div>
                <div className="text-[10px] text-[#94B4C1] uppercase tracking-wide">Districts</div>
              </div>
            </div>
          </div>

          {/* Footer Security Note */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#94B4C1]">
            <Lock className="w-3 h-3" />
            <span>Powered by official URA & REALIS data</span>
          </div>
        </div>
      </div>

      {/* --- RIGHT PANEL: THE ISOMETRIC SHOWCASE (The "Midday" Vibe) --- */}
      <div className="hidden lg:flex flex-1 bg-[#213448] relative overflow-hidden items-center justify-center perspective-[2000px]">

        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#213448] to-[#1a293a]" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#547792]/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#94B4C1]/10 rounded-full blur-[100px]" />

        {/* The Tilted Dashboard Container */}
        <motion.div
          initial={{ opacity: 0, rotateX: 20, rotateY: -20, scale: 0.9 }}
          animate={{ opacity: 1, rotateX: 6, rotateY: -12, scale: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="relative w-[140%] max-w-[1200px] -mr-[20%] shadow-2xl shadow-black/50 rounded-xl border border-[#547792]/30 bg-[#1a293a] overflow-hidden transform-gpu"
        >
          {/* Fake Browser Chrome */}
          <div className="h-10 bg-[#213448] border-b border-[#547792]/30 flex items-center px-4 gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#547792]/40"></div>
              <div className="w-3 h-3 rounded-full bg-[#547792]/40"></div>
              <div className="w-3 h-3 rounded-full bg-[#547792]/40"></div>
            </div>
            {/* Address Bar */}
            <div className="ml-4 h-6 flex-1 max-w-xs bg-[#1a293a] border border-[#547792]/30 rounded text-[10px] flex items-center px-3 text-[#94B4C1]">
              <Lock className="w-3 h-3 mr-1.5 text-[#547792]" />
              propanalytics.sg/dashboard
            </div>
          </div>

          {/* Dashboard Image Placeholder */}
          <div className="aspect-[16/10] bg-[#FDFBF7] relative">
            <img
               src="/dashboard-screenshot.png"
               alt="PropAnalytics Dashboard"
               className="w-full h-full object-cover object-left-top opacity-90"
            />
            {/* Gloss Overlay for that "Premium Screen" look */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[#213448]/10 via-white/5 to-transparent pointer-events-none" />
          </div>
        </motion.div>

        {/* Floating Metrics Card (Parallax Element) */}
        <motion.div
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="absolute bottom-20 left-20 bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl shadow-xl text-[#EAE0CF] max-w-xs"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 bg-[#547792] rounded-lg"><CheckCircle2 className="w-4 h-4 text-white" /></div>
            <span className="text-sm font-medium text-[#94B4C1]">Data Integrity Check</span>
          </div>
          <div className="text-2xl font-bold mb-1">103,379</div>
          <div className="text-xs text-[#94B4C1]">Verified transaction records loaded</div>
        </motion.div>

        {/* Second Floating Card - Top Right */}
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="absolute top-24 right-16 bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl shadow-xl text-[#EAE0CF]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium text-[#94B4C1]">Live Market Sync</span>
          </div>
          <div className="text-lg font-bold">Dec 2024</div>
          <div className="text-[10px] text-[#94B4C1]">Latest URA data integrated</div>
        </motion.div>

      </div>
    </div>
  );
};

export default LandingPage;
