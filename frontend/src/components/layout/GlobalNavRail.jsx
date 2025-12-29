import React, { useState, useTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionContext';
import { UserProfileMenu } from './UserProfileMenu';
import { AccountSettingsModal } from '../AccountSettingsModal';

/**
 * GlobalNavRail - Primary Navigation Sidebar
 *
 * The far-left navigation component that provides app-wide page switching.
 * Uses Deep Navy (#213448) background with professional finance-tool aesthetics.
 *
 * DESIGN SYSTEM (Senior UI Pattern):
 * ─────────────────────────────────────────────────────────────────────────────
 * Section Headers ("Structural Dividers"):
 * - text-[11px] font-bold uppercase tracking-[0.12em] leading-none
 * - Color: text-[#94B4C1]/60 (muted - labels, not buttons)
 * - Uses typography and spacing to separate content, not borders
 *
 * NavItem ("Interactive Targets"):
 * - Active:  bg-white/10 text-white ring-1 ring-white/10 + blue accent bar
 * - Inactive: text-[#94B4C1] opacity-70 → hover:text-white hover:bg-white/5
 * - Coming Soon: opacity-50 cursor-not-allowed + SOON badge
 * - Focus: ring-2 ring-[#547792] ring-offset-2 ring-offset-[#213448]
 *
 * Accent Bar (Active Indicator):
 * - w-1 bg-[#547792] rounded-r-full - positioned absolute left-0
 * - Cleaner than full border, matches professional finance tools
 *
 * Width: Parent controls width (w-full). DashboardLayout sets:
 * - Desktop (lg+): 256px (w-64)
 * - Mobile drawer: 256px (w-64), max 85vw
 *
 * Structure:
 * - Market Intelligence: Market Overview, District Overview, New Launch Market, Supply & Inventory
 * - Project Tools: Explore, Value Check, Exit Risk
 */

// Design token: Nav rail width (defined once, used in DashboardLayout)
export const NAV_WIDTH_EXPANDED = 256; // px - icons + labels
export const NAV_WIDTH_COLLAPSED = 72; // px - icons only
export const NAV_WIDTH = NAV_WIDTH_EXPANDED; // backwards compat

// Premium physics: "Heavy Door" bezier curve
// Starts fast (snappy response), brakes smooth (weighty finish)
const TRANSITION_CLASS = "transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]";

export const NAV_GROUPS = [
  {
    id: 'market-intelligence',
    label: 'Market Intelligence',
    items: [
      { id: 'overview', path: '/market-overview', label: 'Market Overview', icon: '📊' },
      { id: 'districts', path: '/district-overview', label: 'District Overview', icon: '🗺️' },
      { id: 'new-launches', path: '/new-launch-market', label: 'New Launch Market', icon: '🏗️' },
      { id: 'supply', path: '/supply-inventory', label: 'Supply & Inventory', icon: '📦' },
    ],
  },
  {
    id: 'project-tools',
    label: 'Project Tools',
    items: [
      { id: 'explore', path: '/explore', label: 'Explore', icon: '🔍' },
      { id: 'value-check', path: '/value-check', label: 'Value Check', icon: '💰' },
      { id: 'exit-risk', path: '/exit-risk', label: 'Exit Risk', icon: '🚪' },
    ],
  },
];

// Flatten for route matching (backwards compat)
export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

/**
 * NavItem - Individual navigation item with 44px touch target
 *
 * Design System (Senior UI Pattern):
 * - Active: bg-white/10 + ring-1 ring-white/10 + blue accent bar
 * - Inactive: text-[#94B4C1] with opacity transitions
 * - Hover: text-white + bg-white/5
 * - Coming Soon: opacity-50 + cursor-not-allowed
 *
 * Collapse Animation (Premium Physics):
 * - Collapsing: Fade text out fast, then shrink width
 * - Expanding: Grow width first, then fade text in (delayed)
 */
function NavItem({ item, isActive, onClick, collapsed = false }) {
  const isComingSoon = item.comingSoon;

  // Base styles for layout and transition
  const baseStyles = `
    group relative w-full min-h-[44px] px-3 py-2 rounded-md
    flex items-center text-left min-w-0
    text-sm font-medium
    ${TRANSITION_CLASS}
    outline-none select-none
    focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2 focus-visible:ring-offset-[#213448]
  `;

  // State-specific styles
  const activeStyles = 'bg-white/10 text-white shadow-sm ring-1 ring-white/10';
  const inactiveStyles = 'text-[#94B4C1] hover:text-white hover:bg-white/5';
  const comingSoonStyles = 'text-[#94B4C1]/50 cursor-not-allowed opacity-50';

  return (
    <button
      onClick={() => !isComingSoon && onClick(item)}
      disabled={isComingSoon}
      title={item.label}
      className={`
        ${baseStyles}
        ${collapsed ? 'justify-center' : 'gap-3'}
        ${isActive ? activeStyles : isComingSoon ? comingSoonStyles : inactiveStyles}
      `}
      aria-current={isActive ? 'page' : undefined}
      aria-label={item.label}
    >
      {/* Active indicator bar - blue accent, positioned inside left edge */}
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#547792] rounded-r-full" />
      )}

      {/* Icon - full opacity when active, dimmed when inactive */}
      <span className={`
        text-base flex-shrink-0 transition-opacity
        ${isActive ? 'opacity-100 text-white' : 'opacity-70 group-hover:opacity-100'}
      `}>
        {item.icon}
      </span>

      {/* Label - Staggered animation: fade fast on collapse, fade in delayed on expand */}
      <span className={`
        whitespace-nowrap overflow-hidden truncate
        ${TRANSITION_CLASS}
        ${collapsed
          ? 'w-0 opacity-0 translate-x-4'
          : 'w-auto opacity-100 translate-x-0 delay-75'
        }
      `}>
        {item.label}
      </span>

      {/* Coming Soon badge - styled to match design system */}
      {isComingSoon && !collapsed && (
        <span className={`
          flex-shrink-0 ml-auto
          text-[10px] font-bold tracking-wide
          px-1.5 py-0.5 rounded
          bg-[#1E293B] text-[#94B4C1]/80
          border border-[#547792]/40
          ${TRANSITION_CLASS}
          ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}
        `}>
          SOON
        </span>
      )}

      {/* Tooltip - Only shows on hover when collapsed */}
      {collapsed && (
        <div className="
          absolute left-full ml-2 z-50
          hidden group-hover:block
          px-2 py-1.5
          text-xs font-medium text-white
          bg-[#213448] border border-[#547792]/50
          rounded-md shadow-xl
          whitespace-nowrap
          animate-in fade-in slide-in-from-left-1 duration-200
        ">
          {item.label}
          {isComingSoon && <span className="ml-1 text-[#94B4C1]/60">(Coming Soon)</span>}
        </div>
      )}
    </button>
  );
}

export const GlobalNavRail = React.memo(function GlobalNavRail({ activePage, onPageChange, collapsed = false }) {
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

  // Collapsible state - all groups expanded by default
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const initial = {};
    NAV_GROUPS.forEach(g => {
      initial[g.id] = true; // All groups expanded by default
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
      className={`bg-[#213448] w-full flex flex-col py-4 flex-shrink-0 h-full overflow-y-auto overflow-x-hidden transition-[padding] duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${collapsed ? 'px-2' : 'px-3'} ${isPending ? 'opacity-90' : ''}`}
      aria-label="Main navigation"
    >
      {/* Logo / Home - Links to Market Overview */}
      <button
        onClick={() => startTransition(() => navigate('/market-overview'))}
        className={`group relative mb-6 flex items-center w-full min-h-[44px] min-w-0 active:scale-[0.98] select-none ${TRANSITION_CLASS} ${collapsed ? 'justify-center px-0' : 'gap-3 px-2'}`}
        aria-label="Go to Home"
      >
        <div className="w-10 h-10 rounded-lg bg-[#547792]/30 flex items-center justify-center transition-all duration-200 group-hover:bg-[#547792]/50 group-active:bg-[#547792]/60 group-hover:scale-105 group-active:scale-100 flex-shrink-0">
          <svg className="w-6 h-6 text-[#EAE0CF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        {/* Home label - staggered animation */}
        <span className={`
          text-[#EAE0CF] font-medium text-sm whitespace-nowrap overflow-hidden
          ${TRANSITION_CLASS}
          ${collapsed ? 'w-0 opacity-0 -translate-x-4' : 'w-auto opacity-100 translate-x-0 delay-100'}
        `}>
          Home
        </span>

        {/* Tooltip when collapsed */}
        {collapsed && (
          <div className="
            absolute left-full ml-2 z-50
            hidden group-hover:block
            px-2 py-1.5
            text-xs font-medium text-white
            bg-[#213448] border border-[#547792]/50
            rounded-md shadow-xl
            whitespace-nowrap
            animate-in fade-in slide-in-from-left-1 duration-200
          ">
            Home
          </div>
        )}
      </button>

      {/* Navigation Groups */}
      <div className="flex-1 w-full">
        {NAV_GROUPS.map((group, groupIndex) => {
          const isExpanded = expandedGroups[group.id];
          const hasActiveItem = group.id === activeGroupId;

          return (
            <div key={group.id} className={groupIndex > 0 ? 'mt-6' : ''}>
              {/* SectionHeader - The "Structural Divider"
                  Uses typography and spacing to separate content, not borders.
                  Design: text-[11px] uppercase tracking-[0.12em] - muted labels */}
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`
                    w-full px-3 py-2 rounded-lg
                    flex items-center gap-2 text-left min-w-0
                    transition-colors duration-150
                    select-none
                    ${hasActiveItem
                      ? 'text-[#94B4C1]/80'
                      : 'text-[#94B4C1]/60 hover:text-[#94B4C1]/80'
                    }
                  `}
                  aria-expanded={isExpanded}
                >
                  {/* Section header: 11px, uppercase, wide tracking - acts as structural label */}
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] leading-none min-w-0 flex-1">
                    {group.label}
                  </span>
                  {/* Chevron */}
                  <svg
                    className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 opacity-50 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {/* Collapsed: Show separator line instead of header */}
              {collapsed && (
                <div className="h-px bg-[#547792]/30 mx-2 my-2" />
              )}

              {/* Group Items - Collapsible (always expanded when collapsed sidebar) */}
              <div
                className={`
                  overflow-hidden transition-all duration-200 ease-in-out
                  ${(isExpanded || collapsed) ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}
                `}
              >
                <div className={`space-y-1 ${collapsed ? 'pl-0' : 'pl-2'}`}>
                  {group.items.map(item => (
                    <NavItem
                      key={item.id}
                      item={item}
                      isActive={activeItem === item.id}
                      onClick={handleNavClick}
                      collapsed={collapsed}
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

        {/* Methodology Link - matches inactive nav item styling */}
        <button
          onClick={() => startTransition(() => navigate('/methodology'))}
          className={`group relative w-full min-h-[44px] px-3 py-2 rounded-lg flex items-center text-left min-w-0 text-[#94B4C1] hover:text-white hover:bg-white/5 active:bg-white/10 active:scale-[0.98] ${TRANSITION_CLASS} select-none ${collapsed ? 'justify-center' : 'gap-3'}`}
          aria-label="Methodology"
        >
          <span className="text-base flex-shrink-0 opacity-70 group-hover:opacity-100">ℹ️</span>
          <span className={`
            text-sm font-medium whitespace-nowrap overflow-hidden
            ${TRANSITION_CLASS}
            ${collapsed ? 'w-0 opacity-0 translate-x-4' : 'w-auto opacity-100 translate-x-0 delay-75'}
          `}>
            Methodology
          </span>

          {/* Tooltip when collapsed */}
          {collapsed && (
            <div className="
              absolute left-full ml-2 z-50
              hidden group-hover:block
              px-2 py-1.5
              text-xs font-medium text-white
              bg-[#213448] border border-[#547792]/50
              rounded-md shadow-xl
              whitespace-nowrap
              animate-in fade-in slide-in-from-left-1 duration-200
            ">
              Methodology
            </div>
          )}
        </button>

        {/* User Profile */}
        <UserProfileMenu
          expanded={!collapsed}
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
});

export default GlobalNavRail;
