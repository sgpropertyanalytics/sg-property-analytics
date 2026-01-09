import React, { useState, useTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionContext';
import { UserProfileMenu } from './UserProfileMenu';
import { AccountSettingsModal } from '../AccountSettingsModal';
import {
  BarChart3,
  Map,
  Building2,
  Package,
  Search,
  CircleDollarSign,
  DoorOpen,
  Terminal,
  Info
} from 'lucide-react';

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
 * - text-data-xs font-mono uppercase tracking-[0.18em]
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
export const NAV_WIDTH_EXPANDED = 240; // px - icons + labels
export const NAV_WIDTH_COLLAPSED = 64; // px - icons only (mini-dock)
export const NAV_WIDTH = NAV_WIDTH_EXPANDED; // backwards compat

// WEAPON AESTHETIC: Instant snap - no "premium physics"
// Machine precision, no ease, instant response
const TRANSITION_CLASS = "transition-none";

// Icon components for nav items (Lucide React, 18px, stroke-width 1.5)
const NAV_ICONS = {
  overview: BarChart3,
  districts: Map,
  'new-launches': Building2,
  supply: Package,
  explore: Search,
  'value-check': CircleDollarSign,
  'exit-risk': DoorOpen,
};

export const NAV_GROUPS = [
  {
    id: 'market-intelligence',
    label: 'Market Intelligence',
    items: [
      { id: 'overview', path: '/market-overview', label: 'Market Overview' },
      { id: 'districts', path: '/district-overview', label: 'District Overview' },
      { id: 'new-launches', path: '/new-launch-market', label: 'New Launch Market' },
      { id: 'supply', path: '/supply-inventory', label: 'Supply & Inventory' },
    ],
  },
  {
    id: 'project-tools',
    label: 'Project Tools',
    items: [
      { id: 'explore', path: '/explore', label: 'Explore' },
      { id: 'value-check', path: '/value-check', label: 'Value Check' },
      { id: 'exit-risk', path: '/exit-risk', label: 'Exit Risk' },
    ],
  },
];

// Flatten for route matching (backwards compat)
export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

/**
 * NavItem - Luxury Asset Management Style
 *
 * Design System:
 * - Active: Bronze left accent bar (3px) + subtle bg (white/10) + white text
 * - Inactive: Slate-400 text, slate-500 icon
 * - Hover: White text, subtle transparency (white/5)
 * - Typography: Sans-serif 14px for links
 */
function NavItem({ item, isActive, onClick, collapsed = false }) {
  const isComingSoon = item.comingSoon;
  const IconComponent = NAV_ICONS[item.id];

  return (
    <button
      onClick={() => !isComingSoon && onClick(item)}
      disabled={isComingSoon}
      className={`
        group relative min-h-[44px] py-3 mb-1 rounded-r-[4px]
        flex items-center text-left
        transition-all duration-150 ease-out
        outline-none select-none
        focus-visible:ring-2 focus-visible:ring-[#C4A484]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
        ${collapsed
          ? 'w-10 h-10 justify-center mx-auto px-0 mb-0 rounded-[4px]'
          : 'w-full gap-3 pl-6 pr-4'
        }
        ${isActive
          ? 'bg-white/10 text-white font-medium cursor-default border-l-[3px] border-l-[#C4A484]'
          : isComingSoon
            ? 'text-slate-500 cursor-not-allowed opacity-60 border-l-[3px] border-l-transparent'
            : 'text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer border-l-[3px] border-l-transparent'
        }
      `}
      aria-current={isActive ? 'page' : undefined}
      aria-label={item.label}
    >
      {/* Icon container - fixed 18px width for vertical alignment */}
      <div className={`flex-shrink-0 w-[18px] flex items-center justify-center ${collapsed ? '' : ''}`}>
        {IconComponent && (
          <IconComponent
            size={18}
            strokeWidth={1.5}
            className={`transition-colors duration-150 ${
              isActive ? 'text-[#C4A484]' : 'text-slate-500 group-hover:text-white'
            }`}
          />
        )}
      </div>

      {/* Label */}
      {!collapsed && (
        <span className="text-sm font-normal whitespace-nowrap overflow-hidden truncate">
          {item.label}
        </span>
      )}

      {/* "COMING SOON" badge */}
      {(!collapsed && isComingSoon) && (
        <span className="ml-auto flex-shrink-0 text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
          SOON
        </span>
      )}

      {/* Tooltip when collapsed */}
      {collapsed && (
        <div className="absolute left-full ml-2 z-50 hidden group-hover:block px-2 py-1.5 text-xs font-medium text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap">
          {item.label}
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
          relative w-full h-full flex flex-col
          overflow-y-auto overflow-x-hidden
          z-50 bg-slate-900
          pt-6 pb-4
          ${collapsed ? 'px-2' : 'pr-4'}
          ${isPending ? 'opacity-90' : ''}
        `}
        aria-label="Main navigation"
      >
      {/* Logo - SGPropertyAnalytics branding */}
      {/* Aligned with nav item icons on left edge */}
      <button
        onClick={() => startTransition(() => navigate('/market-overview'))}
        className={`group flex items-center min-w-0 select-none ${collapsed ? 'justify-center' : 'gap-3 pl-6'}`}
        aria-label="Go to Dashboard"
      >
        {/* Icon aligned with nav item icons */}
        <div className="flex-shrink-0 w-[18px] flex items-center justify-center">
          <Terminal size={18} strokeWidth={1.5} className="text-[#C4A484]" />
        </div>
        {!collapsed && (
          <span className="font-mono text-sm font-medium tracking-tight text-white">
            SGPropertyAnalytics
          </span>
        )}
        {collapsed && (
          <div className="absolute left-full ml-2 z-50 hidden group-hover:block px-2 py-1 text-xs text-white bg-slate-800 rounded shadow-lg whitespace-nowrap">
            SGPropertyAnalytics
          </div>
        )}
      </button>

      {/* Navigation Groups */}
      <div className="mt-6 space-y-5">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.id}>
            {/* Section Header - aligned with nav items */}
            {!collapsed && (
              <div className="mb-2 pl-6">
                <span className="text-[10px] uppercase tracking-wider font-mono text-slate-500">
                  {group.label}
                </span>
              </div>
            )}
            {collapsed && groupIndex > 0 && (
              <div className="h-px bg-slate-700 mb-2" />
            )}
            {/* Nav Items */}
            <div className="space-y-0.5">
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
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-4" />

      {/* Bottom section - System Menu */}
      <div className="border-t border-slate-700/50 pt-4 mt-2">
        {/* Methodology Link */}
        <button
          onClick={() => startTransition(() => navigate('/methodology'))}
          className={`group relative min-h-[44px] py-3 mb-1 rounded-r-[4px] flex items-center text-left text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-150 ease-out select-none cursor-pointer border-l-[3px] border-l-transparent ${collapsed ? 'w-10 h-10 justify-center mx-auto px-0 mb-0 rounded-[4px]' : 'w-full gap-3 pl-6 pr-4'}`}
          aria-label="Methodology"
        >
          <div className="flex-shrink-0 w-[18px] flex items-center justify-center">
            <Info size={18} strokeWidth={1.5} className="text-slate-500 group-hover:text-white transition-colors duration-150" />
          </div>
          {!collapsed && (
            <span className="text-sm font-normal whitespace-nowrap">
              Methodology
            </span>
          )}
          {collapsed && (
            <div className="absolute left-full ml-2 z-50 hidden group-hover:block px-2 py-1.5 text-xs font-medium text-white bg-slate-800 rounded shadow-lg whitespace-nowrap">
              Methodology
            </div>
          )}
        </button>

        {/* User Profile - with breathing room */}
        <div className="mt-3 pt-3 border-t border-slate-700/50 pl-3">
          <UserProfileMenu
            expanded={!collapsed}
            onOpenSettings={() => setShowAccountSettings(true)}
          />
        </div>

        {/* Collapse Toggle moved to edge (IDE-style) in DashboardLayout */}
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
