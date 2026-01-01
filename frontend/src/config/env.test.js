import { describe, it, expect } from 'vitest';
import { getEnv, MODE, IS_DEV, IS_PROD, IS_TEST, ENABLE_PERF_LOGGER } from './env';

describe('env module', () => {
  it('mirrors Vite env metadata', () => {
    const env = getEnv();

    expect(env.MODE).toBe(import.meta.env.MODE);
    expect(env.IS_DEV).toBe(import.meta.env.DEV);
    expect(env.IS_PROD).toBe(import.meta.env.PROD);
    expect(env.IS_TEST).toBe(env.MODE === 'test');
  });

  it('exposes stable flags', () => {
    expect(MODE).toBe(import.meta.env.MODE);
    expect(IS_DEV).toBe(import.meta.env.DEV);
    expect(IS_PROD).toBe(import.meta.env.PROD);
    expect(IS_TEST).toBe(MODE === 'test');
    expect(ENABLE_PERF_LOGGER).toBe(
      import.meta.env.DEV && import.meta.env.VITE_ENABLE_PERF_LOGGER !== 'false'
    );
  });
});
