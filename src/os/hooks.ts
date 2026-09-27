import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { nova, type Nova } from "../core/nova";
import { useNovaContext } from "./wm";

/** Subscribe to the kernel tick. Returns the current rev counter. */
export function useKernel(): Nova {
  const n = nova();
  useSyncExternalStore(
    useCallback((cb: () => void) => n.bus.on("tick", cb), [n]),
    useCallback(() => n.rev, [n]),
  );
  return n;
}

/** Subscribe to an arbitrary kernel bus event and run a callback. */
export function useKernelEvent(event: string, fn: (payload: any) => void): void {
  const n = nova();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => n.bus.on(event, (p) => ref.current(p)), [n, event]);
}

/** A ticking clock value, updated at most `everyMs`. */
export function useClock(everyMs = 1000): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return t;
}

/** requestAnimationFrame value with a stable callback ref (0..1 driven). */
export function useAnimationFrame(cb: (dtMs: number, elapsed: number) => void, active = true): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const start = last;
    const loop = (now: number) => {
      ref.current(now - last, now - start);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

/** Re-render at a fixed low rate — cheaper than subscribing to the kernel. */
export function useIntervalTick(ms: number, active = true): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setT((v) => v + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, active]);
  return t;
}

export function useNovaKernelState(): Nova {
  return useKernel();
}

/** Desktop bounds, tracked on resize. */
export function useDesktopSize(): { w: number; h: number } {
  const { desktop } = useNovaContext();
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const el = desktop;
    const update = () => {
      const node = el ?? document.body;
      setSize({ w: node.clientWidth || window.innerWidth, h: node.clientHeight || window.innerHeight });
    };
    update();
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    if (el) ro.observe(el);
    return () => {
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [desktop]);
  return size;
}
