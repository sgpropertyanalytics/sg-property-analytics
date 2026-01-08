import React from 'react';
import PrimitiveErrorState from '../primitives/ErrorState';

/**
 * @param {{ message: string, onRetry?: () => void }} props
 */
function ErrorStateBase({ message, onRetry }) {
  const action = onRetry ? (
    <button
      onClick={onRetry}
      className="mt-2 rounded-md border px-3 py-1 text-sm"
    >
      Retry
    </button>
  ) : null;

  return (
    <PrimitiveErrorState
      title="Error"
      description={message}
      className="rounded-lg border border-red-200 bg-red-50 p-3"
      action={action}
    />
  );
}

export const ErrorState = React.memo(ErrorStateBase);
