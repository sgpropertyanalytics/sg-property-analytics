import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, ArrowLeft, Lock, Mail, Eye, EyeOff, ShieldCheck, Clock, Building } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ResearchStackPreview from '../components/unlock/ResearchStackPreview';

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

        {/* Center Section - Vertical Research Stack */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative z-10 flex-1 flex items-center justify-center overflow-hidden"
        >
          <ResearchStackPreview />
        </motion.div>

        {/* Divider Line - separates "The Tool" from "The Description" */}
        <div className="relative z-10 w-full border-t border-white/10 my-6" />

        {/* Bottom Section - Value Proposition + Stats (Spec Sheet) */}
        <div className="relative z-10">
          {/* Headline - single line at desktop */}
          <h3 className="text-2xl xl:text-[1.75rem] font-bold text-[#EAE0CF] tracking-tight leading-tight mb-2">
            Institutional-grade analytics for Singapore private property
          </h3>
          <p className="text-base xl:text-lg text-[#94B4C1] leading-relaxed">
            Make decisions using raw transaction data and current market trends.
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
              Access aggregated market trends · Last 60 days
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
