import { describe, it, expect } from 'vitest';
import { unwrapAccessResponse } from './AccessContext';

describe('unwrapAccessResponse', () => {
  describe('enveloped response', () => {
    it('extracts authenticated access from neutral payload', () => {
      const axiosResponseData = {
        data: {
          accessLevel: 'authenticated',
          subscribed: true,
          ends_at: '2025-12-31T00:00:00Z',
        },
      };

      const result = unwrapAccessResponse(axiosResponseData);

      expect(result).toEqual({
        accessLevel: 'authenticated',
        subscribed: true,
        ends_at: '2025-12-31T00:00:00Z',
      });
    });

    it('extracts anonymous access from neutral payload', () => {
      const axiosResponseData = {
        data: {
          accessLevel: 'anonymous',
          subscribed: false,
          ends_at: null,
        },
      };

      const result = unwrapAccessResponse(axiosResponseData);

      expect(result.accessLevel).toBe('anonymous');
      expect(result.subscribed).toBe(false);
      expect(result.ends_at).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns safe default for null input', () => {
      const result = unwrapAccessResponse(null);
      expect(result.accessLevel).toBe('authenticated');
      expect(result.subscribed).toBe(true);
    });

    it('returns safe default for undefined input', () => {
      const result = unwrapAccessResponse(undefined);
      expect(result.accessLevel).toBe('authenticated');
      expect(result.subscribed).toBe(true);
    });

    it('returns safe default for object without access fields', () => {
      const result = unwrapAccessResponse({ subscribed: true });
      expect(result.accessLevel).toBe('authenticated');
      expect(result.subscribed).toBe(true);
    });
  });
});
