import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * ChartGate - Premium feature gate for dashboard charts
 *
 * Renders chart content with a semi-transparent overlay and CTA for free users.
 * Premium users see the chart directly with no overhead.
 *
 * Usage:
 *   <ChartGate chartId="price-distribution">
 *     <PriceDistributionChart />
 *   </ChartGate>
 *
 * Gating is determined by chartId - only charts with config are gated.
 * Charts without config render children directly.
 */

const CHART_CONFIG = {
  'unit-size-vs-price': {
    title: 'Unlock Size vs Price Analysis',
    description: 'See what you get for your budget across 2,000+ transactions'
  },
  'price-distribution': {
    title: 'Unlock Price Distribution',
    description: 'See median prices, IQR, and where most transactions happen'
  },
  'new-vs-resale': {
    title: 'Unlock New vs Resale Premium',
    description: 'Track the gap between new launches and young resales'
  },
  'price-compression': {
    title: 'Unlock Market Compression',
    description: 'See real-time spread analysis and market signals'
  }
};

export function ChartGate({ chartId, children }) {
  const { isPremium, showPaywall } = useSubscription();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const config = CHART_CONFIG[chartId];

  // No config = not gated, or premium user = show chart directly
  if (!config || isPremium) {
    return children;
  }

  const handleClick = () => {
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      showPaywall({ source: 'chart-gate', chartId });
    }
  };

  return (
    <div className="relative">
      {/* Blurred chart - visible but not interactive */}
      <div className="blur-[2px] pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay with CTA */}
      <div
        className="absolute inset-0 bg-[#213448]/60 backdrop-blur-sm
                   flex items-center justify-center cursor-pointer
                   rounded-lg"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        aria-label={`${config.title}. Click to unlock.`}
      >
        {/* CTA Card */}
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-2xl max-w-xs mx-4 text-center">
          {/* Lock Icon */}
          <div className="w-12 h-12 md:w-14 md:h-14 bg-[#213448] rounded-full
                          flex items-center justify-center mx-auto mb-3 md:mb-4">
            <Lock className="w-6 h-6 md:w-7 md:h-7 text-[#EAE0CF]" />
          </div>

          <h3 className="text-lg md:text-xl font-bold text-[#213448] mb-2">
            {config.title}
          </h3>
          <p className="text-[#547792] text-xs md:text-sm mb-4 md:mb-6">
            {config.description}
          </p>

          <button
            className="w-full px-4 py-2.5 bg-[#213448] text-white
                       rounded-lg font-semibold text-sm hover:bg-[#547792]
                       transition-colors flex items-center justify-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
          >
            <Lock className="w-4 h-4" />
            {isAuthenticated ? 'Upgrade Now' : 'Sign In to Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChartGate;
