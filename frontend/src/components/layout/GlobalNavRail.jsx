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
  Info,
  ChevronLeft
} from 'lucide-react';

/**
 * GlobalNavRail - Primary Navigation Sidebar
 *
 * The far-left navigation component that provides app-wide page switching.
 * Uses REAM khaki-olive palette for warm industrial aesthetic.
 *
 * DESIGN SYSTEM (REAM THEME - Khaki-Olive):
 * ─────────────────────────────────────────────────────────────────────────────
 * Colors:
 * - Background: khaki-olive (#9A9164) - warm tan-brown
 * - Borders: khaki-edge (#5C5844) - warm structural borders
 * - Text: khaki-muted (#A9A48E) inactive → cream (#F5F0E6) active/hover
 *
 * Section Headers ("Structural Dividers"):
 * - text-data-xs font-mono uppercase tracking-[0.18em]
 * - Color: khaki-muted
 *
 * NavItem ("Interactive Targets"):
 * - Active:  bg-khaki-900 (#3D3A2E) + cream text + coral accent
 * - Inactive: khaki-600 → hover:khaki-900 hover:bg-khaki-200/50
 * - Focus: coral focus ring
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
 * NavItem - Technical Index Style
 *
 * Design System (REAM):
 * - Active: Khaki-900 box (#3D3A2E), cream text/icon, rounded-[4px]
 * - Inactive: Khaki-600 text, khaki-900 icon
 * - Hover: Khaki-900 text, faint khaki background
 * - Typography: Sans-serif 14px for links
 */
function NavItem({ item, isActive, onClick, collapsed = false }) {
  const isComingSoon = item.comingSoon;
  const IconComponent = NAV_ICONS[item.id];

  return (
    <button
      onClick={() => !isComingSoon && onClick(item)}
      disabled={isComingSoon}
      title={item.label}
      className={`
        group relative min-h-[44px] py-2 rounded-[4px]
        flex items-center text-left min-w-0
        transition-all duration-200
        outline-none select-none
        focus-visible:ring-2 focus-visible:ring-[#E85C33] focus-visible:ring-offset-2
        ${collapsed
          ? 'w-10 h-10 justify-center mx-auto'
          : 'w-full gap-3'
        }
        ${isActive
          ? 'bg-[#3D3A2E] text-[#F5F0E6]'
          : isComingSoon
            ? 'text-[#A9A48E] cursor-not-allowed opacity-60'
            : 'text-[#5C5844] hover:text-[#3D3A2E] hover:bg-[#D4CEB8]/50'
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
            className={`transition-colors duration-200 ${
              isActive ? 'text-[#F5F0E6]' : 'text-[#3D3A2E] group-hover:text-[#3D3A2E]'
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
        <span className="ml-auto flex-shrink-0 text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded bg-[#EAE6D8] text-[#8A8570] border border-[#D4CEB8]">
          SOON
        </span>
      )}

      {/* Tooltip when collapsed */}
      {collapsed && (
        <div className="absolute left-full ml-2 z-50 hidden group-hover:block px-2 py-1.5 text-xs font-medium text-[#F5F0E6] bg-[#3D3A2E] rounded shadow-lg whitespace-nowrap">
          {item.label}
        </div>
      )}
    </button>
  );
}

export const GlobalNavRail = React.memo(function GlobalNavRail({ activePage, onPageChange, collapsed = false, onToggleCollapse }) {
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
          z-50 bg-transparent
          pt-6 pb-4
          ${collapsed ? 'px-2' : 'px-4'}
          ${isPending ? 'opacity-90' : ''}
        `}
        aria-label="Main navigation"
      >
      {/* Logo - SGPropertyAnalytics branding */}
      {/* Aligned with nav item icons on left edge */}
      <button
        onClick={() => startTransition(() => navigate('/market-overview'))}
        className={`group flex items-center min-w-0 select-none ${collapsed ? 'justify-center' : 'gap-3'}`}
        aria-label="Go to Dashboard"
      >
        {/* Icon aligned with nav item icons */}
        <div className="flex-shrink-0 w-[18px] flex items-center justify-center">
          <Terminal size={18} strokeWidth={1.5} className="text-[#3D3A2E]" />
        </div>
        {!collapsed && (
          <span className="font-mono text-sm font-bold tracking-tight text-[#3D3A2E]">
            SGPropertyAnalytics
          </span>
        )}
        {collapsed && (
          <div className="absolute left-full ml-2 z-50 hidden group-hover:block px-2 py-1 text-xs text-[#F5F0E6] bg-[#3D3A2E] rounded shadow-lg whitespace-nowrap">
            SGPropertyAnalytics
          </div>
        )}
      </button>

      {/* Navigation Groups */}
      <div className="mt-6 space-y-5">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.id}>
            {/* Section Header - aligned with icon column (18px + gap) */}
            {!collapsed && (
              <div className="mb-2 flex items-center gap-3">
                <div className="w-[18px]" /> {/* Spacer to align with icons */}
                <span className="text-[10px] uppercase tracking-wider font-mono text-[#A9A48E]">
                  {group.label}
                </span>
              </div>
            )}
            {collapsed && groupIndex > 0 && (
              <div className="h-px bg-[#D4CEB8] mb-2" />
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

      {/* Bottom section */}
      <div className="space-y-1 border-t border-[#D4CEB8] pt-3">


        {/* Methodology Link - aligned with nav items */}
        <button
          onClick={() => startTransition(() => navigate('/methodology'))}
          className={`group relative min-h-[44px] py-2 rounded-[4px] flex items-center text-left min-w-0 text-[#5C5844] hover:text-[#3D3A2E] hover:bg-[#D4CEB8]/50 transition-all duration-200 select-none ${collapsed ? 'w-10 h-10 justify-center mx-auto' : 'w-full gap-3'}`}
          aria-label="Methodology"
        >
          <div className="flex-shrink-0 w-[18px] flex items-center justify-center">
            <Info size={18} strokeWidth={1.5} className="text-[#3D3A2E]" />
          </div>
          {!collapsed && (
            <span className="text-sm font-normal whitespace-nowrap">
              Methodology
            </span>
          )}
          {collapsed && (
            <div className="absolute left-full ml-2 z-50 hidden group-hover:block px-2 py-1.5 text-xs font-medium text-[#F5F0E6] bg-[#3D3A2E] rounded shadow-lg whitespace-nowrap">
              Methodology
            </div>
          )}
        </button>

        {/* User Profile */}
        <UserProfileMenu
          expanded={!collapsed}
          onOpenSettings={() => setShowAccountSettings(true)}
        />


        {/* Collapse Toggle Button - Technical square button at bottom */}
        {onToggleCollapse && (
          <div className={`px-3 pb-3 ${collapsed ? 'flex justify-center' : ''}`}>
            <button
              onClick={onToggleCollapse}
              className="w-8 h-8 flex items-center justify-center bg-transparent border border-[#C4BFA8] text-[#8A8570] hover:text-[#3D3A2E] hover:border-[#9A9164] hover:bg-[#D4CEB8]/50 transition-all duration-200"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronLeft
                size={16}
                strokeWidth={1.5}
                className="transition-transform duration-200"
                style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>
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
