import React, { useState, useEffect, Suspense } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { GlobalNavRail, NAV_ITEMS, NAV_WIDTH_EXPANDED, NAV_WIDTH_COLLAPSED } from './GlobalNavRail';
import { ErrorBoundary } from '../ui';
import { UpgradeFooterCTA } from '../ui/UpgradeFooterCTA';
import { useSubscription } from '../../context/SubscriptionContext';
import { PricingModal } from '../PricingModal';
import { DebugModeIndicator } from '../debug/DebugModeIndicator';

// localStorage key for nav collapse state persistence
const NAV_STORAGE_KEY = 'nav-collapsed';

// Loading fallback for lazy-loaded page content
// This is INSIDE the layout so nav rail stays visible during loading
// Uses delayed fade-in to prevent flash on fast navigations
function ContentLoadingFallback() {
  return (
    <div className="h-full min-h-[50vh] flex items-center justify-center bg-transparent animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#5C5844] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[#5C5844]">Loading...</span>
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
 * │ Slate-900 #0F172A           Full-width content area            │
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
    if (pathname.startsWith('/market-overview') || pathname === '/analytics' || pathname === '/') {
      return 'overview';
    }
    if (pathname.startsWith('/new-launch-market')) return 'new-launches';
    if (pathname.startsWith('/value-check')) return 'value-check';
    if (pathname.startsWith('/district-overview')) return 'districts';
    if (pathname.startsWith('/explore')) return 'explore';
    if (pathname.startsWith('/supply-inventory')) return 'supply';
    if (pathname.startsWith('/supply-insights')) return 'supply'; // Legacy
    if (pathname.startsWith('/exit-risk')) return 'exit-risk';
    if (pathname.startsWith('/methodology')) return 'methodology';
    // Legacy route support
    if (pathname.startsWith('/market-core')) return 'overview';
    if (pathname.startsWith('/primary-market')) return 'new-launches';
    if (pathname.startsWith('/value-parity')) return 'value-check';
    if (pathname.startsWith('/district-deep-dive')) return 'districts';
    if (pathname.startsWith('/project-deep-dive')) return 'explore';
    return 'overview';
  };

  const activePage = propActivePage || getActivePageFromPath(location.pathname);

  // Mobile nav state
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Desktop nav collapse state - persisted to localStorage
  // Key insight: We sync via useEffect to ensure persistence survives
  // React's reconciliation during navigation
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(NAV_STORAGE_KEY);
      // Only return true if explicitly set to 'true'
      // null/undefined/'false' all default to expanded
      return saved === 'true';
    } catch {
      return false;
    }
  });

  // Sync collapsed state to localStorage whenever it changes
  // This ensures persistence even if state changes outside of toggle
  useEffect(() => {
    try {
      localStorage.setItem(NAV_STORAGE_KEY, String(isNavCollapsed));
    } catch {
      // Ignore storage errors (private browsing, quota exceeded)
    }
  }, [isNavCollapsed]);

  const toggleNavCollapse = () => {
    setIsNavCollapsed(prev => !prev);
  };

  // Reset mobile drawer when page changes
  useEffect(() => {
    setMobileNavOpen(false);
  }, [activePage]);

  // Body scroll lock when mobile nav drawer is open (iOS Safari fix)
  useEffect(() => {
    if (mobileNavOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [mobileNavOpen]);

  // Escape key to close mobile nav drawer
  useEffect(() => {
    if (!mobileNavOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileNavOpen]);

  const handleMobileNavClose = () => setMobileNavOpen(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F5F0E6' }}>
      {/* ===== GLOBAL NAV RAIL (Primary Sidebar) ===== */}
      {/* Desktop: Collapsible mini-dock with mechanical 0.2s animation | Mobile: Hidden */}
      <div
        className="hidden lg:flex flex-shrink-0 relative overflow-visible transition-[width] duration-200 ease-out"
        style={{
          width: isNavCollapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH_EXPANDED
        }}
      >
        <GlobalNavRail
          activePage={activePage}
          collapsed={isNavCollapsed}
          onToggleCollapse={toggleNavCollapse}
        />
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
                className="absolute top-4 right-4 p-2 rounded-none bg-[#F5F0E6] border border-[#C4BFA8] text-[#5C5844] hover:bg-[#EAE6D8] min-h-[44px] min-w-[44px] flex items-center justify-center shadow-sm"
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
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        {/* Background Cross (+) Grid Pattern - Ream aesthetic */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.3]"
          style={{
            backgroundImage: `
              linear-gradient(to right, #C4BFA8 1px, transparent 1px),
              linear-gradient(to bottom, #C4BFA8 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            backgroundPosition: '-0.5px -0.5px'
          }}
        />

        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-40 bg-[#F5F0E6] px-3 py-2 flex-shrink-0 border-b border-[#C4BFA8]">
          <div className="flex items-center justify-between gap-2">
            {/* Hamburger Menu */}
            <button
              onClick={() => setMobileNavOpen(true)}
              className="flex items-center justify-center p-2 rounded-none bg-[#F5F0E6] border border-[#C4BFA8] text-[#5C5844] min-h-[44px] min-w-[44px] hover:bg-[#EAE6D8] transition-none shadow-sm"
              aria-label="Open navigation menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Title */}
            <h1 className="text-[#3D3A2E] font-mono text-[10px] uppercase tracking-[0.18em] truncate flex-1 text-center">
              SG Property Analytics
            </h1>

            {/* Spacer for alignment */}
            <div className="w-11" />
          </div>

          {/* Mobile Page Indicator */}
            <div className="mt-2 flex justify-center">
               <div className="inline-flex rounded-none bg-[#F5F0E6] border border-[#D4CEB8] px-3 py-1.5 shadow-sm">
                <span className="text-[#5C5844] font-mono text-[10px] uppercase tracking-[0.18em]">
                {NAV_ITEMS.find(item => item.id === activePage)?.label || 'Market Core'}
              </span>
            </div>
          </div>
        </header>

        {/* Main Content - Wrapped with Suspense + ErrorBoundary */}
        {/* FLOATING CARD ARCHITECTURE - Cream card with margins on all sides */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden flex flex-col p-4 lg:p-6 relative z-10">
          {/* Floating Cream Card - Visible gap from sidebar, margins on all sides */}
          <div className="flex-1 min-w-0 bg-[#F5F0E6] border border-[#C4BFA8] shadow-[4px_4px_0px_0px_rgba(61,58,46,0.08)] ml-2 lg:ml-4">
            <div className="p-4 lg:p-6">
              <ErrorBoundary name="Page Content">
                <Suspense fallback={<ContentLoadingFallback />}>
                  <div className="flex-1 min-w-0 text-[#3D3A2E]">
                    {content}
                  </div>
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>

          {/* Upgrade CTA - Sticky footer for free users */}
          <UpgradeFooterCTA />
        </main>
      </div>

      {/* Pricing Modal - Global paywall trigger */}
      <PricingModal isOpen={showPricingModal} onClose={hidePaywall} />

      {/* Debug Mode Indicator - Shows when Ctrl+Shift+D is pressed */}
      <DebugModeIndicator />
    </div>
  );
});

export default DashboardLayout;
