import React, { useState, useEffect } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { GlobalNavRail, NAV_ITEMS } from './GlobalNavRail';
import { PowerBIFilterSidebar } from '../powerbi/PowerBIFilterSidebar';
import { ErrorBoundary } from '../ui';
import { UpgradeFooterCTA } from '../ui/UpgradeFooterCTA';
import { useSubscription } from '../../context/SubscriptionContext';
import { PricingModal } from '../PricingModal';

/**
 * DashboardLayout - Double Sidebar Navigation System
 *
 * Layout Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [GlobalNavRail 64px] [FilterSidebar 280px] [Main Content flex-1]│
 * │ Deep Navy #213448    Sand/Cream @30%        Content Area        │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Responsive Behavior:
 * - Desktop (lg+): Both sidebars visible, filter sidebar toggleable
 * - Tablet (md): Nav rail visible, filter sidebar as drawer
 * - Mobile: Both sidebars hidden, hamburger menu + filter button
 *
 * Sidebar Behavior by Page:
 * - Market Pulse: Filter sidebar VISIBLE (Power BI filters for analytics)
 * - All Other Pages: Filter sidebar HIDDEN (full-width canvas)
 *
 * NOTE: The Power BI filter functionality is specific to Market Pulse.
 * Other pages get a clean, full-width canvas for their content.
 */

// Page configurations for sidebar behavior
// Only Market Pulse uses the Power BI filter sidebar
const PAGE_CONFIG = {
  'market-pulse': { showFilterSidebar: true },
  'value-parity': { showFilterSidebar: false },
  'floor-dispersion': { showFilterSidebar: false },
  'district-deep-dive': { showFilterSidebar: false },
  'project-deep-dive': { showFilterSidebar: false },
  'supply-insights': { showFilterSidebar: false },
};

export function DashboardLayout({ children, activePage: propActivePage }) {
  // Use Outlet when used as a route layout (nested routes pattern)
  // This prevents nav rail from unmounting during page transitions
  const content = children || <Outlet />;
  const location = useLocation();
  const { showPricingModal, hidePaywall } = useSubscription();

  // Determine active page from URL or prop
  const getActivePageFromPath = (pathname) => {
    // Map paths to page IDs
    if (pathname.startsWith('/market-pulse') || pathname === '/analytics' || pathname === '/') {
      return 'market-pulse';
    }
    if (pathname.startsWith('/value-parity')) return 'value-parity';
    if (pathname.startsWith('/floor-dispersion')) return 'floor-dispersion';
    if (pathname.startsWith('/district-deep-dive')) return 'district-deep-dive';
    if (pathname.startsWith('/project-deep-dive')) return 'project-deep-dive';
    if (pathname.startsWith('/supply-insights')) return 'supply-insights';
    return 'market-pulse';
  };

  const activePage = propActivePage || getActivePageFromPath(location.pathname);
  const pageConfig = PAGE_CONFIG[activePage] || PAGE_CONFIG['market-pulse'];

  // Sidebar states
  const [filterSidebarCollapsed, setFilterSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Reset mobile drawers when page changes
  useEffect(() => {
    setMobileNavOpen(false);
    setMobileFilterOpen(false);
  }, [activePage]);

  // Close mobile nav when clicking outside
  const handleMobileNavClose = () => setMobileNavOpen(false);
  const handleMobileFilterClose = () => setMobileFilterOpen(false);

  // Determine if filter sidebar should be visible
  const showFilterSidebar = pageConfig.showFilterSidebar;

  return (
      <div className="flex h-screen bg-[#EAE0CF]/30 overflow-hidden">
        {/* ===== GLOBAL NAV RAIL (Primary Sidebar) ===== */}
        {/* Desktop: Always visible | Mobile: Hidden */}
        <div className="hidden lg:block flex-shrink-0">
          <GlobalNavRail activePage={activePage} />
        </div>

        {/* Mobile Nav Drawer Overlay */}
        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={handleMobileNavClose}
            />
            {/* Nav Drawer - Expanded mode with labels */}
            <div className="absolute inset-y-0 left-0 w-64 animate-slide-in-left">
              <GlobalNavRail activePage={activePage} expanded={true} />
              {/* Close button overlay */}
              <button
                onClick={handleMobileNavClose}
                className="absolute top-4 right-4 p-2 rounded-lg bg-[#547792]/30 text-[#EAE0CF] hover:bg-[#547792]/50"
                aria-label="Close navigation"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ===== FILTER SIDEBAR (Secondary Sidebar - Market Pulse Only) ===== */}
        {/* Desktop: Visible with collapse handle | Mobile: Drawer */}
        {showFilterSidebar && (
          <div className="hidden lg:flex flex-shrink-0 relative">
            {/* Filter Sidebar */}
            <div
              className={`
                min-w-0
                ${filterSidebarCollapsed ? 'w-12' : 'w-72'}
              `}
            >
              <PowerBIFilterSidebar
                collapsed={filterSidebarCollapsed}
                onToggle={() => setFilterSidebarCollapsed(!filterSidebarCollapsed)}
              />
            </div>

            {/* Collapse Handle - Chevron at border top (Sand/Cream styling) */}
            <button
              onClick={() => setFilterSidebarCollapsed(!filterSidebarCollapsed)}
              className="absolute -right-3 top-3 z-10 w-6 h-10 bg-[#EAE0CF] border border-[#94B4C1]/30 rounded-r-lg shadow-sm flex items-center justify-center hover:bg-[#94B4C1]/30 transition-colors"
              aria-label={filterSidebarCollapsed ? 'Expand filters' : 'Collapse filters'}
            >
              <svg
                className={`w-4 h-4 text-[#547792] transition-transform duration-200 ${filterSidebarCollapsed ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}

        {/* Mobile Filter Drawer Overlay */}
        {mobileFilterOpen && showFilterSidebar && (
          <div className="lg:hidden fixed inset-0 z-50">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={handleMobileFilterClose}
            />
            {/* Filter Drawer */}
            <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] animate-slide-in-left">
              <PowerBIFilterSidebar
                collapsed={false}
                onToggle={handleMobileFilterClose}
              />
            </div>
          </div>
        )}

        {/* ===== MAIN CONTENT AREA ===== */}
        {/* min-w-0 prevents flex children from overflowing - critical for nested grids */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Mobile Header */}
          <header className="lg:hidden sticky top-0 z-40 bg-[#213448] px-3 py-2 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              {/* Hamburger Menu */}
              <button
                onClick={() => setMobileNavOpen(true)}
                className="flex items-center justify-center p-2 rounded-lg bg-[#547792]/30 text-white min-h-[44px] min-w-[44px]"
                aria-label="Open navigation menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Title */}
              <h1 className="text-white font-semibold text-sm truncate flex-1 text-center">
                SG Property Analytics
              </h1>

              {/* Filter Button (only if filter sidebar is enabled for this page) */}
              {showFilterSidebar ? (
                <button
                  onClick={() => setMobileFilterOpen(true)}
                  className="flex items-center justify-center p-2 rounded-lg bg-[#547792]/30 text-white min-h-[44px] min-w-[44px]"
                  aria-label="Open filters"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </button>
              ) : (
                <div className="w-11" /> // Spacer for alignment
              )}
            </div>

            {/* Mobile Page Indicator */}
            <div className="mt-2 flex justify-center">
              <div className="inline-flex rounded-lg bg-[#547792]/20 px-3 py-1.5">
                <span className="text-[#EAE0CF] text-xs font-medium">
                  {NAV_ITEMS.find(item => item.id === activePage)?.label || 'Market Pulse'}
                </span>
              </div>
            </div>
          </header>

          {/* Main Content - Wrapped with ErrorBoundary to prevent blank page crashes */}
          {/* min-w-0 on main and wrapper prevents nested grid overflow */}
          <main className="flex-1 min-w-0 overflow-auto flex flex-col">
            <ErrorBoundary name="Page Content">
              <div className="flex-1 min-w-0">
                {content}
              </div>
            </ErrorBoundary>

            {/* Upgrade CTA - Sticky footer for free users */}
            <UpgradeFooterCTA />
          </main>
        </div>

        {/* Pricing Modal - Global paywall trigger */}
        <PricingModal isOpen={showPricingModal} onClose={hidePaywall} />
      </div>
  );
}

export default DashboardLayout;
