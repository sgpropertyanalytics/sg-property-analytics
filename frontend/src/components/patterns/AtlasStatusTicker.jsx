import { useEffect, useState } from 'react';

/**
 * AtlasStatusTicker - Full-width status bar at top of hero
 * 3-part layout: left status | center label | right status
 * Inspired by Atlas reference design (atlas-olive-sigma.vercel.app)
 */
export default function AtlasStatusTicker() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const formatTime = (d) => {
    try {
      return d.toLocaleTimeString('en-SG', {
        timeZone: 'Asia/Singapore',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return d.toLocaleTimeString();
    }
  };

  return (
    <div
      className="w-full border-b"
      style={{
        borderColor: 'var(--color-atlas-border)',
        backgroundColor: 'var(--color-atlas-parchment)',
      }}
    >
      <div className="flex items-center justify-between px-4 lg:px-8" style={{ height: 'var(--space-8)' }}>
        {/* Left: Status text */}
        <div
          className="font-mono text-data-xs uppercase tracking-[0.18em]"
          style={{ color: 'var(--color-atlas-text)', opacity: 0.6 }}
        >
          URA DATA SYNC: ACTIVE
        </div>

        {/* Center: Label */}
        <div
          className="font-mono text-data-xs uppercase tracking-[0.18em] hidden md:block"
          style={{ color: 'var(--color-atlas-text)', opacity: 0.8 }}
        >
          SINGAPORE PROPERTY ANALYTICS
        </div>

        {/* Right: Timestamp + Live indicator */}
        <div className="flex items-center gap-4">
          <span
            className="font-mono text-data-xs uppercase tracking-[0.18em] tabular-nums hidden sm:inline"
            style={{ color: 'var(--color-atlas-text)', opacity: 0.6 }}
          >
            SGT {formatTime(time)}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full bg-emerald-500 opacity-70 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 bg-emerald-600 rounded-full" />
            </span>
            <span
              className="font-mono text-data-xs uppercase tracking-[0.18em]"
              style={{ color: 'var(--color-atlas-text)', opacity: 0.6 }}
            >
              LIVE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
