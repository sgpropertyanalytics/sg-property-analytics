import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Command,
  Database,
  Globe,
  Lock,
  Radar,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';
import {
  REGIONAL_PRICING_DATA,
  VOLUME_TREND_DATA,
  DISTRICT_GROWTH_DATA,
  MOMENTUM_GRID_DATA,
  MAX_DISTRICT_PRICE,
} from './landingPreviewData';

// REAM Design System: Bond Paper + Industrial
const CANVAS = '#F5F5F4'; // Warm bond paper (stone-100)
const INK = '#1C1917'; // Warm stone-900
const ACCENT = '#FF4F00'; // Safety orange

function formatSgClock(date) {
  try {
    return date.toLocaleTimeString('en-SG', {
      timeZone: 'Asia/Singapore',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return date.toLocaleTimeString();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function useInterval(callback, delayMs) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs == null) return;
    const id = window.setInterval(() => callbackRef.current(), delayMs);
    return () => window.clearInterval(id);
  }, [delayMs]);
}

function SectionTitle({ eyebrow, title, muted, rightSlot }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        {eyebrow ? (
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#57534E]">
            {eyebrow}
          </div>
        ) : null}
        <div className="mt-2 font-display text-2xl md:text-3xl font-bold tracking-tighter text-[#1C1917] glitch-hover cursor-default">
          {title}{' '}
          {muted ? <span className="text-[#57534E]">{muted}</span> : null}
        </div>
      </div>
      {rightSlot ? <div className="hidden md:block">{rightSlot}</div> : null}
    </div>
  );
}

function MonoPill({ children, leftDot = null }) {
  return (
    <div className="inline-flex items-center gap-2 border border-[#E7E5E4] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#57534E]">
      {leftDot ? <span className="flex h-2 w-2 items-center justify-center">{leftDot}</span> : null}
      <span>{children}</span>
    </div>
  );
}

function SectionDivider() {
  return (
    <div className="relative h-px bg-[#E7E5E4] max-w-7xl mx-auto">
      {/* Industrial decorative markers */}
      <div className="absolute left-1/4 -top-1 w-2 h-2 border border-[#D6D3D1] bg-[#F5F5F4] rotate-45" />
      <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 border border-[#D6D3D1] bg-[#F5F5F4] rotate-45" />
      <div className="absolute right-1/4 -top-1 w-2 h-2 border border-[#D6D3D1] bg-[#F5F5F4] rotate-45" />
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full bg-emerald-500 opacity-70 animate-ping" />
      <span
        className="relative inline-flex h-2 w-2 bg-emerald-600 rounded-full"
        style={{ boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)' }}
      />
    </span>
  );
}

function AnimatedNumber({ value, format = (n) => String(n), durationMs = 1100 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const start = performance.now();
    const from = 0;
    const to = value;

    let raf = 0;
    const tick = (now) => {
      const t = clamp((now - start) / durationMs, 0, 1);
      const eased = easeOutCubic(t);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isInView, value, durationMs]);

  return (
    <div ref={ref} className="font-mono tabular-nums">
      {format(display)}
    </div>
  );
}

function useKeyboardShortcut({ key, ctrlOrMeta = false, onTrigger }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      const pressed = e.key?.toLowerCase() === key.toLowerCase();
      const comboOk = ctrlOrMeta ? (e.ctrlKey || e.metaKey) : true;
      if (!pressed || !comboOk) return;
      e.preventDefault();
      onTrigger?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, ctrlOrMeta, onTrigger]);
}

function CommandBar({ onExecute }) {
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(
    () => [
      'view market data',
      'open market overview',
      'scan district d09 resale 2br',
      'compare ccr vs ocr psf 12m',
      'stream latest resale prints',
      'validate ura pipeline health',
      'find mispricing: 721 sqft > $2,480 psf',
    ],
    [],
  );

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
  }, [suggestions, value]);

  useKeyboardShortcut({
    key: 'k',
    ctrlOrMeta: true,
    onTrigger: () => {
      inputRef.current?.focus();
      setIsOpen(true);
    },
  });

  const execute = (cmd) => {
    onExecute?.(cmd);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(1, filtered.length));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      execute(filtered[activeIndex] ?? value);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      {/* REAM Command Bar - White with brutalist shadow */}
      <div
        className="flex items-stretch border border-[#1C1917] bg-white p-1"
        style={{ boxShadow: '8px 8px 0px 0px rgba(28,25,23,0.1)' }}
      >
        <div className="flex items-center gap-2 pl-4 pr-2">
          <Command className="h-4 w-4 text-[#57534E]" />
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setIsOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a district or project..."
          className="flex-1 min-w-0 p-3 font-mono text-sm tracking-wide text-[#1C1917] placeholder:text-[#A8A29E] bg-transparent outline-none"
        />
        <button
          type="button"
          onClick={() => execute(value || filtered[0] || '')}
          className="group flex items-center gap-2 px-6 py-3 bg-[#1C1917] hover:bg-[#333] focus:outline-none"
        >
          <span className="font-mono text-xs text-white">ENTER TERMINAL</span>
          <ArrowRight className="h-4 w-4 text-white group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && filtered.length ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute left-0 right-0 mt-2 border border-[#E7E5E4] bg-white"
            style={{ boxShadow: '4px 4px 0px 0px rgba(28,25,23,0.05)' }}
          >
            {filtered.map((s, i) => (
              <button
                key={s}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  setValue(s);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-[#F5F5F4] border-t first:border-t-0 border-[#E7E5E4] ${
                  i === activeIndex ? 'bg-[#F5F5F4]' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-[#57534E] truncate">{s}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#A8A29E]" />
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TerminalOutput({ lines, isLive = true }) {
  const [cursorOn, setCursorOn] = useState(true);
  const [visibleLines, setVisibleLines] = useState([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [currentTyping, setCurrentTyping] = useState('');
  const containerRef = useRef(null);

  useInterval(() => setCursorOn((v) => !v), 530);

  useEffect(() => {
    if (currentLineIndex >= lines.length) return;

    const currentLine = lines[currentLineIndex];
    
    if (currentCharIndex < currentLine.length) {
      const timeout = setTimeout(() => {
        setCurrentTyping(currentLine.slice(0, currentCharIndex + 1));
        setCurrentCharIndex((i) => i + 1);
      }, 18 + Math.random() * 12);
      return () => clearTimeout(timeout);
    } else {
      const timeout = setTimeout(() => {
        setVisibleLines((prev) => [...prev, currentLine]);
        setCurrentTyping('');
        setCurrentCharIndex(0);
        setCurrentLineIndex((i) => i + 1);
      }, 150 + Math.random() * 100);
      return () => clearTimeout(timeout);
    }
  }, [currentLineIndex, currentCharIndex, lines]);



  return (
    <div
      ref={containerRef}
      className="font-mono text-xs leading-relaxed text-[#57534E] h-[240px] overflow-hidden"
    >
      {visibleLines.map((line, i) => (
        <div key={i} className={line.startsWith('→') ? 'text-[#10B981]' : 'text-[#57534E]'}>
          {line}
        </div>
      ))}
      {currentTyping && (
        <div className={currentTyping.startsWith('→') ? 'text-[#10B981]' : 'text-[#57534E]'}>
          {currentTyping}
          <span className={`inline-block ${cursorOn ? 'opacity-100' : 'opacity-0'}`}>_</span>
        </div>
      )}
      {currentLineIndex >= lines.length && (
        <div className="text-[#10B981]">
          $ ready<span className={`inline-block ${cursorOn ? 'opacity-100' : 'opacity-0'}`}>_</span>
        </div>
      )}
    </div>
  );
}

function ParticleGlobe() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const dragRef = useRef({ isDown: false, x: 0, y: 0 });

  const stateRef = useRef({
    t: 0,
    rotY: 0,
    rotX: 0.2,
    velY: 0.004,
    velX: 0.0,
    targetVelY: 0.004,
    targetVelX: 0.0,
    mouseNudgeX: 0,
    mouseNudgeY: 0,
  });

  const points = useMemo(() => {
    const count = 980;
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i += 1) {
      const y = 1 - (i / (count - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = golden * i;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      const jitter = (Math.sin(i * 12.73) + Math.cos(i * 3.17)) * 0.002;
      pts.push({
        x: x + jitter,
        y: y + jitter,
        z: z + jitter,
        seed: i,
        kind: i % 37 === 0 ? 'beacon' : 'dot',
      });
    }
    return pts;
  }, []);

  const arcs = useMemo(() => {
    const picks = [];
    for (let i = 0; i < 26; i += 1) {
      const a = (i * 37) % points.length;
      const b = (i * 97 + 113) % points.length;
      picks.push([points[a], points[b]]);
    }
    return picks;
  }, [points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const project = (v, w, h, zScale) => {
      const perspective = 1 / (1 + (v.z * 0.9 + 1) * 0.55);
      return {
        x: w / 2 + v.x * zScale * perspective,
        y: h / 2 + v.y * zScale * perspective,
        p: perspective,
        z: v.z,
      };
    };

    const rotate = (p, rotX, rotY) => {
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = p.y * sinX + z1 * cosX;

      return { x: x1, y: y2, z: z2 };
    };

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const s = stateRef.current;

      s.velY = lerp(s.velY, s.targetVelY, 0.06);
      s.velX = lerp(s.velX, s.targetVelX, 0.06);
      s.rotY += s.velY + s.mouseNudgeX * 0.0013;
      s.rotX += s.velX + s.mouseNudgeY * 0.0011;
      s.rotX = clamp(s.rotX, -0.9, 0.9);
      s.mouseNudgeX = lerp(s.mouseNudgeX, 0, 0.08);
      s.mouseNudgeY = lerp(s.mouseNudgeY, 0, 0.08);
      s.t += 1;

      ctx.clearRect(0, 0, w, h);

      const globeRadius = Math.min(w, h) * 0.58;

      for (const [a, b] of arcs) {
        const steps = 14;
        const path = [];

        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const x = lerp(a.x, b.x, t);
          const y = lerp(a.y, b.y, t);
          const z = lerp(a.z, b.z, t);
          const len = Math.sqrt(x * x + y * y + z * z) || 1;
          const n = { x: x / len, y: y / len, z: z / len };
          const lifted = { x: n.x * 1.02, y: n.y * 1.02, z: n.z * 1.02 };
          const r = rotate(lifted, s.rotX, s.rotY);
          path.push(project(r, w, h, globeRadius));
        }

        ctx.beginPath();
        for (let i = 0; i < path.length; i += 1) {
          const pt = path[i];
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        // REAM: Warm stone color for arcs (drawn on bond paper)
        ctx.strokeStyle = 'rgba(120,113,108,0.25)'; // stone-500
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const rendered = [];
      for (const p of points) {
        const r = rotate(p, s.rotX, s.rotY);
        rendered.push({
          ...r,
          kind: p.kind,
          seed: p.seed,
        });
      }

      rendered.sort((a, b) => a.z - b.z);

      for (const p of rendered) {
        const pr = project(p, w, h, globeRadius);
        const alpha = clamp((pr.z + 1.2) / 2.2, 0, 1);
        const base = 0.22 + alpha * 0.48;
        const size = 1.6;
        const pulse = 1;

        ctx.beginPath();
        ctx.arc(pr.x, pr.y, size * pr.p * pulse, 0, Math.PI * 2);
        // REAM: Warm stone dots (looks drawn on paper)
        ctx.fillStyle = `rgba(87,83,78,${base})`; // stone-600
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [arcs, points]);

  const onMouseMove = (e) => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;

    const s = stateRef.current;
    s.mouseNudgeX = nx;
    s.mouseNudgeY = ny;

    if (dragRef.current.isDown) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      s.rotY += dx * 0.006;
      s.rotX += dy * 0.004;
    }
  };

  const onMouseDown = (e) => {
    dragRef.current.isDown = true;
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
    stateRef.current.targetVelY = 0.001;
  };

  const onMouseUp = () => {
    dragRef.current.isDown = false;
    stateRef.current.targetVelY = 0.004;
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full aspect-[1/1] cursor-crosshair"
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onMouseLeave={onMouseUp}
      onMouseUp={onMouseUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="absolute top-4 right-4 text-right">
        <div className="font-mono text-[10px] uppercase tracking-wider text-black/60">
          GLOBAL_NETWORK
        </div>
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">LIVE</span>
        </div>
      </div>
    </div>
  );
}



function StatusPanel() {
  const [clock, setClock] = useState(() => formatSgClock(new Date()));
  const [txCount, setTxCount] = useState(103247);
  const [integrity, setIntegrity] = useState(99.2);
  const [syncAgo, setSyncAgo] = useState(0);
  
  useInterval(() => setClock(formatSgClock(new Date())), 1000);
  
  useEffect(() => {
    const id = setInterval(() => {
      setTxCount(prev => prev + Math.floor(Math.random() * 3) + 1);
      setIntegrity(prev => {
        const delta = (Math.random() - 0.5) * 0.1;
        return Math.min(99.9, Math.max(99.0, prev + delta));
      });
      setSyncAgo(prev => (prev + 2) % 60);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="border border-[#E7E5E4] bg-white h-[240px] flex flex-col">
      <div className="px-3 py-2 border-b border-[#E7E5E4] flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#57534E]">
          System Status
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#57534E] tabular-nums">
          SG {clock}
        </div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-3 flex-1">
        <div className="border border-[#E7E5E4] px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A8A29E]">URA LINK</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[#10B981]">●</span>
            <div className="font-mono text-xs text-[#1C1917]">ONLINE</div>
          </div>
        </div>
        <div className="border border-[#E7E5E4] px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A8A29E]">INTEGRITY</div>
          <div className="mt-1 font-mono text-xs text-[#1C1917] tabular-nums transition-all duration-300">{integrity.toFixed(1)}% VERIFIED</div>
        </div>
        <div className="border border-[#E7E5E4] px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A8A29E]">TRANSACTIONS</div>
          <div className="mt-1 font-mono text-xs text-[#1C1917] tabular-nums transition-all duration-300">{txCount.toLocaleString('en-SG')}</div>
        </div>
        <div className="border border-[#E7E5E4] px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A8A29E]">PIPELINE</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full bg-[#10B981] opacity-50 animate-ping" style={{ animationDuration: '2s' }} />
              <span className="relative inline-flex h-2 w-2 bg-[#10B981]" />
            </span>
            <div className="font-mono text-xs text-[#1C1917]">STREAMING</div>
          </div>
        </div>
      </div>
      <div className="px-3 py-2 border-t border-[#E7E5E4] flex items-center justify-between mt-auto">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A8A29E]">
          LAST SYNC: {syncAgo}s ago
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1 h-1 bg-[#10B981] animate-pulse" />
          <div className="w-1 h-1 bg-[#10B981] animate-pulse" style={{ animationDelay: '0.2s' }} />
          <div className="w-1 h-1 bg-[#10B981] animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}

function DotMatrixMap() {
  const cols = 44;
  const rows = 18;

  const cells = useMemo(() => {
    const dots = [];
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        // Rough world silhouette (intentionally abstract)
        const nx = x / (cols - 1);
        const ny = y / (rows - 1);

        const blob1 = Math.exp(-((nx - 0.26) ** 2) / 0.018 - ((ny - 0.45) ** 2) / 0.06);
        const blob2 = Math.exp(-((nx - 0.55) ** 2) / 0.04 - ((ny - 0.42) ** 2) / 0.07);
        const blob3 = Math.exp(-((nx - 0.77) ** 2) / 0.03 - ((ny - 0.52) ** 2) / 0.05);
        const land = blob1 + blob2 + blob3;

        // Singapore pin neighborhood
        const sg = Math.exp(-((nx - 0.64) ** 2) / 0.0008 - ((ny - 0.69) ** 2) / 0.003);

        const v = land * 0.85 + sg * 2;
        const alpha = clamp(v, 0, 1);
        const phase = ((x * 17 + y * 31) % 97) / 97;
        const jitter = Math.sin(x * 1.35 + y * 0.92) * 0.55 + Math.cos(x * 0.62 - y * 0.28) * 0.35;
        const shift = clamp(jitter, -0.9, 0.9) * (0.25 + alpha * 0.75);

        dots.push({
          key: `${x}-${y}`,
          alpha,
          isSg: sg > 0.35,
          delay: phase * 1.9,
          dur: 3.0 + phase * 2.2,
          shift,
        });
      }
    }
    return dots;
  }, []);

  return (
    <div
      className="relative border border-black/10 bg-white/90 backdrop-blur-sm"
      style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)' }}
    >
      <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
      <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
      <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
      <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
      <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
      <div className="px-3 py-2 border-b border-black/05 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">MAP</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">SINGAPORE FOCUS</div>
      </div>
      <div className="p-3">
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {cells.map((c) => (
            <div
              key={c.key}
              className={`h-[3px] w-full ${c.isSg ? 'landingV3-dotSg' : 'landingV3-dot'}`}
              style={{
                backgroundColor: c.isSg ? 'rgba(0,0,0,0.55)' : `rgba(0,0,0,${0.06 + c.alpha * 0.18})`,
                '--landingV3-dotShift': `${c.shift.toFixed(2)}px`,
                '--landingV3-dotDur': `${c.dur.toFixed(2)}s`,
                '--landingV3-dotDelay': `${c.delay.toFixed(2)}s`,
              }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">
            COORD: 1.3521N / 103.8198E
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">
            GRID: DOT-MATRIX
          </div>
        </div>
      </div>
    </div>
  );
}

function CapabilityCard({ icon: Icon, title, desc, code }) {
  return (
    <div
      className="group relative border border-black/10 bg-white/90 backdrop-blur-sm p-4 hover:border-black/20 transition-all hover:shadow-sm scan-line-hover"
      style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)' }}
    >
      {/* HUD corner ticks */}
      <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
      <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
      {/* Ruler tick marks */}
      <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
      <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
      <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">{code}</div>
          <div className="mt-2 text-base font-bold tracking-tight text-black">{title}</div>
        </div>
        <div className="border border-black/10 p-2">
          <Icon className="h-4 w-4 text-black/60" />
        </div>
      </div>
      <div className="mt-2 text-sm leading-relaxed text-black/60">{desc}</div>
      <div className="mt-4 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">INSPECT</div>
        <ChevronRight className="h-4 w-4 text-black/60 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
}

function InsightRow({ label, value, delta }) {
  const isNegative = delta?.startsWith('-');
  return (
    <div className="flex items-center justify-between gap-6 border-t border-black/05 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">{label}</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="font-mono text-xs text-black/60 tabular-nums">{value}</div>
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] tabular-nums"
          style={{ color: isNegative ? '#FF5500' : 'rgba(0,0,0,0.3)' }}
        >
          {delta}
        </div>
      </div>
    </div>
  );
}

// ===== CHART PREVIEW COMPONENTS =====

function TerminalChartWrapper({ title, subtitle, children, showLive = false, locked = false }) {
  return (
    <div
      className="relative border border-black/10 bg-white/90 backdrop-blur-sm scan-line-hover"
      style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)' }}
    >
      {/* HUD corners */}
      <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
      <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
      {/* Ruler ticks */}
      <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
      <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
      <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
      {/* Header */}
      <div className="px-4 py-3 border-b border-black/05 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">{title}</div>
          {subtitle && (
            <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-black/25">{subtitle}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showLive && (
            <>
              <LiveDot />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-600">LIVE</span>
            </>
          )}
          {locked && (
            <Lock className="h-3 w-3 text-black/60" />
          )}
        </div>
      </div>
      {/* Content */}
      <div className="relative p-4 cursor-crosshair">
        {children}
        {locked && (
          <div className="absolute inset-0 backdrop-blur-sm bg-white/60 flex items-center justify-center">
            <div className="text-center">
              <Lock className="h-5 w-5 text-black/60 mx-auto" />
              <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">
                AUTH_REQUIRED
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Regional Pricing Preview - simplified beads visualization
function RegionalPricingPreview() {
  return (
    <div className="space-y-4">
      {REGIONAL_PRICING_DATA.map((region) => (
        <div key={region.name} className="flex items-center gap-4">
          <div className="w-10 font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">
            {region.name}
          </div>
          <div className="flex-1 relative h-6">
            {/* String line */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-black/10" />
            {/* Beads */}
            <div className="absolute inset-0 flex items-center justify-around">
              {region.prices.map((price, i) => (
                <div
                  key={i}
                  className="relative"
                  style={{
                    width: 12 + i * 4,
                    height: 12 + i * 4,
                  }}
                >
                  <div
                    className="absolute inset-0 rounded-full border-2 border-white"
                    style={{ backgroundColor: region.color }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="w-16 text-right font-mono text-xs text-black/60 tabular-nums">
            ${(region.prices[2] / 1000).toFixed(1)}K
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 border-t border-black/05">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/60">
          MEDIAN_PSF_BY_BR
        </div>
        <div className="flex items-center gap-3">
          {['1BR', '2BR', '3BR', '4BR+'].map((br, i) => (
            <div key={br} className="flex items-center gap-1">
              <div
                className="rounded-full"
                style={{
                  width: 6 + i * 2,
                  height: 6 + i * 2,
                  backgroundColor: '#0F172A',  // slate-900
                  opacity: 0.3 + i * 0.2,
                }}
              />
              <span className="font-mono text-[8px] text-black/60">{br}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Volume Trend Preview - simplified bar + line chart
function VolumeTrendPreview() {
  const { months, volumes } = VOLUME_TREND_DATA;
  const maxVol = Math.max(...volumes);

  return (
    <div className="h-32">
      <div className="flex items-end justify-between h-24 gap-2">
        {months.map((month, i) => (
          <div key={month} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-black/80 transition-all"
              style={{ height: `${(volumes[i] / maxVol) * 100}%` }}
            />
            <div className="font-mono text-[8px] text-black/60">{month}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/60">
          TX_VOLUME_2024
        </div>
        <div className="font-mono text-xs text-black/60 tabular-nums">
          +4.1% QoQ
        </div>
      </div>
    </div>
  );
}

// District Growth Preview - simplified dumbbell chart
function DistrictGrowthPreview() {
  return (
    <div className="space-y-2">
      {DISTRICT_GROWTH_DATA.map((d) => (
        <div key={d.id} className="flex items-center gap-3">
          <div className="w-8 font-mono text-[9px] text-black/60">{d.id}</div>
          <div className="flex-1 relative h-4">
            {/* Track */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-black/10" />
            {/* Start dot */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-black/20"
              style={{ left: `${(d.start / MAX_DISTRICT_PRICE) * 100}%` }}
            />
            {/* Growth bar */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-black/30 to-emerald-500"
              style={{
                left: `${(d.start / MAX_DISTRICT_PRICE) * 100}%`,
                width: `${((d.end - d.start) / MAX_DISTRICT_PRICE) * 100}%`,
              }}
            />
            {/* End dot */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-500"
              style={{ left: `${(d.end / MAX_DISTRICT_PRICE) * 100}%` }}
            />
          </div>
          <div className="w-12 text-right font-mono text-[9px] text-emerald-600 tabular-nums">
            {d.delta}
          </div>
        </div>
      ))}
      <div className="pt-2 border-t border-black/05 flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/60">
          PSF_DELTA_5Y
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-black/20" />
          <span className="font-mono text-[8px] text-black/60">2019</span>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-mono text-[8px] text-black/60">2024</span>
        </div>
      </div>
    </div>
  );
}

// Momentum Grid Preview - 28 mini sparklines
function MomentumGridPreview() {
  return (
    <div className="grid grid-cols-7 gap-1">
      {MOMENTUM_GRID_DATA.map((d) => (
        <div
          key={d.id}
          className="aspect-square border border-black/05 p-1 flex flex-col items-center justify-center"
        >
          <div className="font-mono text-[7px] text-black/60">{d.id}</div>
          {/* Mini sparkline */}
          <svg className="w-full h-3 mt-0.5" viewBox="0 0 20 8">
            <path
              d={d.trend === 'up'
                ? 'M0 7 L5 5 L10 6 L15 3 L20 1'
                : 'M0 1 L5 3 L10 2 L15 5 L20 7'
              }
              fill="none"
              stroke={d.trend === 'up' ? '#10B981' : '#FF5500'}
              strokeWidth="1"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}

// ===== LIVE SIGNAL ECOSYSTEM COMPONENTS =====

// SVG projection constants for Singapore
const SG_BOUNDS = { minLng: 103.6, maxLng: 104.05, minLat: 1.22, maxLat: 1.47 };
const SVG_SIZE = { width: 500, height: 280 };

function projectToSVG([lng, lat]) {
  const x = ((lng - SG_BOUNDS.minLng) / (SG_BOUNDS.maxLng - SG_BOUNDS.minLng)) * SVG_SIZE.width;
  const y = ((SG_BOUNDS.maxLat - lat) / (SG_BOUNDS.maxLat - SG_BOUNDS.minLat)) * SVG_SIZE.height;
  return [x, y];
}

function coordsToPath(coords) {
  return coords[0].map(([lng, lat], i) => {
    const [x, y] = projectToSVG([lng, lat]);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

// Format price for display (e.g., $1.85M, $850K)
function formatPrice(price) {
  if (price >= 1_000_000) {
    return `$${(price / 1_000_000).toFixed(2)}M`;
  }
  return `$${(price / 1_000).toFixed(0)}K`;
}

// Format bedroom count (e.g., 2BR, 3BR)
function formatBedroom(bedroom) {
  if (bedroom === 5) return '5BR+';
  return `${bedroom}BR`;
}

// Pulse Ticker - auto-scrolling horizontal event feed with structured data packets
// Format: [DISTRICT] PROJECT [PRICE] // separated by double forward slash
function PulseTicker({ transactions, onTransactionClick, activeDistrict, isLoading }) {
  const doubled = useMemo(() => {
    if (!transactions?.length) return [];
    return [...transactions, ...transactions];
  }, [transactions]);

  if (isLoading) {
    return (
      <div className="overflow-hidden border border-black/10 bg-[#fafafa] h-10 flex items-center justify-center">
        <div className="font-mono text-[11px] text-black/40 tracking-wider">LOADING_FEED...</div>
      </div>
    );
  }

  if (!transactions?.length) {
    return (
      <div className="overflow-hidden border border-black/10 bg-[#fafafa] h-10 flex items-center justify-center">
        <div className="font-mono text-[11px] text-black/40 tracking-wider">NO_SIGNAL</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-black/10 bg-[#fafafa] h-10">
      <div className="flex items-center h-full animate-ticker whitespace-nowrap px-4">
        {doubled.map((tx, idx) => (
          <button
            key={`${tx.project}-${idx}`}
            type="button"
            onClick={() => onTransactionClick(tx.district)}
            className={`font-mono text-[11px] tracking-wide transition-colors flex items-center ${
              activeDistrict === tx.district
                ? 'text-emerald-600'
                : 'text-black/50 hover:text-black/70'
            }`}
          >
            <span className="text-black/30">[</span>
            <span className="text-black/60">{tx.district}</span>
            <span className="text-black/30">]</span>
            <span className="mx-1.5">{tx.project}</span>
            <span className="text-black/30">|</span>
            <span className="ml-1.5 text-black/50">{formatBedroom(tx.bedroom)}</span>
            <span className="ml-1.5 text-black/30">[</span>
            <span>{formatPrice(tx.price)}</span>
            <span className="text-black/30">]</span>
            <span className="mx-4 text-black/20">//</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Ghost Map - SVG-based Singapore district map with pulsing dots
// Laser-cut acrylic concept: Pale blue-grey sea + White land "cutout" + Technical grey lines
function GhostMap({ highlightedDistrict, activePulses, onPulseFade }) {
  const [geoData, setGeoData] = useState(null);
  const [centroids, setCentroids] = useState(null);
  const [districtStats, setDistrictStats] = useState({});
  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    import('../data/singaporeDistrictsGeoJSON').then(m => setGeoData(m.singaporeDistrictsGeoJSON.features));
    import('../data/districtCentroids').then(m => setCentroids(m.DISTRICT_CENTROIDS));
  }, []);

  // Fetch real district stats from API
  useEffect(() => {
    const fetchDistrictStats = async () => {
      try {
        const response = await fetch('/api/landing/district-stats');
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setDistrictStats(result.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch district stats:', error);
      }
    };
    fetchDistrictStats();
  }, []);

  // Track mouse position relative to container
  const handleMouseMove = (e) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  if (!geoData || !centroids) {
    return (
      <div className="h-[280px] border border-black/10 bg-slate-50 flex items-center justify-center">
        <div className="font-mono text-[10px] text-black/40 tracking-wider">LOADING_MAP...</div>
      </div>
    );
  }

  // The Land: Pure white "cutout" with subtle lift on interaction
  const getDistrictFill = (district) => {
    if (highlightedDistrict === district) return '#F8FAFC'; // Slate-50 - slight tint on active
    if (hoveredDistrict === district) return '#F8FAFC'; // Slate-50 - slight tint on hover
    return '#FFFFFF'; // Pure white - the "positive space" cutout
  };

  // The Skeleton: Whisper-thin lines for district boundaries
  const getDistrictStroke = (district) => {
    if (highlightedDistrict === district || hoveredDistrict === district) {
      return '#CBD5E1'; // Slate-300 - crisper on interaction
    }
    return '#E2E8F0'; // Slate-200 - barely-there pencil line
  };

  // Get stats for hovered district (from API)
  const hoveredStats = hoveredDistrict ? districtStats[hoveredDistrict] : null;

  return (
    <div
      ref={containerRef}
      className="relative border border-black/10"
      style={{
        // The Sea: Very pale blue-grey engineering surface
        backgroundColor: '#F8FAFC', // Slate-50
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredDistrict(null)}
    >
      {/* HUD corners */}
      <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
      <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
      {/* Ruler ticks */}
      <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
      <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
      <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />

      {/* Intel Tag - Fighter Jet HUD follower tooltip */}
      <AnimatePresence>
        {hoveredDistrict && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute z-50 pointer-events-none"
            style={{
              left: mousePos.x + 16,
              top: mousePos.y + 16,
            }}
          >
            <div
              className="font-mono text-[10px] leading-tight"
              style={{
                background: '#0F172A',
                color: '#F8FAFC',
                padding: '6px 10px',
                boxShadow: '2px 2px 0 rgba(0,0,0,0.3)',
              }}
            >
              {/* Header line */}
              <div className="flex items-center gap-2">
                <span className="text-slate-500">[</span>
                <span className="text-white font-medium">{hoveredDistrict}</span>
                <span className="text-slate-500">]</span>
                <span className="text-slate-300 truncate max-w-[140px]">{hoveredStats?.name || 'SCANNING...'}</span>
              </div>
              {/* Stats line - 3M summary */}
              <div className="flex items-center gap-3 mt-1 text-[9px]">
                <span className="text-slate-500">3M:</span>
                <span>
                  <span className="text-slate-400">VOL:</span>
                  <span className={hoveredStats?.vol === 'HIGH' ? 'text-emerald-400 ml-1' : hoveredStats?.vol === 'LOW' ? 'text-amber-400 ml-1' : 'text-slate-300 ml-1'}>
                    {hoveredStats?.vol || '---'}
                  </span>
                </span>
                <span>
                  <span className="text-slate-400">TX:</span>
                  <span className="text-slate-200 ml-1">{hoveredStats?.txCount ?? '---'}</span>
                </span>
                <span>
                  <span className="text-slate-400">Δ:</span>
                  <span className={hoveredStats?.psfDelta?.startsWith('+') ? 'text-emerald-400 ml-1' : hoveredStats?.psfDelta?.startsWith('-') ? 'text-red-400 ml-1' : 'text-slate-300 ml-1'}>
                    {hoveredStats?.psfDelta || '---'}
                  </span>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <svg
        viewBox={`0 0 ${SVG_SIZE.width} ${SVG_SIZE.height}`}
        className="w-full h-auto"
      >
        {/* District paths - White land cutouts with paper-thin shadow */}
        {geoData.map((f) => (
          <path
            key={f.properties.district}
            d={coordsToPath(f.geometry.coordinates)}
            fill={getDistrictFill(f.properties.district)}
            stroke={getDistrictStroke(f.properties.district)}
            strokeWidth="0.5"
            className="transition-all duration-200 ease-out cursor-crosshair"
            style={{
              // Paper-thin shadow - crisp separation without thickness
              filter: 'drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.08))',
            }}
            onMouseEnter={() => setHoveredDistrict(f.properties.district)}
            onMouseLeave={() => setHoveredDistrict(null)}
          />
        ))}

        {/* Electric Glass Ripple - monochromatic pencil-sketch animation */}
        <AnimatePresence>
          {activePulses.map((pulse) => {
            const c = centroids.find(c => c.district === pulse.district)?.centroid;
            if (!c) return null;
            const [x, y] = projectToSVG([c.lng, c.lat]);
            return (
              <g key={pulse.id}>
                {/* Center dot - brief flash */}
                <motion.circle
                  cx={x}
                  cy={y}
                  r={1.5}
                  fill="rgba(100, 116, 139, 0.8)"
                  initial={{ opacity: 0.8 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
                {/* Primary ripple - translucent glass ring */}
                <motion.circle
                  cx={x}
                  cy={y}
                  fill="none"
                  stroke="rgba(100, 116, 139, 0.6)"
                  initial={{ r: 2, strokeWidth: 1.5, opacity: 0.8 }}
                  animate={{ r: 30, strokeWidth: 0, opacity: 0 }}
                  transition={{ duration: 2, ease: [0, 0, 0.2, 1] }}
                  onAnimationComplete={() => onPulseFade(pulse.id)}
                />
                {/* Secondary ripple - delayed, wider expansion */}
                <motion.circle
                  cx={x}
                  cy={y}
                  fill="none"
                  stroke="rgba(100, 116, 139, 0.4)"
                  initial={{ r: 2, strokeWidth: 1, opacity: 0.6 }}
                  animate={{ r: 45, strokeWidth: 0, opacity: 0 }}
                  transition={{ duration: 2.5, ease: [0, 0, 0.2, 1], delay: 0.15 }}
                />
              </g>
            );
          })}
        </AnimatePresence>
      </svg>

      {/* Timestamp overlay */}
      <div className="absolute bottom-2 right-3 font-mono text-[9px] text-slate-400 tracking-wider">
        SIG_FEED // LIVE
      </div>
    </div>
  );
}

// Fallback sample data when API is unavailable
const FALLBACK_TRANSACTIONS = [
  { project: 'THE ORIE', bedroom: 2, price: 1850000, district: 'D19' },
  { project: 'PINETREE HILL', bedroom: 3, price: 2680000, district: 'D21' },
  { project: 'LENTOR MANSION', bedroom: 2, price: 1520000, district: 'D26' },
  { project: 'HILLOCK GREEN', bedroom: 3, price: 1980000, district: 'D26' },
  { project: 'GRAND DUNMAN', bedroom: 4, price: 3850000, district: 'D15' },
  { project: 'TEMBUSU GRAND', bedroom: 2, price: 1720000, district: 'D15' },
  { project: 'ORCHARD SOPHIA', bedroom: 1, price: 1280000, district: 'D09' },
  { project: 'THE CONTINUUM', bedroom: 3, price: 3250000, district: 'D15' },
  { project: 'SCENECA RESIDENCE', bedroom: 2, price: 1380000, district: 'D16' },
  { project: 'LENTORIA', bedroom: 2, price: 1450000, district: 'D26' },
  { project: 'THE MYST', bedroom: 3, price: 2150000, district: 'D23' },
  { project: 'ALTURA', bedroom: 4, price: 2480000, district: 'D23' },
  { project: 'J\'DEN', bedroom: 2, price: 1680000, district: 'D22' },
  { project: 'THE LAKEGARDEN RESIDENCES', bedroom: 3, price: 2280000, district: 'D22' },
  { project: 'WATTEN HOUSE', bedroom: 3, price: 4850000, district: 'D11' },
];

// Live Signal Ecosystem - container for Pulse Ticker + Ghost Map
function LiveSignalEcosystem() {
  const [highlightedDistrict, setHighlightedDistrict] = useState(null);
  const [activePulses, setActivePulses] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 });

  // Fetch recent transactions from API with fallback
  useEffect(() => {
    const fetchRecentActivity = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/landing/recent-activity');
        if (response.ok) {
          const result = await response.json();
          if (result.data?.length > 0) {
            setTransactions(result.data);
            return;
          }
        }
        // Use fallback if API fails or returns empty
        setTransactions(FALLBACK_TRANSACTIONS);
      } catch (error) {
        console.error('Failed to fetch recent activity, using fallback:', error);
        setTransactions(FALLBACK_TRANSACTIONS);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentActivity();
  }, []);

  const handleTransactionClick = (district) => {
    setHighlightedDistrict(district);
    setActivePulses(prev => [...prev, { id: `p_${Date.now()}`, district }]);
    setTimeout(() => setHighlightedDistrict(null), 3000);
  };

  const handlePulseFade = (id) => {
    setActivePulses(prev => prev.filter(p => p.id !== id));
  };

  // Cold boot animation variants
  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.15 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  return (
    <motion.div
      ref={sectionRef}
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
    >
      {/* Ticker */}
      <motion.div variants={itemVariants}>
        <PulseTicker
          transactions={transactions}
          onTransactionClick={handleTransactionClick}
          activeDistrict={highlightedDistrict}
          isLoading={isLoading}
        />
      </motion.div>

      {/* Ghost Map */}
      <motion.div variants={itemVariants}>
        <GhostMap
          highlightedDistrict={highlightedDistrict}
          activePulses={activePulses}
          onPulseFade={handlePulseFade}
        />
      </motion.div>

      {/* System status */}
      <motion.div variants={itemVariants} className="flex items-center justify-center gap-2">
        <div className="heartbeat-led" />
        <span className="font-mono text-[9px] text-black/50">SYSTEM_ACTIVE</span>
      </motion.div>
    </motion.div>
  );
}

export default function LandingV3() {
  const navigate = useNavigate();

  const onAnyCTA = () => navigate('/login');
  const [isGridHot, setIsGridHot] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  // Track scroll progress for navbar effects
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setScrollProgress(progress);
      setIsScrolled(scrollTop > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const onSectionEnter = () => setIsGridHot(true);
  const onSectionLeave = () => setIsGridHot(false);

  const terminalLines = useMemo(
    () => [
      'AUTH: GUEST // CLEARANCE: NONE',
      'MODE: READ-ONLY PREVIEW',
      '',
      '> handshake ura.endpoint … OK',
      '> pipeline.validate integrity=99.2% … OK',
      '> stream.transactions sale_type=RESALE … RUNNING',
      '',
      'Tip: Press Ctrl+K to run a command.',
      '',
      '> cache.warmup districts=28 … OK',
      '> index.projects count=1,247 … OK',
      '> verify.data_quality … PASSED',
    ],
    [],
  );

  return (
    <div className="relative min-h-screen bg-[#F5F5F4] text-[#1C1917] overflow-x-hidden">
      <style>{`
        :root { color-scheme: light; }

        /* REAM vertical ruler grid - faint lines every 120px */
        .ream-vertical-grid {
          background-image: linear-gradient(to right, #E7E5E4 1px, transparent 1px);
          background-size: 120px 100%;
        }

        @keyframes landingV3-dotDrift {
          0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.82; }
          50% { transform: translate3d(0, var(--landingV3-dotShift, 0px), 0); opacity: 1; }
        }

        @keyframes landingV3-dotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.68; }
        }

        .landingV3-dot {
          will-change: transform, opacity;
          animation: landingV3-dotDrift var(--landingV3-dotDur, 3.2s) ease-in-out infinite;
          animation-delay: var(--landingV3-dotDelay, 0s);
        }

        .landingV3-dotSg {
          will-change: opacity;
          animation: landingV3-dotPulse 2.6s ease-in-out infinite;
          animation-delay: var(--landingV3-dotDelay, 0s);
        }

        @media (prefers-reduced-motion: reduce) {
          .landingV3-scanline { display: none !important; }
          .landingV3-dot, .landingV3-dotSg { animation: none !important; }
        }
      `}</style>

      {/* REAM vertical ruler grid - industrial 120px spacing */}
      <div
        className={`pointer-events-none fixed inset-0 z-0 ream-vertical-grid transition-opacity duration-300 ${isGridHot ? 'opacity-100' : 'opacity-60'}`}
      />

      {/* Scanline overlay */}
      <div
        className="landingV3-scanline pointer-events-none fixed inset-0 z-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 10px, rgba(0,0,0,0.05) 11px)',
        }}
      />

      {/* Noise texture */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* NAV - REAM Industrial */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 border-b transition-all duration-200 ${
          isScrolled
            ? 'bg-[#F5F5F4]/95 backdrop-blur-sm border-[#E7E5E4] shadow-sm'
            : 'bg-[#F5F5F4] border-[#E7E5E4]'
        }`}
      >
        {/* Scroll progress indicator */}
        <div
          className="absolute bottom-0 left-0 h-px bg-[#1C1917]/30 transition-all duration-75"
          style={{ width: `${scrollProgress}%` }}
        />
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo block */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 bg-[#1C1917] flex items-center justify-center text-white font-mono font-bold text-sm">
                &gt;_
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#57534E]">
                  PROPANALYTICS.SG
                </div>
                <div className="font-mono text-xs font-bold tracking-tight text-[#1C1917]">
                  INTELLIGENCE TERMINAL
                </div>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <MonoPill leftDot={<LiveDot />}>URA LINK: ONLINE</MonoPill>
              <MonoPill>PIPELINE: HEALTHY</MonoPill>
            </div>

            {/* CTA buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onAnyCTA}
                className="px-6 py-2 font-mono text-xs font-bold border border-[#1C1917] text-[#1C1917] hover:bg-[#E7E5E4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1917]/20"
              >
                LOG IN
              </button>
              {/* Safety Orange accent - REAM brutalist */}
              <button
                type="button"
                onClick={onAnyCTA}
                className="px-6 py-2 font-mono text-xs font-bold bg-[#FF4F00] text-white border border-[#FF4F00] hover:bg-[#CC3F00] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4F00]/20"
                style={{ boxShadow: '4px 4px 0px 0px rgba(28,25,23,1)' }}
              >
                REQUEST ACCESS
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* HERO */}
        <section className="relative pt-24 md:pt-28 pb-16 md:pb-24 overflow-hidden">
          {/* Gradient mesh - subtle corner accent */}
          <div
            className="absolute top-0 right-0 w-1/2 h-1/2 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at top right, rgba(0,0,0,0.02) 0%, transparent 60%)',
            }}
          />
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                {/* 60/40 asymmetric split for visual interest */}
                <div className="lg:col-span-7">
                  {/* REAM 'Stamp' - Industrial marker */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center gap-2 mb-6 border-l-2 border-[#FF4F00] pl-3"
                  >
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#57534E]">
                      Live URA Data // V3 Pipeline
                    </span>
                  </motion.div>

                  {/* REAM Typography - Condensed 'Alert' style */}
                  <motion.h1
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.05 }}
                    className="font-sans text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[0.9]"
                  >
                    <span className="block text-[#1C1917]">SINGAPORE</span>
                    <span className="block text-[#1C1917]">CONDO</span>
                    <span className="block text-[#FF4F00]">INTELLIGENCE</span>
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.12 }}
                    className="mt-8 font-mono text-sm text-[#57534E] max-w-md leading-relaxed"
                  >
                    Data-driven price benchmarking across projects, locations, and market segments.
                    <span className="block mt-2 text-[#1C1917] font-bold">
                      // Indexing 100,000+ private property transactions.
                    </span>
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.24 }}
                    className="mt-6"
                  >
                    <CommandBar onExecute={onAnyCTA} />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="mt-8"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                      <TerminalOutput lines={terminalLines} isLive />
                      <StatusPanel />
                    </div>
                  </motion.div>
                </div>

                {/* Globe column - slightly overflow for tension */}
                <div className="lg:col-span-5 lg:-mr-8">
                  <motion.div
                    className="globe-bloom"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  >
                    <ParticleGlobe />
                  </motion.div>
                </div>
              </div>
            </div>
          </div>

        </section>

        <SectionDivider />

        {/* STATS */}
        <section className="py-16 md:py-24 section-overlap-down" onMouseEnter={onSectionEnter} onMouseLeave={onSectionLeave}>
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <SectionTitle
              eyebrow="COVERAGE"
              title="SIGNAL_DEPTH"
              muted="auditable"
              rightSlot={<MonoPill>PREVIEW_MODE</MonoPill>}
            />

            {/* Stats grid with equal-height cards */}
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-fr">
              {/* Card 1 - slight rotation for visual interest per Phase 7.1 */}
              <div
                className="relative h-full border border-black/10 bg-white/90 backdrop-blur-sm p-4 hover:border-black/20 transition-all hover:shadow-sm"
                style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)', transform: 'rotate(-0.5deg)' }}
              >
                {/* HUD corner ticks */}
                <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
                <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
                {/* Ruler tick marks along top edge */}
                <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
                <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
                <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">TX_COUNT</div>
                <div className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-black tabular-nums font-data">
                  <AnimatedNumber
                    value={103379}
                    format={(n) => Math.round(n).toLocaleString('en-SG')}
                  />
                </div>
                <div className="mt-1 font-mono text-[10px] text-black/60">RESALE_TAPE</div>
              </div>
              {/* Card 2 */}
              <div
                className="relative h-full border border-black/10 bg-white/90 backdrop-blur-sm p-4 hover:border-black/20 transition-all hover:shadow-sm"
                style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)', transform: 'rotate(0.5deg)' }}
              >
                <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
                <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
                <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
                <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
                <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">INTEGRITY</div>
                <div className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-black tabular-nums font-data">
                  <AnimatedNumber value={99.2} format={(n) => `${n.toFixed(1)}%`} />
                </div>
                <div className="mt-1 font-mono text-[10px] text-black/60">OUTLIER_GATED</div>
              </div>
              {/* Card 3 - slight rotation */}
              <div
                className="relative h-full border border-black/10 bg-white/90 backdrop-blur-sm p-4 hover:border-black/20 transition-all hover:shadow-sm"
                style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)', transform: 'rotate(-0.5deg)' }}
              >
                <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
                <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
                <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
                <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
                <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">DISTRICTS</div>
                <div className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-black tabular-nums font-data">
                  <AnimatedNumber value={28} format={(n) => String(Math.round(n))} />
                </div>
                <div className="mt-1 font-mono text-[10px] text-black/60">CCR/RCR/OCR</div>
              </div>
              {/* Card 4 */}
              <div
                className="relative h-full border border-black/10 bg-white/90 backdrop-blur-sm p-4 hover:border-black/20 transition-all hover:shadow-sm"
                style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)', transform: 'rotate(0.5deg)' }}
              >
                <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
                <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
                <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
                <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
                <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">HISTORY</div>
                <div className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-black tabular-nums font-data">
                  <AnimatedNumber value={5} format={(n) => `${Math.round(n)}Y`} />
                </div>
                <div className="mt-1 font-mono text-[10px] text-black/60">CYCLE_DEPTH</div>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* LIVE SIGNAL ECOSYSTEM */}
        <section className="py-16 md:py-24 section-overlap-up" onMouseEnter={onSectionEnter} onMouseLeave={onSectionLeave}>
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <SectionTitle
              eyebrow="SURVEILLANCE"
              title="SIGNAL_FEED"
              muted="live_stream"
              rightSlot={<MonoPill leftDot={<div className="heartbeat-led" />}>ACTIVE</MonoPill>}
            />
            <div className="mt-6">
              <LiveSignalEcosystem />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* CAPABILITIES */}
        <section className="py-16 md:py-24" onMouseEnter={onSectionEnter} onMouseLeave={onSectionLeave}>
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <SectionTitle eyebrow="SYSTEM" title="CAPABILITIES_MANIFEST" muted="analyst_tools" />

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <CapabilityCard
                icon={Radar}
                code="UNDERWRITE"
                title="Deal Underwriting"
                desc="Benchmark PSF by district, project, and unit type with repeatable assumptions."
              />
              <CapabilityCard
                icon={Database}
                code="TX_TAPE"
                title="Raw Transaction Tape"
                desc="Scan prints like a feed: district · size · psf · timestamp. No hidden smoothing."
              />
              <CapabilityCard
                icon={ShieldCheck}
                code="INTEGRITY"
                title="Integrity Gating"
                desc="Signal quality checks baked into the workflow — thin data flags and audit trails."
              />
              <CapabilityCard
                icon={Zap}
                code="LOW_LATENCY"
                title="Query Engine"
                desc="Command-first UX for power users: run queries without leaving the keyboard."
              />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* INSIGHTS */}
        <section className="py-16 md:py-24" onMouseEnter={onSectionEnter} onMouseLeave={onSectionLeave}>
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <SectionTitle eyebrow="READOUT" title="MARKET_SIGNALS" muted="realtime" />

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 relative border border-black/10 bg-[#fafafa]">
                <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
                <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
                <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
                <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
                <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
                <div className="px-4 py-3 border-b border-black/05 flex items-center justify-between">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">Metrics</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">
                    Snapshot · non-binding
                  </div>
                </div>
                <div className="px-4">
                  <InsightRow label="Median PSF" value="$2,180" delta="+0.8% QoQ" />
                  <InsightRow label="Momentum" value="STABLE" delta="-0.3% MoM" />
                  <InsightRow label="Volume" value="2,104" delta="+4.1% QoQ" />
                  <InsightRow label="Dispersion" value="LOW" delta="-1.2% QoQ" />

                  <div className="mt-2 border-t border-black/05 pt-3 pb-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">
                      Tagged entities
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 font-mono text-[10px] uppercase tracking-[0.18em] text-black/60 truncate">
                          ORCHARD_RD <span className="text-black/60">[SG-D09-8821]</span>
                        </div>
                        <div className="font-mono text-xs text-black/60 tabular-nums">$2,480</div>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 font-mono text-[10px] uppercase tracking-[0.18em] text-black/60 truncate">
                          TIONG_BAHRU <span className="text-black/60">[SG-D03-4412]</span>
                        </div>
                        <div className="font-mono text-xs text-black/60 tabular-nums">$2,110</div>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 font-mono text-[10px] uppercase tracking-[0.18em] text-black/60 truncate">
                          BEDOK_RESERVOIR <span className="text-black/60">[SG-D16-1097]</span>
                        </div>
                        <div className="font-mono text-xs text-black/60 tabular-nums">$1,760</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-4 border-t border-black/05">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">Notes</div>
                  <div className="mt-2 text-sm leading-relaxed text-black/60">
                    Preview signals are illustrative. Authenticate to unlock full district/project drilldowns, export, and
                    full time windows.
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-1 gap-4">
                <DotMatrixMap />
                <div className="relative border border-black/10 bg-[#fafafa] p-4">
                  <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
                  <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
                  <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
                  <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
                  <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">ACCESS</div>
                      <div className="mt-2 text-base font-bold tracking-tight text-black">Terminal clearance required</div>
                      <div className="mt-2 text-sm leading-relaxed text-black/60">
                        Login to unlock market overview, district heatmaps, exit risk, and valuation tools.
                      </div>
                    </div>
                    <div className="border border-black/10 p-2">
                      <Lock className="h-4 w-4 text-black/60" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">AUTH</div>
                    <button
                      type="button"
                      onClick={onAnyCTA}
                      className="group inline-flex items-center gap-2 px-4 py-2 border border-black/10 hover:border-black/20 hover:bg-black/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                    >
                      Proceed
                      <ArrowRight className="h-4 w-4 text-black/60 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 md:py-24 bg-black text-[#fafafa]">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#fafafa]/60">
                  Clearance
                </div>
                <div className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tighter">
                  Request terminal clearance
                </div>
                <div className="mt-4 text-base md:text-lg leading-relaxed text-[#fafafa]/70 max-w-2xl">
                  Authenticate to access the full PropAnalytics intelligence surface. Export, drilldown, and data
                  validation are locked behind login.
                </div>
              </div>
              <div className="lg:col-span-4">
                <div className="border border-[#fafafa]/10 p-6">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#fafafa]/60">Status</div>
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#fafafa]/70">
                      <LiveDot />
                      <span>READY</span>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="border border-[#fafafa]/10 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#fafafa]/60">ROLE</div>
                      <div className="mt-1 font-mono text-xs text-[#fafafa]/80">ANALYST</div>
                    </div>
                    <div className="border border-[#fafafa]/10 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#fafafa]/60">MODE</div>
                      <div className="mt-1 font-mono text-xs text-[#fafafa]/80">SECURE</div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={onAnyCTA}
                      className="w-full px-5 py-3 bg-[#fafafa] text-black font-medium hover:bg-[#fafafa]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa]/30"
                    >
                      Continue to Login
                    </button>
                    <button
                      type="button"
                      onClick={onAnyCTA}
                      className="w-full px-5 py-3 border border-[#fafafa]/20 text-[#fafafa] font-medium hover:border-[#fafafa]/35 hover:bg-[#fafafa]/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa]/30"
                    >
                      Request Access
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-10 flex items-center justify-between gap-4 border-t border-[#fafafa]/10 pt-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#fafafa]/60">
                PROPANALYTICS.SG · TERMINAL
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#fafafa]/50">
                DO NOT DISTRIBUTE
              </div>
            </div>
          </div>
        </section>

        <footer className="py-10 footer-grid-pattern">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            {/* System Status Row */}
            <div className="system-status-row pb-6 border-b border-black/05">
              <div className="status-item">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                </span>
                <span>All Systems Operational</span>
              </div>
              <div className="status-item">
                <span className="text-black/60">URA_FEED</span>
                <span className="text-emerald-600">SYNC</span>
              </div>
              <div className="status-item">
                <span className="text-black/60">LATENCY</span>
                <span>&lt;50ms</span>
              </div>
              <div className="status-item hidden md:flex">
                <span className="text-black/60">UPTIME</span>
                <span>99.9%</span>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-6">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">Build</div>
                <div className="mt-1 text-sm text-black/60">LandingV3 · monochrome + emerald signals</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onAnyCTA}
                  className="px-4 py-2 border border-black/10 text-black font-medium hover:border-black/20 hover:bg-black/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 btn-scan-sweep"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={onAnyCTA}
                  className="px-4 py-2 bg-black text-[#fafafa] font-medium hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 btn-scan-sweep"
                >
                  Enter
                </button>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* Keep strict palette visible to readers */}
      <div className="sr-only">{CANVAS}{INK}</div>
    </div>
  );
}
