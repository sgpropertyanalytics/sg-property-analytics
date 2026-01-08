import Container from '../primitives/Container';

export function LandingSectionHeader({ eyebrow, title, muted, rightSlot }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        {eyebrow ? (
          <div className="font-mono text-data-xs uppercase tracking-[0.18em] text-black/60">
            {eyebrow}
          </div>
        ) : null}
        <div className="mt-2 font-display text-2xl md:text-3xl font-bold tracking-tighter text-black glitch-hover cursor-default">
          {title}{' '}
          {muted ? <span className="text-black/60">{muted}</span> : null}
        </div>
      </div>
      {rightSlot ? <div className="hidden md:block">{rightSlot}</div> : null}
    </div>
  );
}

export function LandingMonoPill({ children, leftDot = null }) {
  return (
    <div className="inline-flex items-center gap-2 border border-black/10 px-3 py-1.5 font-mono text-data-xs uppercase tracking-[0.18em] text-black/60">
      {leftDot ? <span className="flex h-2 w-2 items-center justify-center">{leftDot}</span> : null}
      <span>{children}</span>
    </div>
  );
}

export function LandingSectionDivider() {
  return (
    <Container padding={false} className="relative h-px bg-black/10">
      {/* Aerospace-style decorative markers */}
      <div className="absolute left-1/4 -top-1 w-2 h-2 border border-black/15 bg-mono-canvas rotate-45" />
      <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 border border-black/20 bg-mono-canvas rotate-45" />
      <div className="absolute right-1/4 -top-1 w-2 h-2 border border-black/15 bg-mono-canvas rotate-45" />
    </Container>
  );
}

