import { __test__, unwrapEnvelope } from './client';

describe('api client queue and cache', () => {
  beforeEach(() => {
    __test__.resetQueueState();
  });

  it('skips aborted queued requests before execution', async () => {
    const controller = new AbortController();
    const execute = vi.fn(() => Promise.resolve('ok'));

    __test__.setActiveRequests(4);
    const promise = __test__.queueRequest(execute, { signal: controller.signal });
    controller.abort();

    __test__.setActiveRequests(0);
    __test__.processQueue();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('caps cache size to prevent unbounded growth', () => {
    const max = __test__.getMaxCacheEntries();
    for (let i = 0; i < max + 1; i += 1) {
      __test__.addCacheEntry(`key-${i}`, i);
    }
    expect(__test__.apiCache.size).toBe(max);
  });
});

describe('unwrapEnvelope', () => {
  it('unwraps api_contract envelope with data and meta', () => {
    const body = {
      data: { kpis: [{ kpi_id: 'test', value: 42 }] },
      meta: { requestId: 'abc123', elapsedMs: 50 },
    };

    const result = unwrapEnvelope(body);

    expect(result.data).toEqual({ kpis: [{ kpi_id: 'test', value: 42 }] });
    expect(result.meta).toEqual({ requestId: 'abc123', elapsedMs: 50 });
  });

  it('allows callers to access kpis directly', () => {
    const body = {
      data: { kpis: [{ kpi_id: 'median_psf', value: 1772 }] },
      meta: { requestId: 'req_123' },
    };

    const result = unwrapEnvelope(body);

    // Frontend code uses response.data.kpis - this is the critical assertion
    expect(result.data.kpis).toBeDefined();
    expect(result.data.kpis[0].kpi_id).toBe('median_psf');
  });

  it('preserves response without envelope (no data key)', () => {
    const body = { items: [1, 2, 3] };

    const result = unwrapEnvelope(body);

    expect(result.data).toEqual({ items: [1, 2, 3] });
    expect(result.meta).toBeUndefined();
  });

  it('handles null/undefined body', () => {
    expect(unwrapEnvelope(null)).toEqual({ data: null, meta: undefined });
    expect(unwrapEnvelope(undefined)).toEqual({ data: undefined, meta: undefined });
  });

  it('handles primitive body', () => {
    expect(unwrapEnvelope('string')).toEqual({ data: 'string', meta: undefined });
    expect(unwrapEnvelope(42)).toEqual({ data: 42, meta: undefined });
  });
});
