import React from 'react';

/**
 * MobileTransactionCard - Card view for transactions on mobile devices
 *
 * Shows key transaction details in a compact, touch-friendly card format:
 * - Project name
 * - Location and bedroom info
 * - Price and PSF
 * - Sale type badge
 */
export function MobileTransactionCard({ transaction, formatCurrency, formatDate }) {
  const txn = transaction;

  return (
    <div className="p-3 bg-white rounded-lg border border-[#94B4C1]/30 active:bg-[#EAE0CF]/20">
      <div className="flex justify-between items-start gap-3">
        {/* Left: Property info */}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[#213448] truncate">
            {txn.project_name || '-'}
          </div>
          <div className="text-xs text-[#547792] mt-0.5">
            {txn.district || '-'} &bull; {txn.bedroom_count || '-'}BR &bull; {formatDate(txn.transaction_date)}
          </div>
          <div className="text-xs text-[#547792] mt-0.5">
            {txn.area_sqft?.toLocaleString() || '-'} sqft &bull; {txn.tenure || '-'}
          </div>
        </div>

        {/* Right: Price and type */}
        <div className="flex-shrink-0 text-right">
          <div className="font-semibold text-[#213448]">
            {formatCurrency(txn.price)}
          </div>
          <div className="text-xs text-[#547792]">
            ${txn.psf?.toLocaleString() || '-'} PSF
          </div>
          <span className={`inline-block mt-1 px-1.5 py-0.5 text-xs rounded ${
            txn.sale_type === 'New Sale'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {txn.sale_type === 'New Sale' ? 'New' : 'Resale'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default MobileTransactionCard;
