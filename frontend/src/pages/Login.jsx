import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, ArrowLeft, Lock, Mail, Eye, EyeOff, ShieldCheck, Clock, Building } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Login/Sign Up Page - "Research Terminal Unlock" Experience
 *
 * Premium design for PropAnalytics real estate analytics platform.
 * User has clicked "View Market Data" and is unlocking their preview.
 *
 * Color Palette (from CLAUDE.md):
 * - Deep Navy (#213448) - Headings, primary text, left panel bg
 * - Ocean Blue (#547792) - Secondary text, labels, borders
 * - Sky Blue (#94B4C1) - Icons, disabled states, subtle accents
 * - Sand/Cream (#EAE0CF) - Accent text, highlights, right panel bg
 */
function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithGoogle, error: authError, loading: authLoading, isConfigured } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Get the page they were trying to access (from ProtectedRoute)
  const from = location.state?.from?.pathname || '/market-pulse';

  const handleGoogleSignIn = async () => {
    if (!isConfigured) return;

    setIsSigningIn(true);
    try {
      await signInWithGoogle();
      navigate(from, { replace: true });
    } catch (err) {
      console.error('Sign-in failed:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  // Social proof metrics with Teal accent
  const metrics = [
    { value: '$2.8B+', label: 'Analyzed' },
    { value: '103K+', label: 'Transactions' },
    { value: '28', label: 'Districts' },
  ];

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#213448] flex">

      {/* ===== LEFT PANEL - The "Value" Zone (50/50 split) ===== */}
      <div className="hidden lg:flex lg:w-1/2 p-8 xl:p-12 flex-col justify-between relative overflow-hidden">

        {/* Ambient Background Orbs */}
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-[#547792]/30 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-[#94B4C1]/20 rounded-full blur-[80px] pointer-events-none" />

        {/* Top Section - Logo & Back */}
        <div className="relative z-10">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-[#94B4C1] hover:text-[#EAE0CF] transition-colors mb-8 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Back to home</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#EAE0CF] rounded-xl flex items-center justify-center shadow-lg">
              <LineChart className="w-6 h-6 text-[#213448]" />
            </div>
            <span className="font-bold text-2xl tracking-tight text-[#EAE0CF]">
              PropAnalytics<span className="text-[#94B4C1]">.sg</span>
            </span>
          </div>
        </div>

        {/* Center Section - Floating Dashboard Preview with Data Collage */}
        <div className="relative z-10 flex-1 flex items-center justify-center py-8">
          {/* ===== DATA COLLAGE - Real Dashboard Chart Types ===== */}

          {/* BG Card 1: TimeTrendChart - Stacked Bar + Line (Top Left) */}
          <div
            className="absolute w-96 h-64 bg-[#213448]/60 border border-[#547792]/30 rounded-xl backdrop-blur-sm overflow-hidden"
            style={{
              top: '8%',
              left: '-30px',
              transform: 'rotate(-6deg)',
              zIndex: 5,
              opacity: 0.45,
            }}
          >
            {/* Stacked bar chart with line overlay - like TimeTrendChart */}
            <svg className="w-full h-full" viewBox="0 0 384 256" preserveAspectRatio="none">
              <rect width="100%" height="100%" fill="#213448" />
              {/* Grid lines */}
              <line x1="40" y1="220" x2="360" y2="220" stroke="#547792" strokeWidth="1" opacity="0.3" />
              <line x1="40" y1="170" x2="360" y2="170" stroke="#547792" strokeWidth="1" opacity="0.2" />
              <line x1="40" y1="120" x2="360" y2="120" stroke="#547792" strokeWidth="1" opacity="0.2" />
              {/* Stacked bars - New Sale (Deep Navy) + Resale (Ocean Blue) */}
              <rect x="55" y="140" width="28" height="80" fill="#213448" rx="2" />
              <rect x="55" y="100" width="28" height="40" fill="#547792" rx="2" />
              <rect x="100" y="120" width="28" height="100" fill="#213448" rx="2" />
              <rect x="100" y="70" width="28" height="50" fill="#547792" rx="2" />
              <rect x="145" y="150" width="28" height="70" fill="#213448" rx="2" />
              <rect x="145" y="110" width="28" height="40" fill="#547792" rx="2" />
              <rect x="190" y="100" width="28" height="120" fill="#213448" rx="2" />
              <rect x="190" y="55" width="28" height="45" fill="#547792" rx="2" />
              <rect x="235" y="130" width="28" height="90" fill="#213448" rx="2" />
              <rect x="235" y="85" width="28" height="45" fill="#547792" rx="2" />
              <rect x="280" y="110" width="28" height="110" fill="#213448" rx="2" />
              <rect x="280" y="65" width="28" height="45" fill="#547792" rx="2" />
              <rect x="325" y="125" width="28" height="95" fill="#213448" rx="2" />
              <rect x="325" y="80" width="28" height="45" fill="#547792" rx="2" />
              {/* Trend line overlay (Sand/Cream color) */}
              <path d="M69,90 L114,60 L159,85 L204,45 L249,70 L294,55 L339,65" fill="none" stroke="#EAE0CF" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="69" cy="90" r="4" fill="#EAE0CF" />
              <circle cx="204" cy="45" r="4" fill="#EAE0CF" />
              <circle cx="339" cy="65" r="4" fill="#EAE0CF" />
            </svg>
          </div>

          {/* BG Card 2: PriceDistributionChart - Histogram with Median Line (Bottom Right) */}
          <div
            className="absolute w-80 h-52 bg-[#213448]/60 border border-[#547792]/30 rounded-xl backdrop-blur-sm overflow-hidden"
            style={{
              bottom: '8%',
              right: '-25px',
              transform: 'rotate(5deg)',
              zIndex: 5,
              opacity: 0.45,
            }}
          >
            {/* Histogram with median annotation - like PriceDistributionChart */}
            <svg className="w-full h-full" viewBox="0 0 320 208" preserveAspectRatio="none">
              <rect width="100%" height="100%" fill="#213448" />
              {/* Grid */}
              <line x1="30" y1="175" x2="295" y2="175" stroke="#547792" strokeWidth="1" opacity="0.3" />
              {/* Histogram bars (Ocean Blue gradient) */}
              <rect x="35" y="155" width="22" height="20" fill="#547792" opacity="0.5" rx="1" />
              <rect x="62" y="135" width="22" height="40" fill="#547792" opacity="0.6" rx="1" />
              <rect x="89" y="100" width="22" height="75" fill="#547792" opacity="0.7" rx="1" />
              <rect x="116" y="65" width="22" height="110" fill="#547792" opacity="0.85" rx="1" />
              <rect x="143" y="45" width="22" height="130" fill="#547792" opacity="1" rx="1" />
              <rect x="170" y="70" width="22" height="105" fill="#547792" opacity="0.8" rx="1" />
              <rect x="197" y="95" width="22" height="80" fill="#547792" opacity="0.7" rx="1" />
              <rect x="224" y="125" width="22" height="50" fill="#547792" opacity="0.55" rx="1" />
              <rect x="251" y="150" width="22" height="25" fill="#547792" opacity="0.4" rx="1" />
              <rect x="278" y="160" width="22" height="15" fill="#547792" opacity="0.3" rx="1" />
              {/* Median line (dashed) */}
              <line x1="154" y1="30" x2="154" y2="175" stroke="#EAE0CF" strokeWidth="2" strokeDasharray="6,4" />
              {/* IQR shaded band */}
              <rect x="116" y="30" width="76" height="145" fill="#94B4C1" opacity="0.15" />
            </svg>
          </div>

          {/* BG Card 3: MedianPsfTrendChart - Multi-line by Region (Top Right, Deep) */}
          <div
            className="absolute w-72 h-56 bg-[#213448]/40 border border-[#547792]/20 rounded-xl backdrop-blur-sm overflow-hidden"
            style={{
              top: '12%',
              right: '-50px',
              transform: 'rotate(10deg)',
              zIndex: 2,
              opacity: 0.3,
            }}
          >
            {/* Multi-line trend - CCR, RCR, OCR like MedianPsfTrendChart */}
            <svg className="w-full h-full" viewBox="0 0 288 224" preserveAspectRatio="none">
              <rect width="100%" height="100%" fill="#213448" />
              {/* Grid */}
              <line x1="30" y1="190" x2="260" y2="190" stroke="#547792" strokeWidth="1" opacity="0.3" />
              <line x1="30" y1="140" x2="260" y2="140" stroke="#547792" strokeWidth="1" opacity="0.15" />
              <line x1="30" y1="90" x2="260" y2="90" stroke="#547792" strokeWidth="1" opacity="0.15" />
              {/* CCR line (Deep Navy - highest PSF) */}
              <path d="M40,70 L80,55 L120,60 L160,45 L200,50 L240,40" fill="none" stroke="#EAE0CF" strokeWidth="2.5" strokeLinecap="round" />
              {/* RCR line (Ocean Blue - mid PSF) */}
              <path d="M40,110 L80,100 L120,95 L160,85 L200,90 L240,80" fill="none" stroke="#547792" strokeWidth="2.5" strokeLinecap="round" />
              {/* OCR line (Sky Blue - lower PSF) */}
              <path d="M40,150 L80,145 L120,140 L160,130 L200,135 L240,125" fill="none" stroke="#94B4C1" strokeWidth="2.5" strokeLinecap="round" />
              {/* Point markers */}
              <circle cx="160" cy="45" r="4" fill="#EAE0CF" />
              <circle cx="160" cy="85" r="3" fill="#547792" />
              <circle cx="160" cy="130" r="3" fill="#94B4C1" />
            </svg>
          </div>

          {/* ===== MAIN CARD ===== */}
          <motion.div
            initial={{ opacity: 0, y: 30, rotateX: 5 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative w-[480px] max-w-full"
            style={{ perspective: '1000px', zIndex: 20 }}
          >
            {/* Preview Mode Badge */}
            <div className="absolute -top-3 left-8" style={{ zIndex: 30 }}>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#213448] border border-[#547792]/50 rounded-full text-xs font-semibold text-[#94B4C1] shadow-lg backdrop-blur-sm">
                <span className="w-1.5 h-1.5 bg-[#EAE0CF] rounded-full animate-pulse" />
                Preview Mode
              </span>
            </div>

            {/* Main Card - Dashboard Snippet (highest z-index) */}
            <div
              className="relative bg-[#213448] backdrop-blur-xl rounded-2xl border border-[#547792]/40 overflow-hidden"
              style={{
                transform: 'rotateY(-2deg) rotateX(2deg)',
                boxShadow: '0 25px 80px -12px rgba(148, 180, 193, 0.3), 0 12px 40px -8px rgba(33, 52, 72, 0.4)',
              }}
            >
              {/* Card Header */}
              <div className="px-6 py-5 border-b border-[#547792]/20 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-[#EAE0CF]">Market Pulse</h3>
                  <p className="text-sm text-[#94B4C1]">Last 60 days · District-level data</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#547792]/40" />
                  <div className="w-3 h-3 rounded-full bg-[#94B4C1]/60" />
                  <div className="w-3 h-3 rounded-full bg-[#EAE0CF]" />
                </div>
              </div>

              {/* Mock Chart Area */}
              <div className="p-6">
                {/* KPI Row */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label: 'Median PSF', value: '$1,847', change: '+2.3%', positive: true },
                    { label: 'Volume', value: '1,284', change: '-5.1%', positive: false },
                    { label: 'Avg Days', value: '42', change: '-3d', positive: false },
                  ].map((kpi, i) => (
                    <div key={i} className="bg-[#547792]/20 rounded-lg p-4 border border-[#547792]/30">
                      <div className="text-[11px] text-[#94B4C1] uppercase tracking-wide mb-1">{kpi.label}</div>
                      <div className="text-xl font-bold text-[#EAE0CF] font-mono">{kpi.value}</div>
                      <div className={`text-sm font-medium ${kpi.positive ? 'text-[#EAE0CF]' : 'text-[#94B4C1]'}`}>
                        {kpi.change}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mock Area Chart */}
                <div className="relative h-36 bg-[#547792]/10 rounded-lg border border-[#547792]/20 overflow-hidden">
                  <svg className="w-full h-full" viewBox="0 0 400 120" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#94B4C1" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#94B4C1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,80 Q50,70 100,75 T200,60 T300,50 T400,55 L400,120 L0,120 Z"
                      fill="url(#chartGradient)"
                    />
                    <path
                      d="M0,80 Q50,70 100,75 T200,60 T300,50 T400,55"
                      fill="none"
                      stroke="#EAE0CF"
                      strokeWidth="2"
                    />
                  </svg>
                  {/* Chart Labels */}
                  <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[9px] text-[#94B4C1]">
                    <span>Oct</span>
                    <span>Nov</span>
                    <span>Dec</span>
                  </div>
                </div>

                {/* Blurred Overlay Hint */}
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#94B4C1]">
                  <Lock className="w-3 h-3" />
                  <span>Sign in to interact with live data</span>
                </div>
              </div>
            </div>

          </motion.div>
        </div>

        {/* Bottom Section - Social Proof Metrics */}
        <div className="relative z-10">
          <div className="flex items-center gap-8">
            {metrics.map((metric, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-2xl font-bold text-[#EAE0CF] font-mono tracking-tight">
                  {metric.value}
                </span>
                <span className="text-xs text-[#94B4C1] uppercase tracking-wide">
                  {metric.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[#94B4C1]">
            Trusted by property investors, agents, and analysts.
          </p>
        </div>
      </div>

      {/* ===== RIGHT PANEL - The "Unlock" Action ===== */}
      <div className="flex-1 bg-[#FBF9F4] flex flex-col items-center justify-center p-6 md:p-10 relative overflow-hidden">

        {/* Subtle Texture */}
        <div
          className="absolute inset-0 opacity-[0.015] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full max-w-sm"
        >
          {/* Mobile Logo & Back */}
          <div className="lg:hidden mb-10">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-[#547792] hover:text-[#213448] transition-colors mb-6 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-medium">Back to home</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-[#213448] rounded-lg flex items-center justify-center">
                <LineChart className="w-6 h-6 text-[#EAE0CF]" />
              </div>
              <span className="font-bold text-xl tracking-tight text-[#213448]">PropAnalytics.sg</span>
            </div>
          </div>

          {/* Header - Editorial style with eyebrow badge */}
          <div className="mb-10 text-center">
            {/* Eyebrow Badge - Neutral slate on cream */}
            <span className="inline-block text-xs font-semibold tracking-wider text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 mb-3">
              PREVIEW MODE
            </span>
            <h2 className="text-4xl font-bold text-slate-900 tracking-tight mb-3">
              Unlock Market Data
            </h2>
            <p className="text-lg text-slate-500 leading-relaxed max-w-xl mx-auto text-balance">
              Access aggregated market trends from the last 60 days.
            </p>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {authError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl"
              >
                <p className="text-sm text-red-600">{authError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Primary CTA - Google Sign In (Large, prominent button) */}
          {isConfigured ? (
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn || authLoading}
              className="w-full h-14 bg-white border border-slate-400 text-slate-700 rounded-xl font-medium hover:bg-slate-50 hover:border-slate-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-md"
            >
              {/* Standard multi-color Google 'G' icon */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {isSigningIn ? 'Signing in...' : 'Continue with Google'}
            </button>
          ) : (
            <button
              disabled
              className="w-full h-14 bg-white/50 border border-slate-200 text-slate-400 rounded-xl font-semibold cursor-not-allowed flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5 opacity-50" viewBox="0 0 24 24">
                <path fill="#ccc" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#ccc" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#ccc" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#ccc" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>
          )}

          {/* Secondary - Email Expand Toggle */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowEmailForm(!showEmailForm)}
              className="text-sm text-[#547792] hover:text-[#213448] transition-colors underline underline-offset-2 decoration-[#94B4C1] hover:decoration-[#213448]"
            >
              Or continue with email
            </button>
          </div>

          {/* Expandable Email Form */}
          <AnimatePresence>
            {showEmailForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-6 pt-6 border-t border-[#E0DCD4] space-y-4">
                  {/* Email Input */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] uppercase tracking-wide mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94B4C1]" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-11 pr-4 py-3 bg-white border border-[#E0DCD4] rounded-xl text-[#213448] placeholder:text-[#94B4C1] focus:outline-none focus:ring-2 focus:ring-[#547792]/30 focus:border-[#547792] transition-all"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] uppercase tracking-wide mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94B4C1]" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full pl-11 pr-12 py-3 bg-white border border-[#E0DCD4] rounded-xl text-[#213448] placeholder:text-[#94B4C1] focus:outline-none focus:ring-2 focus:ring-[#547792]/30 focus:border-[#547792] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#94B4C1] hover:text-[#547792] transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Email Submit Button */}
                  <button
                    disabled
                    className="w-full py-3 bg-[#547792] text-white rounded-xl font-medium hover:bg-[#456680] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue with Email
                  </button>

                  <p className="text-xs text-center text-[#94B4C1]">
                    Email sign-in coming soon. Use Google for now.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trust Floor - micro-trust signals */}
          <div className="mt-8 flex items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">Official Data</span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">Secure Access</span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">No Credit Card</span>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-slate-400">
            By continuing, you agree to our{' '}
            <a href="#" className="text-slate-500 hover:underline">Terms</a>
            {' '}and{' '}
            <a href="#" className="text-slate-500 hover:underline">Privacy Policy</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default Login;
