import React from 'react';

/**
 * @param {{ message: string, onRetry?: () => void }} props
 */
function ErrorStateBase({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <div className="text-sm text-red-700">Error: {message}</div>
      <button
        onClick={onRetry}
        disabled={!onRetry}
        className="mt-2 rounded-md border px-3 py-1 text-sm"
      >
        Retry
      </button>
    </div>
  );
}

export const ErrorState = React.memo(ErrorStateBase);
