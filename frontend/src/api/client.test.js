import { __test__ } from './client';

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
