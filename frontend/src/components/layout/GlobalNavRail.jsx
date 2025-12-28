import React, { useState, useTransition } from 'react';
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
 * 1. Market Core - Resale market analytics (MacroOverview content)
 * 2. Primary Market - New sale vs resale comparison
 * 3. District Deep Dive - Detailed district analysis (Volume/Liquidity & Price/PSF)
 * 4. Project Deep Dive - Detailed project analysis with floor liquidity
 * 5. Value Parity - Budget search tool (includes New Launches + Resale)
 */

export const NAV_ITEMS = [
  {
    id: 'market-core',
    path: '/market-core',
    label: 'Market Core',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'primary-market',
    path: '/primary-market',
    label: 'Primary Market',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    id: 'district-deep-dive',
    path: '/district-deep-dive',
    label: 'District Deep Dive',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'project-deep-dive',
    path: '/project-deep-dive',
    label: 'Project Deep Dive',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
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
    id: 'supply-insights',
    path: '/supply-insights',
    label: 'Supply & Inventory',
    icon: (
      // Concentric rings - dotted outer (pipeline), solid inner
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {/* Outer dotted ring */}
        <circle cx="12" cy="12" r="10" strokeDasharray="2.5 2.5" opacity="0.9" />
        {/* Inner solid ring */}
        <circle cx="12" cy="12" r="4.5" />
      </svg>
    ),
  },
];

export function GlobalNavRail({ activePage, onPageChange, expanded = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showPaywall } = useSubscription();
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  // useTransition for non-urgent navigation - prevents Suspense fallback flash
  // When navigating to a cached page, this keeps the current view visible
  // instead of briefly showing the loading spinner
  const [isPending, startTransition] = useTransition();

  // Determine active page from URL or prop
  const currentPath = location.pathname;
  const activeItem = activePage ||
    NAV_ITEMS.find(item => currentPath.startsWith(item.path))?.id ||
    'market-core';

  const handleNavClick = (item) => {
    if (onPageChange) {
      onPageChange(item.id);
    }
    // Wrap navigation in startTransition to prevent Suspense fallback flash
    // This marks the navigation as non-urgent, allowing React to keep
    // showing the current page while the new page loads
    startTransition(() => {
      navigate(item.path);
    });
  };

  return (
    <nav
      className={`bg-[#213448] flex flex-col py-4 flex-shrink-0 h-full ${expanded ? 'w-64 px-3' : 'w-16 items-center'} ${isPending ? 'opacity-90' : ''}`}
      aria-label="Main navigation"
    >
      {/* Logo / Home - Links to Market Core */}
      <button
        onClick={() => startTransition(() => navigate('/market-core'))}
        className={`group relative mb-8 flex items-center ${expanded ? 'gap-3 w-full px-2' : 'justify-center'}`}
        aria-label="Go to Market Core"
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
              <span className={`flex-shrink-0 ${isActive ? 'scale-110' : ''}`}>
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

      {/* Bottom section - Info links + User Profile */}
      <div className={`mt-auto w-full ${expanded ? 'px-1' : 'px-2'}`}>
        {/* Separator */}
        <div className={`border-t border-[#547792]/30 mb-3 ${expanded ? 'mx-2' : 'mx-1'}`} />

        {/* Info Links */}
        <div className="flex flex-col gap-1 mb-3">
          {/* Methodology */}
          <button
            onClick={() => startTransition(() => navigate('/methodology'))}
            className={`
              group relative flex items-center
              ${expanded ? 'gap-3 px-3 py-2 rounded-lg' : 'justify-center py-2'}
              text-[#94B4C1]/70 hover:bg-[#547792]/20 hover:text-[#EAE0CF]
              transition-colors duration-200
            `}
            aria-label="Methodology"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {expanded && <span className="text-sm">Methodology</span>}
            {!expanded && (
              <div className="absolute left-full ml-4 px-3 py-2 bg-[#213448] text-[#EAE0CF] text-sm font-medium rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible pointer-events-none transition-all duration-200 delay-100 whitespace-nowrap z-50 border border-[#94B4C1]/30">
                Methodology
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-3 h-3 bg-[#213448] rotate-45 border-l border-b border-[#94B4C1]/30" />
              </div>
            )}
          </button>

          {/* Data Sources */}
          <button
            onClick={() => startTransition(() => navigate('/methodology#data-sources'))}
            className={`
              group relative flex items-center
              ${expanded ? 'gap-3 px-3 py-2 rounded-lg' : 'justify-center py-2'}
              text-[#94B4C1]/70 hover:bg-[#547792]/20 hover:text-[#EAE0CF]
              transition-colors duration-200
            `}
            aria-label="Data Sources"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            {expanded && <span className="text-sm">Data Sources</span>}
            {!expanded && (
              <div className="absolute left-full ml-4 px-3 py-2 bg-[#213448] text-[#EAE0CF] text-sm font-medium rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible pointer-events-none transition-all duration-200 delay-100 whitespace-nowrap z-50 border border-[#94B4C1]/30">
                Data Sources
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-3 h-3 bg-[#213448] rotate-45 border-l border-b border-[#94B4C1]/30" />
              </div>
            )}
          </button>
        </div>

        {/* User Profile */}
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
