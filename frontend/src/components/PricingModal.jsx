import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

/**
 * PricingModal - One-Step Checkout Modal
 *
 * Wide landscape modal with side-by-side cards.
 * Clicking "Select" goes directly to Stripe - no intermediate page.
 *
 * Design: "Black Card Effect"
 * - Left: Quarterly (white, anchor)
 * - Right: Annual (navy, hero with shadow)
 */
export function PricingModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(null); // Track which plan is loading

  if (!isOpen) return null;

  const handleSelectPlan = async (planId) => {
    // If not logged in, redirect to login
    if (!isAuthenticated) {
      onClose();
      navigate('/login', { state: { returnTo: window.location.pathname, selectedPlan: planId } });
      return;
    }

    setLoading(planId);

    try {
      // Create Stripe checkout session
      const response = await apiClient.post('/payments/create-checkout', {
        plan_id: planId,
        success_url: `${window.location.origin}/market-pulse?upgraded=true`,
        cancel_url: window.location.href,
      });

      // Redirect to Stripe Checkout
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop - dimmed dashboard visible behind */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal - Wide Landscape */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-[#EAE0CF] rounded-2xl shadow-2xl w-full max-w-[780px] p-6 md:p-8">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-[#547792] hover:text-[#213448] hover:bg-white/50 rounded-lg transition-colors z-10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-[#213448] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#EAE0CF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[#213448] mb-2">
              Unlock Full Data Access
            </h2>
            <p className="text-[#547792] text-sm">
              See exact prices, project names, and PSF details
            </p>
          </div>

          {/* Side-by-Side Cards */}
          <div className="flex flex-col md:flex-row gap-5 items-stretch mb-6">

            {/* LEFT: Quarterly Card (Anchor) */}
            <div className="flex-1 bg-white rounded-xl p-6 border border-[#94B4C1]/50 flex flex-col">
              <div className="flex-1">
                <h3 className="text-[#547792] font-semibold text-lg mb-1">Quarterly</h3>
                <p className="text-[#213448] text-3xl font-bold mb-1">
                  $25<span className="text-[#547792] text-base font-normal">/mo</span>
                </p>
                <p className="text-[#94B4C1] text-xs mb-4">Billed $75 quarterly</p>

                <div className="text-[#547792] text-sm">
                  <p>• Standard Access</p>
                </div>
              </div>

              <button
                onClick={() => handleSelectPlan('quarterly')}
                disabled={loading === 'quarterly'}
                className="mt-6 w-full border-2 border-[#547792] text-[#547792] px-5 py-3 rounded-lg font-semibold hover:bg-[#547792]/10 transition-colors disabled:opacity-50"
              >
                {loading === 'quarterly' ? 'Loading...' : 'Select'}
              </button>
            </div>

            {/* RIGHT: Annual Card (Hero - Black Card) */}
            <div
              className="flex-1 bg-[#213448] rounded-xl p-6 flex flex-col relative md:scale-105 md:py-8"
              style={{ boxShadow: '0px 10px 30px rgba(0,0,0,0.25)' }}
            >
              {/* SAVE 40% Badge */}
              <div className="absolute -top-3 left-4">
                <span className="bg-[#94B4C1] text-[#213448] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  Save 40%
                </span>
              </div>

              <div className="flex-1">
                <h3 className="text-[#EAE0CF] font-semibold text-lg mb-1">Annual</h3>
                <p className="text-white text-3xl font-bold mb-1">
                  $15<span className="text-[#94B4C1] text-base font-normal">/mo</span>
                </p>
                <p className="text-[#94B4C1] text-xs mb-4">Billed $180 yearly</p>

                {/* Feature Bullets */}
                <div className="space-y-2 text-white text-sm">
                  <p className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#94B4C1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Full 10-Year History
                  </p>
                  <p className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#94B4C1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Export to Excel
                  </p>
                  <p className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#94B4C1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Priority Support
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleSelectPlan('annual')}
                disabled={loading === 'annual'}
                className="mt-6 w-full bg-[#EAE0CF] text-[#213448] px-5 py-3 rounded-lg font-bold hover:bg-white transition-colors disabled:opacity-50"
              >
                {loading === 'annual' ? 'Loading...' : 'Unlock Access'}
              </button>
            </div>
          </div>

          {/* Trust signals */}
          <div className="flex items-center justify-center gap-6 text-xs text-[#547792]">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secure via Stripe
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Cancel anytime
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              7-day money-back
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PricingModal;
