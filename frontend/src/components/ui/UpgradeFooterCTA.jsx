import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { Lock } from 'lucide-react';

/**
 * UpgradeFooterCTA - Sticky footer CTA for teaser dashboard
 *
 * Decision logic (builds trust through consistency):
 * - Not logged in → Navigate to /login (Google auth)
 * - Logged in but unpaid → Show PricingModal (Stripe)
 * - Paid (canAccessPremium) → Don't render at all
 *
 * Positioned at bottom of main content area (z-30)
 */
export function UpgradeFooterCTA() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { canAccessPremium, paywall } = useSubscription();

  // Don't render if already premium
  if (canAccessPremium) return null;

  const handleClick = () => {
    if (!isAuthenticated) {
      // Not logged in → Go to login
      navigate('/login');
    } else {
      // Logged in but unpaid → Show pricing modal
      paywall.open({ source: 'footer-cta' });
    }
  };

  return (
    <div className="sticky bottom-0 z-30 bg-brand-navy shadow-lg">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Text content */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-brand-sand text-sm">
            Unlock Full Access
          </p>
          <p className="text-xs text-brand-sky truncate">
            See exact prices, project names, and transaction details
          </p>
        </div>

        {/* CTA Button - Golden/Cream button on dark background */}
        <button
          onClick={handleClick}
          className="flex items-center gap-2 px-4 py-2 bg-brand-sand text-brand-navy
                     rounded-lg font-semibold text-sm hover:bg-brand-sand/90
                     transition-colors whitespace-nowrap shadow-md"
        >
          <Lock className="w-4 h-4" />
          {isAuthenticated ? 'Upgrade Now' : 'Sign In to Unlock'}
        </button>
      </div>
    </div>
  );
}

export default UpgradeFooterCTA;
