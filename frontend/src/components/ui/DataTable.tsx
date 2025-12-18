import React, { ReactNode, useState, useCallback, useMemo } from 'react';

/**
 * DataTable - Responsive table with mobile card view
 *
 * Following responsive-layout-system skill:
 * - Desktop: Full table with all columns, hover states
 * - Tablet: Horizontal scroll in container
 * - Mobile: Card view OR horizontal scroll
 *
 * Key features:
 * - Automatic mobile card view rendering
 * - Sortable columns
 * - Pagination controls
 * - Loading skeleton states
 * - Empty state handling
 */

export interface Column<T> {
  /** Unique key for the column */
  key: string;
  /** Column header label */
  label: string;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Column width class */
  width?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Whether to show in mobile card view */
  showInCard?: boolean;
  /** Whether this is the primary field (shown prominently in card) */
  primary?: boolean;
  /** Custom render function */
  render?: (value: any, row: T, index: number) => ReactNode;
  /** Mobile card label (if different from header) */
  cardLabel?: string;
}

interface DataTableProps<T> {
  /** Array of data rows */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string | null;
  /** Max height for scrollable area */
  maxHeight?: number;
  /** Unique key field for rows */
  rowKey?: keyof T | ((row: T, index: number) => string | number);
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Sort configuration */
  sortConfig?: {
    column: string;
    order: 'asc' | 'desc';
  };
  /** Sort change handler */
  onSort?: (column: string) => void;
  /** Additional CSS classes */
  className?: string;
  /** Card view breakpoint */
  cardViewBreakpoint?: 'sm' | 'md' | 'lg';
  /** Custom empty state message */
  emptyMessage?: string;
  /** Skeleton row count for loading */
  skeletonRows?: number;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  loading = false,
  error,
  maxHeight = 400,
  rowKey = 'id',
  onRowClick,
  sortConfig,
  onSort,
  className = '',
  cardViewBreakpoint = 'md',
  emptyMessage = 'No data found',
  skeletonRows = 5,
}: DataTableProps<T>) {
  // Get row key value
  const getRowKey = useCallback((row: T, index: number): string | number => {
    if (typeof rowKey === 'function') {
      return rowKey(row, index);
    }
    return row[rowKey] ?? index;
  }, [rowKey]);

  // Breakpoint class for card view
  const breakpointClasses = {
    sm: { table: 'hidden sm:table', cards: 'sm:hidden' },
    md: { table: 'hidden md:table', cards: 'md:hidden' },
    lg: { table: 'hidden lg:table', cards: 'lg:hidden' },
  };

  // Columns to show in card view
  const cardColumns = useMemo(() =>
    columns.filter(col => col.showInCard !== false),
    [columns]
  );

  const primaryColumn = useMemo(() =>
    columns.find(col => col.primary) ?? columns[0],
    [columns]
  );

  return (
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden ${className}`}>
      {/* Table View - Hidden on mobile */}
      <div className="overflow-auto" style={{ maxHeight }}>
        {error ? (
          <ErrorState message={error} />
        ) : (
          <>
            {/* Desktop/Tablet Table */}
            <table className={`w-full text-sm ${breakpointClasses[cardViewBreakpoint].table}`}>
              <thead className="bg-[#EAE0CF]/50 sticky top-0 z-10">
                <tr>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      className={`
                        px-3 py-2.5
                        text-left font-medium text-[#547792]
                        border-b border-[#94B4C1]/30
                        ${col.width || ''}
                        ${col.sortable && onSort ? 'cursor-pointer hover:bg-[#94B4C1]/20 select-none' : ''}
                        ${col.align === 'center' ? 'text-center' : ''}
                        ${col.align === 'right' ? 'text-right' : ''}
                      `}
                      onClick={() => col.sortable && onSort?.(col.key)}
                    >
                      <div className={`
                        flex items-center gap-1
                        ${col.align === 'center' ? 'justify-center' : ''}
                        ${col.align === 'right' ? 'justify-end' : ''}
                      `}>
                        <span>{col.label}</span>
                        {col.sortable && onSort && (
                          <SortIcon
                            active={sortConfig?.column === col.key}
                            direction={sortConfig?.column === col.key ? sortConfig.order : undefined}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Loading skeleton rows
                  [...Array(skeletonRows)].map((_, i) => (
                    <tr key={`skeleton-${i}`} className="animate-pulse">
                      {columns.map(col => (
                        <td key={col.key} className="px-3 py-2.5 border-b border-[#94B4C1]/20">
                          <div className="h-4 bg-[#94B4C1]/30 rounded w-3/4" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-3 py-8 text-center text-[#547792]">
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  data.map((row, index) => (
                    <tr
                      key={getRowKey(row, index)}
                      className={`
                        hover:bg-[#EAE0CF]/30 transition-colors
                        ${onRowClick ? 'cursor-pointer' : ''}
                      `}
                      onClick={() => onRowClick?.(row, index)}
                    >
                      {columns.map(col => (
                        <td
                          key={col.key}
                          className={`
                            px-3 py-2.5 border-b border-[#94B4C1]/20
                            ${col.align === 'center' ? 'text-center' : ''}
                            ${col.align === 'right' ? 'text-right' : ''}
                          `}
                        >
                          {col.render
                            ? col.render(row[col.key], row, index)
                            : row[col.key] ?? '-'
                          }
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Mobile Card View */}
            <div className={`${breakpointClasses[cardViewBreakpoint].cards} divide-y divide-[#94B4C1]/20`}>
              {loading ? (
                // Loading skeleton cards
                [...Array(skeletonRows)].map((_, i) => (
                  <div key={`card-skeleton-${i}`} className="p-4 animate-pulse">
                    <div className="h-5 bg-[#94B4C1]/30 rounded w-2/3 mb-3" />
                    <div className="space-y-2">
                      <div className="h-3 bg-[#94B4C1]/20 rounded w-1/2" />
                      <div className="h-3 bg-[#94B4C1]/20 rounded w-1/3" />
                    </div>
                  </div>
                ))
              ) : data.length === 0 ? (
                <div className="p-8 text-center text-[#547792]">
                  {emptyMessage}
                </div>
              ) : (
                data.map((row, index) => (
                  <DataCard
                    key={getRowKey(row, index)}
                    row={row}
                    columns={cardColumns}
                    primaryColumn={primaryColumn}
                    onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                    index={index}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * DataCard - Mobile card representation of a table row
 */
interface DataCardProps<T> {
  row: T;
  columns: Column<T>[];
  primaryColumn: Column<T>;
  onClick?: () => void;
  index: number;
}

function DataCard<T extends Record<string, any>>({
  row,
  columns,
  primaryColumn,
  onClick,
  index,
}: DataCardProps<T>) {
  const primaryValue = primaryColumn.render
    ? primaryColumn.render(row[primaryColumn.key], row, index)
    : row[primaryColumn.key];

  const otherColumns = columns.filter(col => col.key !== primaryColumn.key);

  return (
    <div
      className={`
        p-4
        ${onClick ? 'cursor-pointer active:bg-[#EAE0CF]/50' : ''}
      `}
      onClick={onClick}
    >
      {/* Primary field */}
      <div className="font-medium text-[#213448] mb-2">
        {primaryValue ?? '-'}
      </div>

      {/* Other fields in a grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {otherColumns.map(col => (
          <div key={col.key} className="flex flex-col">
            <span className="text-[10px] text-[#94B4C1] uppercase tracking-wide">
              {col.cardLabel ?? col.label}
            </span>
            <span className="text-[#547792]">
              {col.render
                ? col.render(row[col.key], row, index)
                : row[col.key] ?? '-'
              }
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * DataTablePagination - Pagination controls for data tables
 */
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  loading?: boolean;
}

export function DataTablePagination({
  currentPage,
  totalPages,
  totalRecords,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  loading = false,
}: PaginationProps) {
  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalRecords);

  return (
    <div className="px-4 py-3 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30 flex flex-col sm:flex-row items-center justify-between gap-3">
      {/* Record info + page size */}
      <div className="flex items-center gap-3 text-xs text-[#547792] order-2 sm:order-1">
        {totalRecords > 0 && !loading && (
          <span>
            Showing {startRecord}-{endRecord} of {totalRecords.toLocaleString()}
          </span>
        )}
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
            disabled={loading}
            className="
              border border-[#94B4C1] rounded px-2 py-1
              focus:outline-none focus:ring-1 focus:ring-[#547792]
              text-[#213448] bg-white
              min-h-[36px]
            "
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>{size} rows</option>
            ))}
          </select>
        )}
      </div>

      {/* Pagination buttons */}
      <div className="flex items-center gap-1 order-1 sm:order-2">
        <PaginationButton
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1 || loading}
          title="First page"
        >
          <DoubleChevronLeftIcon />
        </PaginationButton>
        <PaginationButton
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
          title="Previous page"
        >
          <ChevronLeftIcon />
        </PaginationButton>

        <span className="px-3 py-1 text-sm text-[#213448] min-w-[100px] text-center">
          Page {currentPage} of {totalPages || 1}
        </span>

        <PaginationButton
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || loading}
          title="Next page"
        >
          <ChevronRightIcon />
        </PaginationButton>
        <PaginationButton
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages || loading}
          title="Last page"
        >
          <DoubleChevronRightIcon />
        </PaginationButton>
      </div>
    </div>
  );
}

/**
 * DataTableHeader - Header for data tables with title, count, and actions
 */
interface HeaderProps {
  title: string;
  subtitle?: string;
  totalRecords?: number;
  activeFilters?: number;
  loading?: boolean;
  actions?: ReactNode;
  onRefresh?: () => void;
}

export function DataTableHeader({
  title,
  subtitle,
  totalRecords,
  activeFilters,
  loading,
  actions,
  onRefresh,
}: HeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center justify-between">
      <div>
        <h3 className="font-semibold text-[#213448]">{title}</h3>
        <p className="text-xs text-[#547792]">
          {loading ? 'Loading...' : (
            <>
              {totalRecords !== undefined && `${totalRecords.toLocaleString()} records`}
              {activeFilters && activeFilters > 0 && (
                <span className="text-[#547792] font-medium ml-1">
                  ({activeFilters} filters applied)
                </span>
              )}
              {subtitle && <span className="ml-1">{subtitle}</span>}
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="
              p-2 rounded
              text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF]
              transition-colors
              min-w-[36px] min-h-[36px]
              flex items-center justify-center
            "
            title="Refresh"
          >
            <RefreshIcon className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </div>
  );
}

// Helper components
function PaginationButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="
        p-2 rounded border border-[#94B4C1]
        text-[#547792] hover:bg-[#94B4C1]/20
        disabled:opacity-50 disabled:cursor-not-allowed
        min-w-[36px] min-h-[36px]
        flex items-center justify-center
      "
    >
      {children}
    </button>
  );
}

function SortIcon({
  active,
  direction,
}: {
  active?: boolean;
  direction?: 'asc' | 'desc';
}) {
  if (!active) {
    return (
      <svg className="w-3 h-3 text-[#94B4C1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }

  return direction === 'asc' ? (
    <svg className="w-3 h-3 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-3 h-3 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-red-500">
      <div className="text-center">
        <svg className="w-8 h-8 mx-auto mb-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}

// Icons
function ChevronLeftIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function DoubleChevronLeftIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
    </svg>
  );
}

function DoubleChevronRightIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
  );
}

function RefreshIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

export default DataTable;
