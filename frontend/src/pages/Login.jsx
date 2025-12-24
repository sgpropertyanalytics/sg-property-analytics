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

        {/* Center Section - Isometric Exploded Dashboard Preview */}
        <div
          className="relative z-10 flex-1 flex items-center justify-center py-8 overflow-hidden"
          style={{ perspective: '2000px' }}
        >
          {/* ===== ISOMETRIC FLOATING CARDS ===== */}

          {/* TOP CENTER CARD: Outlier Detection / Scatter Plot (Way Behind) */}
          <div
            className="absolute w-72 h-56 rounded-2xl border border-[#547792]/40 overflow-hidden"
            style={{
              transform: 'translateY(-140px) scale(0.75)',
              zIndex: 10,
              opacity: 0.3,
              filter: 'blur(2px)',
              background: 'linear-gradient(180deg, #1e293b 0%, #213448 100%)',
            }}
          >
            {/* Card Header */}
            <div className="px-4 py-3 border-b border-[#547792]/20 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-[#EAE0CF]">Outlier Detection</h4>
                <p className="text-[10px] text-[#94B4C1]">Price anomalies</p>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-[#547792]/50" />
                <div className="w-2 h-2 rounded-full bg-[#EAE0CF]" />
              </div>
            </div>
            {/* Scatter Plot Content */}
            <div className="p-3">
              <svg className="w-full h-32" viewBox="0 0 240 120">
                <line x1="20" y1="100" x2="220" y2="100" stroke="#547792" strokeWidth="1" opacity="0.3" />
                <line x1="20" y1="20" x2="20" y2="100" stroke="#547792" strokeWidth="1" opacity="0.3" />
                {/* Scatter dots */}
                <circle cx="45" cy="75" r="4" fill="#547792" opacity="0.8" />
                <circle cx="65" cy="60" r="3" fill="#547792" opacity="0.7" />
                <circle cx="85" cy="70" r="5" fill="#547792" opacity="0.9" />
                <circle cx="105" cy="50" r="4" fill="#547792" opacity="0.8" />
                <circle cx="125" cy="65" r="3" fill="#547792" opacity="0.6" />
                <circle cx="145" cy="40" r="4" fill="#EAE0CF" opacity="0.9" />
                <circle cx="165" cy="55" r="5" fill="#547792" opacity="0.8" />
                <circle cx="185" cy="45" r="3" fill="#547792" opacity="0.7" />
                <circle cx="200" cy="35" r="4" fill="#EAE0CF" opacity="0.9" />
                <circle cx="75" cy="85" r="3" fill="#547792" opacity="0.5" />
                <circle cx="155" cy="80" r="4" fill="#547792" opacity="0.6" />
              </svg>
            </div>
          </div>

          {/* LEFT FLANK CARD: Heatmap Analysis (Floating Left) */}
          <div
            className="absolute w-80 h-56 rounded-2xl border border-[#547792]/40 overflow-hidden"
            style={{
              transform: 'translateX(-280px) translateY(-30px) rotateY(15deg) rotateZ(-5deg) scale(0.9)',
              transformStyle: 'preserve-3d',
              zIndex: 15,
              opacity: 0.6,
              filter: 'blur(1px)',
              background: 'linear-gradient(180deg, #1e293b 0%, #213448 100%)',
            }}
          >
            {/* Card Header */}
            <div className="px-4 py-3 border-b border-[#547792]/20 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-[#EAE0CF]">Heatmap Analysis</h4>
                <p className="text-[10px] text-[#94B4C1]">Regional liquidity</p>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-[#547792]/50" />
                <div className="w-2 h-2 rounded-full bg-[#EAE0CF]" />
              </div>
            </div>
            {/* Heatmap Content */}
            <div className="p-3">
              <svg className="w-full h-32" viewBox="0 0 280 120">
                <defs>
                  <radialGradient id="heatSpot1" cx="30%" cy="40%" r="40%">
                    <stop offset="0%" stopColor="#547792" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#547792" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="heatSpot2" cx="70%" cy="60%" r="35%">
                    <stop offset="0%" stopColor="#94B4C1" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#94B4C1" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="heatSpot3" cx="50%" cy="30%" r="25%">
                    <stop offset="0%" stopColor="#EAE0CF" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#EAE0CF" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="100%" height="100%" fill="#213448" rx="8" />
                <ellipse cx="84" cy="48" rx="70" ry="45" fill="url(#heatSpot1)" />
                <ellipse cx="196" cy="72" rx="60" ry="40" fill="url(#heatSpot2)" />
                <ellipse cx="140" cy="36" rx="40" ry="30" fill="url(#heatSpot3)" />
              </svg>
            </div>
          </div>

          {/* RIGHT FLANK CARD: Volume Distribution (Floating Right) */}
          <div
            className="absolute w-80 h-56 rounded-2xl border border-[#547792]/40 overflow-hidden"
            style={{
              transform: 'translateX(280px) translateY(50px) rotateY(-15deg) rotateZ(5deg) scale(0.9)',
              transformStyle: 'preserve-3d',
              zIndex: 15,
              opacity: 0.6,
              filter: 'blur(1px)',
              background: 'linear-gradient(180deg, #1e293b 0%, #213448 100%)',
            }}
          >
            {/* Card Header */}
            <div className="px-4 py-3 border-b border-[#547792]/20 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-[#EAE0CF]">Volume Distribution</h4>
                <p className="text-[10px] text-[#94B4C1]">Price segments</p>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-[#547792]/50" />
                <div className="w-2 h-2 rounded-full bg-[#EAE0CF]" />
              </div>
            </div>
            {/* Bar Chart Content */}
            <div className="p-3">
              <svg className="w-full h-32" viewBox="0 0 280 120">
                <line x1="20" y1="100" x2="260" y2="100" stroke="#547792" strokeWidth="1" opacity="0.3" />
                {/* Histogram bars */}
                <rect x="30" y="85" width="20" height="15" fill="#547792" opacity="0.5" rx="2" />
                <rect x="58" y="70" width="20" height="30" fill="#547792" opacity="0.6" rx="2" />
                <rect x="86" y="50" width="20" height="50" fill="#547792" opacity="0.75" rx="2" />
                <rect x="114" y="30" width="20" height="70" fill="#547792" opacity="0.9" rx="2" />
                <rect x="142" y="20" width="20" height="80" fill="#EAE0CF" opacity="0.9" rx="2" />
                <rect x="170" y="35" width="20" height="65" fill="#547792" opacity="0.85" rx="2" />
                <rect x="198" y="55" width="20" height="45" fill="#547792" opacity="0.7" rx="2" />
                <rect x="226" y="75" width="20" height="25" fill="#547792" opacity="0.5" rx="2" />
                {/* Median line */}
                <line x1="152" y1="10" x2="152" y2="100" stroke="#EAE0CF" strokeWidth="2" strokeDasharray="4,3" />
              </svg>
            </div>
          </div>

          {/* ===== MAIN CARD (Front & Center) ===== */}
          <motion.div
            initial={{ opacity: 0, y: 30, rotateX: 5 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative w-[420px] max-w-full"
            style={{ zIndex: 50 }}
          >
            {/* Preview Mode Badge */}
            <div className="absolute -top-3 left-6" style={{ zIndex: 60 }}>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#213448] border border-[#547792]/50 rounded-full text-xs font-semibold text-[#94B4C1] shadow-lg backdrop-blur-sm">
                <span className="w-1.5 h-1.5 bg-[#EAE0CF] rounded-full animate-pulse" />
                Preview Mode
              </span>
            </div>

            {/* Main Card - Dashboard Snippet (highest z-index) */}
            <div
              className="relative rounded-2xl border border-[#547792]/50 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #1e293b 0%, #213448 100%)',
                boxShadow: '0 35px 100px -15px rgba(0, 0, 0, 0.5), 0 15px 50px -10px rgba(148, 180, 193, 0.2)',
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
