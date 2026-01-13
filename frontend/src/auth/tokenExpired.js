// Centralized token-expired emitter with debounce + auth URL guard.
// Single policy used by API client + non-axios fetch callers.

// ===== Auth URL Detection =====
// Handles both relative ("/auth/...") and absolute ("https://.../api/auth/...") URLs
const isAuthUrl = (url = '') => url.includes('/api/auth/') || url.includes('/auth/');

// ===== Token Expired Debounce =====
// Prevents spam during boot when multiple parallel requests hit 401
let lastTokenExpiredAt = 0;
const TOKEN_EXPIRED_DEBOUNCE_MS = 1500;

export const emitTokenExpiredOnce = (url) => {
  if (isAuthUrl(url)) {
    return;
  }

  const now = Date.now();
  if (now - lastTokenExpiredAt < TOKEN_EXPIRED_DEBOUNCE_MS) {
    return;
  }
  lastTokenExpiredAt = now;
  window.dispatchEvent(new CustomEvent('auth:token-expired', { detail: { url } }));
};

