import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, ArrowLeft, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Login/Sign Up Page - "Research Terminal Unlock" Experience
 *
 * Premium design for PropAnalytics real estate analytics platform.
 * User has clicked "View Market Data" and is unlocking their preview.
 *
 * Design System:
 * - Warm Cream (#FBF9F4) right panel - NO stark white
 * - Deep Navy (#213448) text
 * - Teal (#2DD4BF) accent for key stats
 * - Floating dashboard preview card on left
 * - Fintech aesthetic with backdrop-blur
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

      {/* ===== LEFT PANEL - The "Value" Zone ===== */}
      <div className="hidden lg:flex lg:w-[55%] p-8 xl:p-12 flex-col justify-between relative overflow-hidden">

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

        {/* Center Section - Floating Dashboard Preview */}
        <div className="relative z-10 flex-1 flex items-center justify-center py-8">
          <motion.div
            initial={{ opacity: 0, y: 30, rotateX: 5 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative w-full max-w-lg"
            style={{ perspective: '1000px' }}
          >
            {/* Preview Mode Badge */}
            <div className="absolute -top-3 left-6 z-20">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#213448] border border-[#547792]/50 rounded-full text-xs font-semibold text-[#94B4C1] shadow-lg backdrop-blur-sm">
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse" />
                Preview Mode
              </span>
            </div>

            {/* Floating Card - Dashboard Snippet */}
            <div
              className="relative bg-[#1a2a3a]/80 backdrop-blur-xl rounded-2xl border border-[#547792]/30 shadow-2xl shadow-black/30 overflow-hidden"
              style={{ transform: 'rotateY(-2deg) rotateX(2deg)' }}
            >
              {/* Card Header */}
              <div className="px-5 py-4 border-b border-[#547792]/20 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#EAE0CF]">Market Pulse</h3>
                  <p className="text-xs text-[#94B4C1]">Last 60 days · District-level data</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#547792]/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#547792]/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                </div>
              </div>

              {/* Mock Chart Area */}
              <div className="p-5">
                {/* KPI Row */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Median PSF', value: '$1,847', change: '+2.3%' },
                    { label: 'Volume', value: '1,284', change: '-5.1%' },
                    { label: 'Avg Days', value: '42', change: '-3d' },
                  ].map((kpi, i) => (
                    <div key={i} className="bg-[#213448]/60 rounded-lg p-3 border border-[#547792]/20">
                      <div className="text-[10px] text-[#94B4C1] uppercase tracking-wide mb-1">{kpi.label}</div>
                      <div className="text-lg font-bold text-[#EAE0CF] font-mono">{kpi.value}</div>
                      <div className={`text-xs font-medium ${kpi.change.startsWith('+') ? 'text-teal-400' : 'text-[#94B4C1]'}`}>
                        {kpi.change}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mock Area Chart */}
                <div className="relative h-32 bg-[#213448]/40 rounded-lg border border-[#547792]/20 overflow-hidden">
                  <svg className="w-full h-full" viewBox="0 0 400 120" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,80 Q50,70 100,75 T200,60 T300,50 T400,55 L400,120 L0,120 Z"
                      fill="url(#chartGradient)"
                    />
                    <path
                      d="M0,80 Q50,70 100,75 T200,60 T300,50 T400,55"
                      fill="none"
                      stroke="#2DD4BF"
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

            {/* Decorative Shadow Card Behind */}
            <div
              className="absolute -bottom-4 -right-4 w-full h-full bg-[#547792]/10 rounded-2xl -z-10"
              style={{ transform: 'rotateY(-4deg) rotateX(4deg)' }}
            />
          </motion.div>
        </div>

        {/* Bottom Section - Social Proof Metrics */}
        <div className="relative z-10">
          <div className="flex items-center gap-8">
            {metrics.map((metric, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-2xl font-bold text-teal-400 font-mono tracking-tight">
                  {metric.value}
                </span>
                <span className="text-xs text-[#94B4C1] uppercase tracking-wide">
                  {metric.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[#547792]">
            Trusted by property investors, agents, and analysts.
          </p>
        </div>
      </div>

      {/* ===== RIGHT PANEL - The "Unlock" Action ===== */}
      <div className="flex-1 bg-[#FBF9F4] flex items-center justify-center p-6 md:p-10 relative overflow-hidden">

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
          className="relative w-full max-w-md"
        >
          {/* Mobile Logo & Back */}
          <div className="lg:hidden mb-8">
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

          {/* Unlock Card */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-[#E8E4DC] shadow-xl shadow-[#213448]/5 p-8 md:p-10">

            {/* Header */}
            <div className="mb-8 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-[#213448] tracking-tight mb-3">
                Unlock Market Data
              </h2>
              <p className="text-[#547792] text-sm md:text-base leading-relaxed">
                Access aggregated market trends from the last 60 days.
                <br />
                <span className="text-[#213448] font-medium">No credit card required.</span>
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

            {/* Context Text */}
            <p className="text-center text-sm text-[#547792] mb-4">
              Create a free account or sign in to continue
            </p>

            {/* Primary CTA - Google Sign In */}
            {isConfigured ? (
              <button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn || authLoading}
                className="w-full py-4 bg-[#213448] text-[#EAE0CF] rounded-xl font-semibold hover:bg-[#2a4560] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg shadow-[#213448]/20"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {isSigningIn ? 'Signing in...' : 'Continue with Google'}
              </button>
            ) : (
              <button
                disabled
                className="w-full py-4 bg-[#213448]/50 text-[#94B4C1] rounded-xl font-semibold cursor-not-allowed flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5 opacity-50" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
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
                  <div className="mt-6 pt-6 border-t border-[#E8E4DC] space-y-4">
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
                          className="w-full pl-11 pr-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-[#213448] placeholder:text-[#94B4C1] focus:outline-none focus:ring-2 focus:ring-[#547792]/30 focus:border-[#547792] transition-all"
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
                          className="w-full pl-11 pr-12 py-3 bg-white border border-[#E8E4DC] rounded-xl text-[#213448] placeholder:text-[#94B4C1] focus:outline-none focus:ring-2 focus:ring-[#547792]/30 focus:border-[#547792] transition-all"
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

            {/* Trust Signal */}
            <div className="mt-8 pt-6 border-t border-[#E8E4DC]">
              <div className="flex items-center justify-center gap-2 text-xs text-[#94B4C1]">
                <Lock className="w-3.5 h-3.5" />
                <span>Free preview · No credit card required</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-[#94B4C1]">
            By continuing, you agree to our{' '}
            <a href="#" className="text-[#547792] hover:underline">Terms</a>
            {' '}and{' '}
            <a href="#" className="text-[#547792] hover:underline">Privacy Policy</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default Login;
