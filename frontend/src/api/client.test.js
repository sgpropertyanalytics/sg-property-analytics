import { __test__, unwrapEnvelope } from './client';

describe('api client queue and cache', () => {
  beforeEach(() => {
    __test__.resetQueueState();
  });

  it('skips aborted queued requests before execution', async () => {
    const controller = new AbortController();
    const execute = vi.fn(() => Promise.resolve('ok'));

    // Set to MAX_CONCURRENT_REQUESTS (8) to force queuing
    __test__.setActiveRequests(8);
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

describe('retry policy', () => {
  it('does not retry non-idempotent requests without explicit opt-in', () => {
    const error = { response: { status: 502 } };
    const config = { method: 'post' };
    expect(__test__.isRetryableError(error, config)).toBe(false);
  });

  it('retries gateway errors for idempotent requests', () => {
    const error = { response: { status: 503 } };
    const config = { method: 'get' };
    expect(__test__.isRetryableError(error, config)).toBe(true);
  });
});

describe('envelope unwrap regression', () => {
  /**
   * REGRESSION TEST: Ensure no .data.data patterns sneak into the codebase
   *
   * The apiClient interceptor unwraps the API envelope automatically.
   * After unwrapping: response.data = the inner data (not the envelope)
   *
   * CORRECT: response.data (the inner data)
   * WRONG:   response.data.data (would be undefined)
   *
   * This test scans source files to catch accidental double-unwrap patterns.
   */
  it('should not have response.data.data patterns in components (apiClient unwraps automatically)', async () => {
    const { execSync } = await import('child_process');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    // Get __dirname equivalent in ES modules
    const currentFile = fileURLToPath(import.meta.url);
    const srcDir = path.resolve(path.dirname(currentFile), '..');

    // Grep for .data?.data or .data.data patterns
    // Exclude: test files, comments, Chart.js patterns (chart.data.datasets)
    let grepResult = '';
    try {
      grepResult = execSync(
        `grep -rn "\\.data\\?\\.data\\|response\\.data\\.data" "${srcDir}" ` +
        `--include="*.jsx" --include="*.js" ` +
        `| grep -v "\\.test\\." ` +
        `| grep -v "chart\\.data\\.datasets" ` +
        `| grep -v "// " ` +
        `| grep -v "\\* " ` +
        `| grep -v "JSDoc" || true`,
        { encoding: 'utf-8' }
      );
    } catch {
      // grep returns non-zero if no matches, which is what we want
      grepResult = '';
    }

    // Filter out false positives
    const violations = grepResult
      .split('\n')
      .filter(line => line.trim())
      // Exclude documentation examples
      .filter(line => !line.includes('adapters/aggregate/index.js'))
      // Exclude the test file itself
      .filter(line => !line.includes('client.test.js'))
      // Exclude Chart.js data access (chart.data.datasets)
      .filter(line => !line.includes('chart.data.'));

    if (violations.length > 0) {
      console.error('Found .data.data patterns that should use .data instead:');
      violations.forEach(v => console.error(`  ${v}`));
    }

    expect(violations).toHaveLength(0);
  });
});
