import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

/**
 * Login Page - Swiss International + Technical Brutalist
 *
 * Auth flow:
 * 1. If already authenticated → redirect immediately
 * 2. signInWithPopup (immediate) with redirect fallback (mobile)
 * 3. onAuthStateChanged fires → auto-redirect effect navigates
 */

// Safety net: reject if popup hangs beyond timeout
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error('Sign-in timed out'), { code: 'auth/timeout' })),
        ms
      )
    ),
  ]);

// Data atmosphere - coordinates for mobile view
const DATA_COORDS = ['01.3521°N', '103.8198°E', '0x7F3A', 'SGP_001', '01.2894°N'];

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithGoogle, isConfigured, isAuthenticated, initialized, user, getErrorMessage } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  const from = location.state?.from?.pathname || '/market-overview';

  // Auto-redirect if user is already authenticated (persisted Firebase session)
  useEffect(() => {
    if (initialized && isAuthenticated && user) {
      navigate(from, { replace: true });
    }
  }, [initialized, isAuthenticated, user, from, navigate]);

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  const handleGoogleSignIn = async () => {
    if (isAuthenticated && user) {
      navigate(from, { replace: true });
      return;
    }

    if (!isConfigured) return;

    setIsSigningIn(true);

    try {
      await withTimeout(signInWithGoogle(), 20000);
      // Popup resolved → onAuthStateChanged fires → auto-redirect effect navigates
    } catch (err) {
      const isCancelled =
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request';

      if (err?.code === 'auth/timeout') {
        toast.error('Sign-in is taking too long. Please try again.');
      } else if (isCancelled && isAuthenticated) {
        toast.info('Sign-in cancelled — staying on your current session.');
      } else if (!isCancelled) {
        toast.error(getErrorMessage(err?.code));
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen relative">

      {/* ===== GLOBAL NOISE OVERLAY ===== */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ===== CENTER VERTICAL RULER (Desktop only) ===== */}
      <div className="hidden lg:block fixed left-1/2 top-0 bottom-0 -translate-x-1/2 z-40 pointer-events-none">
        {/* Main vertical line with fade */}
        <div
          className="absolute left-1/2 top-0 bottom-0 w-px bg-black/10"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)'
          }}
        />
        {/* Tick marks - from 15% to 85% of screen height */}
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 flex items-center"
            style={{ top: `calc(15% + ${i * 60}px)` }}
          >
            <div className="w-2 h-px bg-black/30 -translate-x-1/2" />
            <span className="font-mono text-[8px] text-black/30 ml-2">{String((i + 1) * 60).padStart(4, '0')}</span>
          </div>
        ))}
      </div>

      {/* ===== MOBILE: Image Panel (stacks above on mobile) ===== */}
      <div className="lg:hidden relative h-[280px] overflow-hidden bg-[#fafafa]">
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
          className="absolute bottom-0 right-0 h-[220%] object-contain object-right -translate-y-60"
        />

      </div>

      {/* ===== LEFT COLUMN - Form/Content ===== */}
      <div className="relative bg-[#fafafa] flex flex-col justify-center items-center px-6 md:px-12 py-12 overflow-hidden order-2 lg:order-1 lg:border-r border-neutral-200">

        {/* Executive Pinstripe Background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: '#ffffff',
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 4px,
              #e5e5e5 4px,
              #e5e5e5 5px
            )`
          }}
        />

        {/* ===== PASSIVE DATA BLOCKS ===== */}

        {/* Version + Memory - Bottom Left */}
        <div className="absolute bottom-4 left-4 font-mono text-[9px] text-black/25 uppercase tracking-widest z-20 space-y-1">
          <div>v.2.0.4 [STABLE]</div>
          <div>:: MEMORY_USAGE : 14%</div>
          <div>:: CACHE_HIT : 0.97</div>
        </div>

        {/* System Hash - Bottom Right (on left panel) */}
        <div className="absolute bottom-4 right-4 font-mono text-[8px] text-black/20 z-20 text-right space-y-0.5 hidden lg:block">
          <div>0x7F3A9B2E</div>
          <div>0x4C8D1F6A</div>
          <div>0xE2B5A0C3</div>
        </div>



        {/* Back Button - Outside the frame */}
        <button
          onClick={() => navigate('/')}
          className="absolute top-6 left-6 flex items-center gap-2 text-black/50 hover:text-black transition-colors group z-20"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-mono text-xs uppercase tracking-widest">Back</span>
        </button>

        {/* ===== TECHNICAL FRAME ===== */}
        <div className="relative w-full max-w-[480px] bg-white border-2 border-black p-10 md:p-12 z-10 shadow-[8px_8px_0px_0px_#000000]">

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
              :: SYSTEM_ENTRY_POINT ::
            </span>
          </div>

          {/* Micro Label */}
          <div className="mb-6">
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
          <p className="font-mono text-xs text-black/50 mb-10 tracking-wide">
            Evaluate with the latest data + market trends
          </p>

          {/* Google Sign In Button */}
          {isConfigured ? (
            <motion.button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
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
                {isSigningIn ? '[ AUTHENTICATING... ]' : '[ CONTINUE WITH GOOGLE ]'}
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
              [ CONTINUE WITH GOOGLE ]
            </button>
          )}

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

        {/* Kaiju Image - Sits BEHIND the grid (Schematic Approach) */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[95%] z-0"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 80%, transparent 100%), linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 80%, transparent 100%), linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
            maskComposite: 'intersect',
            WebkitMaskComposite: 'source-in'
          }}
        >
          <img
            src="/ZG.png"
            alt="Zyon Grand"
            className="h-[200%] object-contain object-right ml-auto -translate-y-80 opacity-70"
            style={{
              filter: 'contrast(0.8) brightness(1.15) grayscale(100%)',
              mixBlendMode: 'multiply'
            }}
          />
        </div>

        {/* Grid Sky - Now ABOVE the building (z-10) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.06] z-10"
          style={{
            backgroundImage: `
              linear-gradient(to right, #000 1px, transparent 1px),
              linear-gradient(to bottom, #000 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px'
          }}
        />

        {/* Perspective Grid Overlay - adds depth */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03] z-10"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #000 1px, transparent 0)`,
            backgroundSize: '20px 20px'
          }}
        />

        {/* Directive Text Block - Data Column */}
        <div className="absolute top-8 left-8 z-20 space-y-2">
          {/* Primary Directive - Headline */}
          <p className="font-mono text-sm leading-tight whitespace-nowrap tracking-wide">
            <span className="font-normal text-black/50">{'>'} DIRECTIVE //</span>
            <span className="font-semibold text-black"> INSTITUTIONAL-GRADE ANALYTICS</span>
            <span className="font-normal text-black/50"> : SINGAPORE_PRIVATE_PROPERTY</span>
          </p>
          <p className="font-mono text-sm leading-tight whitespace-nowrap tracking-wide font-normal text-black/50">
            {'>'} CCR [D09] // River Valley
          </p>
        </div>

      </div>
    </div>
  );
}

export default Login;
