import { useEffect, useMemo, useRef, useState } from "react";
import { APP_LIST, APPS, GROUPS } from "./registry";
import { TASKBAR_H, useNovaContext } from "./wm";
import { WindowFrame } from "./Window";
import { useClock, useKernel } from "./hooks";
import { AppHost } from "./AppHost";
import type { NovaUser } from "./types";
import { Badge, Btn } from "../ui/primitives";
import { fmtBytes } from "../core/rng";

export function Desktop({ user }: { user: NovaUser }) {
  const wm = useNovaContext();
  const [startOpen, setStartOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    wm.setDesktop(desktopRef.current);
  }, [wm]);

  // close menus on outside click
  useEffect(() => {
    if (!startOpen && !notifOpen) return;
    const onDown = (e: PointerEvent) => {
      if (startRef.current?.contains(e.target as Node)) return;
      setStartOpen(false);
      setNotifOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [startOpen, notifOpen]);

  // auto-start apps
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    const list = wm.settings.autoStartApps;
    if (list.length) {
      const id = window.setTimeout(() => list.forEach((a) => wm.openApp(a as never)), 320);
      return () => window.clearTimeout(id);
    }
  }, [wm]);

  const topZ = useMemo(() => Math.max(0, ...wm.windows.map((w) => w.z)), [wm.windows]);

  return (
    <div className="nova-root">
      <div
        ref={desktopRef}
        className="nova-desktop"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
      >
        <div className="nova-wallpaper" data-w={wm.settings.wallpaper} />

        {/* desktop icons */}
        <div
          className="col"
          style={{ position: "absolute", top: 16, left: 14, gap: 4, zIndex: 1 }}
        >
          {(["files", "terminal", "browser", "netlab", "robots", "city", "cloud"] as const).map((id) => {
            const a = APPS[id];
            return (
              <div
                key={id}
                className="desktop-icon"
                data-selected={selected === id}
                onClick={() => setSelected(id)}
                onDoubleClick={() => wm.openApp(id)}
                title={`${a.name} — double-click to open`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && wm.openApp(id)}
              >
                <span style={{ fontSize: 28, filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }}>{a.icon}</span>
                <span>{a.name}</span>
              </div>
            );
          })}
        </div>

        {/* windows */}
        {wm.windows.map((win) => (
          <WindowFrame key={win.id} win={win}>
            <AppHost win={win} />
          </WindowFrame>
        ))}

        {/* start menu */}
        {startOpen && (
          <div
            ref={startRef}
            className="panel scroll"
            style={{
              position: "absolute",
              left: 8,
              bottom: TASKBAR_H + 6,
              width: 470,
              maxHeight: "min(560px, 78vh)",
              zIndex: 6000,
              padding: 0,
              animation: "pop 160ms cubic-bezier(0.2,0,0.2,1)",
            }}
          >
            <div
              className="row between"
              style={{ padding: 12, borderBottom: "1px solid var(--border)" }}
            >
              <div className="row" style={{ gap: 10 }}>
                <div
                  className="col center"
                  style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: "linear-gradient(140deg, var(--accent), var(--accent-2))",
                    color: "#04121c", fontWeight: 800,
                  }}
                >
                  {user.name[0].toUpperCase()}
                </div>
                <div className="col" style={{ gap: 0 }}>
                  <span className="semi" style={{ fontSize: 13 }}>{user.name}</span>
                  <span className="tiny dim" style={{ textTransform: "capitalize" }}>{user.role} · {user.shell}</span>
                </div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => { setStartOpen(false); wm.openApp("settings"); }}>
                ⚙ Settings
              </Btn>
            </div>

            <div style={{ padding: 10 }}>
              <div className="row wrap" style={{ gap: 4, marginBottom: 10 }}>
                {(["files", "terminal", "browser", "editor", "calculator"] as const).map((id) => (
                  <button
                    key={id}
                    className="btn btn-sm"
                    onClick={() => { setStartOpen(false); wm.openApp(id); }}
                  >
                    <span>{APPS[id].icon}</span> {APPS[id].name}
                  </button>
                ))}
              </div>

              {GROUPS.map((g) => (
                <div key={g.id} style={{ marginBottom: 10 }}>
                  <div className="tiny dim semi" style={{ padding: "2px 4px 5px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    {g.label}
                  </div>
                  <div className="row wrap" style={{ gap: 4 }}>
                    {APP_LIST.filter((a) => a.group === g.id).map((a) => (
                      <button
                        key={a.id}
                        className="btn btn-sm"
                        style={{ borderColor: selected === a.id ? a.accent : undefined }}
                        onClick={() => { setStartOpen(false); wm.openApp(a.id); }}
                        title={a.desc}
                      >
                        <span>{a.icon}</span> {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="row" style={{ gap: 4, marginTop: 4 }}>
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => { setStartOpen(false); wm.openApp("netmgr"); }}
                >
                  🛰 Network Manager
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => { setStartOpen(false); wm.openApp("appstore"); }}
                >
                  🛍 NOVA Store
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => { setStartOpen(false); wm.cascade(); }}
                >
                  ⧉ Tile windows
                </Btn>
              </div>
            </div>

            <div
              className="row between"
              style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 11.5 }}
            >
              <span className="dim">NOVA CLOUD PC · aurora-n1</span>
              <Btn size="sm" variant="ghost" onClick={() => { setStartOpen(false); wm.closeAll(); }}>
                Close all windows
              </Btn>
            </div>
          </div>
        )}

        {/* notification centre */}
        {notifOpen && (
          <div
            className="panel col"
            style={{
              position: "absolute",
              right: 8,
              bottom: TASKBAR_H + 6,
              width: 330,
              maxHeight: 420,
              zIndex: 6000,
              padding: 0,
              animation: "pop 160ms cubic-bezier(0.2,0,0.2,1)",
            }}
          >
            <div className="row between" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 12.5 }}>Notifications</strong>
              <Btn size="sm" variant="ghost" onClick={() => setNotifOpen(false)}>✕</Btn>
            </div>
            <div className="scroll" style={{ padding: 8 }}>
              {wm.notifications.length === 0 && (
                <div className="small dim" style={{ padding: 16, textAlign: "center" }}>
                  Nothing yet — the city, robots and cloud will post here.
                </div>
              )}
              {wm.notifications.map((nt) => (
                <div
                  key={nt.id}
                  className="card card-hover pointer"
                  onClick={() => wm.dismissNotification(nt.id)}
                  style={{ marginBottom: 6, borderLeft: `3px solid ${nt.tone === "ok" ? "var(--ok)" : nt.tone === "warn" ? "var(--warn)" : "var(--accent)"}` }}
                >
                  <div className="row between" style={{ gap: 8 }}>
                    <span className="semi small ellipsis">{nt.title}</span>
                    <span className="tiny dim nowrap">{new Date(nt.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>{nt.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Taskbar
          startOpen={startOpen}
          setStartOpen={setStartOpen}
          notifOpen={notifOpen}
          setNotifOpen={setNotifOpen}
          topZ={topZ}
        />
      </div>
    </div>
  );
}

function Taskbar({
  startOpen,
  setStartOpen,
  notifOpen,
  setNotifOpen,
  topZ,
}: {
  startOpen: boolean;
  setStartOpen: (v: boolean) => void;
  notifOpen: boolean;
  setNotifOpen: (v: boolean) => void;
  topZ: number;
}) {
  const wm = useNovaContext();
  const n = useKernel();
  void n;
  const now = useClock(1000);
  const [menu, setMenu] = useState<"sys" | null>(null);
  const s = n.system;

  const date = new Date(now);
  const clock = wm.settings.clock24
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className="taskbar">
        <button
          className="btn"
          onClick={() => {
            setStartOpen(!startOpen);
            setNotifOpen(false);
            setMenu(null);
          }}
          style={{ width: 40, justifyContent: "center", padding: 0, height: 34 }}
          title="Start"
          aria-label="Start menu"
        >
          <span
            style={{
              width: 20, height: 20, borderRadius: 6,
              background: "linear-gradient(140deg, var(--accent), var(--accent-2))",
              boxShadow: startOpen ? "0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent)" : "none",
            }}
          />
        </button>

        <div style={{ width: 1, height: 22, background: "var(--border)" }} />

        <div className="row grow" style={{ gap: 4, minWidth: 0, overflow: "hidden" }}>
          {wm.windows.map((w) => {
            const def = APPS[w.appId];
            return (
              <button
                key={w.id}
                className="task-item"
                data-active={!w.minimized && w.z === topZ}
                onClick={() => {
                  if (w.minimized) wm.restore(w.id);
                  else if (w.z === topZ) wm.minimize(w.id);
                  else wm.focus(w.id);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) wm.close(w.id);
                }}
                title={w.title}
              >
                <span>{def.icon}</span>
                <span className="ellipsis">{w.title}</span>
              </button>
            );
          })}
        </div>

        {/* tray */}
        <div className="row" style={{ gap: 4 }}>
          {wm.settings.showCpu && (
            <div
              className="row tiny mono"
              style={{ gap: 4, padding: "3px 7px", borderRadius: 6, color: "var(--text-2)" }}
              title={`CPU ${s.cpuLoad.toFixed(0)}% · RAM ${fmtBytes(s.memUsed * 1024 * 1024)} · ${wm.fps} fps`}
            >
              <span className="dim">CPU</span>
              <span style={{ color: s.cpuLoad > 80 ? "var(--err)" : s.cpuLoad > 55 ? "var(--warn)" : "var(--ok)" }}>
                {s.cpuLoad.toFixed(0)}%
              </span>
              <span className="dim">MEM</span>
              <span>{(s.memUsed / 1024).toFixed(1)}G</span>
            </div>
          )}

          <button
            className="btn btn-ghost btn-icon"
            onClick={() => { setNotifOpen(!notifOpen); setStartOpen(false); }}
            title="Notifications"
            aria-label="Notifications"
            style={{ position: "relative" }}
          >
            🔔
            {wm.notifications.length > 0 && (
              <span
                style={{
                  position: "absolute", top: 1, right: 1, minWidth: 13, height: 13,
                  borderRadius: 99, background: "var(--err)", color: "#fff",
                  fontSize: 9, display: "grid", placeItems: "center", padding: "0 3px",
                }}
              >
                {wm.notifications.length}
              </span>
            )}
          </button>

          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setMenu(menu === "sys" ? null : "sys")}
            title="System menu"
            aria-label="System menu"
          >
            ⏻
          </button>

          <button
            className="btn btn-ghost"
            onClick={() => wm.openApp("settings")}
            style={{ gap: 8, paddingLeft: 10, paddingRight: 10 }}
            title="Date and time"
          >
            <span className="col" style={{ alignItems: "flex-end", gap: 0, lineHeight: 1.15 }}>
              <span className="mono semi" style={{ fontSize: 12.5 }}>{clock}</span>
              <span className="tiny dim">{date.toLocaleDateString([], { day: "2-digit", month: "short" })}</span>
            </span>
          </button>
        </div>
      </div>

      {menu === "sys" && (
        <div
          className="panel col"
          style={{
            position: "absolute",
            right: 8,
            bottom: TASKBAR_H + 6,
            width: 290,
            zIndex: 6000,
            padding: 10,
            gap: 8,
            animation: "pop 150ms cubic-bezier(0.2,0,0.2,1)",
          }}
        >
          <div className="row between">
            <strong className="small">System</strong>
            <Badge tone="ok">online</Badge>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <div className="row between tiny">
              <span className="dim">CPU</span>
              <span className="mono">{s.cpuLoad.toFixed(0)}%</span>
            </div>
            <div className="row between tiny">
              <span className="dim">Memory</span>
              <span className="mono">{(s.memUsed / 1024).toFixed(1)} / {(s.memTotal / 1024).toFixed(0)} GB</span>
            </div>
            <div className="row between tiny">
              <span className="dim">Processes</span>
              <span className="mono">{n.proc.list().length}</span>
            </div>
            <div className="row between tiny">
              <span className="dim">Uptime</span>
              <span className="mono">{Math.floor(s.uptimeMs / 60000)}m</span>
            </div>
          </div>
          <div className="hr" style={{ margin: "2px 0" }} />
          <div className="row wrap" style={{ gap: 5 }}>
            <Btn size="sm" onClick={() => { setMenu(null); wm.openApp("taskmgr"); }}>Processes</Btn>
            <Btn size="sm" onClick={() => { setMenu(null); wm.openApp("sysmon"); }}>Performance</Btn>
            <Btn size="sm" onClick={() => { setMenu(null); wm.openApp("settings"); }}>Settings</Btn>
          </div>
          <Btn
            variant="danger"
            size="sm"
            onClick={() => {
              n.persist();
              n.factoryReset();
            }}
          >
            ⏻ Power off & reset machine
          </Btn>
        </div>
      )}
    </>
  );
}
