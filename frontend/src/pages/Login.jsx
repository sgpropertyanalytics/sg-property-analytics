import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LineChart, ArrowLeft, Shield, TrendingUp, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Login/Sign Up Page
 *
 * A premium sign-up page with Google Authentication.
 * Uses the "Warm Precision" design system.
 */
function Login() {
  const navigate = useNavigate();
  const { signInWithGoogle, error: authError, loading: authLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
      // Redirect to dashboard on success
      navigate('/market-pulse');
    } catch (err) {
      // Error is handled by AuthContext
      console.error('Sign-in failed:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  // Features list
  const features = [
    { icon: TrendingUp, text: '103,379 transaction records' },
    { icon: BarChart3, text: 'Real-time market analytics' },
    { icon: Shield, text: 'Institutional-grade data' },
  ];

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#FDFBF7] flex">
      {/* Left Panel - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#213448] text-[#EAE0CF] p-12 flex-col justify-between relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#94B4C1] rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#547792] rounded-full blur-3xl" />
        </div>

        {/* Logo & Back */}
        <div className="relative z-10">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-[#94B4C1] hover:text-[#EAE0CF] transition-colors mb-12 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Back to home</span>
          </button>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-[#EAE0CF] rounded-xl flex items-center justify-center">
              <LineChart className="w-7 h-7 text-[#213448]" />
            </div>
            <span className="font-bold text-2xl tracking-tighter">PropAnalytics.sg</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
            Singapore's most comprehensive
            <br />
            <span className="text-[#94B4C1]">property analytics platform.</span>
          </h1>

          <p className="text-[#94B4C1] text-lg max-w-md">
            Join thousands of investors who use institutional-grade data to make smarter property decisions.
          </p>
        </div>

        {/* Features */}
        <div className="relative z-10 space-y-4">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-[#547792]/30 flex items-center justify-center">
                <feature.icon className="w-5 h-5 text-[#94B4C1]" />
              </div>
              <span className="text-[#EAE0CF]">{feature.text}</span>
            </motion.div>
          ))}
        </div>

        {/* Testimonial/Trust */}
        <div className="relative z-10 pt-8 border-t border-[#547792]/30">
          <p className="text-sm text-[#94B4C1]">
            Trusted by property investors, agents, and analysts across Singapore.
          </p>
        </div>
      </div>

      {/* Right Panel - Sign In Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-[#547792] hover:text-[#213448] transition-colors mb-6 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-medium">Back to home</span>
            </button>

            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 bg-[#213448] rounded-lg flex items-center justify-center">
                <LineChart className="w-6 h-6 text-[#EAE0CF]" />
              </div>
              <span className="font-bold text-xl tracking-tighter text-[#213448]">PropAnalytics.sg</span>
            </div>
          </div>

          {/* Sign In Card */}
          <div className="bg-white rounded-2xl border border-[#94B4C1]/30 shadow-xl shadow-[#213448]/5 p-8">
            <h2 className="text-2xl font-bold text-[#213448] tracking-tight mb-2">
              Get started
            </h2>
            <p className="text-[#547792] mb-8">
              Sign in to access premium analytics
            </p>

            {/* Error Message */}
            {authError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl"
              >
                <p className="text-sm text-red-600">{authError}</p>
              </motion.div>
            )}

            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn || authLoading}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-[#94B4C1]/40 rounded-xl hover:border-[#547792] hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {/* Google Logo */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="font-medium text-[#213448] group-hover:text-[#547792] transition-colors">
                {isSigningIn ? 'Signing in...' : 'Continue with Google'}
              </span>
            </button>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#94B4C1]/30" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-[#94B4C1]">Secure authentication</span>
              </div>
            </div>

            {/* Trust Signals */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-[#547792]">
                <Shield className="w-4 h-4 text-[#94B4C1]" />
                <span>Your data is encrypted and secure</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-[#547792]">
                <svg className="w-4 h-4 text-[#94B4C1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>We never share your information</span>
              </div>
            </div>
          </div>

          {/* Terms */}
          <p className="mt-6 text-center text-sm text-[#94B4C1]">
            By signing in, you agree to our{' '}
            <a href="#" className="text-[#547792] hover:text-[#213448] underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-[#547792] hover:text-[#213448] underline">
              Privacy Policy
            </a>
          </p>

          {/* Skip for now (demo mode) */}
          <div className="mt-8 text-center">
            <button
              onClick={() => navigate('/market-pulse')}
              className="text-sm text-[#94B4C1] hover:text-[#547792] transition-colors"
            >
              Skip for now and explore demo
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default Login;
