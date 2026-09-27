import { useCallback, useEffect, useState, type ReactNode } from "react";
import { APPS } from "./registry";
import { TASKBAR_H, useNovaContext, type SnapZone } from "./wm";
import type { WinState } from "./types";

type ResizeDir = "e" | "s" | "se";

export function WindowFrame({ win, children }: { win: WinState; children: ReactNode }) {
  const { focus, close, minimize, toggleMax, move, resize, snap, desktop } = useNovaContext();
  const def = APPS[win.appId];
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [rsize, setRsize] = useState<{ x: number; y: number; w: number; h: number; dir: ResizeDir } | null>(null);
  const [zone, setZone] = useState<SnapZone>(null);

  const vw = desktop?.clientWidth || window.innerWidth;
  const vh = desktop?.clientHeight || window.innerHeight;

  useEffect(() => {
    if (!drag && !rsize) return;
    const onMove = (e: PointerEvent) => {
      if (drag) {
        const nx = e.clientX - drag.dx;
        const ny = Math.min(Math.max(0, e.clientY - drag.dy), vh - TASKBAR_H - 30);
        move(win.id, Math.round(nx), Math.round(ny));
        const el: SnapZone =
          e.clientX < 16 ? "left" : e.clientX > vw - 16 ? "right" : e.clientY < 10 ? "top" : null;
        setZone((prev) => (prev === el ? prev : el));
      } else if (rsize) {
        const dw = e.clientX - rsize.x;
        const dh = e.clientY - rsize.y;
        const w = rsize.dir === "s" ? rsize.w : Math.max(def.minW, Math.min(vw - win.x, rsize.w + dw));
        const h = rsize.dir === "e" ? rsize.h : Math.max(def.minH, Math.min(vh - TASKBAR_H - win.y, rsize.h + dh));
        resize(win.id, Math.round(w), Math.round(h));
      }
    };
    const onUp = () => {
      if (zone) snap(win.id, zone);
      setDrag(null);
      setRsize(null);
      setZone(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, rsize, zone, move, resize, snap, win.id, win.x, win.y, def.minW, def.minH, vw, vh]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
      focus(win.id);
      if (win.maximized) return;
      setDrag({ dx: e.clientX - win.x, dy: e.clientY - win.y });
    },
    [focus, win.id, win.x, win.y, win.maximized],
  );

  const startResize = useCallback(
    (e: React.PointerEvent, dir: ResizeDir) => {
      e.stopPropagation();
      focus(win.id);
      setRsize({ x: e.clientX, y: e.clientY, w: win.w, h: win.h, dir });
    },
    [focus, win.id, win.w, win.h],
  );

  if (win.minimized) return null;

  return (
    <div
      role="dialog"
      aria-label={win.title}
      className="col"
      onPointerDown={() => focus(win.id)}
      style={{
        position: "absolute",
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: win.z,
        borderRadius: win.maximized ? 0 : 12,
        background: "var(--panel)",
        backdropFilter: "blur(20px) saturate(1.35)",
        WebkitBackdropFilter: "blur(20px) saturate(1.35)",
        border: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
        contain: "layout paint",
        transition: drag || rsize ? "none" : "left 130ms ease, top 130ms ease, width 130ms ease, height 130ms ease",
      }}
    >
      <div
        onPointerDown={startDrag}
        onDoubleClick={() => toggleMax(win.id)}
        className="row"
        style={{
          height: 36,
          flex: "none",
          paddingLeft: 10,
          paddingRight: 6,
          gap: 8,
          background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 9%, transparent), transparent)",
          borderBottom: "1px solid var(--border)",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <span style={{ fontSize: 13 }}>{def.icon}</span>
        <span className="semi ellipsis" style={{ fontSize: 12.5 }}>
          {win.title}
        </span>
        <span className="spacer" />
        <button data-nodrag className="wc" onClick={() => minimize(win.id)} title="Minimise" aria-label="Minimise">
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
            <path d="M1 5.5h9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          data-nodrag
          className="wc"
          onClick={() => toggleMax(win.id)}
          title={win.maximized ? "Restore" : "Maximise"}
          aria-label={win.maximized ? "Restore" : "Maximise"}
        >
          {win.maximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
              <rect x="1.5" y="3.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.1" />
              <rect x="3.5" y="1.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
              <rect x="1.5" y="1.5" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          )}
        </button>
        <button
          data-nodrag
          className="wc"
          onClick={() => close(win.id)}
          title="Close"
          aria-label="Close"
          style={{ color: "var(--err)" }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
            <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>

      <div className="grow" style={{ minHeight: 0, position: "relative" }}>
        {children}
      </div>

      {!win.maximized && (
        <>
          <span className="rz" onPointerDown={(e) => startResize(e, "e")} style={{ cursor: "ew-resize", top: 6, bottom: 6, right: -3, width: 7 }} />
          <span className="rz" onPointerDown={(e) => startResize(e, "s")} style={{ cursor: "ns-resize", left: 6, right: 6, bottom: -3, height: 7 }} />
          <span className="rz" onPointerDown={(e) => startResize(e, "se")} style={{ cursor: "nwse-resize", right: -2, bottom: -2, width: 16, height: 16 }} />
        </>
      )}

      {zone && (
        <div
          style={{
            position: "fixed",
            pointerEvents: "none",
            zIndex: 50000,
            left: zone === "right" ? vw / 2 : 0,
            right: zone === "left" ? vw / 2 : undefined,
            top: 0,
            bottom: 0,
            background: "color-mix(in srgb, var(--accent) 14%, transparent)",
            border: `2px solid color-mix(in srgb, var(--accent) 50%, transparent)`,
            borderRadius: 10,
            transition: "all 80ms ease",
          }}
        />
      )}
    </div>
  );
}
