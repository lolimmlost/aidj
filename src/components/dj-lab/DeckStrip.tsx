import { useEffect, useRef } from 'react';
import { barAt, type TrackAnalysis } from '@/lib/dj-lab/analysis';
import { cn } from '@/lib/utils';

export interface StripRegion {
  from: number;
  to: number;
  /** Tailwind background class, e.g. "bg-primary/25" */
  className: string;
  label?: string;
}

export interface StripMarker {
  bar: number;
  className: string;
  label?: string;
}

/**
 * One track as a bar-by-bar energy strip (lows as columns, mids as a lighter cap), with the
 * transition's regions and markers on top and a live playhead. Bars are the analysis' bars, so a
 * drop marker sits on the bar line the mix lands on.
 */
export function DeckStrip({
  analysis,
  regions = [],
  markers = [],
  position,
  className,
}: {
  analysis: TrackAnalysis;
  regions?: StripRegion[];
  markers?: StripMarker[];
  /** track seconds, read every frame for the playhead */
  position?: () => number | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const n = Math.max(1, analysis.nBars);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const css = getComputedStyle(canvas);
      const low = css.getPropertyValue('--primary').trim() || '#7c3aed';
      const mid = css.getPropertyValue('--chart-3').trim() || '#0ea5e9';
      const norm = (vals: number[]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        const lo = sorted[Math.floor(sorted.length * 0.05)] ?? -60;
        const hi = sorted[Math.floor(sorted.length * 0.98)] ?? 0;
        return (v: number) => Math.max(0.04, Math.min(1, (v - lo) / Math.max(1, hi - lo)));
      };
      const nl = norm(analysis.el);
      const nm = norm(analysis.eh);
      const bw = w / n;
      for (let i = 0; i < analysis.nBars; i++) {
        const x = i * bw;
        const hl = nl(analysis.el[i]) * h * 0.78;
        g.globalAlpha = 0.9;
        g.fillStyle = low;
        g.fillRect(x, h - hl, Math.max(1, bw - (bw > 3 ? 1 : 0)), hl);
        const hm = nm(analysis.eh[i]) * h * 0.22;
        g.globalAlpha = 0.55;
        g.fillStyle = mid;
        g.fillRect(x, h - hl - hm, Math.max(1, bw - (bw > 3 ? 1 : 0)), hm);
      }
      g.globalAlpha = 1;
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [analysis, n]);

  useEffect(() => {
    if (!position) return;
    let raf = 0;
    const loop = () => {
      const p = position();
      const el = headRef.current;
      if (el) {
        if (p === null) el.style.opacity = '0';
        else {
          el.style.opacity = '1';
          el.style.left = `${Math.max(0, Math.min(100, (barAt(analysis, p) / n) * 100))}%`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [position, analysis, n]);

  const pct = (bar: number) => `${Math.max(0, Math.min(100, (bar / n) * 100))}%`;
  return (
    <div className={cn('relative h-14 w-full overflow-hidden rounded-md bg-muted/40', className)}>
      {regions.map((r, i) => (
        <div
          key={i}
          className={cn('absolute inset-y-0', r.className)}
          style={{ left: pct(r.from), width: `calc(${pct(r.to)} - ${pct(r.from)})` }}
          title={r.label}
        />
      ))}
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
      {markers.map((m, i) => (
        <div key={i} className={cn('absolute inset-y-0 w-px', m.className)} style={{ left: pct(m.bar) }} title={m.label}>
          {m.label && (
            <span className="absolute left-1 top-0.5 whitespace-nowrap text-[10px] font-medium leading-none text-foreground/80">
              {m.label}
            </span>
          )}
        </div>
      ))}
      {position && <div ref={headRef} className="absolute inset-y-0 w-0.5 bg-foreground opacity-0 shadow" aria-hidden />}
    </div>
  );
}
