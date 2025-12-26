import React from 'react';

/**
 * DEPRECATED: TransactionDetailModal removed for URA compliance.
 *
 * This modal previously showed drill-through transaction details which violates
 * URA data usage rules. Individual transaction records are no longer exposed.
 *
 * The platform now provides aggregated project-level insights instead.
 */
export function TransactionDetailModal({ isOpen, onClose, title, additionalFilters = {} }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#94B4C1] hover:text-[#547792]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-amber-600"
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
          </div>
          <h3 className="text-lg font-semibold text-[#213448] mb-2">
            Feature Deprecated
          </h3>
          <p className="text-sm text-[#547792] mb-4">
            Transaction drill-through has been replaced with aggregated project insights
            for compliance reasons.
          </p>
          <p className="text-xs text-[#94B4C1] mb-6">
            Individual transaction records are no longer available.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#213448] text-white rounded-lg hover:bg-[#547792] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default TransactionDetailModal;
