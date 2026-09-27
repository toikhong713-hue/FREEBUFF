import { useEffect, useMemo, useRef, useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { Badge, Btn, Empty, KV, Meter, Slider, Tabs, loadColor } from "../ui/primitives";
import { fmtBytes, uid } from "../core/rng";
import {
  COMPONENTS,
  PART_CATEGORIES,
  WORLD_H,
  WORLD_W,
  compById,
  configDerived,
  defaultConfig,
  partsFor,
  type Behavior,
  type Robot,
  type RobotConfig,
} from "../core/robots";

type Tab = "build" | "sim" | "fleet" | "bench";
type Nova = ReturnType<typeof useKernel>;

const BEHAVIORS: Behavior[] = ["explore", "patrol", "follow", "work", "recharge"];

const CATEGORY_META: Record<string, { label: string; icon: string; hue: number }> = {
  cpu: { label: "CPU", icon: "🧠", hue: 265 },
  ram: { label: "Memory", icon: "🧩", hue: 210 },
  gpu: { label: "GPU", icon: "🎮", hue: 320 },
  storage: { label: "Storage", icon: "💾", hue: 150 },
  battery: { label: "Battery", icon: "🔋", hue: 45 },
  sensor: { label: "Sensors", icon: "📡", hue: 190 },
  motor: { label: "Motors", icon: "⚙️", hue: 25 },
  comm: { label: "Comms", icon: "📶", hue: 175 },
  cooling: { label: "Cooling", icon: "❄️", hue: 195 },
};

export function RobotLabApp(_props: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const [tab, setTab] = useState<Tab>("build");
  const [cfg, setCfg] = useState<RobotConfig>(() => defaultConfig());
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

  const live = useMemo(
    () => n.robots.robots,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const sel = selected ? n.robots.robots.find((r) => r.id === selected) ?? null : null;
  const d = configDerived(cfg);

  const setPart = (cat: string, id: string) => setCfg((c) => ({ ...c, parts: { ...c.parts, [cat]: id } }));

  const save = () => {
    n.saveRobotConfig({ ...cfg, id: cfg.id || uid("cfg") });
    wm.notify({ title: "Robot saved", body: `${cfg.name} written to /robots and NovaDB`, tone: "ok", source: "robots" });
  };

  const spawn = (c: RobotConfig = cfg) => {
    const r = n.robots.spawn(c);
    setSelected(r.id);
    setTab("sim");
  };

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "build", label: "Builder" },
            { value: "sim", label: "Simulation", badge: live.length },
            { value: "fleet", label: "Fleet", badge: n.robots.listConfigs().length },
            { value: "bench", label: "Benchmarks", badge: n.robots.benches.length },
          ]}
        />
        <span className="spacer" />
        <Badge tone={d.enduranceH < 2 ? "warn" : "ok"}>{d.enduranceH.toFixed(1)}h endurance</Badge>
        <Badge>{d.score} score</Badge>
        <Badge>{d.cost} cr</Badge>
      </div>

      {tab === "build" && (
        <div className="row grow" style={{ minHeight: 0 }}>
          <div className="sidebar" style={{ width: 200 }}>
            <div className="tiny dim semi" style={{ padding: "2px 6px 6px" }}>CHASSIS</div>
            <div className="col" style={{ gap: 6, padding: "0 4px 8px" }}>
              <input
                className="input"
                value={cfg.name}
                onChange={(e) => setCfg({ ...cfg, name: e.target.value })}
                placeholder="Robot name"
              />
              <select
                className="select"
                value={cfg.behaviour}
                onChange={(e) => setCfg({ ...cfg, behaviour: e.target.value as Behavior })}
              >
                {BEHAVIORS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="color"
                value={cfg.color}
                onChange={(e) => setCfg({ ...cfg, color: e.target.value })}
                style={{ height: 30, padding: 2 }}
                aria-label="Chassis colour"
              />
            </div>
            <div className="hr" />
            <div className="tiny dim semi" style={{ padding: "2px 6px 6px" }}>COMPONENTS</div>
            {PART_CATEGORIES.map((cat) => {
              const meta = CATEGORY_META[cat];
              const chosen = compById(cfg.parts[cat]);
              return (
                <button
                  key={cat}
                  className="sidebar-item"
                  aria-current={false}
                  onClick={() => {
                    const el = document.getElementById(`cat-${cat}`);
                    el?.scrollIntoView({ block: "center", behavior: "smooth" });
                    el?.animate(
                      [{ boxShadow: "0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent)" }, { boxShadow: "0 0 0 6px transparent" }],
                      { duration: 700 },
                    );
                  }}
                >
                  <span>{meta.icon}</span>
                  <span className="grow ellipsis">{meta.label}</span>
                  <span className="tiny dim ellipsis" style={{ maxWidth: 72, textAlign: "right" }}>
                    {chosen ? chosen.name.split(" ").pop() : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="scroll grow" style={{ padding: 14 }}>
            <div className="col" style={{ gap: 16 }}>
              <div className="row wrap" style={{ gap: 14, alignItems: "flex-start" }}>
                <div className="panel-flat col" style={{ padding: 14, gap: 4, minWidth: 240, flex: "1 1 240px" }}>
                  <strong className="small">Derived performance</strong>
                  <KV k="Compute" v={`${d.compute} pts`} />
                  <KV k="Endurance" v={`${d.enduranceH.toFixed(2)} h`} />
                  <KV k="Draw" v={`${d.drawW.toFixed(1)} W`} />
                  <KV k="Mass" v={`${d.mass.toFixed(2)} kg`} />
                  <KV k="Top speed" v={`${d.topSpeed.toFixed(2)} m/s`} />
                  <KV k="Sensor range" v={`${d.sensorRange} m`} />
                  <KV k="Sensor rate" v={`${d.sensorHz} Hz`} />
                  <KV k="Cooling Δ" v={`${d.cooling} °C`} />
                  <KV k="Cost" v={`${d.cost} credits`} />
                </div>
                <div className="panel-flat col" style={{ padding: 14, gap: 10, minWidth: 240, flex: "1 1 240px" }}>
                  <strong className="small">Tuning</strong>
                  <Slider label="Speed multiplier" min={0.3} max={2.2} step={0.1} value={cfg.speed} format={(v) => `${v.toFixed(1)}×`} onChange={(v) => setCfg({ ...cfg, speed: v })} />
                  <Slider label="Sensor range" min={2} max={12} step={0.5} value={cfg.sensorRange} format={(v) => `${v} m`} onChange={(v) => setCfg({ ...cfg, sensorRange: v })} />
                  <div className="hr" style={{ margin: 0 }} />
                  <div className="row" style={{ gap: 6 }}>
                    <Btn variant="primary" onClick={save}>💾 Save config</Btn>
                    <Btn onClick={() => spawn()}>▶ Run now</Btn>
                    <Btn onClick={() => setCfg({ ...defaultConfig(`Robot-${cfg.name.length + 1}`) })}>New</Btn>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {n.robots.listConfigs().slice(0, 6).map((c) => (
                      <Btn key={c.id} size="sm" variant="ghost" onClick={() => setCfg(c)}>
                        {c.name}
                      </Btn>
                    ))}
                  </div>
                </div>
              </div>

              {PART_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const options = partsFor(cat);
                return (
                  <div key={cat} id={`cat-${cat}`} className="panel col" style={{ padding: 14, gap: 8 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{meta.icon}</span>
                      <strong className="small">{meta.label}</strong>
                      <span className="spacer" />
                      <span className="tiny dim mono">{cfg.parts[cat]}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
                      {options.map((p) => {
                        const active = cfg.parts[cat] === p.id;
                        return (
                          <button
                            key={p.id}
                            className="card card-hover col"
                            style={{
                              gap: 3,
                              textAlign: "left",
                              cursor: "pointer",
                              font: "inherit",
                              color: "var(--text)",
                              borderColor: active ? `hsl(${meta.hue} 65% 55%)` : undefined,
                              background: active ? `hsl(${meta.hue} 55% 45% / 0.14)` : undefined,
                            }}
                            onClick={() => setPart(cat, p.id)}
                          >
                            <div className="row between">
                              <span className="small semi ellipsis">{p.name}</span>
                              {active && <span style={{ color: "var(--ok)", fontSize: 11 }}>✓</span>}
                            </div>
                            <span className="tiny dim">{p.blurb}</span>
                            <div className="row tiny dim" style={{ gap: 8, flexWrap: "wrap" }}>
                              {Object.entries(p.spec).map(([k, v]) => (
                                <span key={k} className="mono">
                                  {k} {v}
                                </span>
                              ))}
                              <span>{p.cost} cr</span>
                              <span>{p.massKg} kg</span>
                              <span>{p.powerW} W</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "sim" && <SimPane n={n} sel={sel} setSelected={setSelected} />}

      {tab === "fleet" && (
        <FleetPane
          n={n}
          compare={compare}
          setCompare={setCompare}
          onSpawn={(c) => { spawn(c); setTab("sim"); }}
          onEdit={(c) => { setCfg(c); setTab("build"); }}
        />
      )}

      {tab === "bench" && <BenchPane n={n} />}

      <div className="app-status">
        <Badge tone="ok">{live.length} running</Badge>
        <span>{n.robots.objects.length} packages</span>
        <span>{n.robots.obstacles.length} obstacles</span>
        <span>{n.robots.chargers.length} chargers</span>
        <span className="spacer" />
        <Btn size="sm" onClick={() => wm.openApp("city")}>Deploy to city →</Btn>
        <span className="dim mono">
          world {WORLD_W}×{WORLD_H}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sim */

function SimPane({ n, sel, setSelected }: { n: Nova; sel: Robot | null; setSelected: (id: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wm = useNovaContext();
  const [showPaths, setShowPaths] = useState(true);
  const [showLog, setShowLog] = useState(true);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const lab = n.robots;
      ctx.clearRect(0, 0, WORLD_W, WORLD_H);

      // floor grid
      ctx.strokeStyle = "rgba(125,160,215,0.10)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= WORLD_W; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, WORLD_H);
        ctx.stroke();
      }
      for (let y = 0; y <= WORLD_H; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(WORLD_W, y + 0.5);
        ctx.stroke();
      }

      // obstacles
      for (const o of lab.obstacles) {
        ctx.fillStyle =
          o.kind === "wall" ? "#1e293b" : o.kind === "plant" ? "#14532d" : o.kind === "pillar" ? "#334155" : o.kind === "barrier" ? "#78350f" : "#44403c";
        ctx.strokeStyle = o.kind === "wall" ? "#475569" : "rgba(255,255,255,0.12)";
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
      }

      // chargers
      for (const c of lab.chargers) {
        ctx.fillStyle = c.active ? "rgba(52,211,153,0.18)" : "rgba(100,116,139,0.12)";
        ctx.fillRect(c.x - 26, c.y - 18, 52, 36);
        ctx.strokeStyle = c.active ? "#34d399" : "#64748b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(c.x - 26, c.y - 18, 52, 36);
        ctx.fillStyle = c.active ? "#34d399" : "#64748b";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("⚡", c.x, c.y + 3);
      }

      // nav targets
      for (const t of lab.targets) {
        ctx.strokeStyle = t.active ? "#38bdf8" : "#475569";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(t.x - 7, t.y);
        ctx.lineTo(t.x + 7, t.y);
        ctx.moveTo(t.x, t.y - 7);
        ctx.lineTo(t.x, t.y + 7);
        ctx.stroke();
        ctx.fillStyle = "#64748b";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(t.label, t.x, t.y - 19);
      }

      // objects
      for (const o of lab.objects) {
        ctx.fillStyle = o.pickedUpBy ? "#f472b6" : "#fbbf24";
        ctx.fillRect(o.x - 7, o.y - 7, 14, 14);
        ctx.fillStyle = "#0f172a";
        ctx.font = "8px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("P", o.x, o.y + 3);
      }

      // robot paths + bodies
      for (const r of lab.robots) {
        if (showPaths && r.waypoints.length) {
          ctx.strokeStyle = r.config.color + "66";
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          for (let i = 0; i < r.waypoints.length; i++) ctx.lineTo(r.waypoints[i].x, r.waypoints[i].y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // sensor cone
        if (r.status === "moving" || r.status === "blocked") {
          const range = Math.max(configDerived(r.config).sensorRange * 26, 40);
          ctx.fillStyle = r.config.color + "18";
          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          ctx.arc(r.x, r.y, range, r.heading - 0.6, r.heading + 0.6);
          ctx.closePath();
          ctx.fill();
        }

        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.heading);
        ctx.fillStyle = r.config.color;
        ctx.fillRect(-13, -10, 26, 20);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(6, -7, 7, 14);
        ctx.restore();

        ctx.strokeStyle = sel?.id === r.id ? "#fff" : r.config.color;
        ctx.lineWidth = sel?.id === r.id ? 2.4 : 1.2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 16, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#cbd5e1";
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(r.config.name, r.x, r.y - 22);
        ctx.fillStyle = r.battery < 25 ? "#f87171" : "#64748b";
        ctx.font = "9px ui-monospace, monospace";
        ctx.fillText(`${r.battery.toFixed(0)}% ${r.status}`, r.x, r.y + 28);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [n, sel, showPaths]);

  return (
    <div className="row grow" style={{ minHeight: 0 }}>
      <div className="grow col" style={{ minWidth: 0 }}>
        <div className="app-toolbar">
          <Btn
            size="sm"
            onClick={() => {
              n.robots.paused = !n.robots.paused;
              n.markDirty("robots");
            }}
          >
            {n.robots.paused ? "▶ Resume" : "⏸ Pause"}
          </Btn>
          <span style={{ width: 1, height: 20, background: "var(--border)" }} />
          <Btn size="sm" onClick={() => n.robots.buildWorld()}>↻ New world</Btn>
          <label className="checkbox small">
            <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} />
            paths
          </label>
          <span className="spacer" />
          <Badge tone={n.robots.robots.length ? "ok" : undefined}>{n.robots.robots.length} robots</Badge>
          {n.robots.paused && <Badge tone="warn">paused</Badge>}
        </div>
        {n.robots.robots.length === 0 ? (
          <Empty icon="🤖" title="No robots running" hint="Build one in the Builder tab and press Run, or start a saved config from the Fleet." />
        ) : (
          <canvas
            ref={canvasRef}
            width={WORLD_W}
            height={WORLD_H}
            onClick={(e) => {
              const r = canvasRef.current!.getBoundingClientRect();
              const x = ((e.clientX - r.left) / r.width) * WORLD_W;
              const y = ((e.clientY - r.top) / r.height) * WORLD_H;
              const hit = n.robots.robots.find((rb) => Math.hypot(rb.x - x, rb.y - y) < 22);
              setSelected(hit ? hit.id : null);
            }}
            style={{ width: "100%", flex: 1, display: "block", minHeight: 0, background: "var(--bg-1)", objectFit: "contain" }}
          />
        )}
      </div>

      <aside className="sidebar" style={{ width: 300, borderRight: 0, borderLeft: "1px solid var(--border)" }}>
        {sel ? (
          <div className="col" style={{ gap: 10 }}>
            <div className="row between">
              <div className="row" style={{ gap: 8 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: sel.config.color }} />
                <strong className="small">{sel.config.name}</strong>
              </div>
              <Btn size="sm" variant="danger" onClick={() => { n.robots.remove(sel.id); setSelected(null); }}>Stop</Btn>
            </div>
            <div className="hr" style={{ margin: 0 }} />
            <div className="col" style={{ gap: 5 }}>
              <Metric label="CPU" pct={sel.metrics.cpu} color="var(--accent)" />
              <Metric label="GPU" pct={sel.metrics.gpu} color="var(--accent-2)" />
              <Metric label="Memory" pct={sel.metrics.ram} color="#f472b6" />
              <Metric label="Battery" pct={sel.battery} color={sel.battery < 25 ? "var(--err)" : "var(--ok)"} />
              <Metric label="Thermal" pct={(sel.metrics.temp / 95) * 100} color={sel.metrics.temp > 75 ? "var(--err)" : "var(--warn)"} text={`${sel.metrics.temp.toFixed(0)}°C`} />
            </div>
            <div className="hr" style={{ margin: 0 }} />
            <KV k="Status" v={sel.status} />
            <KV k="Behaviour" v={sel.config.behaviour} />
            <KV k="Position" v={`${sel.x.toFixed(0)}, ${sel.y.toFixed(0)}`} />
            <KV k="Distance" v={`${sel.distance.toFixed(1)} m`} />
            <KV k="Collisions" v={sel.metrics.collisions} />
            <KV k="Sensor rate" v={`${sel.metrics.sensorHz.toFixed(1)} Hz`} />
            <KV k="Net" v={`${sel.metrics.net.toFixed(1)} KB/s`} />
            <KV k="Battery drain" v={`${sel.metrics.batteryDrain.toFixed(3)} %/h`} />
            <KV k="Carrying" v={sel.carried ? (n.robots.objects.find((o) => o.id === sel.carried)?.label ?? "—") : "—"} />
            <div className="hr" style={{ margin: 0 }} />
            <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
              <Btn
                size="sm"
                variant="primary"
                onClick={() => {
                  const p = n.robots.writeTelemetry(sel);
                  wm.notify({ title: "Telemetry written", body: p ?? "failed", tone: "ok" });
                }}
              >
                Write telemetry
              </Btn>
              <Btn
                size="sm"
                onClick={() => {
                  const r = n.uploadRobotTelemetry(sel.id);
                  wm.notify({
                    title: "Uploaded to cloud",
                    body: r ? `${r.path} · readable at telemetry.nova.cloud` : "Upload failed",
                    tone: r ? "ok" : "warn",
                  });
                }}
              >
                ⬆ Upload to cloud
              </Btn>
              <Btn size="sm" onClick={() => n.robots.benchmark(sel.id)}>Benchmark</Btn>
              <Btn
                size="sm"
                onClick={() => {
                  n.city.deployRobot(sel, sel.config.name);
                  wm.notify({ title: "Deployed to Aurora", body: `${sel.config.name} is now a city service unit`, tone: "ok" });
                }}
              >
                🏙 Deploy to city
              </Btn>
            </div>
            <div className="hr" style={{ margin: 0 }} />
            <label className="checkbox small">
              <input type="checkbox" checked={showLog} onChange={(e) => setShowLog(e.target.checked)} />
              event log
            </label>
            {showLog && (
              <div className="scroll" style={{ maxHeight: 200, fontSize: 10.5, fontFamily: "var(--mono)" }}>
                {sel.log
                  .slice(-40)
                  .reverse()
                  .map((l, i) => (
                    <div
                      key={i}
                      style={{
                        color:
                          l.level === "error" ? "var(--err)" : l.level === "warn" ? "var(--warn)" : l.level === "telemetry" ? "var(--info)" : "var(--text-2)",
                        padding: "1px 0",
                      }}
                    >
                      {new Date(l.ts).toISOString().slice(11, 19)} [{l.level}] {l.msg}
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            <strong className="small">Robots in the lab</strong>
            {n.robots.robots.length === 0 && <div className="tiny dim">Nothing running.</div>}
            {n.robots.robots.map((r) => (
              <button key={r.id} className="card card-hover col" style={{ gap: 3, textAlign: "left", cursor: "pointer" }} onClick={() => setSelected(r.id)}>
                <div className="row between">
                  <span className="small semi">{r.config.name}</span>
                  <span className="tiny dim">{r.status}</span>
                </div>
                <Meter pct={r.battery} />
                <span className="tiny dim mono">
                  {r.x.toFixed(0)},{r.y.toFixed(0)} · {r.battery.toFixed(0)}% · {r.metrics.cpu.toFixed(0)}%cpu
                </span>
              </button>
            ))}
            <div className="hr" style={{ margin: 0 }} />
            <div className="col" style={{ gap: 4 }}>
              <span className="tiny dim semi">WORLD</span>
              <KV k="Floor" v={`${WORLD_W} × ${WORLD_H}`} />
              <KV k="Obstacles" v={n.robots.obstacles.length} />
              <KV k="Chargers" v={n.robots.chargers.length} />
              <KV k="Nav targets" v={n.robots.targets.length} />
              <KV k="Packages" v={n.robots.objects.length} />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Metric({ label, pct, color, text }: { label: string; pct: number; color: string; text?: string }) {
  return (
    <div className="col" style={{ gap: 2 }}>
      <div className="row between tiny">
        <span className="dim">{label}</span>
        <span className="mono">{text ?? `${pct.toFixed(0)}%`}</span>
      </div>
      <Meter pct={pct} color={color} />
    </div>
  );
}

/* ---------------------------------------------------------------- fleet */

function FleetPane({
  n,
  compare,
  setCompare,
  onSpawn,
  onEdit,
}: {
  n: Nova;
  compare: string[];
  setCompare: (c: string[]) => void;
  onSpawn: (c: RobotConfig) => void;
  onEdit: (c: RobotConfig) => void;
}) {
  const wm = useNovaContext();
  const configs = useMemo(
    () => n.robots.listConfigs(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );

  const dup = (c: RobotConfig) => {
    const copy: RobotConfig = { ...c, id: uid("cfg"), name: `${c.name}-copy`, parts: { ...c.parts }, createdAt: Date.now() };
    n.robots.saveConfig(copy);
    n.markDirty("robots");
  };

  return (
    <div className="row grow" style={{ minHeight: 0 }}>
      <div className="scroll grow" style={{ padding: 14 }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <strong className="small">Saved configurations</strong>
          <span className="tiny dim">select up to 3 to compare</span>
        </div>
        {configs.length === 0 && <Empty icon="💾" title="No saved robots" hint="Build one and press Save config." />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
          {configs.map((c) => {
            const d = configDerived(c);
            const on = compare.includes(c.id);
            return (
              <div key={c.id} className="panel col" style={{ padding: 14, gap: 8, borderColor: on ? "var(--accent)" : undefined }}>
                <div className="row between">
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color }} />
                    <span className="small semi ellipsis">{c.name}</span>
                  </div>
                  <label className="checkbox tiny">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setCompare(on ? compare.filter((x) => x !== c.id) : [...compare, c.id].slice(-3))}
                    />
                    compare
                  </label>
                </div>
                <div className="row wrap tiny dim mono" style={{ gap: 6 }}>
                  <span className="badge">{c.behaviour}</span>
                  {PART_CATEGORIES.map((k) => (
                    <span key={k} className="badge">
                      {compById(c.parts[k])?.name.split(" ").pop() ?? "—"}
                    </span>
                  ))}
                </div>
                <div className="hr" style={{ margin: 0 }} />
                <KV k="Compute" v={d.compute} />
                <KV k="Endurance" v={`${d.enduranceH.toFixed(1)}h`} />
                <KV k="Mass" v={`${d.mass.toFixed(2)}kg`} />
                <KV k="Cost" v={d.cost} />
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  <Btn size="sm" variant="primary" onClick={() => onSpawn(c)}>Run</Btn>
                  <Btn size="sm" onClick={() => onEdit(c)}>Edit</Btn>
                  <Btn size="sm" onClick={() => dup(c)}>Duplicate</Btn>
                  <Btn
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      n.db.removeWhere("robot_configs", (r) => r.id === c.id);
                      n.markDirty("robots");
                    }}
                  >
                    Delete
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="sidebar" style={{ width: 300, borderRight: 0, borderLeft: "1px solid var(--border)" }}>
        <div className="col" style={{ gap: 8 }}>
          <strong className="small">Comparison</strong>
          {compare.length < 2 && <div className="tiny dim">Select at least two configurations.</div>}
          {compare.map((id) => configs.find((c) => c.id === id)).filter(Boolean).map((c) => {
            const d = configDerived(c!);
            return (
              <div key={c!.id} className="card col" style={{ gap: 2 }}>
                <span className="small semi">{c!.name}</span>
                <span className="tiny dim mono">{c!.behaviour}</span>
                <KV k="compute" v={d.compute} />
                <KV k="endurance" v={`${d.enduranceH.toFixed(1)}h`} />
                <KV k="cost" v={d.cost} />
              </div>
            );
          })}
          {compare.length >= 2 && <CompareBars configs={compare.map((id) => configs.find((c) => c.id === id)!).filter(Boolean)} />}
          <div className="hr" style={{ margin: 0 }} />
          <Btn
            size="sm"
            onClick={() => {
              const lines = configs
                .filter((c) => compare.includes(c.id))
                .map((c) => {
                  const d = configDerived(c);
                  return `${c.name}: compute=${d.compute} endurance=${d.enduranceH.toFixed(1)}h cost=${d.cost} mass=${d.mass.toFixed(2)}kg`;
                });
              const path = "/robots/comparison.txt";
              n.fs.mkdirp("/robots", { origin: "robot" });
              n.fs.write(path, lines.join("\n") || "(no comparison)", { origin: "robot" });
              n.markDirty("fs");
              wm.notify({ title: "Comparison saved", body: path, tone: "ok" });
            }}
          >
            Export comparison
          </Btn>
        </div>
      </aside>
    </div>
  );
}

function CompareBars({ configs }: { configs: RobotConfig[] }) {
  const rows = [
    { label: "Compute", get: (c: RobotConfig) => configDerived(c).compute },
    { label: "Endurance (h)", get: (c: RobotConfig) => configDerived(c).enduranceH },
    { label: "Agility", get: (c: RobotConfig) => Math.min(100, configDerived(c).agilityScore) },
    { label: "Sensors (Hz)", get: (c: RobotConfig) => configDerived(c).sensorHz },
    { label: "Cooling (°C)", get: (c: RobotConfig) => configDerived(c).cooling },
  ];
  return (
    <div className="col" style={{ gap: 8 }}>
      {rows.map((r) => {
        const max = Math.max(...configs.map(r.get), 0.001);
        return (
          <div key={r.label} className="col" style={{ gap: 3 }}>
            <span className="tiny dim">{r.label}</span>
            {configs.map((c) => (
              <div key={c.id} className="row" style={{ gap: 5 }}>
                <span className="tiny ellipsis" style={{ width: 54, color: c.color }}>{c.name}</span>
                <div className="grow">
                  <Meter pct={(r.get(c) / max) * 100} color={c.color} />
                </div>
                <span className="tiny mono" style={{ width: 38, textAlign: "right" }}>{r.get(c).toFixed(0)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- bench */

function BenchPane({ n }: { n: Nova }) {
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      for (const r of n.robots.robots.slice(0, 3)) n.robots.benchmark(r.id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [auto, n]);

  const benches = useMemo(
    () => n.robots.benches,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const best = benches.reduce((a, b) => (b.score > a.score ? b : a), benches[0]);

  return (
    <div className="scroll grow" style={{ padding: 14 }}>
      <div className="col" style={{ gap: 14 }}>
        <div className="row between">
          <div className="col" style={{ gap: 1 }}>
            <strong className="small">Benchmarks</strong>
            <span className="tiny dim">Real timings measured in this browser, not hard-coded numbers.</span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <label className="checkbox small">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              run continuously
            </label>
            <Btn
              size="sm"
              variant="primary"
              disabled={n.robots.robots.length === 0}
              onClick={() => n.robots.robots.forEach((r) => n.robots.benchmark(r.id))}
            >
              Run all
            </Btn>
          </div>
        </div>

        {benches.length === 0 ? (
          <Empty icon="⏱" title="No results yet" hint="Start a robot in the Simulation tab, then run a benchmark." />
        ) : (
          <>
            {best && (
              <div className="panel-flat col" style={{ padding: 14, gap: 6 }}>
                <strong className="small">Best — {best.robot} · score {best.score}</strong>
                <KV k="Navigation" v={`${best.navigationMs} ms`} />
                <KV k="CPU workload" v={best.cpuWorkload} />
                <KV k="Memory" v={`${best.memoryMb} MB`} />
                <KV k="Sensor rate" v={`${best.sensorHz} Hz`} />
                <KV k="Rendering" v={`${best.renderMs} ms`} />
              </div>
            )}
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              {benches.map((b) => (
                <div key={b.ts} className="row" style={{ gap: 12, padding: "7px 12px", borderBottom: "1px solid var(--border)" }}>
                  <span className="small semi" style={{ width: 110 }}>{b.robot}</span>
                  <span className="tiny mono dim" style={{ width: 90 }}>nav {b.navigationMs}ms</span>
                  <span className="tiny mono dim" style={{ width: 80 }}>cpu {b.cpuWorkload}</span>
                  <span className="tiny mono dim" style={{ width: 80 }}>mem {b.memoryMb}M</span>
                  <span className="tiny mono dim" style={{ width: 70 }}>bat {b.batteryPct}%</span>
                  <span className="tiny mono dim" style={{ width: 90 }}>sen {b.sensorHz}Hz</span>
                  <span className="tiny mono dim" style={{ width: 80 }}>gpu {b.renderMs}ms</span>
                  <span className="spacer" />
                  <span className="badge" style={{ color: loadColor((b.score / 200) * 100) }}>
                    score {b.score}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="panel-flat col" style={{ padding: 14, gap: 6 }}>
          <strong className="small">Component catalogue</strong>
          <span className="tiny dim">{COMPONENTS.length} parts across {PART_CATEGORIES.length} categories</span>
          <div className="row wrap" style={{ gap: 4 }}>
            {COMPONENTS.map((c) => (
              <span key={c.id} className="badge" title={c.blurb}>
                {CATEGORY_META[c.category].icon} {c.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { fmtBytes };
