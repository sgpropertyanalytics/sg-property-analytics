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
        success_url: `${window.location.origin}/market-pulse?upgraded=true`,
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
  const outcomes = [
    'Know if you over- or under-paid relative to recent transactions',
    'Track resale benchmarks within your project',
    'Get notified when similar units transact',
    'Validate exit or refinancing timing using live data',
    'Spot pricing hotspots with district-level heatmaps',
    'See how floor level impacts price in any building',
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
        <div className="relative bg-[#EAE0CF] rounded-2xl shadow-2xl w-full max-w-[820px] p-6 md:p-8">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-[#547792] hover:text-[#213448] hover:bg-white/50 rounded-lg transition-colors z-10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Hero Section - Contextual based on trigger */}
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#213448] mb-2">
              {message.title}
            </h2>
            <p className="text-[#547792] text-sm md:text-base">
              {message.subtitle}
            </p>
          </div>

          {/* Side-by-Side Cards - Annual elevated, Quarterly centered */}
          <div className="flex flex-col md:flex-row gap-5 md:items-center mb-6">

            {/* LEFT: Quarterly (Vertically centered, resting on page) */}
            <div
              className="flex-1 bg-white rounded-xl p-6 border border-[#94B4C1] flex flex-col"
              style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
            >
              <div className="flex-1 flex flex-col justify-center">
                <h3 className="text-[#213448] font-bold text-xl mb-2">Quarterly</h3>
                <p className="text-[#213448] text-3xl font-bold mb-1">
                  $25<span className="text-[#547792] text-base font-normal">/mo</span>
                </p>
                <p className="text-[#547792] text-sm mb-5">Billed $75 every 3 months</p>

                {/* Reference to Annual features */}
                <p className="flex items-start gap-2 text-[#547792] text-sm">
                  <svg className="w-4 h-4 text-[#94B4C1] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-[#213448] font-medium">Includes everything in Annual.</span>
                </p>
              </div>

              <button
                onClick={() => handleSelectPlan('quarterly')}
                disabled={loading === 'quarterly'}
                className="mt-6 w-full border-2 border-[#547792] text-[#547792] px-5 py-3 rounded-lg font-semibold hover:bg-[#547792]/10 transition-colors disabled:opacity-50"
              >
                {loading === 'quarterly' ? 'Loading...' : 'Select Quarterly'}
              </button>
            </div>

            {/* RIGHT: Annual (Taller, elevated with deep shadow - "Pop-out" effect) */}
            <div
              className="flex-1 bg-[#213448] rounded-xl flex flex-col relative"
              style={{
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                padding: '2rem 1.5rem 1.5rem 1.5rem',
                marginTop: '-20px',
                marginBottom: '-20px',
              }}
            >
              {/* SAVE 40% Badge */}
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="bg-[#94B4C1] text-[#213448] text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide whitespace-nowrap">
                  Save 40%
                </span>
              </div>

              <div className="flex-1 pt-2">
                <h3 className="text-[#EAE0CF] font-bold text-xl mb-2">Annual</h3>
                <p className="mb-1">
                  <span className="text-white text-4xl font-bold">$15</span>
                  <span className="text-[#94B4C1] text-base font-normal">/mo</span>
                </p>
                <p className="text-[#94B4C1] text-sm mb-5">Billed $180 yearly · <span className="text-[#EAE0CF]">Save 40%</span></p>

                {/* Outcomes - Full List (Master List) */}
                <div className="space-y-2.5">
                  {outcomes.map((outcome, i) => (
                    <p key={i} className="flex items-start gap-2 text-white text-sm">
                      <svg className="w-4 h-4 text-[#94B4C1] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {outcome}
                    </p>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleSelectPlan('annual')}
                disabled={loading === 'annual'}
                className="mt-6 w-full bg-[#EAE0CF] text-[#213448] px-5 py-3.5 rounded-lg font-bold hover:bg-white transition-colors disabled:opacity-50"
              >
                {loading === 'annual' ? 'Loading...' : 'Unlock & Save $120'}
              </button>
            </div>
          </div>

          {/* The Closer */}
          <p className="text-center text-[#547792] text-sm italic mb-4">
            "The price of one bad property decision &gt; 10 years of this subscription."
          </p>

          {/* Trust signals */}
          <div className="flex items-center justify-center gap-6 text-xs text-[#547792]">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secure via Stripe
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PricingModal;
