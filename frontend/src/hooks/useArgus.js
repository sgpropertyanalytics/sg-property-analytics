/**
 * useArgus - SSE consumer hook for AI-powered analysis
 *
 * Connects to the backend AI endpoint and streams the analysis response.
 * Supports both chart interpretation and Argus project analysis.
 *
 * Handles:
 * - SSE connection management
 * - Token accumulation into full response
 * - Streaming state (idle, streaming, done, error)
 * - Version metadata display
 *
 * Usage:
 * ```jsx
 * const { interpret, response, isStreaming } = useArgus();
 *
 * // Argus project analysis
 * interpret({
 *   chartType: 'argus',
 *   chartTitle: 'Marina One Residences',
 *   data: { subject: {...}, evidence: {...} },
 *   filters: currentFilters,
 * });
 *
 * // Chart interpretation (legacy)
 * interpret({
 *   chartType: 'absolute_psf',
 *   chartTitle: 'Absolute PSF by Region',
 *   data: chartData,
 *   filters: currentFilters,
 * });
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import { emitTokenExpiredOnce } from '../auth/tokenExpired';

// API base for SSE endpoint
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return '/api';
};

/**
 * Status enum for interpretation state
 */
export const InterpretStatus = {
  IDLE: 'idle',
  STREAMING: 'streaming',
  DONE: 'done',
  ERROR: 'error',
  CACHED: 'cached',
};

/**
 * Hook for AI-powered analysis via SSE streaming
 *
 * @returns {Object} Analysis state and controls
 */
export function useArgus() {
  const [status, setStatus] = useState(InterpretStatus.IDLE);
  const [response, setResponse] = useState('');
  const [error, setError] = useState(null);
  const [versions, setVersions] = useState(null);
  const [isCached, setIsCached] = useState(false);

  // Ref to abort ongoing request
  const abortControllerRef = useRef(null);

  /**
   * Reset state to idle
   */
  const reset = useCallback(() => {
    // Abort any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus(InterpretStatus.IDLE);
    setResponse('');
    setError(null);
    setVersions(null);
    setIsCached(false);
  }, []);

  /**
   * Request chart interpretation from the AI service
   *
   * @param {Object} params - Interpretation parameters
   * @param {string} params.chartType - Chart type identifier
   * @param {string} params.chartTitle - Chart display title
   * @param {Object} params.data - Chart data payload
   * @param {Object} params.filters - Active filters
   * @param {Object} [params.kpis] - Optional KPI values
   */
  const interpret = useCallback(async ({ chartType, chartTitle, data, filters, kpis }) => {
    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Reset state
    setStatus(InterpretStatus.STREAMING);
    setResponse('');
    setError(null);
    setVersions(null);
    setIsCached(false);

    const apiBase = getApiBase();
    const url = `${apiBase}/ai/interpret-chart`;

    try {
      // Use fetch for SSE with POST body (EventSource doesn't support POST)
      const fetchResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for auth
        body: JSON.stringify({
          chartType,
          chartTitle,
          data,
          filters,
          kpis,
        }),
        signal,
      });

      // Check for auth/premium errors
      if (fetchResponse.status === 401) {
        emitTokenExpiredOnce(url);
        throw new Error('Authentication required. Please sign in.');
      }
      if (fetchResponse.status === 403) {
        throw new Error('Premium subscription required for AI insights.');
      }
      if (fetchResponse.status === 503) {
        throw new Error('AI service is not configured. Please try again later.');
      }
      if (!fetchResponse.ok) {
        const errorData = await fetchResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${fetchResponse.status}`);
      }

      // Read SSE stream
      const reader = fetchResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedResponse = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (end with \n\n)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim()) continue;

          // Parse SSE data line
          const dataMatch = message.match(/^data: (.+)$/m);
          if (!dataMatch) continue;

          try {
            const event = JSON.parse(dataMatch[1]);

            switch (event.type) {
              case 'meta':
                setVersions(event.versions);
                break;

              case 'token':
                accumulatedResponse += event.content;
                setResponse(accumulatedResponse);
                break;

              case 'done':
                setIsCached(event.cached || false);
                setStatus(event.cached ? InterpretStatus.CACHED : InterpretStatus.DONE);
                break;

              case 'error':
                throw new Error(event.message || 'AI interpretation failed');
            }
          } catch (parseError) {
            // Log but don't fail on parse errors
            console.warn('Failed to parse SSE event:', parseError);
          }
        }
      }

      // Ensure we're in done state if stream completed without done event
      if (status !== InterpretStatus.DONE && status !== InterpretStatus.CACHED) {
        setStatus(InterpretStatus.DONE);
      }

    } catch (err) {
      // Don't set error state if request was aborted
      if (err.name === 'AbortError') {
        setStatus(InterpretStatus.IDLE);
        return;
      }

      console.error('Chart interpretation error:', err);
      setError(err.message || 'Failed to get AI interpretation');
      setStatus(InterpretStatus.ERROR);
    }
  }, [status]);

  return {
    // Actions
    interpret,
    reset,

    // State
    status,
    response,
    error,
    versions,
    isCached,

    // Derived booleans for convenience
    isIdle: status === InterpretStatus.IDLE,
    isStreaming: status === InterpretStatus.STREAMING,
    isDone: status === InterpretStatus.DONE || status === InterpretStatus.CACHED,
    isError: status === InterpretStatus.ERROR,
  };
}

// Alias for backward compatibility
export const useChartInterpret = useArgus;

export default useArgus;
