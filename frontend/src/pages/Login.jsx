import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Login Page - Swiss International + Technical Brutalist
 *
 * Polish Features:
 * - Data atmosphere overlay on right panel
 * - Micro-interactions on buttons
 * - Blinking terminal cursor on headline
 * - Mobile-first responsive image
 */

// Data atmosphere - coordinates for mobile view
const DATA_COORDS = ['01.3521°N', '103.8198°E', '0x7F3A', 'SGP_001', '01.2894°N'];

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithGoogle, error: authError, authUiLoading, isConfigured } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  const from = location.state?.from?.pathname || '/market-overview';

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

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
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">

      {/* ===== MOBILE: Image Panel (stacks above on mobile) ===== */}
      <div className="lg:hidden relative h-[200px] overflow-hidden bg-[#fafafa]">
        {/* Data Atmosphere - Mobile */}
        <div className="absolute inset-0 flex justify-around opacity-[0.04] overflow-hidden pointer-events-none">
          <div className="flex flex-col items-center font-mono text-[8px] text-black tracking-wider">
            {DATA_COORDS.map((item, idx) => (
              <span key={idx} className="my-1">{item}</span>
            ))}
          </div>
        </div>

        <img
          src="/ZG.png"
          alt="Zyon Grand"
          className="absolute bottom-0 right-0 w-full h-full object-cover object-top"
        />

        {/* Corner Label - Mobile */}
        <div className="absolute top-4 left-4 font-mono text-[9px] uppercase tracking-widest text-black/40">
          <span className="text-[#FF6600]">|</span> Zyon Grand
        </div>
      </div>

      {/* ===== LEFT COLUMN - Form/Content ===== */}
      <div className="relative bg-[#fafafa] flex flex-col justify-center items-center px-6 md:px-12 py-12 overflow-hidden order-2 lg:order-1 lg:border-r border-neutral-200">

        {/* Diagonal Pinstripe Background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 7px,
              #E5E5E5 7px,
              #E5E5E5 8px
            )`
          }}
        />

        {/* Back Button - Outside the frame */}
        <button
          onClick={() => navigate('/')}
          className="absolute top-6 left-6 flex items-center gap-2 text-black/50 hover:text-black transition-colors group z-20"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-mono text-xs uppercase tracking-widest">Back</span>
        </button>

        {/* ===== TECHNICAL FRAME ===== */}
        <div className="relative w-full max-w-[480px] bg-white border border-black p-10 md:p-12 z-10 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">

          {/* Corner Accents - Registration Marks */}
          {/* Top-Left */}
          <div className="absolute -top-[7px] -left-[7px] text-black/40 font-mono text-sm leading-none">+</div>
          {/* Top-Right */}
          <div className="absolute -top-[7px] -right-[7px] text-black/40 font-mono text-sm leading-none">+</div>
          {/* Bottom-Left */}
          <div className="absolute -bottom-[7px] -left-[7px] text-black/40 font-mono text-sm leading-none">+</div>
          {/* Bottom-Right */}
          <div className="absolute -bottom-[7px] -right-[7px] text-black/40 font-mono text-sm leading-none">+</div>

          {/* Top Border Label - breaks the border line */}
          <div className="absolute -top-[10px] left-1/2 -translate-x-1/2 bg-white px-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/40">
              :: Auth_Module ::
            </span>
          </div>

          {/* Micro Label - Red/Orange Pipe */}
          <div className="border-l-2 border-black pl-4 mb-6 flex items-center gap-1">
            <span className="text-[#FF6600] font-mono text-[10px]">|</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
              System Access
            </span>
          </div>

          {/* Headline with Blinking Cursor */}
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-black leading-[1.1] mb-4">
            Unlock Market Data
            <span
              className={`inline-block ml-1 w-[3px] h-[1em] bg-black align-middle transition-opacity duration-100 ${
                cursorVisible ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </h1>

          {/* Subtext */}
          <p className="font-mono text-sm text-black/50 mb-10 tracking-wide">
            Institutional clearance required. Preview mode active.
          </p>

          {/* Error Message */}
          <AnimatePresence>
            {authError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-4 border border-red-500 bg-red-50"
              >
                <p className="font-mono text-xs text-red-600 uppercase tracking-wide">{authError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google Sign In Button - With Hover Animation */}
          {isConfigured ? (
            <motion.button
              onClick={handleGoogleSignIn}
              disabled={authUiLoading || isSigningIn}
              className="group w-full h-12 bg-black text-white font-mono text-xs uppercase tracking-widest hover:bg-black/90 active:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 relative overflow-hidden"
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
            >
              {/* Reveal arrow on hover */}
              <span className="absolute left-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-white/70">
                {'>'}
              </span>
              <span className="flex items-center gap-3 transition-transform duration-200 group-hover:translate-x-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {isSigningIn ? 'Authenticating...' : 'Continue with Google'}
              </span>
            </motion.button>
          ) : (
            <button
              disabled
              className="w-full h-12 bg-black/20 text-black/40 font-mono text-xs uppercase tracking-widest cursor-not-allowed flex items-center justify-center gap-3"
            >
              <svg className="w-4 h-4 opacity-50" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              </svg>
              Continue with Google
            </button>
          )}

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-black/10" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-black/30">Or</span>
            <div className="flex-1 h-px bg-black/10" />
          </div>

          {/* Email Toggle - Bracket Animation */}
          <motion.button
            onClick={() => setShowEmailForm(!showEmailForm)}
            className="group w-full font-mono text-xs uppercase text-black/50 hover:text-black transition-colors py-2 flex items-center justify-center"
            whileHover={{ letterSpacing: '0.15em' }}
          >
            <span className="inline-block transition-transform duration-200 group-hover:-translate-x-1">[</span>
            <span className="mx-2 transition-all duration-200 group-hover:tracking-wider">
              {showEmailForm ? 'Hide Email Form' : 'Continue with Email'}
            </span>
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">]</span>
          </motion.button>

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
                <div className="mt-6 space-y-4">
                  {/* Email Input */}
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-widest text-black/50 mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-12 pr-4 py-4 bg-white border border-black text-black placeholder:text-black/30 font-mono text-sm focus:outline-none focus:ring-0 focus:border-[#FF6600] transition-colors"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-widest text-black/50 mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full pl-12 pr-12 py-4 bg-white border border-black text-black placeholder:text-black/30 font-mono text-sm focus:outline-none focus:ring-0 focus:border-[#FF6600] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-black/30 hover:text-black transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Email Submit Button */}
                  <button
                    disabled
                    className="w-full py-4 bg-black text-white font-mono text-xs uppercase tracking-widest hover:bg-black/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Authenticate
                  </button>

                  <p className="font-mono text-[10px] text-center text-black/40 uppercase tracking-wide">
                    Email sign-in coming soon. Use Google for now.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <p className="mt-6 font-mono text-[10px] text-center text-black/30 uppercase tracking-wide">
            By continuing, you agree to our{' '}
            <a href="#" className="text-black/50 hover:text-black underline">Terms</a>
            {' '}and{' '}
            <a href="#" className="text-black/50 hover:text-black underline">Privacy</a>
          </p>

          {/* Connector Line - extends from card to divider */}
          <div className="hidden lg:block absolute top-1/2 -right-[6px] w-[calc(50vw-240px-48px)] h-px bg-black/10" />
        </div>
      </div>

      {/* ===== RIGHT COLUMN - Kaiju Towers (Desktop) ===== */}
      <div className="hidden lg:block relative h-full overflow-hidden bg-[#F5F5F7] order-2">

        {/* Grid Sky - 3D Wireframe Pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(to right, #000 1px, transparent 1px),
              linear-gradient(to bottom, #000 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            maskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 70%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 70%)'
          }}
        />

        {/* Perspective Grid Overlay - adds depth */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #000 1px, transparent 0)`,
            backgroundSize: '20px 20px',
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 50%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 50%)'
          }}
        />

        {/* Directive Text Block - Data Column */}
        <div className="absolute top-8 left-8 z-20 max-w-[320px]">
          {/* Primary Directive - Headline */}
          <div className="mb-4">
            <p className="font-mono font-bold text-base text-black leading-tight">
              {'>'} DIRECTIVE // INSTITUTIONAL-GRADE ANALYTICS : SINGAPORE_PRIVATE_PROPERTY
            </p>
          </div>

          {/* Execution Parameters - Body */}
          <div className="font-mono text-sm text-neutral-600 leading-relaxed">
            <p>// EXECUTE: Decision_making with latest raw data + market_trends</p>
          </div>
        </div>

        {/* Kaiju Image - Massive towers anchored bottom-right with top fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[82%]"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 100%)'
          }}
        >
          <img
            src="/ZG.png"
            alt="Zyon Grand"
            className="w-full h-full object-cover object-bottom"
          />
        </div>

        {/* Corner Technical Labels */}
        <div className="absolute top-6 right-6 font-mono text-[10px] uppercase tracking-widest text-black/30 z-10">
          <span className="text-[#FF6600]">|</span> Zyon Grand
        </div>
        <div className="absolute bottom-6 left-6 font-mono text-[10px] uppercase tracking-widest text-black/30 z-10">
          01.3521°N / 103.8198°E
        </div>
        <div className="absolute bottom-6 right-6 font-mono text-[10px] uppercase tracking-widest text-black/40 z-10">
          SG_D15 // NEW_LAUNCH
        </div>
      </div>
    </div>
  );
}

export default Login;
