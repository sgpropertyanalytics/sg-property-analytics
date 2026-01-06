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

const CANVAS = '#fafafa';
const INK = '#000000';

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
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
            {eyebrow}
          </div>
        ) : null}
        <div className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-black">
          {title}{' '}
          {muted ? <span className="text-black/30">{muted}</span> : null}
        </div>
      </div>
      {rightSlot ? <div className="hidden md:block">{rightSlot}</div> : null}
    </div>
  );
}

function MonoPill({ children, leftDot = null }) {
  return (
    <div className="inline-flex items-center gap-2 border border-black/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-black/50">
      {leftDot ? <span className="flex h-2 w-2 items-center justify-center">{leftDot}</span> : null}
      <span>{children}</span>
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full bg-emerald-500 opacity-70 animate-ping" />
      <span className="relative inline-flex h-2 w-2 bg-emerald-600" />
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
      <div className="flex items-stretch border border-black/10 bg-[#fafafa]">
        <div className="flex items-center gap-2 px-3 border-r border-black/10">
          <Command className="h-4 w-4 text-black/30" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40 hidden sm:inline">
            Cmd
          </span>
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
          placeholder="Type a command…"
          className="flex-1 min-w-0 px-3 py-3 font-mono text-xs tracking-wide text-black/70 placeholder:text-black/30 bg-transparent outline-none"
        />
        <button
          type="button"
          onClick={() => execute(value || filtered[0] || '')}
          className="group flex items-center gap-2 px-4 bg-black hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white">Enter Terminal</span>
          <ArrowRight className="h-4 w-4 text-white group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>



      <AnimatePresence>
        {isOpen && filtered.length ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute left-0 right-0 mt-2 border border-black/10 bg-[#fafafa]"
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
                className={`w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] border-t first:border-t-0 border-black/05 ${
                  i === activeIndex ? 'bg-black/[0.02]' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-black/70 truncate">{s}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-black/20" />
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
      className="font-mono text-xs leading-relaxed text-black/40 h-[180px] overflow-hidden"
    >
      {visibleLines.map((line, i) => (
        <div key={i} className={line.startsWith('→') ? 'text-emerald-600' : 'text-black/40'}>
          {line}
        </div>
      ))}
      {currentTyping && (
        <div className={currentTyping.startsWith('→') ? 'text-emerald-600' : 'text-black/40'}>
          {currentTyping}
          <span className={`inline-block ${cursorOn ? 'opacity-100' : 'opacity-0'}`}>_</span>
        </div>
      )}
      {currentLineIndex >= lines.length && (
        <div className="text-emerald-600">
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
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
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
        const base = 0.18 + alpha * 0.52;
        const size = 1.6;
        const pulse = 1;

        ctx.beginPath();
        ctx.arc(pr.x, pr.y, size * pr.p * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${base})`;
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
        <div className="font-mono text-[10px] uppercase tracking-wider text-black/20">
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
  
  useInterval(() => {
    setTxCount(prev => prev + Math.floor(Math.random() * 3));
    setIntegrity(prev => {
      const delta = (Math.random() - 0.5) * 0.02;
      return Math.min(99.9, Math.max(99.0, prev + delta));
    });
    setSyncAgo(prev => (prev + 1) % 60);
  }, 2000);

  return (
    <div className="border border-black/10 bg-[#fafafa]">
      <div className="px-3 py-2 border-b border-black/05 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
          System Status
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/30 tabular-nums">
          SG {clock}
        </div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-3">
        <div className="border border-black/10 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">URA LINK</div>
          <div className="mt-1 flex items-center gap-2">
            <LiveDot />
            <div className="font-mono text-xs text-black/60">ONLINE</div>
          </div>
        </div>
        <div className="border border-black/10 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">PIPELINE</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full bg-emerald-500 opacity-50 animate-ping" style={{ animationDuration: '2s' }} />
              <span className="relative inline-flex h-2 w-2 bg-emerald-600" />
            </span>
            <div className="font-mono text-xs text-black/60">STREAMING</div>
          </div>
        </div>
        <div className="border border-black/10 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">TRANSACTIONS</div>
          <div className="mt-1 font-mono text-xs text-black/60 tabular-nums">{txCount.toLocaleString('en-SG')}</div>
        </div>
        <div className="border border-black/10 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">INTEGRITY</div>
          <div className="mt-1 font-mono text-xs text-black/60 tabular-nums">{integrity.toFixed(1)}%</div>
        </div>
      </div>
      <div className="px-3 py-2 border-t border-black/05 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/30">
          LAST SYNC: {syncAgo}s ago
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1 h-1 bg-emerald-500 animate-pulse" />
          <div className="w-1 h-1 bg-emerald-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
          <div className="w-1 h-1 bg-emerald-500 animate-pulse" style={{ animationDelay: '0.4s' }} />
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
        dots.push({
          key: `${x}-${y}`,
          alpha,
          isSg: sg > 0.35,
        });
      }
    }
    return dots;
  }, []);

  return (
    <div className="border border-black/10 bg-[#fafafa]">
      <div className="px-3 py-2 border-b border-black/05 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">MAP</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/30">SINGAPORE FOCUS</div>
      </div>
      <div className="p-3">
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {cells.map((c) => (
            <div
              key={c.key}
              className="h-[3px] w-full"
              style={{
                backgroundColor: c.isSg ? 'rgba(0,0,0,0.55)' : `rgba(0,0,0,${0.06 + c.alpha * 0.18})`,
              }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
            COORD: 1.3521N / 103.8198E
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/30">
            GRID: DOT-MATRIX
          </div>
        </div>
      </div>
    </div>
  );
}

function CapabilityCard({ icon: Icon, title, desc }) {
  return (
    <div className="group border border-black/10 bg-[#fafafa] p-6 hover:border-black/20 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Capability</div>
          <div className="mt-2 text-lg font-bold tracking-tight text-black">{title}</div>
        </div>
        <div className="border border-black/10 p-2">
          <Icon className="h-5 w-5 text-black/30" />
        </div>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-black/50">{desc}</div>
      <div className="mt-5 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/30">Inspect</div>
        <ChevronRight className="h-4 w-4 text-black/20 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
}

function InsightRow({ label, value, delta }) {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-black/05 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">{label}</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="font-mono text-xs text-black/60 tabular-nums">{value}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/30 tabular-nums">
          {delta}
        </div>
      </div>
    </div>
  );
}

export default function LandingV3() {
  const navigate = useNavigate();

  const onAnyCTA = () => navigate('/login');

  const terminalLines = useMemo(
    () => [
      'AUTH: GUEST // CLEARANCE: NONE',
      'MODE: READ-ONLY PREVIEW',
      '',
      '> init system.boot … OK',
      '> handshake ura.endpoint … OK',
      '> pipeline.validate integrity=99.2% … OK',
      '> cache.warmup districts=28 … OK',
      '> stream.transactions sale_type=RESALE … RUNNING',
      '> index.projects count=1,247 … OK',
      '> verify.data_quality … PASSED',
      '',
      'System ready. Type a command above.',
    ],
    [],
  );

  return (
    <div className="relative min-h-screen bg-[#fafafa] text-black overflow-x-hidden">
      <style>{`
        :root { color-scheme: light; }
        @media (prefers-reduced-motion: reduce) {
          .landingV3-scanline { display: none !important; }
        }
      `}</style>

      {/* Subtle crosshatch grid @ 80px */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.015]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(0,0,0,1) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,1) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
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

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#fafafa] border-b border-black/10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="border border-black/10 p-2">
                <Terminal className="h-5 w-5 text-black" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
                  PROPANALYTICS.SG
                </div>
                <div className="text-sm font-bold tracking-tight text-black">
                  Intelligence Terminal
                </div>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <MonoPill leftDot={<LiveDot />}>URA LINK: ONLINE</MonoPill>
              <MonoPill>PIPELINE: HEALTHY</MonoPill>
              <MonoPill>RESTRICTED ACCESS // CLASSIFIED</MonoPill>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onAnyCTA}
                className="px-4 py-2 border border-black/10 text-black font-medium hover:border-black/20 hover:bg-black/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
              >
                Log In
              </button>
              <button
                type="button"
                onClick={onAnyCTA}
                className="px-4 py-2 bg-black text-[#fafafa] font-medium hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
              >
                Request Access
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* HERO */}
        <section className="pt-24 md:pt-28">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                <div className="lg:col-span-6">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-3"
                  >
                    <MonoPill leftDot={<LiveDot />}>Live URA Data</MonoPill>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/30">
                      v3 // preview
                    </div>
                  </motion.div>

                  <motion.h1
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.05 }}
                    className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[0.96]"
                  >
                    <span className="text-black">Singapore Condo</span>{' '}
                    <span className="text-black/30">Market Intelligence</span>
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.12 }}
                    className="mt-6 text-base sm:text-lg leading-relaxed text-black/50 max-w-xl"
                  >
                    Data-driven price benchmarking across projects, locations, and market segments — based on 100,000+ private property transactions.
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
                    className="mt-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TerminalOutput lines={terminalLines} isLive />
                      <StatusPanel />
                    </div>
                  </motion.div>
                </div>

                <div className="lg:col-span-6">
                  <motion.div
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

        {/* STATS */}
        <section className="py-14 md:py-18">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <SectionTitle
              eyebrow="Coverage"
              title="Signal depth"
              muted="with auditability"
              rightSlot={<MonoPill>All outputs are preview-mode</MonoPill>}
            />

            <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="border border-black/10 bg-[#fafafa] p-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Transactions</div>
                <div className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-black">
                  <AnimatedNumber
                    value={103379}
                    format={(n) => Math.round(n).toLocaleString('en-SG')}
                  />
                </div>
                <div className="mt-1 text-sm text-black/50">Resale-focused tape</div>
              </div>
              <div className="border border-black/10 bg-[#fafafa] p-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Integrity</div>
                <div className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-black">
                  <AnimatedNumber value={99.2} format={(n) => `${n.toFixed(1)}%`} />
                </div>
                <div className="mt-1 text-sm text-black/50">Outlier-gated metrics</div>
              </div>
              <div className="border border-black/10 bg-[#fafafa] p-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Districts</div>
                <div className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-black">
                  <AnimatedNumber value={28} format={(n) => String(Math.round(n))} />
                </div>
                <div className="mt-1 text-sm text-black/50">CCR / RCR / OCR</div>
              </div>
              <div className="border border-black/10 bg-[#fafafa] p-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">History</div>
                <div className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-black">
                  <AnimatedNumber value={5} format={(n) => `${Math.round(n)}Y`} />
                </div>
                <div className="mt-1 text-sm text-black/50">Depth for cycles</div>
              </div>
            </div>
          </div>
        </section>

        {/* CAPABILITIES */}
        <section className="py-14 md:py-18">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <SectionTitle eyebrow="Tools" title="Capabilities" muted="built for analysts" />

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <CapabilityCard
                icon={Radar}
                title="Deal Underwriting"
                desc="Benchmark PSF by district, project, and unit type with repeatable assumptions."
              />
              <CapabilityCard
                icon={Database}
                title="Raw Transaction Tape"
                desc="Scan prints like a feed: district · size · psf · timestamp. No hidden smoothing."
              />
              <CapabilityCard
                icon={ShieldCheck}
                title="Integrity Gating"
                desc="Signal quality checks baked into the workflow — thin data flags and audit trails."
              />
              <CapabilityCard
                icon={Zap}
                title="Fast Navigation"
                desc="Command-first UX for power users: run queries without leaving the keyboard."
              />
            </div>
          </div>
        </section>

        {/* INSIGHTS */}
        <section className="py-14 md:py-18">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <SectionTitle eyebrow="Readout" title="Market insights" muted="as signals" />

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 border border-black/10 bg-[#fafafa]">
                <div className="px-4 py-3 border-b border-black/05 flex items-center justify-between">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Metrics</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/30">
                    Snapshot · non-binding
                  </div>
                </div>
                <div className="px-4">
                  <InsightRow label="Median PSF" value="$2,180" delta="+0.8% QoQ" />
                  <InsightRow label="Momentum" value="STABLE" delta="-0.3% MoM" />
                  <InsightRow label="Volume" value="2,104" delta="+4.1% QoQ" />
                  <InsightRow label="Dispersion" value="LOW" delta="-1.2% QoQ" />
                </div>
                <div className="px-4 py-4 border-t border-black/05">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Notes</div>
                  <div className="mt-2 text-sm leading-relaxed text-black/50">
                    Preview signals are illustrative. Authenticate to unlock full district/project drilldowns, export, and
                    full time windows.
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-1 gap-4">
                <DotMatrixMap />
                <div className="border border-black/10 bg-[#fafafa] p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Access</div>
                      <div className="mt-2 text-lg font-bold tracking-tight text-black">Terminal clearance required</div>
                      <div className="mt-2 text-sm leading-relaxed text-black/50">
                        Login to unlock market overview, district heatmaps, exit risk, and valuation tools.
                      </div>
                    </div>
                    <div className="border border-black/10 p-2">
                      <Lock className="h-5 w-5 text-black/30" />
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/30">Auth</div>
                    <button
                      type="button"
                      onClick={onAnyCTA}
                      className="group inline-flex items-center gap-2 px-4 py-2 border border-black/10 hover:border-black/20 hover:bg-black/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                    >
                      Proceed
                      <ArrowRight className="h-4 w-4 text-black/30 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 md:py-20 bg-black text-[#fafafa]">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#fafafa]/60">
                  Clearance
                </div>
                <div className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
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

        <footer className="py-10">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-t border-black/10 pt-6">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Build</div>
                <div className="mt-1 text-sm text-black/50">LandingV3 · monochrome + emerald signals</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onAnyCTA}
                  className="px-4 py-2 border border-black/10 text-black font-medium hover:border-black/20 hover:bg-black/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={onAnyCTA}
                  className="px-4 py-2 bg-black text-[#fafafa] font-medium hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
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
