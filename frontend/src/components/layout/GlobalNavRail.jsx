import React, { useState, useTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionContext';
import { UserProfileMenu } from './UserProfileMenu';
import { AccountSettingsModal } from '../AccountSettingsModal';

/**
 * GlobalNavRail - Primary Navigation Sidebar
 *
 * The far-left navigation component that provides app-wide page switching.
 * Uses Deep Navy (#213448) background with Sand/Cream (#EAE0CF) active states.
 *
 * Width: Parent controls width (w-full). DashboardLayout sets:
 * - Desktop (lg+): 288px (w-72)
 * - Mobile drawer: 288px (w-72), max 85vw
 *
 * Structure:
 * - Market Intelligence: Overview, Districts, New Launches, Supply & Inventory
 * - Project Tools: Explore, Value Comparison, Exit Risk (Coming Soon)
 */

// Design token: Nav rail width (defined once, used in DashboardLayout)
// Collapsed: 72px (icons only) - future
// Expanded: 256px (icons + labels) - current
export const NAV_WIDTH = 256; // px

export const NAV_GROUPS = [
  {
    id: 'market-intelligence',
    label: 'Market Intelligence',
    items: [
      { id: 'overview', path: '/market-core', label: 'Overview', icon: '📊' },
      { id: 'districts', path: '/district-deep-dive', label: 'Districts', icon: '🗺️' },
      { id: 'new-launches', path: '/primary-market', label: 'New Launches', icon: '🏗️' },
      { id: 'supply', path: '/supply-insights', label: 'Supply & Inventory', icon: '📦' },
    ],
  },
  {
    id: 'project-tools',
    label: 'Project Tools',
    items: [
      { id: 'explore', path: '/project-deep-dive', label: 'Explore', icon: '🔍' },
      { id: 'value-comparison', path: '/value-parity', label: 'Value Comparison', icon: '💰' },
      { id: 'exit-risk', path: null, label: 'Exit Risk', icon: '🚪', comingSoon: true },
    ],
  },
];

// Flatten for route matching (backwards compat)
export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

/**
 * NavItem - Individual navigation item with 44px touch target
 */
function NavItem({ item, isActive, onClick }) {
  const isComingSoon = item.comingSoon;

  return (
    <button
      onClick={() => !isComingSoon && onClick(item)}
      disabled={isComingSoon}
      title={item.label} // Tooltip for truncated text
      className={`
        group relative w-full min-h-[44px] px-3 py-2 rounded-lg
        flex items-center gap-3 text-left min-w-0
        transition-colors duration-100
        active:scale-[0.98] select-none
        ${isActive
          ? 'bg-[#547792]/40 text-[#EAE0CF]'
          : isComingSoon
            ? 'text-[#94B4C1]/40 cursor-not-allowed'
            : 'text-[#94B4C1]/60 hover:bg-[#547792]/30 hover:text-[#EAE0CF] active:bg-[#547792]/40'
        }
      `}
      aria-current={isActive ? 'page' : undefined}
      aria-label={item.label}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#EAE0CF] rounded-r-full" />
      )}

      {/* Icon */}
      <span className="text-base flex-shrink-0">{item.icon}</span>

      {/* Label - can truncate, tooltip shows full text */}
      <span className="text-sm font-medium truncate min-w-0 flex-1">{item.label}</span>

      {/* Coming Soon badge */}
      {isComingSoon && (
        <span className="flex-shrink-0 text-[10px] bg-[#547792]/30 text-[#94B4C1] px-1.5 py-0.5 rounded">
          Soon
        </span>
      )}
    </button>
  );
}

export function GlobalNavRail({ activePage, onPageChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showPaywall } = useSubscription();
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  // useTransition for non-urgent navigation - prevents Suspense fallback flash
  const [isPending, startTransition] = useTransition();

  // Determine active page from URL or prop
  const currentPath = location.pathname;
  const activeItem = activePage ||
    NAV_ITEMS.find(item => item.path && currentPath.startsWith(item.path))?.id ||
    'overview';

  // Find which group contains the active item
  const activeGroupId = NAV_GROUPS.find(g =>
    g.items.some(item => item.id === activeItem)
  )?.id;

  // Collapsible state - auto-expand group with active item
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const initial = {};
    NAV_GROUPS.forEach(g => {
      initial[g.id] = g.items.some(item => item.id === activeItem);
    });
    return initial;
  });

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const handleNavClick = (item) => {
    if (!item.path) return;
    if (onPageChange) {
      onPageChange(item.id);
    }
    startTransition(() => {
      navigate(item.path);
    });
  };

  return (
    <nav
      className={`bg-[#213448] w-full flex flex-col py-4 px-3 flex-shrink-0 h-full overflow-y-auto overflow-x-hidden ${isPending ? 'opacity-90' : ''}`}
      aria-label="Main navigation"
    >
      {/* Logo / Home - Links to Market Core */}
      <button
        onClick={() => startTransition(() => navigate('/market-core'))}
        className="group relative mb-6 flex items-center gap-3 w-full px-2 min-h-[44px] min-w-0 active:scale-[0.98] select-none"
        aria-label="Go to Home"
      >
        <div className="w-10 h-10 rounded-lg bg-[#547792]/30 flex items-center justify-center transition-all duration-200 group-hover:bg-[#547792]/50 group-active:bg-[#547792]/60 group-hover:scale-105 group-active:scale-100 flex-shrink-0">
          <svg className="w-6 h-6 text-[#EAE0CF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <span className="text-[#EAE0CF] font-medium text-sm truncate min-w-0">Home</span>
      </button>

      {/* Navigation Groups */}
      <div className="flex-1 space-y-2 w-full">
        {NAV_GROUPS.map(group => {
          const isExpanded = expandedGroups[group.id];
          const hasActiveItem = group.id === activeGroupId;

          return (
            <div key={group.id}>
              {/* Group Header - Collapsible, sentence case, no icon */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={`
                  w-full min-h-[44px] px-3 py-2 rounded-lg
                  flex items-center gap-2 text-left min-w-0
                  transition-colors duration-100
                  active:scale-[0.98] select-none
                  ${hasActiveItem
                    ? 'text-[#EAE0CF] bg-[#547792]/20'
                    : 'text-[#94B4C1] hover:bg-[#547792]/20 hover:text-[#EAE0CF] active:bg-[#547792]/30'
                  }
                `}
                aria-expanded={isExpanded}
              >
                {/* Section header: text only, no icon, sentence case */}
                <span className="text-sm font-semibold min-w-0 flex-1">
                  {group.label}
                </span>
                {/* Chevron */}
                <svg
                  className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Group Items - Collapsible */}
              <div
                className={`
                  overflow-hidden transition-all duration-200 ease-in-out
                  ${isExpanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}
                `}
              >
                <div className="space-y-1 pl-2">
                  {group.items.map(item => (
                    <NavItem
                      key={item.id}
                      item={item}
                      isActive={activeItem === item.id}
                      onClick={handleNavClick}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom section - Info links + User Profile */}
      <div className="mt-auto w-full">
        {/* Separator */}
        <div className="border-t border-[#547792]/30 mb-3 mx-2" />

        {/* Methodology Link */}
        <button
          onClick={() => startTransition(() => navigate('/methodology'))}
          className="group relative w-full min-h-[44px] px-3 py-2 rounded-lg flex items-center gap-3 text-left min-w-0 text-[#94B4C1]/60 hover:bg-[#547792]/30 hover:text-[#EAE0CF] active:bg-[#547792]/40 active:scale-[0.98] transition-colors duration-100 select-none"
          aria-label="Methodology"
        >
          <span className="text-base flex-shrink-0">ℹ️</span>
          <span className="text-sm font-medium truncate min-w-0 flex-1">Methodology</span>
        </button>

        {/* User Profile */}
        <UserProfileMenu
          expanded={true}
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
