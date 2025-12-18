import React, { ReactNode } from 'react';

/**
 * DashboardGrid - Responsive grid layout for dashboard pages
 *
 * Following responsive-layout-system skill:
 * - Desktop-first: Build for 1440px+, then adapt down
 * - Uses CSS Grid with responsive column counts
 * - Consistent gap spacing across breakpoints
 *
 * Breakpoint behavior:
 * - Desktop (1440px+): Full multi-column layouts
 * - Small Desktop (1024-1439px): May reduce columns
 * - Tablet (768-1023px): 2 columns typically
 * - Mobile (< 768px): Single column
 */

interface DashboardGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * Main page container with proper padding and background
 */
export function DashboardContainer({ children, className = '' }: DashboardGridProps) {
  return (
    <div className={`min-h-screen bg-[#EAE0CF]/30 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Main content area (excludes sidebar)
 */
export function DashboardMain({ children, className = '' }: DashboardGridProps) {
  return (
    <main className={`
      flex-1 overflow-auto
      p-3 md:p-4 lg:p-6
      ${className}
    `}>
      {children}
    </main>
  );
}

/**
 * Section container with consistent vertical spacing
 */
export function DashboardSection({
  children,
  className = '',
  title,
  subtitle,
  actions,
}: DashboardGridProps & {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`mb-4 md:mb-6 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div>
            {title && (
              <h2 className="text-lg md:text-xl font-bold text-[#213448]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs md:text-sm text-[#547792] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * KPI Cards Grid - Responsive grid for stat cards
 *
 * Breakpoint behavior:
 * - Desktop: 4 columns (or custom)
 * - Tablet: 2 columns
 * - Mobile: 2 columns (compact)
 */
export function KPIGrid({
  children,
  className = '',
  columns = 4,
}: DashboardGridProps & {
  columns?: 2 | 3 | 4 | 5 | 6;
}) {
  const colClasses = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
    5: 'md:grid-cols-5 lg:grid-cols-5',
    6: 'md:grid-cols-3 lg:grid-cols-6',
  };

  return (
    <div className={`
      grid gap-3 md:gap-4
      grid-cols-2
      ${colClasses[columns]}
      ${className}
    `}>
      {children}
    </div>
  );
}

/**
 * Chart Grid - Responsive grid for chart cards
 *
 * Breakpoint behavior:
 * - Desktop: 2 columns (or 3)
 * - Tablet: 1-2 columns
 * - Mobile: 1 column
 */
export function ChartGrid({
  children,
  className = '',
  columns = 2,
}: DashboardGridProps & {
  columns?: 1 | 2 | 3;
}) {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 lg:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  };

  return (
    <div className={`
      grid gap-4 md:gap-6
      ${colClasses[columns]}
      ${className}
    `}>
      {children}
    </div>
  );
}

/**
 * Mixed Grid - For layouts with different sized cards
 * Uses CSS Grid with named areas for complex layouts
 *
 * Children should use grid column/row span classes:
 * - lg:col-span-2 for wide charts
 * - lg:row-span-2 for tall charts
 */
export function MixedGrid({
  children,
  className = '',
}: DashboardGridProps) {
  return (
    <div className={`
      grid gap-4 md:gap-6
      grid-cols-1
      lg:grid-cols-3
      ${className}
    `}>
      {children}
    </div>
  );
}

/**
 * Full Width Row - For charts that should span full width
 */
export function FullWidthRow({ children, className = '' }: DashboardGridProps) {
  return (
    <div className={`lg:col-span-2 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Two Column Row - For side-by-side charts
 */
export function TwoColumnRow({ children, className = '' }: DashboardGridProps) {
  return (
    <div className={`
      grid gap-4 md:gap-6
      grid-cols-1 lg:grid-cols-2
      ${className}
    `}>
      {children}
    </div>
  );
}

/**
 * Responsive Sidebar Layout
 * Desktop: Sidebar + Main content
 * Mobile: Full width (sidebar collapses/becomes drawer)
 */
interface SidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  sidebarWidth?: 'narrow' | 'default' | 'wide';
  sidebarCollapsed?: boolean;
  className?: string;
}

export function SidebarLayout({
  sidebar,
  children,
  sidebarWidth = 'default',
  sidebarCollapsed = false,
  className = '',
}: SidebarLayoutProps) {
  const widthClasses = {
    narrow: sidebarCollapsed ? 'w-12' : 'w-56',
    default: sidebarCollapsed ? 'w-12' : 'w-72',
    wide: sidebarCollapsed ? 'w-12' : 'w-80',
  };

  return (
    <div className={`flex h-screen ${className}`}>
      {/* Sidebar - Hidden on mobile, shown on desktop */}
      <aside className={`
        hidden lg:block
        ${widthClasses[sidebarWidth]}
        transition-all duration-200
        flex-shrink-0
      `}>
        {sidebar}
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}

/**
 * Mobile-first responsive container
 * Switches between mobile and desktop layouts
 */
interface ResponsiveLayoutProps {
  mobileContent: ReactNode;
  desktopContent: ReactNode;
  breakpoint?: 'sm' | 'md' | 'lg' | 'xl';
}

export function ResponsiveLayout({
  mobileContent,
  desktopContent,
  breakpoint = 'lg',
}: ResponsiveLayoutProps) {
  const breakpointClasses = {
    sm: { mobile: 'sm:hidden', desktop: 'hidden sm:block' },
    md: { mobile: 'md:hidden', desktop: 'hidden md:block' },
    lg: { mobile: 'lg:hidden', desktop: 'hidden lg:block' },
    xl: { mobile: 'xl:hidden', desktop: 'hidden xl:block' },
  };

  return (
    <>
      <div className={breakpointClasses[breakpoint].mobile}>
        {mobileContent}
      </div>
      <div className={breakpointClasses[breakpoint].desktop}>
        {desktopContent}
      </div>
    </>
  );
}

// All components are named exports - no default export needed
