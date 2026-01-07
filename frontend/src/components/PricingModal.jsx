import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import apiClient from '../api/client';

/**
 * PricingModal - Conversion-Optimized Checkout Modal
 *
 * Strategy: "Black Card Effect" + "Mirror Strategy" + "IQ Test" pricing
 * - Both cards have IDENTICAL features (forces price comparison)
 * - Annual card physically dominates (10% taller, shadow, navy)
 * - Direct to Stripe on click
 * - Contextual headers based on trigger source
 */

// Intent-based upgrade messages
const UPGRADE_MESSAGES = {
  'project-drill': {
    title: 'Unlock Unit-Level Precision',
    subtitle: 'See exactly what your neighbors paid.',
  },
  'time-range': {
    title: 'See the Full Cycle',
    subtitle: 'Compare today\'s prices to past market lows.',
  },
  'confidence-scores': {
    title: 'Stop Guessing',
    subtitle: 'Unlock Confidence Scores and Fair Value estimates.',
  },
  'transaction-table': {
    title: 'Unlock Transaction Details',
    subtitle: 'See every unit, price, and date.',
  },
  'preview-banner': {
    title: 'Unlock Full Access',
    subtitle: 'Full history, unit-level data, and advanced analytics.',
  },
  'scatter-tooltip': {
    title: 'Unlock Unit-Level Details',
    subtitle: 'See the exact project, price, and PSF for every transaction.',
  },
  default: {
    title: 'Stop Guessing. Start Knowing.',
    subtitle: 'Unlock the hidden valuation data for the unit you just viewed.',
  },
};

export function PricingModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { upsellContext } = useSubscription();
  const [loading, setLoading] = useState(null);

  if (!isOpen) return null;

  // Get contextual messaging based on trigger source
  const message = UPGRADE_MESSAGES[upsellContext?.source] || UPGRADE_MESSAGES.default;

  const handleSelectPlan = async (planId) => {
    if (!isAuthenticated) {
      onClose();
      navigate('/login', { state: { returnTo: window.location.pathname, selectedPlan: planId } });
      return;
    }

    setLoading(planId);

    try {
      const response = await apiClient.post('/payments/create-checkout', {
        plan_id: planId,
        success_url: `${window.location.origin}/market-overview?upgraded=true`,
        cancel_url: window.location.href,
      });

      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      setLoading(null);
    }
  };

  // Outcome-focused statements (what users achieve, not features)
  // Key benefits are marked with isBold: true for emphasis
  const outcomes = [
    { text: 'Check over/under paid status', isBold: true },
    { text: 'Track resale benchmarks within your project', isBold: false },
    { text: 'Validate exit plans with market cycles', isBold: true },
    { text: 'Spot pricing hotspots with district heatmaps', isBold: false },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal - Wide Landscape */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-brand-sand rounded-2xl shadow-2xl w-full max-w-[820px] p-6 md:p-8">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-brand-blue hover:text-brand-navy hover:bg-white/50 rounded-lg transition-colors z-10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Hero Section - Contextual based on trigger */}
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-brand-navy mb-2">
              {message.title}
            </h2>
            <p className="text-brand-blue text-sm md:text-base mb-4">
              {message.subtitle}
            </p>
            {/* Loss Aversion Anchor - Prominent placement */}
            <div className="inline-flex items-center gap-2 bg-brand-navy/5 border border-brand-navy/10 rounded-lg px-4 py-2">
              <svg className="w-5 h-5 text-brand-blue flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-brand-navy text-sm font-medium">
                One bad property decision costs more than 10 years of this subscription.
              </p>
            </div>
          </div>

          {/* Side-by-Side Cards - Annual elevated, Quarterly centered */}
          <div className="flex flex-col md:flex-row gap-5 md:items-center mb-6">

            {/* LEFT: Quarterly (Vertically centered, resting on page) */}
            <div
              className="flex-1 bg-white rounded-xl p-6 border border-brand-sky flex flex-col min-h-[360px]"
              style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
            >
              <div className="flex-1 flex flex-col justify-center">
                <h3 className="text-brand-navy font-bold text-xl mb-2">Quarterly</h3>
                <p className="text-brand-navy text-3xl font-bold mb-1">
                  $33<span className="text-brand-blue text-base font-normal">/mo</span>
                </p>
                <p className="text-brand-blue text-sm mb-5">Billed $99 every 3 months</p>

                {/* Quarterly-specific value props */}
                <div className="space-y-2.5">
                  <p className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-brand-sky mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-brand-navy font-medium">Full access to all valuation tools</span>
                  </p>
                  <p className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-brand-sky mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-brand-blue">Flexible commitment, cancel anytime</span>
                  </p>
                  <p className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-brand-sky mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-brand-blue">Try before committing to a year</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleSelectPlan('quarterly')}
                disabled={loading === 'quarterly'}
                className="mt-6 w-full border-2 border-brand-blue text-brand-blue px-5 py-3 rounded-lg font-semibold hover:bg-brand-blue/10 transition-colors disabled:opacity-50"
              >
                {loading === 'quarterly' ? 'Loading...' : 'Start Quarterly Plan'}
              </button>
            </div>

            {/* RIGHT: Annual (Subtly elevated with soft shadow - ~5-10% taller) */}
            <div
              className="flex-1 bg-brand-navy rounded-xl flex flex-col relative"
              style={{
                boxShadow: '0 16px 32px -8px rgba(0,0,0,0.18)',
                padding: '1.5rem',
              }}
            >
              {/* Most Popular Badge - Social proof */}
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="bg-brand-sand text-brand-navy text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide whitespace-nowrap flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Most Popular
                </span>
              </div>

              <div className="flex-1 pt-2">
                <h3 className="text-brand-sand font-bold text-xl mb-2">Annual</h3>
                <p className="mb-1">
                  <span className="text-white text-4xl font-bold">$24</span>
                  <span className="text-brand-sky text-base font-normal">/mo</span>
                </p>
                <p className="text-brand-sky text-sm mb-5">Billed $288 yearly · <span className="text-brand-sand font-medium">Save $108</span></p>

                {/* Outcomes - Key benefits bolded for scannability */}
                <div className="space-y-2.5">
                  {outcomes.map((outcome, i) => (
                    <p key={i} className="flex items-start gap-2 text-white text-sm">
                      <svg className="w-4 h-4 text-brand-sky mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className={outcome.isBold ? 'font-semibold' : ''}>{outcome.text}</span>
                    </p>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleSelectPlan('annual')}
                disabled={loading === 'annual'}
                className="mt-6 w-full bg-brand-sand text-brand-navy px-5 py-3.5 rounded-lg font-bold hover:bg-white transition-colors disabled:opacity-50"
              >
                {loading === 'annual' ? 'Loading...' : 'Start Annual & Save $108'}
              </button>
            </div>
          </div>

          {/* Trust signals */}
          <div className="flex items-center justify-center gap-6 text-xs text-brand-blue mb-3">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secure via Stripe
            </span>
          </div>

          {/* "X Trap" - Negative option that guilt-trips users into reconsidering */}
          <button
            onClick={onClose}
            className="block mx-auto text-xs text-brand-sky hover:text-brand-blue transition-colors underline underline-offset-2"
          >
            No thanks, I prefer to guess market prices
          </button>
        </div>
      </div>
    </div>
  );
}

export default PricingModal;
