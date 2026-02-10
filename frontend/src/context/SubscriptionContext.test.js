import { describe, it, expect } from 'vitest';
import { unwrapSubscriptionResponse } from './SubscriptionContext';

describe('unwrapSubscriptionResponse', () => {
  describe('enveloped response (v3 contract)', () => {
    it('extracts authenticated access from enveloped legacy billing response', () => {
      const axiosResponseData = {
        data: {
          tier: 'premium',
          subscribed: true,
          ends_at: '2025-12-31T00:00:00Z',
        },
        meta: {
          requestId: 'req_abc123',
          elapsedMs: 15.5,
          apiVersion: 'v3',
        },
      };

      const result = unwrapSubscriptionResponse(axiosResponseData);

      expect(result).toEqual({
        accessLevel: 'authenticated',
        tier: 'premium',
        subscribed: true,
        ends_at: '2025-12-31T00:00:00Z',
      });
      expect(result.accessLevel).toBe('authenticated');
      expect(result.tier).toBe('premium'); // legacy alias preserved
      expect(result.subscribed).toBe(true);
    });

    it('extracts authenticated access from legacy non-entitled label response', () => {
      const axiosResponseData = {
        data: {
          tier: 'free',
          subscribed: true,
          ends_at: null,
        },
      };

      const result = unwrapSubscriptionResponse(axiosResponseData);

      expect(result.accessLevel).toBe('authenticated');
      expect(result.tier).toBe('free');
      expect(result.subscribed).toBe(true);
      expect(result.ends_at).toBeNull();
    });

    it('extracts authenticated access from neutral response fields', () => {
      const axiosResponseData = {
        data: {
          accessLevel: 'authenticated',
          subscribed: true,
          ends_at: null,
        },
      };

      const result = unwrapSubscriptionResponse(axiosResponseData);

      expect(result.accessLevel).toBe('authenticated');
      expect(result.tier).toBe('free');
      expect(result.subscribed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns safe default for null input', () => {
      const result = unwrapSubscriptionResponse(null);
      expect(result.accessLevel).toBe('authenticated');
      expect(result.tier).toBe('free');
    });

    it('returns safe default for undefined input', () => {
      const result = unwrapSubscriptionResponse(undefined);
      expect(result.accessLevel).toBe('authenticated');
      expect(result.tier).toBe('free');
    });

    it('returns safe default for object without access fields', () => {
      const result = unwrapSubscriptionResponse({ subscribed: true });
      expect(result.accessLevel).toBe('authenticated');
      expect(result.tier).toBe('free');
    });
  });

  describe('regression scenario', () => {
    it('does not downgrade authenticated access by misreading envelope', () => {
      const axiosResponseData = {
        data: {
          tier: 'premium',
          subscribed: true,
          ends_at: null,
        },
        meta: {
          requestId: 'req_123',
          elapsedMs: 20,
          apiVersion: 'v3',
        },
      };

      const result = unwrapSubscriptionResponse(axiosResponseData);

      expect(result.accessLevel).toBe('authenticated');
      expect(result.tier).toBe('premium');
    });
  });
});
