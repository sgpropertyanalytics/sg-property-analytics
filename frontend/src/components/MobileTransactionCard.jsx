import React from 'react';

/**
 * DEPRECATED: MobileTransactionCard removed for URA compliance.
 *
 * This component previously displayed individual transaction cards which violates
 * URA data usage rules. Individual transaction records are no longer exposed.
 *
 * The platform now provides aggregated market insights instead.
 */
export function MobileTransactionCard({ transaction: _transaction, formatCurrency: _formatCurrency, formatDate: _formatDate, formatRemainingLease: _formatRemainingLease }) {
  return (
    <div className="p-3 bg-white rounded-lg border border-amber-200 bg-amber-50/50">
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 text-amber-600 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-xs text-amber-800">
          Transaction cards deprecated - use aggregated insights instead
        </span>
      </div>
    </div>
  );
}

export default MobileTransactionCard;
