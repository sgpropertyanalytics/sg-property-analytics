import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import apiClient from '../api/client';

/**
 * Pricing Page - "Black Card Effect" Design
 *
 * Two-card layout:
 * - Quarterly: White card (anchor/standard)
 * - Annual: Deep Navy card (premium "black card" VIP look)
 *
 * Color Palette:
 * - Page Background: #EAE0CF (Sand)
 * - Quarterly: White bg, Navy text, Ghost button
 * - Annual: #213448 (Navy) bg, Sand/White text, Sand button
 */
export default function Pricing() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { isPremium, subscription } = useSubscription();

  const handleSelectPlan = async (planId) => {
    // If not logged in, redirect to login with return path
    if (!isAuthenticated) {
      navigate('/login', { state: { returnTo: '/pricing', selectedPlan: planId } });
      return;
    }

    try {
      // Create Stripe checkout session
      const response = await apiClient.post('/payments/create-checkout', {
        plan_id: planId,
        success_url: `${window.location.origin}/market-pulse?upgraded=true`,
        cancel_url: `${window.location.origin}/pricing`,
      });

      // Redirect to Stripe Checkout
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      // TODO: Show error toast
    }
  };

  // If already premium, show confirmation
  if (isPremium) {
    return (
      <div className="min-h-screen bg-[#EAE0CF] py-16 px-4">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-[#94B4C1]/30">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[#213448] mb-2">You're a Premium Member</h2>
            <p className="text-[#547792] mb-6">
              You have full access to all property data and features.
            </p>
            <p className="text-sm text-[#94B4C1] mb-4">
              {subscription.ends_at && (
                <>Subscription ends: {new Date(subscription.ends_at).toLocaleDateString('en-SG', { year: 'numeric', month: 'long', day: 'numeric' })}</>
              )}
            </p>
            <button
              onClick={() => navigate('/market-pulse')}
              className="w-full py-3 bg-[#213448] text-white rounded-xl hover:bg-[#547792] transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EAE0CF] py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#213448] mb-4">
            Unlock Full Property Intelligence
          </h1>
          <p className="text-[#547792] text-lg max-w-xl mx-auto">
            Access exact prices, project names, unit sizes, and PSF data to make confident property decisions.
          </p>
        </div>

        {/* Pricing Cards - Side by Side, Same height */}
        <div className="flex flex-col md:flex-row gap-6 items-stretch max-w-2xl mx-auto">

          {/* Quarterly Card - White (References Annual) */}
          <div className="flex-1 bg-white rounded-2xl p-8 border-2 border-[#94B4C1]/50 shadow-lg flex flex-col">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-[#547792] mb-2">Quarterly</h3>
              <div className="mb-1">
                <span className="text-4xl font-bold text-[#213448]">$75</span>
                <span className="text-[#547792] ml-1"> / quarter</span>
              </div>
              <p className="text-[#547792] text-sm mb-1">Equivalent to $25/mo</p>
              <p className="text-[#547792] text-xs mb-6">Cancel anytime.</p>

              {/* Reference to Annual features */}
              <p className="flex items-start gap-2 text-sm">
                <svg className="w-5 h-5 text-[#94B4C1] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-[#213448] font-medium">Includes full access to all 6 features listed in Annual.</span>
              </p>
            </div>

            <button
              onClick={() => handleSelectPlan('quarterly')}
              className="w-full py-3 border-2 border-[#547792] text-[#547792] rounded-xl font-medium hover:bg-[#547792]/10 transition-colors mt-6"
            >
              Select Quarterly
            </button>
          </div>

          {/* Annual Card - Deep Navy (Full features list) */}
          <div className="flex-1 bg-[#213448] rounded-2xl p-8 shadow-2xl relative flex flex-col">
            {/* Save 40% Badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-[#94B4C1] text-[#213448] text-xs font-bold px-4 py-1.5 rounded-full shadow-md">
                SAVE 40%
              </span>
            </div>

            <div className="flex-1 pt-2">
              <h3 className="text-xl font-bold text-[#EAE0CF] mb-2">Annual</h3>
              <div className="mb-1">
                <span className="text-4xl font-bold text-white">$180</span>
                <span className="text-[#94B4C1] ml-1"> / year</span>
              </div>
              <p className="text-[#94B4C1] text-sm mb-1">Equivalent to $15/mo · <span className="text-[#EAE0CF]">Save 40%</span></p>
              <p className="text-[#547792] text-xs mb-6">Cancel anytime.</p>

              {/* Full Features List (Master List) */}
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[#94B4C1] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[#94B4C1]">Exact Transaction Prices</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[#94B4C1] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[#94B4C1]">Deal Percentile Ranking</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[#94B4C1] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[#94B4C1]">Floor-Level Pricing Patterns</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[#94B4C1] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[#94B4C1]">New Launch vs Resale Gap</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[#94B4C1] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[#94B4C1]">Market Signals & Distribution</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[#94B4C1] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[#94B4C1]">Upcoming Supply Pipeline</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => handleSelectPlan('annual')}
              className="w-full py-3 bg-[#EAE0CF] text-[#213448] rounded-xl font-bold hover:bg-white transition-colors mt-6"
            >
              Unlock & Save $120
            </button>
          </div>
        </div>

        {/* Trust Signals */}
        <div className="mt-12 text-center">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[#547792]">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Secure payment via Stripe</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>7-day money-back guarantee</span>
            </div>
          </div>
        </div>

        {/* Back to Dashboard Link */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/market-pulse')}
            className="text-[#547792] hover:text-[#213448] underline text-sm"
          >
            Continue with limited access
          </button>
        </div>
      </div>
    </div>
  );
}
