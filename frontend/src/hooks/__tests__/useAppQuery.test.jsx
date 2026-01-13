/**
 * useAppQuery Hook Tests
 *
 * Phase 2 of filter system simplification.
 *
 * Tests for:
 * 1. Query key stability (critical fix for infinite loops)
 * 2. Boot gating behavior
 * 3. Status derivation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppQuery } from '../useAppQuery';

// Mock the AppReadyContext
vi.mock('../../context/AppReadyContext', () => ({
  useAppReadyOptional: () => ({
    publicReady: true,
    proReady: true,
    bootStatus: 'ready',
    banners: {},
  }),
}));

// Mock the useChartTiming hook
vi.mock('../useChartTiming', () => ({
  useChartTiming: () => ({
    recordFetchStart: vi.fn(),
    recordStateUpdate: vi.fn(),
  }),
}));

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  });
}

function createWrapper(queryClient) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

// =============================================================================
// QUERY KEY STABILITY TESTS (Critical fix)
// =============================================================================

describe('useAppQuery query key stability', () => {
  let queryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('generates stable query key from deps array with same values', () => {
    const fetchFn = vi.fn().mockResolvedValue('data');

    // Render with deps array
    const { result, rerender } = renderHook(
      ({ deps }) => useAppQuery(fetchFn, deps, {}),
      {
        wrapper: createWrapper(queryClient),
        initialProps: { deps: ['filter1', 'option1'] },
      }
    );

    // Rerender with NEW array reference but SAME values
    rerender({ deps: ['filter1', 'option1'] });

    // Should only have been called once (same values = same query key)
    // Wait for initial fetch to complete
    return waitFor(() => {
      // Query should only execute once, not twice
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  it('generates new query key when deps values change', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');

    const { rerender } = renderHook(
      ({ deps }) => useAppQuery(fetchFn, deps, {}),
      {
        wrapper: createWrapper(queryClient),
        initialProps: { deps: ['filter1'] },
      }
    );

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    // Rerender with different values
    rerender({ deps: ['filter2'] });

    await waitFor(() => {
      // Should have been called twice (different values = different query key)
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  it('handles complex deps with objects (serialized correctly)', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');

    const { rerender } = renderHook(
      ({ deps }) => useAppQuery(fetchFn, deps, {}),
      {
        wrapper: createWrapper(queryClient),
        initialProps: { deps: [{ filter: 'test', value: 1 }] },
      }
    );

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    // Rerender with new object reference but same content
    rerender({ deps: [{ filter: 'test', value: 1 }] });

    // Should NOT trigger new fetch (same serialized value)
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// RETURN VALUE TESTS
// =============================================================================

describe('useAppQuery return value', () => {
  let queryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns ChartFrame-compatible status on success', async () => {
    const fetchFn = vi.fn().mockResolvedValue([1, 2, 3]);

    const { result } = renderHook(
      () => useAppQuery(fetchFn, ['test'], { initialData: [] }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.hasData).toBe(true);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.error).toBe(null);
  });

  it('returns error status on failure', async () => {
    const testError = new Error('Test error');
    // Mock 401 to skip retry logic (useAppQuery doesn't retry 401s)
    testError.response = { status: 401 };
    const fetchFn = vi.fn().mockRejectedValue(testError);

    const { result } = renderHook(
      () => useAppQuery(fetchFn, ['test'], { initialData: [] }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(testError);
  });

  it('returns initialData before fetch completes', () => {
    const fetchFn = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves

    const { result } = renderHook(
      () => useAppQuery(fetchFn, ['test'], { initialData: [] }),
      { wrapper: createWrapper(queryClient) }
    );

    // Should have initialData immediately
    expect(result.current.data).toEqual([]);
    expect(result.current.hasData).toBe(false); // Empty array = no real data
  });

  it('exposes TanStack query result via _tanstack', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');

    const { result } = renderHook(
      () => useAppQuery(fetchFn, ['test'], {}),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(result.current._tanstack).toBeDefined();
      expect(result.current._tanstack.isSuccess).toBe(true);
    });
  });
});

// =============================================================================
// ENABLED/DISABLED TESTS
// =============================================================================

describe('useAppQuery enabled behavior', () => {
  let queryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('does not fetch when enabled is false', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');

    const { result } = renderHook(
      () => useAppQuery(fetchFn, ['test'], { enabled: false }),
      { wrapper: createWrapper(queryClient) }
    );

    // Wait a bit to ensure no fetch happens
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.isIdle).toBe(true);
  });

  it('fetches when enabled becomes true', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');

    const { result, rerender } = renderHook(
      ({ enabled }) => useAppQuery(fetchFn, ['test'], { enabled }),
      {
        wrapper: createWrapper(queryClient),
        initialProps: { enabled: false },
      }
    );

    expect(fetchFn).not.toHaveBeenCalled();

    // Enable the query
    rerender({ enabled: true });

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('success');
    });
  });
});
