import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LineChart, ArrowLeft, Shield, CheckCircle2, ArrowRight, Database, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Login Page - "Midday Style" Isometric Split
 *
 * Architecture:
 * - Left Panel (40%): Functional, Clean. Contains the Form.
 * - Right Panel (60%): Immersive, Deep Navy. Contains the 3D Tilted Dashboard.
 */
function Login() {
  const navigate = useNavigate();
  const { signInWithGoogle, error: authError, loading: authLoading, isConfigured } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!isConfigured) return;
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
      navigate('/market-pulse');
    } catch (err) {
      console.error('Sign-in failed:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#FDFBF7] overflow-hidden">

      {/* --- LEFT PANEL: THE WORKSPACE (Form) --- */}
      <div className="w-full lg:w-[480px] xl:w-[550px] flex flex-col justify-center p-8 lg:p-12 relative z-20 bg-[#FDFBF7] shadow-2xl shadow-[#213448]/5">

        {/* Nav / Back */}
        <div className="absolute top-8 left-8 lg:left-12">
           <button
             onClick={() => navigate('/')}
             className="flex items-center gap-2 text-[#547792] hover:text-[#213448] transition-colors group text-sm font-medium"
           >
             <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
             Back to home
           </button>
        </div>

        <div className="max-w-sm mx-auto w-full">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-[#213448] rounded-xl flex items-center justify-center shadow-lg shadow-[#213448]/20">
              <LineChart className="w-6 h-6 text-[#EAE0CF]" />
            </div>
            <span className="font-bold text-2xl tracking-tight text-[#213448]">PropAnalytics.sg</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#213448] tracking-tight mb-3">Welcome back</h1>
            <p className="text-[#547792] leading-relaxed">
              Enter your portal to institutional-grade Singapore property data.
            </p>
          </div>

          {/* Error State */}
          {authError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3"
            >
              <div className="text-red-500 mt-0.5"><Shield className="w-4 h-4" /></div>
              <p className="text-sm text-red-600 font-medium">{authError}</p>
            </motion.div>
          )}

          {/* MAIN ACTION: Dashboard Access */}
          <div className="space-y-4">
            <button
              onClick={() => navigate('/market-pulse')}
              className="group w-full py-4 bg-[#213448] text-[#EAE0CF] font-medium rounded-xl hover:bg-[#324b66] active:scale-[0.98] transition-all shadow-xl shadow-[#213448]/10 flex items-center justify-center gap-2.5"
            >
              <Database className="w-4 h-4 opacity-80" />
              <span>Access Dashboard</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform opacity-80" />
            </button>

            {/* Divider */}
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#94B4C1]/20"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider font-semibold text-[#94B4C1]">
                <span className="bg-[#FDFBF7] px-3">Authentication</span>
              </div>
            </div>

            {/* Google Button (with "Coming Soon" Logic) */}
            {isConfigured ? (
              <button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn || authLoading}
                className="w-full py-3.5 bg-white border border-[#EAE0CF] rounded-xl hover:border-[#94B4C1] hover:shadow-md transition-all flex items-center justify-center gap-3 text-[#213448] font-medium"
              >
                 {/* Google SVG Icon */}
                 <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                 {isSigningIn ? 'Connecting...' : 'Continue with Google'}
              </button>
            ) : (
              /* The "Pro" Disabled State */
              <div className="relative group">
                <button disabled className="w-full py-3.5 bg-white border border-[#EAE0CF] rounded-xl flex items-center justify-center gap-3 opacity-60 cursor-not-allowed grayscale">
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  <span className="font-medium text-[#94B4C1]">Continue with Google</span>
                </button>
                <div className="absolute top-1/2 -translate-y-1/2 right-4">
                  <span className="bg-[#EAE0CF] text-[#213448] text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-[#94B4C1]/20">
                    Coming Soon
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Security Note */}
          <div className="mt-12 flex items-center justify-center gap-2 text-xs text-[#94B4C1]">
            <Lock className="w-3 h-3" />
            <span>Bank-grade 256-bit encryption</span>
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
          </div>

          {/* Dashboard Image Placeholder */}
          {/* TIP: Use 'object-left-top' so the focus stays on the data even when cut off */}
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

        {/* Floating Metrics Cards (Parallax Elements) */}
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

      </div>
    </div>
  );
}

export default Login;
