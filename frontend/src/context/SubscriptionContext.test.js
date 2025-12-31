import { describe, it, expect } from 'vitest';
import { unwrapSubscriptionResponse } from './SubscriptionContext';

describe('unwrapSubscriptionResponse', () => {
  describe('enveloped response (v3 contract)', () => {
    it('extracts enterprise tier from enveloped response', () => {
      // Backend returns: {data: {tier: "enterprise", ...}, meta: {...}}
      // Axios wraps this in response.data
      const axiosResponseData = {
        data: {
          tier: 'enterprise',
          subscribed: true,
          ends_at: '2025-12-31T00:00:00Z',
          _debug_user_id: 123,
          _debug_email: 'user@example.com',
        },
        meta: {
          requestId: 'req_abc123',
          elapsedMs: 15.5,
          apiVersion: 'v3',
        },
      };

      const result = unwrapSubscriptionResponse(axiosResponseData);

      expect(result).toEqual({
        tier: 'enterprise',
        subscribed: true,
        ends_at: '2025-12-31T00:00:00Z',
        _debug_user_id: 123,
        _debug_email: 'user@example.com',
      });
      expect(result.tier).toBe('enterprise');
      expect(result.subscribed).toBe(true);
    });

    it('extracts free tier from enveloped response', () => {
      const axiosResponseData = {
        data: {
          tier: 'free',
          subscribed: false,
          ends_at: null,
        },
        meta: {
          requestId: 'req_xyz789',
          elapsedMs: 10.2,
          apiVersion: 'v3',
        },
      };

      const result = unwrapSubscriptionResponse(axiosResponseData);

      expect(result.tier).toBe('free');
      expect(result.subscribed).toBe(false);
      expect(result.ends_at).toBeNull();
    });

    it('extracts premium tier from enveloped response', () => {
      const axiosResponseData = {
        data: {
          tier: 'premium',
          subscribed: true,
          ends_at: '2025-06-15T00:00:00Z',
        },
        meta: {
          requestId: 'req_def456',
          elapsedMs: 12.3,
          apiVersion: 'v3',
        },
      };

      const result = unwrapSubscriptionResponse(axiosResponseData);

      expect(result.tier).toBe('premium');
      expect(result.subscribed).toBe(true);
    });
  });

  describe('flat response (legacy)', () => {
    it('handles flat response without envelope', () => {
      // Legacy format: {tier: "enterprise", subscribed: true, ...}
      const flatResponseData = {
        tier: 'enterprise',
        subscribed: true,
        ends_at: '2025-12-31T00:00:00Z',
      };

      const result = unwrapSubscriptionResponse(flatResponseData);

      expect(result.tier).toBe('enterprise');
      expect(result.subscribed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns null for null input', () => {
      const result = unwrapSubscriptionResponse(null);
      expect(result).toBeNull();
    });

    it('returns null for undefined input', () => {
      const result = unwrapSubscriptionResponse(undefined);
      expect(result).toBeNull();
    });

    it('returns null for empty object', () => {
      const result = unwrapSubscriptionResponse({});
      expect(result).toBeNull();
    });

    it('returns null for object without tier', () => {
      const result = unwrapSubscriptionResponse({ subscribed: true });
      expect(result).toBeNull();
    });

    it('returns null for nested object without tier in data', () => {
      const result = unwrapSubscriptionResponse({
        data: { subscribed: true },
        meta: {},
      });
      expect(result).toBeNull();
    });
  });

  describe('real-world bug scenario', () => {
    it('enterprise user is NOT downgraded to free by misreading envelope', () => {
      // This is the bug we fixed: reading response.data.tier when tier is in response.data.data
      const axiosResponseData = {
        data: {
          tier: 'enterprise',
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

      // Before the fix, this would have been undefined (defaulting to 'free')
      // After the fix, this correctly reads 'enterprise'
      expect(result.tier).not.toBe('free');
      expect(result.tier).toBe('enterprise');
    });
  });
});
