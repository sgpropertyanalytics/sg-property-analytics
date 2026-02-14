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

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    signInWithGoogle,
    isConfigured,
    isAuthenticated,
    initialized,
    user,
    logout,
    getErrorMessage
  } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [domainError, setDomainError] = useState(false);
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
    if (isAuthenticated && user) return;

    if (!isConfigured) return;

    setIsSigningIn(true);

    try {
      await withTimeout(signInWithGoogle(), 20000);
      // Popup resolved → onAuthStateChanged fires → auto-redirect effect navigates
    } catch (err) {
      const isCancelled =
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request';

      if (err?.code === 'auth/unauthorized-domain') {
        setDomainError(true);
      } else if (err?.code === 'auth/timeout') {
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
    <div className="min-h-screen relative flex items-center justify-center px-6 py-12 bg-[#f5f5f7]">

      {/* ===== GLOBAL NOISE OVERLAY ===== */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative w-full max-w-[560px]">
        {/* ===== TECHNICAL FRAME ===== */}
        <div className="relative bg-white border-2 border-black p-8 md:p-10 shadow-[8px_8px_0px_0px_#000000]">

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

          {/* Already Signed In State */}
          {initialized && isAuthenticated && user ? (
            <div className="mb-6 border border-black/10 bg-white/80 p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/40">
                Session Detected
              </div>
              <div className="mt-2 font-mono text-xs text-black/70">
                Signed in as {user?.email || 'unknown'}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate(from, { replace: true })}
                  className="flex-1 h-10 bg-black text-white font-mono text-[10px] uppercase tracking-widest"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="flex-1 h-10 border border-black/30 text-black font-mono text-[10px] uppercase tracking-widest hover:bg-black/[0.04]"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : null}

          {/* Domain Authorization Error */}
          {domainError && (
            <div className="mb-6 border border-red-300 bg-red-50 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-600/70 mb-2">
                Domain Not Authorized
              </div>
              <p className="font-mono text-xs text-red-800 leading-relaxed">
                <strong>{window.location.hostname}</strong> is not registered as an authorized domain in Firebase.
              </p>
              <p className="font-mono text-[10px] text-red-600/80 mt-2 leading-relaxed">
                Fix: Firebase Console &rarr; Authentication &rarr; Settings &rarr; Authorized domains &rarr; Add this domain.
              </p>
            </div>
          )}

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
        </div>
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          className="absolute -top-12 left-0 flex items-center gap-2 text-black/50 hover:text-black transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-mono text-xs uppercase tracking-widest">Back</span>
        </button>
      </div>
    </div>
  );
}

export default Login;
