import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { APPS } from "./registry";
import { DEFAULT_SETTINGS, type AppId, type DesktopSettings, type WinState } from "./types";
import { nova } from "../core/nova";

export const TASKBAR_H = 46;
export const SNAP_PREVIEW = 12;

export type SnapZone = "left" | "right" | "top" | "bottom-left" | "bottom-right" | null;

export interface LaunchOptions {
  title?: string;
  args?: Record<string, unknown>;
}

interface NovaCtx {
  windows: WinState[];
  settings: DesktopSettings;
  setSettings: (patch: Partial<DesktopSettings>) => void;
  openApp: (appId: AppId, opts?: LaunchOptions) => void;
  close: (id: string) => void;
  closeAll: () => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMax: (id: string) => void;
  restore: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, w: number, h: number) => void;
  setTitle: (id: string, title: string) => void;
  snap: (id: string, zone: SnapZone) => void;
  cascade: () => void;
  desktop: HTMLElement | null;
  setDesktop: (el: HTMLElement | null) => void;
  argsFor: (id: string) => Record<string, unknown>;
  notifications: Notification[];
  notify: (n: Omit<Notification, "id" | "ts">) => void;
  dismissNotification: (id: string) => void;
  fps: number;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  ts: number;
  tone: "info" | "ok" | "warn";
  source?: string;
}

const Ctx = createContext<NovaCtx | null>(null);

let zCounter = 10;

export function NovaProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<WinState[]>([]);
  const [settings, setSettingsState] = useState<DesktopSettings>(() => {
    try {
      const raw = localStorage.getItem("nova-settings");
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      /* ignore corrupt settings */
    }
    return DEFAULT_SETTINGS;
  });
  const [args, setArgs] = useState<Record<string, Record<string, unknown>>>({});
  const [desktop, setDesktop] = useState<HTMLElement | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [fps, setFps] = useState(60);
  const idRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem("nova-settings", JSON.stringify(settings));
    } catch {
      /* storage full — settings are non-critical */
    }
    const root = document.documentElement;
    root.classList.toggle("light", settings.theme === "light");
    root.style.setProperty("--accent", settings.accent);
    root.dataset.wallpaper = settings.wallpaper;
    root.dataset.motion = settings.reduceMotion ? "reduced" : "full";
  }, [settings]);

  // frame-rate meter for the tray
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(frames);
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setSettings = useCallback((patch: Partial<DesktopSettings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const viewport = useCallback(() => {
    const el = desktop ?? document.body;
    return { w: el.clientWidth || window.innerWidth, h: el.clientHeight || window.innerHeight };
  }, [desktop]);

  const openApp = useCallback(
    (appId: AppId, opts?: LaunchOptions) => {
      const def = APPS[appId];
      const vp = viewport();
      idRef.current += 1;
      const id = `w${idRef.current}`;

      setWindows((prev) => {
        if (def.singleton) {
          const existing = prev.find((w) => w.appId === appId);
          if (existing) {
            zCounter += 1;
            return prev.map((w) =>
              w.id === existing.id
                ? { ...w, minimized: false, z: zCounter, title: opts?.title ?? w.title }
                : w,
            );
          }
        }
        // cascade placement so a new window never hides behind another
        const n = prev.length;
        const w = Math.min(def.w, vp.w - 40);
        const h = Math.min(def.h, vp.h - TASKBAR_H - 30);
        const baseX = def.defaultX ?? 120;
        const x = clampNum(baseX + n * 28, 8, Math.max(8, vp.w - w - 8));
        const y = clampNum((def.defaultY ?? 60) + n * 26, 8, Math.max(8, vp.h - TASKBAR_H - h - 8));
        zCounter += 1;
        const next: WinState = {
          id,
          appId,
          title: opts?.title ?? def.windowTitle,
          x,
          y,
          w,
          h,
          minimized: false,
          maximized: false,
          z: zCounter,
        };
        if (opts?.args) setArgs((a) => ({ ...a, [id]: opts.args! }));
        nova().proc.spawn({
          name: processNameFor(appId),
          appId,
          title: next.title,
          windowId: id,
          cpu: cpuFor(appId),
          ram: ramFor(appId),
          net: netFor(appId),
          io: 8,
        });
        return [...prev, next];
      });
    },
    [viewport],
  );

  const close = useCallback((id: string) => {
    setWindows((prev) => {
      const w = prev.find((x) => x.id === id);
      if (w) {
        const p = nova().proc.byWindow(id);
        if (p) nova().proc.kill(p.pid);
      }
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const closeAll = useCallback(() => {
    setWindows((prev) => {
      for (const w of prev) {
        const p = nova().proc.byWindow(w.id);
        if (p) nova().proc.kill(p.pid);
      }
      return [];
    });
  }, []);

  const focus = useCallback((id: string) => {
    setWindows((prev) => {
      const target = prev.find((w) => w.id === id);
      if (!target || target.z === Math.max(...prev.map((w) => w.z))) return prev;
      zCounter += 1;
      return prev.map((w) => (w.id === id ? { ...w, z: zCounter, minimized: false } : w));
    });
  }, []);

  const minimize = useCallback((id: string) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, minimized: true } : w)));
  }, []);

  const restore = useCallback((id: string) => {
    zCounter += 1;
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, minimized: false, z: zCounter } : w)),
    );
  }, []);

  const toggleMax = useCallback(
    (id: string) => {
      setWindows((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          const vp = viewport();
          if (w.maximized && w.restore) {
            return { ...w, maximized: false, ...w.restore };
          }
          return {
            ...w,
            maximized: true,
            restore: { x: w.x, y: w.y, w: w.w, h: w.h },
            x: 0,
            y: 0,
            w: vp.w,
            h: vp.h - TASKBAR_H,
          };
        }),
      );
    },
    [viewport],
  );

  const move = useCallback((id: string, x: number, y: number) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, x, y, maximized: false } : w)));
  }, []);

  const resize = useCallback((id: string, w: number, h: number) => {
    setWindows((prev) => prev.map((win) => (win.id === id ? { ...win, w, h, maximized: false } : win)));
  }, []);

  const setTitle = useCallback((id: string, title: string) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, title } : w)));
    const p = nova().proc.byWindow(id);
    if (p) {
      p.title = title;
      nova().proc.bus.emit("change");
    }
  }, []);

  const snap = useCallback(
    (id: string, zone: SnapZone) => {
      if (!zone) return;
      const vp = viewport();
      const halfW = Math.round(vp.w / 2);
      const halfH = Math.round((vp.h - TASKBAR_H) / 2);
      const h = vp.h - TASKBAR_H;
      const geo: Record<string, { x: number; y: number; w: number; h: number }> = {
        left: { x: 0, y: 0, w: halfW, h },
        right: { x: vp.w - halfW, y: 0, w: halfW, h },
        top: { x: 0, y: 0, w: vp.w, h },
        "bottom-left": { x: 0, y: h - halfH, w: halfW, h: halfH },
        "bottom-right": { x: vp.w - halfW, y: h - halfH, w: halfW, h: halfH },
      };
      const g = geo[zone];
      if (!g) return;
      setWindows((prev) =>
        prev.map((w) =>
          w.id === id
            ? {
                ...w,
                ...g,
                maximized: false,
                restore: w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h },
              }
            : w,
        ),
      );
    },
    [viewport],
  );

  const cascade = useCallback(() => {
    const vp = viewport();
    setWindows((prev) => {
      let n = 0;
      return prev.map((w) => {
        const x = 30 + n * 34;
        const y = 24 + n * 30;
        n++;
        return {
          ...w,
          maximized: false,
          x: clampNum(x, 4, Math.max(4, vp.w - 200)),
          y: clampNum(y, 4, Math.max(4, vp.h - TASKBAR_H - 120)),
        };
      });
    });
  }, [viewport]);

  const argsFor = useCallback((id: string) => args[id] ?? {}, [args]);

  const notify = useCallback((n: Omit<Notification, "id" | "ts">) => {
    const id = `n${Date.now()}${Math.floor(performance.now() % 1000)}`;
    setNotifications((prev) => [{ ...n, id, ts: Date.now() }, ...prev].slice(0, 6));
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((x) => x.id !== id));
    }, 6000);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const value = useMemo<NovaCtx>(
    () => ({
      windows,
      settings,
      setSettings,
      openApp,
      close,
      closeAll,
      focus,
      minimize,
      toggleMax,
      restore,
      move,
      resize,
      setTitle,
      snap,
      cascade,
      desktop,
      setDesktop,
      argsFor,
      notifications,
      notify,
      dismissNotification,
      fps,
    }),
    [
      windows, settings, setSettings, openApp, close, closeAll, focus, minimize, toggleMax, restore,
      move, resize, setTitle, snap, cascade, desktop, argsFor, notifications, notify,
      dismissNotification, fps,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNovaContext(): NovaCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNovaContext must be used inside <NovaProvider>");
  return ctx;
}

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function processNameFor(appId: AppId): string {
  switch (appId) {
    case "files": return "filemanager.exe";
    case "terminal": case "terminalFull": return "terminal.exe";
    case "editor": return "editor.exe";
    case "calculator": return "calc.exe";
    case "browser": return "browser.exe";
    case "settings": return "settings.exe";
    case "taskmgr": return "taskmgr.exe";
    case "sysmon": return "sysmon.exe";
    case "netmgr": return "netmgr.exe";
    case "netlab": return "network_service.exe";
    case "appstore": return "appstore.exe";
    case "cloud": return "nova-cloud-console.exe";
    case "drive": return "cloud_sync.exe";
    case "robots": return "robot_lab.exe";
    case "city": return "city_sim.exe";
    default: return "app.exe";
  }
}

function cpuFor(appId: AppId): number {
  switch (appId) {
    case "city": return 6.5;
    case "robots": return 4.5;
    case "netlab": return 3.2;
    case "browser": return 3.5;
    case "terminal": case "terminalFull": return 1.1;
    default: return 1.6;
  }
}

function ramFor(appId: AppId): number {
  switch (appId) {
    case "city": return 520;
    case "robots": return 380;
    case "netlab": return 300;
    case "browser": return 340;
    case "cloud": return 260;
    case "files": return 110;
    default: return 130;
  }
}

function netFor(appId: AppId): number {
  switch (appId) {
    case "browser": return 22;
    case "netlab": return 18;
    case "drive": return 14;
    case "cloud": return 10;
    case "robots": return 7;
    default: return 2;
  }
}
