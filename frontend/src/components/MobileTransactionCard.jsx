import React from 'react';
import { isSaleType, getTxnField, TxnField } from '../schemas/apiContract';

/**
 * MobileTransactionCard - Card view for transactions on mobile devices
 *
 * Shows key transaction details in a compact, touch-friendly card format:
 * - Project name
 * - Location and bedroom info
 * - Price and PSF
 * - Sale type badge
 */
export function MobileTransactionCard({ transaction, formatCurrency, formatDate, formatRemainingLease }) {
  const txn = transaction;

  // Default formatter if not provided
  const formatLease = formatRemainingLease || ((years) => {
    if (years === null || years === undefined) return '-';
    if (years >= 999) return 'Freehold';
    return `${years} yrs`;
  });

  return (
    <div className="p-3 bg-white rounded-lg border border-[#94B4C1]/30 active:bg-[#EAE0CF]/20">
      <div className="flex justify-between items-start gap-3">
        {/* Left: Property info */}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[#213448] truncate">
            {txn.project_name || txn.project_name_masked || '-'}
          </div>
          <div className="text-xs text-[#547792] mt-0.5">
            {txn.district || '-'} &bull; {txn.bedroom_count || '-'}BR &bull; {formatDate(txn.transaction_date)}
          </div>
          <div className="text-xs text-[#547792] mt-0.5">
            {txn.area_sqft?.toLocaleString() || txn.area_sqft_masked || '-'} {txn.area_sqft ? 'sqft' : ''} &bull; {formatLease(txn.remaining_lease)}
          </div>
        </div>

        {/* Right: Price and type */}
        <div className="flex-shrink-0 text-right">
          <div className="font-semibold text-[#213448]">
            {txn.price ? formatCurrency(txn.price) : txn.price_masked || '-'}
          </div>
          <div className="text-xs text-[#547792]">
            {txn.psf ? `$${txn.psf.toLocaleString()} PSF` : txn.psf_masked || '-'}
          </div>
          <span className={`inline-block mt-1 px-1.5 py-0.5 text-xs rounded ${
            isSaleType.newSale(getTxnField(txn, TxnField.SALE_TYPE))
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {isSaleType.newSale(getTxnField(txn, TxnField.SALE_TYPE)) ? 'New' : 'Resale'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default MobileTransactionCard;
