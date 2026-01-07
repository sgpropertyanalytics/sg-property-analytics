import React, { useState, useTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionContext';
import { UserProfileMenu } from './UserProfileMenu';
import { AccountSettingsModal } from '../AccountSettingsModal';

/**
 * GlobalNavRail - Primary Navigation Sidebar
 *
 * The far-left navigation component that provides app-wide page switching.
 * Uses VOID palette (#0A0A0A) for Palantir/tactical aesthetic continuity.
 *
 * DESIGN SYSTEM (VOID THEME - Dark Nav):
 * ─────────────────────────────────────────────────────────────────────────────
 * Colors:
 * - Background: mono-void (#0A0A0A) - dense black, not default #171717
 * - Borders: mono-edge (#333333) - machined metal effect
 * - Text: mono-light (#A3A3A3) inactive → mono-canvas (#FAFAFA) active/hover
 *
 * Section Headers ("Structural Dividers"):
 * - text-[10px] font-mono uppercase tracking-[0.18em]
 * - Color: mono-mid → mono-light on active group
 *
 * NavItem ("Interactive Targets"):
 * - Active:  bg-mono-surface + text-mono-canvas + ring-mono-edge + blue accent bar
 * - Inactive: text-mono-light → hover:text-mono-canvas hover:bg-white/5
 * - Focus: ring-white/20 ring-offset-mono-void
 *
 * HUD Corners:
 * - Tactical frame brackets in all 4 corners (border-mono-edge)
 *
 * Width: Parent controls width (w-full). DashboardLayout sets:
 * - Desktop (lg+): 256px (w-64)
 * - Mobile drawer: 256px (w-64), max 85vw
 */

// Design token: Nav rail width (defined once, used in DashboardLayout)
export const NAV_WIDTH_EXPANDED = 256; // px - icons + labels
export const NAV_WIDTH_COLLAPSED = 72; // px - icons only
export const NAV_WIDTH = NAV_WIDTH_EXPANDED; // backwards compat

// WEAPON AESTHETIC: Instant snap - no "premium physics"
// Machine precision, no ease, instant response
const TRANSITION_CLASS = "transition-none";

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
 * - Inactive: text-brand-sky with opacity transitions
 * - Hover: text-white + bg-white/5
 * - Coming Soon: opacity-50 + cursor-not-allowed
 *
 * Collapse Animation (Premium Physics):
 * - Collapsing: Fade text out fast, then shrink width
 * - Expanding: Grow width first, then fade text in (delayed)
 */
function NavItem({ item, isActive, onClick, collapsed = false }) {
  const isComingSoon = item.comingSoon;

  // Base styles for layout - INDUSTRIAL MACHINE: "Physical LED" with light physics
  const baseStyles = `
    group relative w-full min-h-[44px] px-3 py-2 rounded-none
    flex items-center text-left min-w-0
    font-mono text-[11px] font-medium uppercase tracking-tight
    border-b border-mono-edge
    border-l-[3px]
    transition-all duration-200
    outline-none select-none
    focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-mono-void
  `;

   // State-specific styles (INDUSTRIAL MACHINE - "Physical LED Light Source")
   // Active: The Source (border) + The Spill (gradient) + The Reflection (inset shadow)
   const activeStyles = 'border-emerald-500 text-white bg-gradient-to-r from-emerald-500/10 to-transparent shadow-[inset_10px_0_15px_-3px_rgba(16,185,129,0.2)]';
   // Inactive: Dimmed switches with transparent border slot
   const inactiveStyles = 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5';
   const comingSoonStyles = 'border-transparent text-mono-mid cursor-not-allowed opacity-60';

   // Badge styles (VOID THEME)
   const badgeBase = 'ml-auto flex-shrink-0 text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-none border transition-none';
   const badgeActive = 'bg-mono-canvas text-mono-void border-mono-canvas';
   const badgeInactive = 'bg-mono-surface text-mono-light border-mono-edge group-hover:bg-mono-canvas group-hover:text-mono-void';
   const badgeComingSoon = 'bg-mono-surface text-mono-mid border-mono-edge';

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
      {/* Icon - Light source glow when active, dimmed when inactive */}
      <span className={`
        text-sm flex-shrink-0 transition-all duration-200
        ${isActive
          ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]'
          : 'opacity-70 text-zinc-500 group-hover:text-zinc-300'
        }
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

       {/* "COMING SOON" badge for unfinished features only */}
       {(!collapsed && isComingSoon) && (
         <span
           className={`${badgeBase} ${badgeComingSoon} ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}
         >
           SOON
         </span>
       )}


      {/* Tooltip - WEAPON: hard edges, instant */}
       {collapsed && (
         <div className="
           absolute left-full ml-2 z-50
           hidden group-hover:block
           px-2 py-1.5
           font-mono text-[10px] uppercase tracking-[0.18em] text-mono-canvas
           bg-black border border-black/20
           rounded-none weapon-shadow
           whitespace-nowrap
         ">

          {item.label}
          {isComingSoon && <span className="ml-1 text-brand-sky/60">(SOON)</span>}
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
        className={`
          relative w-full h-full flex flex-col py-4 flex-shrink-0
          overflow-y-auto overflow-x-visible
          z-50
          ${collapsed ? 'px-2' : 'px-3'}
          ${isPending ? 'opacity-90' : ''}

          /* THE COLOR - Warm Charcoal (Stone-950) instead of Cold Black */
          /* Stone has red/orange undertones that harmonize with beige paper */
          bg-[#1C1917]

          /* THE GASKET - Bridging border between chassis and paper */
          /* Stone-800 (#44403C) is mid-tone that softens the hard cut */
          border-r border-[#44403C]

          /* THE SHADOW - Uses Stone tones for warmth */
          shadow-[10px_0_30px_-10px_rgba(28,25,23,0.7)]
        `}
        aria-label="Main navigation"
      >
        {/* HUD corners - tactical frame */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-mono-edge pointer-events-none" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-mono-edge pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-mono-edge pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-mono-edge pointer-events-none" />


      {/* Logo / Home - Links to Market Overview (VOID THEME) */}
      <button
        onClick={() => startTransition(() => navigate('/market-overview'))}
        className={`group relative mb-6 flex items-center w-full min-h-[44px] min-w-0 select-none ${TRANSITION_CLASS} ${collapsed ? 'justify-center px-0' : 'gap-3 px-2'} hover:bg-white/[0.05]`}
        aria-label="Go to Home"
      >
        <div className="w-10 h-10 rounded-none bg-mono-surface border border-mono-edge flex items-center justify-center transition-none group-hover:bg-white/[0.05] flex-shrink-0">
          <svg className="w-6 h-6 text-mono-light group-hover:text-mono-canvas" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        {/* Home label - staggered animation (VOID THEME) */}
        <span className={`
          font-mono text-[10px] uppercase tracking-[0.18em] text-mono-light group-hover:text-mono-canvas whitespace-nowrap overflow-hidden
          ${TRANSITION_CLASS}
          ${collapsed ? 'w-0 opacity-0 -translate-x-4' : 'w-auto opacity-100 translate-x-0 delay-100'}
        `}>
          HOME
        </span>

        {/* Tooltip when collapsed - WEAPON: hard edges */}
        {collapsed && (
          <div className="
            absolute left-full ml-2 z-50
            hidden group-hover:block
            px-2 py-1.5
            text-xs font-mono uppercase tracking-[0.18em] text-white
            bg-black border border-black/20
            rounded-none weapon-shadow
            whitespace-nowrap
          ">
            HOME
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
              {/* SectionHeader - "Stamped Metal" Labels (INDUSTRIAL MACHINE)
                  Laser-etched labels on server rack casing.
                  Typography: Condensed, tight tracking, stone-600 (#525252) */}
               {!collapsed && (
                 <button
                   onClick={() => toggleGroup(group.id)}
                   className={`
                     w-full px-3 py-2 rounded-none
                     flex items-center gap-2 text-left min-w-0
                     transition-none
                     select-none
                     ${hasActiveItem
                       ? 'text-mono-light'
                       : 'text-[#525252] hover:text-mono-light'
                     }
                   `}
                   aria-expanded={isExpanded}
                 >
                   <span className="font-mono text-[10px] uppercase tracking-[0.15em] leading-none min-w-0 flex-1 font-bold tabular-nums">
                     {group.label}
                   </span>
                   <svg
                     className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 opacity-60 ${isExpanded ? 'rotate-180' : ''}`}
                     fill="none"
                     stroke="currentColor"
                     viewBox="0 0 24 24"
                   >
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                   </svg>
                 </button>
               )}


              {/* Collapsed: Show separator line instead of header (VOID THEME) */}
               {collapsed && (
                 <div className="h-px bg-mono-edge mx-2 my-2" />
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

      {/* Bottom section - Info links + User Profile (VOID THEME) */}
      <div className="mt-auto w-full">
        {/* Separator */}
         <div className="border-t border-mono-edge mb-3 mx-2" />


        {/* Methodology Link - WEAPON: hard edges, rack-mount style (VOID THEME) */}
         <button
           onClick={() => startTransition(() => navigate('/methodology'))}
           className={`group relative w-full min-h-[44px] px-3 py-2 rounded-none border-b border-mono-edge flex items-center text-left min-w-0 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-mono-light hover:text-mono-canvas hover:bg-white/[0.05] active:bg-white/[0.08] ${TRANSITION_CLASS} select-none ${collapsed ? 'justify-center' : 'gap-3'}`}
           aria-label="Methodology"
         >
           <span className="text-sm flex-shrink-0 text-mono-mid group-hover:text-mono-canvas">ℹ️</span>

          <span className={`
            text-sm font-medium whitespace-nowrap overflow-hidden
            ${TRANSITION_CLASS}
            ${collapsed ? 'w-0 opacity-0 translate-x-4' : 'w-auto opacity-100 translate-x-0 delay-75'}
          `}>
            Methodology
          </span>

          {/* Tooltip when collapsed - WEAPON: hard edges */}
          {collapsed && (
             <div className="
               absolute left-full ml-2 z-50
               hidden group-hover:block
               px-2 py-1.5
               font-mono text-[10px] uppercase tracking-[0.18em] text-mono-canvas
               bg-black border border-black/20
               rounded-none weapon-shadow
               whitespace-nowrap
             ">
               METHODOLOGY
             </div>

          )}
        </button>

        {/* User Profile */}
        <UserProfileMenu
          expanded={!collapsed}
          onOpenSettings={() => setShowAccountSettings(true)}
        />

        {/* System Metrics Footer - "Hacker Density" */}
        {!collapsed && (
          <div className="p-4 border-t border-[#292524]">
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[#78716C]">
              <div className="flex flex-col">
                <span className="opacity-50">LATENCY</span>
                <span className="text-emerald-500 tabular-nums">12ms</span>
              </div>
              <div className="flex flex-col">
                <span className="opacity-50">BUILD</span>
                <span className="tabular-nums">v2.0.4</span>
              </div>
              <div className="flex flex-col col-span-2 mt-2">
                <span className="opacity-50">STATUS</span>
                <span className="text-[#A8A29E]">SYSTEM_OPTIMAL</span>
              </div>
            </div>
          </div>
        )}
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
