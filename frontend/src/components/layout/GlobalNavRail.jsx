import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionContext';
import { UserProfileMenu } from './UserProfileMenu';
import { AccountSettingsModal } from '../AccountSettingsModal';

/**
 * GlobalNavRail - Primary Navigation Rail (64px fixed width)
 *
 * The far-left navigation component that provides app-wide page switching.
 * Uses Deep Navy (#213448) background with Sand/Cream (#EAE0CF) active states.
 *
 * Responsive Behavior:
 * - Desktop (lg+): Fixed 64px rail, always visible
 * - Tablet/Mobile: Hidden, controlled via parent DashboardLayout hamburger
 *
 * Pages:
 * 1. Market Pulse - Current MacroOverview analytics content
 * 2. Value Parity - Budget search tool (includes New Launches + Resale)
 * 3. Floor Dispersion - Floor level analysis
 * 4. District Deep Dive - Detailed district analysis (Volume/Liquidity & Price/PSF)
 * 5. Project Deep Dive - Detailed project analysis (Coming Soon)
 */

export const NAV_ITEMS = [
  {
    id: 'market-pulse',
    path: '/market-pulse',
    label: 'Market Pulse',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'district-deep-dive',
    path: '/district-deep-dive',
    label: 'District Deep Dive',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    id: 'project-deep-dive',
    path: '/project-deep-dive',
    label: 'Project Deep Dive',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
      </svg>
    ),
  },
  {
    id: 'value-parity',
    path: '/value-parity',
    label: 'Value Parity',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    id: 'floor-dispersion',
    path: '/floor-dispersion',
    label: 'Floor Dispersion',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
];

export function GlobalNavRail({ activePage, onPageChange, expanded = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showPaywall } = useSubscription();
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  // Determine active page from URL or prop
  const currentPath = location.pathname;
  const activeItem = activePage ||
    NAV_ITEMS.find(item => currentPath.startsWith(item.path))?.id ||
    'market-pulse';

  const handleNavClick = (item) => {
    if (onPageChange) {
      onPageChange(item.id);
    }
    navigate(item.path);
  };

  return (
    <nav
      className={`bg-[#213448] flex flex-col py-4 flex-shrink-0 h-full ${expanded ? 'w-64 px-3' : 'w-16 items-center'}`}
      aria-label="Main navigation"
    >
      {/* Logo / Home - Links to Market Pulse */}
      <button
        onClick={() => navigate('/market-pulse')}
        className={`group relative mb-8 flex items-center ${expanded ? 'gap-3 w-full px-2' : 'justify-center'}`}
        aria-label="Go to Market Pulse"
      >
        <div className="w-10 h-10 rounded-lg bg-[#547792]/30 flex items-center justify-center transition-all duration-200 group-hover:bg-[#547792]/50 group-hover:scale-105 flex-shrink-0">
          <svg className="w-6 h-6 text-[#EAE0CF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>

        {/* Label when expanded */}
        {expanded && (
          <span className="text-[#EAE0CF] font-medium text-sm">Home</span>
        )}

        {/* Tooltip - only shown when collapsed */}
        {!expanded && (
          <div className="
            absolute left-full ml-4 px-3 py-2
            bg-[#213448] text-[#EAE0CF] text-sm font-medium
            rounded-lg shadow-xl
            opacity-0 invisible group-hover:opacity-100 group-hover:visible
            pointer-events-none transition-all duration-200 delay-100
            whitespace-nowrap z-50 border border-[#94B4C1]/30
          ">
            Home
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-3 h-3 bg-[#213448] rotate-45 border-l border-b border-[#94B4C1]/30" />
          </div>
        )}
      </button>

      {/* Navigation Items */}
      <div className={`flex-1 flex flex-col gap-2 w-full ${expanded ? 'px-1' : 'px-2'}`}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`
                group relative flex items-center
                ${expanded ? 'gap-3 px-3 py-3 rounded-lg' : 'flex-col justify-center w-full aspect-square rounded-xl'}
                transition-all duration-200 ease-out
                ${isActive
                  ? 'bg-[#547792]/40 text-[#EAE0CF]'
                  : 'text-[#94B4C1]/60 hover:bg-[#547792]/30 hover:text-[#EAE0CF]'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#EAE0CF] rounded-r-full" />
              )}

              {/* Icon */}
              <span className={`transition-transform duration-200 flex-shrink-0 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                {item.icon}
              </span>

              {/* Label when expanded */}
              {expanded && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}

              {/* Tooltip on hover - only when collapsed */}
              {!expanded && (
                <div className="
                  absolute left-full ml-4 px-3 py-2
                  bg-[#213448] text-[#EAE0CF] text-sm font-medium
                  rounded-lg shadow-xl
                  opacity-0 invisible group-hover:opacity-100 group-hover:visible
                  pointer-events-none transition-all duration-200 delay-100
                  whitespace-nowrap z-50 border border-[#94B4C1]/30
                ">
                  {item.label}
                  {/* Arrow pointing left */}
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-3 h-3 bg-[#213448] rotate-45 border-l border-b border-[#94B4C1]/30" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom section - User Profile */}
      <div className={`mt-auto pt-4 w-full ${expanded ? 'px-1' : 'px-2'}`}>
        <UserProfileMenu
          expanded={expanded}
          onOpenSettings={() => setShowAccountSettings(true)}
        />
      </div>

      {/* Account Settings Modal */}
      <AccountSettingsModal
        isOpen={showAccountSettings}
        onClose={() => setShowAccountSettings(false)}
        onShowPricing={() => showPaywall({ source: 'account_settings' })}
      />
    </nav>
  );
}

export default GlobalNavRail;
