import React, { useState, useEffect, Suspense } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { GlobalNavRail, NAV_ITEMS, NAV_WIDTH_EXPANDED, NAV_WIDTH_COLLAPSED } from './GlobalNavRail';
import { ErrorBoundary } from '../ui';
import { UpgradeFooterCTA } from '../ui/UpgradeFooterCTA';
import { useSubscription } from '../../context/SubscriptionContext';
import { PricingModal } from '../PricingModal';

// Loading fallback for lazy-loaded page content
// This is INSIDE the layout so nav rail stays visible during loading
// Uses delayed fade-in to prevent flash on fast navigations
function ContentLoadingFallback() {
  return (
    <div className="h-full min-h-[50vh] flex items-center justify-center bg-transparent animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[#547792]">Loading...</span>
      </div>
    </div>
  );
}

/**
 * DashboardLayout - Single Sidebar Navigation System
 *
 * Layout Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [GlobalNavRail 256px]       [Main Content flex-1]              │
 * │ Deep Navy #213448           Full-width content area            │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Responsive Behavior:
 * - Desktop (lg+): Nav rail visible, full-width content
 * - Tablet (md): Nav rail visible
 * - Mobile: Nav rail hidden, hamburger menu
 *
 * NOTE: Filter controls are now handled by ControlBar within each page,
 * providing a horizontal filter bar below the page title.
 */

export const DashboardLayout = React.memo(function DashboardLayout({ children, activePage: propActivePage }) {
  // Use Outlet when used as a route layout (nested routes pattern)
  // This prevents nav rail from unmounting during page transitions
  const content = children || <Outlet />;
  const location = useLocation();
  const { showPricingModal, hidePaywall } = useSubscription();

  // Determine active page from URL or prop
  const getActivePageFromPath = (pathname) => {
    // Map paths to page IDs
    if (pathname.startsWith('/market-core') || pathname === '/analytics' || pathname === '/') {
      return 'market-core';
    }
    if (pathname.startsWith('/primary-market')) return 'primary-market';
    if (pathname.startsWith('/value-parity')) return 'value-parity';
    if (pathname.startsWith('/floor-dispersion')) return 'floor-dispersion';
    if (pathname.startsWith('/district-deep-dive')) return 'district-deep-dive';
    if (pathname.startsWith('/project-deep-dive')) return 'project-deep-dive';
    if (pathname.startsWith('/supply-insights')) return 'supply-insights';
    if (pathname.startsWith('/methodology')) return 'methodology';
    return 'market-core';
  };

  const activePage = propActivePage || getActivePageFromPath(location.pathname);

  // Mobile nav state
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Desktop nav collapse state - persisted to localStorage to prevent flicker on navigation
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('nav-collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const toggleNavCollapse = () => {
    setIsNavCollapsed(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem('nav-collapsed', String(newValue));
      } catch {
        // Ignore storage errors
      }
      return newValue;
    });
  };

  // Reset mobile drawer when page changes
  useEffect(() => {
    setMobileNavOpen(false);
  }, [activePage]);

  const handleMobileNavClose = () => setMobileNavOpen(false);

  return (
    <div className="flex h-screen bg-[#EAE0CF]/30 overflow-hidden">
      {/* ===== GLOBAL NAV RAIL (Primary Sidebar) ===== */}
      {/* Desktop: Collapsible with premium physics animation | Mobile: Hidden */}
      <div
        className="hidden lg:flex flex-shrink-0 relative"
        style={{
          width: isNavCollapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH_EXPANDED,
          transition: 'width 500ms cubic-bezier(0.2, 0, 0, 1)'
        }}
      >
        <GlobalNavRail activePage={activePage} collapsed={isNavCollapsed} />

        {/* Collapse Toggle Button - Positioned at sidebar edge */}
        <button
          onClick={toggleNavCollapse}
          className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-[#213448] border border-[#547792]/50 flex items-center justify-center text-[#94B4C1] hover:text-white hover:bg-[#547792] active:scale-95 transition-all duration-200 shadow-lg"
          aria-label={isNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <svg
            className="w-3.5 h-3.5 transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)]"
            style={{ transform: isNavCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Mobile Nav Drawer Overlay */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleMobileNavClose}
          />
          {/* Nav Drawer - Uses NAV_WIDTH_EXPANDED design token, capped at 85vw */}
          <div
            className="absolute inset-y-0 left-0 max-w-[85vw] animate-slide-in-left"
            style={{ width: NAV_WIDTH_EXPANDED }}
          >
            <GlobalNavRail activePage={activePage} />
            {/* Close button overlay */}
            <button
              onClick={handleMobileNavClose}
              className="absolute top-4 right-4 p-2 rounded-lg bg-[#547792]/30 text-[#EAE0CF] hover:bg-[#547792]/50 min-h-[44px] min-w-[44px] flex items-center justify-center active:bg-[#547792]/60 active:scale-[0.98]"
              aria-label="Close navigation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
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

            {/* Spacer for alignment */}
            <div className="w-11" />
          </div>

          {/* Mobile Page Indicator */}
          <div className="mt-2 flex justify-center">
            <div className="inline-flex rounded-lg bg-[#547792]/20 px-3 py-1.5">
              <span className="text-[#EAE0CF] text-xs font-medium">
                {NAV_ITEMS.find(item => item.id === activePage)?.label || 'Market Core'}
              </span>
            </div>
          </div>
        </header>

        {/* Main Content - Wrapped with Suspense + ErrorBoundary */}
        {/* IMPORTANT: Suspense is HERE so nav rail stays mounted during lazy loading */}
        {/* min-w-0 on main and wrapper prevents nested grid overflow */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden flex flex-col">
          <ErrorBoundary name="Page Content">
            <Suspense fallback={<ContentLoadingFallback />}>
              <div className="flex-1 min-w-0">
                {content}
              </div>
            </Suspense>
          </ErrorBoundary>

          {/* Upgrade CTA - Sticky footer for free users */}
          <UpgradeFooterCTA />
        </main>
      </div>

      {/* Pricing Modal - Global paywall trigger */}
      <PricingModal isOpen={showPricingModal} onClose={hidePaywall} />
    </div>
  );
});

export default DashboardLayout;
