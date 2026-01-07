import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import apiClient from '../api/client';

/**
 * Pricing Page - "Black Card Effect" Design
 *
 * Two-card layout:
 * - Quarterly: White card (anchor/standard)
 * - Annual: Slate card (premium "black card" VIP look)
 *
 * Color Palette (Institutional Print / Slate):
 * - Page Background: slate-200 (#E5E7EB)
 * - Quarterly: White bg, Slate text, Ghost button
 * - Annual: slate-900 (#0F172A) bg, Light text, slate-200 button
 */
export default function Pricing() {
  const navigate = useNavigate();
  const { user: _user, isAuthenticated } = useAuth();
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
        success_url: `${window.location.origin}/market-overview?upgraded=true`,
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
      <div className="min-h-screen bg-brand-sand py-16 px-4">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-brand-sky/30">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-brand-navy mb-2">You're a Premium Member</h2>
            <p className="text-brand-blue mb-6">
              You have full access to all property data and features.
            </p>
            <p className="text-sm text-brand-sky mb-4">
              {subscription.ends_at && (
                <>Subscription ends: {new Date(subscription.ends_at).toLocaleDateString('en-SG', { year: 'numeric', month: 'long', day: 'numeric' })}</>
              )}
            </p>
            <button
              onClick={() => navigate('/market-overview')}
              className="w-full py-3 bg-brand-navy text-white rounded-xl hover:bg-brand-blue transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-sand py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-brand-navy mb-4">
            Unlock Full Property Intelligence
          </h1>
          <p className="text-brand-blue text-lg max-w-xl mx-auto">
            Access exact prices, project names, unit sizes, and PSF data to make confident property decisions.
          </p>
        </div>

        {/* Pricing Cards - Annual elevated with pop-out effect, Quarterly centered */}
        <div className="flex flex-col md:flex-row gap-6 md:items-center max-w-2xl mx-auto">

          {/* Quarterly Card - White (Vertically centered, resting on page) */}
          <div
            className="flex-1 bg-white rounded-2xl p-8 border border-brand-sky/50 flex flex-col min-h-[420px]"
            style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
          >
            <div className="flex-1 flex flex-col justify-center">
              <h3 className="text-xl font-bold text-brand-blue mb-2">Quarterly</h3>
              <div className="mb-1">
                <span className="text-4xl font-bold text-brand-navy">$33</span>
                <span className="text-brand-blue ml-1">/mo</span>
              </div>
              <p className="text-brand-blue text-sm mb-6">Billed $99 every 3 months</p>

              {/* Quarterly-specific value props */}
              <div className="space-y-2.5">
                <p className="flex items-start gap-2 text-sm">
                  <svg className="w-5 h-5 text-brand-sky mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-brand-navy font-medium">Full access to all valuation tools</span>
                </p>
                <p className="flex items-start gap-2 text-sm">
                  <svg className="w-5 h-5 text-brand-sky mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-brand-blue">Flexible commitment, cancel anytime</span>
                </p>
                <p className="flex items-start gap-2 text-sm">
                  <svg className="w-5 h-5 text-brand-sky mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-brand-blue">Try before committing to a year</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => handleSelectPlan('quarterly')}
              className="w-full py-3 border-2 border-brand-blue text-brand-blue rounded-xl font-medium hover:bg-brand-blue/10 transition-colors mt-6"
            >
              Start Quarterly Plan
            </button>
          </div>

          {/* Annual Card - Deep Navy (Subtly elevated - ~5-10% taller) */}
          <div
            className="flex-1 bg-brand-navy rounded-2xl relative flex flex-col"
            style={{
              boxShadow: '0 16px 32px -8px rgba(0,0,0,0.18)',
              padding: '2rem',
            }}
          >
            {/* Most Popular Badge - Social proof */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-brand-sand text-brand-navy text-xs font-bold px-4 py-1.5 rounded-full shadow-md flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                MOST POPULAR
              </span>
            </div>

            <div className="flex-1 pt-2">
              <h3 className="text-xl font-bold text-brand-sand mb-2">Annual</h3>
              <div className="mb-1">
                <span className="text-4xl font-bold text-white">$24</span>
                <span className="text-brand-sky ml-1">/mo</span>
              </div>
              <p className="text-brand-sky text-sm mb-6">Billed $288 yearly · <span className="text-brand-sand">Save $108</span></p>

              {/* Outcomes List (Master List) */}
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-brand-sky mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-brand-sky">Check whether you over/under paid relatively</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-brand-sky mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-brand-sky">Track resale benchmarks within your project</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-brand-sky mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-brand-sky">Get alerts when similar units transact</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-brand-sky mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-brand-sky">Validate exit plans with market timing cycles</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-brand-sky mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-brand-sky">Spot pricing hotspots using district heatmaps</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-brand-sky mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-brand-sky">See how floor level impacts price</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => handleSelectPlan('annual')}
              className="w-full py-3.5 bg-brand-sand text-brand-navy rounded-xl font-bold hover:bg-white transition-colors mt-6"
            >
              Start Annual & Save $108
            </button>
          </div>
        </div>

        {/* Trust Signals */}
        <div className="mt-12 text-center">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-brand-blue">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Secure payment via Stripe</span>
            </div>
          </div>
        </div>

        {/* Back to Dashboard Link */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/market-overview')}
            className="text-brand-blue hover:text-brand-navy underline text-sm"
          >
            Continue with limited access
          </button>
        </div>
      </div>
    </div>
  );
}
