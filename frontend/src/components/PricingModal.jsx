import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

/**
 * PricingModal - Modal version of the pricing page
 *
 * Triggered when:
 * - User clicks on blurred data
 * - User tries to access premium features
 *
 * Follows the "Black Card Effect" design:
 * - Quarterly: Standard white card
 * - Annual: Premium navy "black card"
 */
export function PricingModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  if (!isOpen) return null;

  const handleSelectPlan = async (planId) => {
    // If not logged in, redirect to login
    if (!isAuthenticated) {
      onClose();
      navigate('/login', { state: { returnTo: '/pricing', selectedPlan: planId } });
      return;
    }

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
    }
  };

  const handleViewFullPricing = () => {
    onClose();
    navigate('/pricing');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-[#EAE0CF] rounded-2xl shadow-2xl max-w-lg w-full p-6 md:p-8">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-[#547792] hover:text-[#213448] hover:bg-white/50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="text-center mb-6">
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

          {/* Quick Plan Options */}
          <div className="space-y-4 mb-6">

            {/* Annual - Recommended (Black Card) */}
            <div className="bg-[#213448] rounded-xl p-5 relative">
              <div className="absolute -top-2.5 left-4">
                <span className="bg-[#94B4C1] text-[#213448] text-[10px] font-bold px-2 py-1 rounded-full">
                  BEST VALUE
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[#EAE0CF] font-semibold">Annual</h3>
                  <p className="text-white text-2xl font-bold">
                    $15<span className="text-[#94B4C1] text-sm font-normal">/mo</span>
                  </p>
                  <p className="text-[#94B4C1] text-xs">$180/year (save 40%)</p>
                </div>
                <button
                  onClick={() => handleSelectPlan('annual')}
                  className="bg-[#EAE0CF] text-[#213448] px-5 py-2.5 rounded-lg font-bold hover:bg-white transition-colors"
                >
                  Select
                </button>
              </div>
            </div>

            {/* Quarterly - Standard */}
            <div className="bg-white rounded-xl p-5 border border-[#94B4C1]/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[#547792] font-semibold">Quarterly</h3>
                  <p className="text-[#213448] text-2xl font-bold">
                    $25<span className="text-[#547792] text-sm font-normal">/quarter</span>
                  </p>
                </div>
                <button
                  onClick={() => handleSelectPlan('quarterly')}
                  className="border-2 border-[#547792] text-[#547792] px-5 py-2 rounded-lg font-medium hover:bg-[#547792]/10 transition-colors"
                >
                  Select
                </button>
              </div>
            </div>
          </div>

          {/* Trust signals */}
          <div className="flex items-center justify-center gap-4 text-xs text-[#547792] mb-4">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secure via Stripe
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Cancel anytime
            </span>
          </div>

          {/* View full pricing link */}
          <div className="text-center">
            <button
              onClick={handleViewFullPricing}
              className="text-[#547792] hover:text-[#213448] underline text-sm"
            >
              View full pricing details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PricingModal;
