import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { Badge, Btn, DataTable, Empty, KV, Meter, Modal, Ring, Seg, Slider, Tabs, loadColor } from "../ui/primitives";
import { BLOCK, CITY_H, CITY_W, ROAD_W, type Building, type Npc, type WeatherKind } from "../core/city";
import { CITY_DISTRICTS } from "../core/world";
import { timeAgo } from "../core/rng";

type Tab = "map" | "people" | "business" | "dashboard";
type Nova = ReturnType<typeof useKernel>;

const WEATHER_ICON: Record<WeatherKind, string> = {
  sunny: "☀️",
  cloudy: "☁️",
  rain: "🌧️",
  storm: "⛈️",
};

export function CityApp(_props: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const [tab, setTab] = useState<Tab>("map");
  const [selectedNpc, setSelectedNpc] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [follow, setFollow] = useState<string | null>(null);

  const npc = selectedNpc ? n.city.npcById.get(selectedNpc) ?? null : null;
  const stats = n.city.stats();

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "map", label: "City map" },
            { value: "people", label: "People", badge: n.city.npcs.length },
            { value: "business", label: "Business", badge: stats.businesses },
            { value: "dashboard", label: "Dashboard" },
          ]}
        />
        <span className="spacer" />
        <Badge>
          Day {stats.day} · {stats.weekday} · {stats.clock}
        </Badge>
        <Badge>
          {WEATHER_ICON[stats.weather]} {stats.weather} {stats.tempC}°C
        </Badge>
        {follow && (
          <Btn size="sm" onClick={() => setFollow(null)}>✕ Stop following</Btn>
        )}
      </div>

      {tab === "map" && (
        <MapPane
          n={n}
          follow={follow}
          onPickNpc={(id) => {
            setSelectedNpc(id);
          }}
          selectedNpc={selectedNpc}
        />
      )}
      {tab === "people" && (
        <PeoplePane
          n={n}
          selected={selectedNpc}
          onSelect={(id) => {
            setSelectedNpc(id);
            setFollow(id);
            setTab("map");
          }}
        />
      )}
      {tab === "business" && <BusinessPane n={n} selected={selectedBuilding} onSelect={setSelectedBuilding} />}
      {tab === "dashboard" && <Dashboard n={n} />}

      <div className="app-status">
        <Badge tone="ok">{stats.population.toLocaleString()} population</Badge>
        <span>{n.city.buildings.length} buildings</span>
        <span>{stats.openBusinesses}/{stats.businesses} businesses open</span>
        <span>congestion {(stats.congestion * 100).toFixed(0)}%</span>
        <span className="spacer" />
        <span className="dim">{n.city.deployedRobots.length} robots deployed</span>
        <Btn size="sm" onClick={() => wm.openApp("browser", { args: { url: "aurora-city.gov" } })}>
          City website →
        </Btn>
      </div>

      <Modal open={!!npc} onClose={() => setSelectedNpc(null)} title={npc ? npc.name : ""} width={560}>
        {npc && <NpcInspector n={n} npc={npc} onFollow={() => { setFollow(npc.id); setSelectedNpc(null); setTab("map"); }} />}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ map */

interface Camera {
  x: number;
  y: number;
  z: number;
}

function MapPane({
  n,
  follow,
  onPickNpc,
  selectedNpc,
}: {
  n: Nova;
  follow: string | null;
  onPickNpc: (id: string) => void;
  selectedNpc: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cam = useRef<Camera>({ x: CITY_W / 2, y: CITY_H / 2, z: 0.7 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [showNpcs, setShowNpcs] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [layer, setLayer] = useState<"all" | "npcs" | "traffic" | "buildings">("all");

  const resize = useCallback(() => {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    if (!wrap || !cvs) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = wrap.clientWidth * dpr;
    cvs.height = wrap.clientHeight * dpr;
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, [resize]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.016;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cvs.width / dpr;
      const H = cvs.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const hourF = (n.city.minutes / 60) % 24;
      const night = hourF < 6 || hourF > 20;
      const dusk = (hourF >= 17 && hourF < 20) || (hourF >= 5 && hourF < 7);
      const light = night ? 0.24 : dusk ? 0.6 : 1;

      ctx.fillStyle = `rgb(${Math.round(8 * light + 2)},${Math.round(13 * light + 3)},${Math.round(24 * light + 6)})`;
      ctx.fillRect(0, 0, W, H);

      const { x: cx, y: cy, z } = cam.current;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(z, z);
      ctx.translate(-cx, -cy);

      // roads
      ctx.strokeStyle = `rgba(${night ? 30 : 58},${night ? 36 : 66},${night ? 52 : 82},0.9)`;
      ctx.lineWidth = ROAD_W;
      ctx.lineCap = "butt";
      for (let x = 0; x <= CITY_W; x += BLOCK) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CITY_H);
        ctx.stroke();
      }
      for (let y = 0; y <= CITY_H; y += BLOCK) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CITY_W, y);
        ctx.stroke();
      }
      // lane markings
      ctx.strokeStyle = night ? "rgba(200,210,230,0.18)" : "rgba(220,225,240,0.35)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([12, 14]);
      for (let x = 0; x <= CITY_W; x += BLOCK) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CITY_H);
        ctx.stroke();
      }
      for (let y = 0; y <= CITY_H; y += BLOCK) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CITY_W, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // buildings
      if (layer !== "npcs" && layer !== "traffic") {
        for (const b of n.city.buildings) {
          const shade = Math.round(60 + b.floors * 6);
          ctx.fillStyle =
            b.type === "park"
              ? `rgba(30,90,52,${0.85 * light + 0.15})`
              : `hsl(${b.hue} ${night ? 18 : 32}% ${Math.round(shade * light * 0.75 + 12)}%)`;
          ctx.fillRect(b.x, b.y, b.w, b.h);
          if (night) {
            // window lights
            ctx.fillStyle = `rgba(255,214,140,${0.10 + (b.floors % 5) * 0.035})`;
            const cols = Math.max(1, Math.floor(b.w / 9));
            const rows = Math.max(1, Math.floor(b.h / 11));
            for (let c = 0; c < cols; c++) {
              for (let r = 0; r < rows; r++) {
                if (((c * 7 + r * 13 + b.x + b.y) % 5) < 2) {
                  ctx.fillRect(b.x + 3 + c * 9, b.y + 3 + r * 11, 3.4, 4.4);
                }
              }
            }
          }
          if (b.type === "park") {
            ctx.fillStyle = `rgba(40,120,70,${0.9})`;
            for (let i = 0; i < 6; i++) {
              const tx = b.x + ((i * 37) % Math.max(b.w - 8, 1)) + 4;
              const ty = b.y + ((i * 53) % Math.max(b.h - 8, 1)) + 4;
              ctx.beginPath();
              ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          if (hover === b.id && z > 0.45) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
          }
          if (showLabels && z > 0.9) {
            ctx.fillStyle = "rgba(226,236,252,0.8)";
            ctx.font = "10px system-ui";
            ctx.textAlign = "center";
            ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 3);
          }
        }
      }

      // traffic lights
      if (layer === "all" || layer === "traffic") {
        for (const l of n.city.lights) {
          ctx.fillStyle = l.phase === 0 ? "#ef4444" : "#22c55e";
          ctx.beginPath();
          ctx.arc(l.x, l.y, 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // vehicles
      if (layer === "all" || layer === "traffic") {
        for (const v of n.city.vehicles) {
          ctx.fillStyle = v.color;
          const w = v.kind === "bus" ? 20 : v.kind === "truck" ? 18 : 11;
          const h = v.kind === "car" ? 6 : 7;
          ctx.fillRect(v.x - w / 2, v.y - h / 2, w, h);
          if (night) {
            ctx.fillStyle = "rgba(255,240,190,0.28)";
            ctx.fillRect(v.x - w / 2 - 8, v.y - h / 2, 8, h);
          }
        }
      }

      // npcs
      if (showNpcs && (layer === "all" || layer === "npcs")) {
        for (const a of n.city.npcs) {
          if (a.state === "sleeping") continue;
          ctx.fillStyle = `hsl(${a.hue} 62% ${a.state === "commuting" ? 52 : 60}%)`;
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.state === "working" ? 2.6 : 3.2, 0, Math.PI * 2);
          ctx.fill();
          if (a.id === selectedNpc || hover === a.id) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(a.x, a.y, 7, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // deployed robots
      for (const r of n.city.deployedRobots) {
        const wob = Math.sin(t * 2 + r.x) * 1.6;
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(r.x + wob, r.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#0ea5e9";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        if (z > 0.6) {
          ctx.fillStyle = "#7dd3fc";
          ctx.font = "9px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(r.name, r.x, r.y - 10);
        }
      }

      // weather
      const w = n.city.weather;
      if (w.kind === "rain" || w.kind === "storm") {
        ctx.strokeStyle = `rgba(180,210,255,${w.kind === "storm" ? 0.4 : 0.22})`;
        ctx.lineWidth = 1;
        const count = w.kind === "storm" ? 260 : 130;
        for (let i = 0; i < count; i++) {
          const seed = i * 97.3;
          const px = ((seed * 13 + t * 620 * (0.6 + (i % 5) * 0.2)) % (CITY_W + 200)) - 100;
          const py = ((seed * 29 + t * 900) % (CITY_H + 200)) - 100;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - 3, py + 11);
          ctx.stroke();
        }
      }
      if (w.kind === "storm") {
        ctx.fillStyle = `rgba(0,0,0,${0.12 + Math.sin(t * 0.4) * 0.05})`;
        ctx.fillRect(0, 0, CITY_W, CITY_H);
      }

      ctx.restore();

      // vignette + clock
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, night ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.28)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [n, showNpcs, showLabels, hover, selectedNpc, layer]);

  // follow camera
  useEffect(() => {
    if (!follow) return;
    const id = window.setInterval(() => {
      const a = n.city.npcById.get(follow);
      if (a) {
        cam.current.x = a.x;
        cam.current.y = a.y;
        cam.current.z = Math.max(cam.current.z, 1.6);
      }
    }, 40);
    return () => window.clearInterval(id);
  }, [follow, n]);

  const toWorld = (e: React.PointerEvent | React.MouseEvent | React.WheelEvent) => {
    const cvs = canvasRef.current!;
    const r = cvs.getBoundingClientRect();
    const { x, y, z } = cam.current;
    return {
      x: (e.clientX - r.left - r.width / 2) / z + x,
      y: (e.clientY - r.top - r.height / 2) / z + y,
    };
  };

  const pick = (p: { x: number; y: number }) => {
    let bestNpc: Npc | null = null;
    let bestD = 14 / cam.current.z + 6;
    for (const a of n.city.npcs) {
      if (a.state === "sleeping") continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bestD) {
        bestD = d;
        bestNpc = a;
      }
    }
    if (bestNpc) return { npc: bestNpc.id, building: null as string | null };
    const b = n.city.buildingAtPoint(p.x, p.y);
    return { npc: null as string | null, building: b ? b.id : null };
  };

  return (
    <div className="row grow" style={{ minHeight: 0 }}>
      <div ref={wrapRef} className="grow rel" style={{ minWidth: 0, background: "#05070c" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            const p = toWorld(e);
            drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y };
            const hit = pick(p);
            if (hit.npc) onPickNpc(hit.npc);
            else if (hit.building) {
              const b = n.city.buildings.find((x) => x.id === hit.building);
              if (b) n.db.insert("city_buildings", { ...b, viewedAt: Date.now() });
            }
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current) {
              cam.current.x = drag.current.cx - (e.clientX - drag.current.x) / cam.current.z;
              cam.current.y = drag.current.cy - (e.clientY - drag.current.y) / cam.current.z;
              cam.current.x = Math.max(0, Math.min(CITY_W, cam.current.x));
              cam.current.y = Math.max(0, Math.min(CITY_H, cam.current.y));
            } else {
              const p = toWorld(e);
              const hit = pick(p);
              setHover(hit.npc ?? hit.building);
            }
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => {
            drag.current = null;
            setHover(null);
          }}
          onWheel={(e) => {
            const p = toWorld(e);
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const nz = Math.max(0.22, Math.min(4, cam.current.z * factor));
            const ratio = nz / cam.current.z;
            cam.current.x = p.x - (p.x - cam.current.x) * ratio;
            cam.current.y = p.y - (p.y - cam.current.y) * ratio;
            cam.current.z = nz;
          }}
          style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "grab" }}
        />

        <div className="row" style={{ position: "absolute", left: 10, top: 10, gap: 6, flexWrap: "wrap" }}>
          <Btn size="sm" onClick={() => { cam.current = { x: CITY_W / 2, y: CITY_H / 2, z: 0.7 }; }}>⌂ Reset view</Btn>
          <Btn size="sm" onClick={() => (cam.current.z = Math.min(4, cam.current.z * 1.3))}>＋</Btn>
          <Btn size="sm" onClick={() => (cam.current.z = Math.max(0.22, cam.current.z / 1.3))}>－</Btn>
          <Seg
            value={layer}
            onChange={setLayer}
            options={[
              { value: "all", label: "All" },
              { value: "npcs", label: "People" },
              { value: "traffic", label: "Traffic" },
              { value: "buildings", label: "Buildings" },
            ]}
          />
          <label className="checkbox tiny" style={{ background: "color-mix(in srgb, var(--panel-solid) 80%, transparent)", padding: "2px 8px", borderRadius: 99 }}>
            <input type="checkbox" checked={showNpcs} onChange={(e) => setShowNpcs(e.target.checked)} />
            people
          </label>
          <label className="checkbox tiny" style={{ background: "color-mix(in srgb, var(--panel-solid) 80%, transparent)", padding: "2px 8px", borderRadius: 99 }}>
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            labels
          </label>
        </div>

        <div
          className="panel col"
          style={{ position: "absolute", right: 10, top: 10, padding: "8px 12px", gap: 2, minWidth: 160 }}
        >
          <span className="tiny dim">AURORA</span>
          <strong>{n.city.stats().clock}</strong>
          <span className="tiny dim">
            Day {n.city.day} · {n.city.stats().weekday}
          </span>
          <span className="tiny dim">
            {WEATHER_ICON[n.city.weather.kind]} {n.city.weather.kind} {n.city.weather.tempC}°C
          </span>
        </div>

        {hover && !selectedNpc && (
          <div
            className="panel"
            style={{ position: "absolute", left: 10, bottom: 10, padding: "6px 10px", fontSize: 11.5, pointerEvents: "none" }}
          >
            {(() => {
              const b = n.city.buildings.find((x) => x.id === hover);
              if (b) return <span>{b.name} · {b.district} · {b.floors} floors</span>;
              const a = n.city.npcById.get(hover);
              return a ? <span>{a.name} · {a.state} · {a.occupation}</span> : null;
            })()}
          </div>
        )}

        <div className="row tiny dim" style={{ position: "absolute", right: 10, bottom: 10, gap: 10 }}>
          <span>{Math.round(cam.current.z * 100)}%</span>
          <span>drag to pan · scroll to zoom · click a person to inspect</span>
        </div>
      </div>

      <aside className="sidebar" style={{ width: 286, borderRight: 0, borderLeft: "1px solid var(--border)" }}>
        <CitySidebar n={n} />
      </aside>
    </div>
  );
}

function CitySidebar({ n }: { n: Nova }) {
  const stats = n.city.stats();
  const districts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of n.city.buildings) m.set(b.district, (m.get(b.district) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.rev]);
  const topBiz = [...n.city.buildings].filter((b) => b.stock > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  return (
    <div className="col" style={{ gap: 12 }}>
      <strong className="small">City pulse</strong>
      <div className="row between">
        <div className="col"><span className="tiny dim">Population</span><strong>{stats.population.toLocaleString()}</strong></div>
        <div className="col"><span className="tiny dim">Out now</span><strong>{stats.activeNpcs}</strong></div>
        <div className="col"><span className="tiny dim">Congestion</span><strong>{(stats.congestion * 100).toFixed(0)}%</strong></div>
      </div>
      <Meter pct={stats.congestion * 100} color={stats.congestion > 0.8 ? "var(--warn)" : "var(--ok)"} />

      <div className="hr" style={{ margin: 0 }} />
      <strong className="small">Time & weather</strong>
      <Slider
        label="Speed"
        min={0}
        max={600}
        step={30}
        value={n.citySpeed}
        format={(v) => (v === 0 ? "paused" : `${v}×`)}
        onChange={(v) => {
          n.citySpeed = v;
        }}
      />
      <div className="row wrap" style={{ gap: 4 }}>
        {(["sunny", "cloudy", "rain", "storm"] as WeatherKind[]).map((w) => (
          <Btn key={w} size="sm" variant={n.city.weather.kind === w ? "primary" : "default"} onClick={() => n.city.applyWeather(w)}>
            {WEATHER_ICON[w]}
          </Btn>
        ))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <Btn size="sm" onClick={() => { n.city.minutes = 6 * 60; n.markDirty("city"); }}>Dawn</Btn>
        <Btn size="sm" onClick={() => { n.city.minutes = 12 * 60; n.markDirty("city"); }}>Noon</Btn>
        <Btn size="sm" onClick={() => { n.city.minutes = 18 * 60; n.markDirty("city"); }}>Evening</Btn>
        <Btn size="sm" onClick={() => { n.city.minutes = 23 * 60; n.markDirty("city"); }}>Night</Btn>
      </div>

      <div className="hr" style={{ margin: 0 }} />
      <strong className="small">Districts</strong>
      {districts.map(([d, c]) => (
        <div key={d} className="row between">
          <span className="small">{d}</span>
          <span className="tiny dim">{c} buildings</span>
        </div>
      ))}

      <div className="hr" style={{ margin: 0 }} />
      <strong className="small">Busiest businesses</strong>
      {topBiz.length === 0 && <div className="tiny dim">Nothing open yet.</div>}
      {topBiz.map((b) => (
        <div key={b.id} className="col" style={{ gap: 2 }}>
          <div className="row between">
            <span className="tiny semi ellipsis">{b.name}</span>
            <span className="tiny dim">{Math.round(b.revenue)} cr</span>
          </div>
          <Meter pct={Math.min(100, (b.customers / 40) * 100)} color={loadColor((b.stock / 400) * 100)} />
        </div>
      ))}

      {n.city.deployedRobots.length > 0 && (
        <>
          <div className="hr" style={{ margin: 0 }} />
          <strong className="small">Deployed robots</strong>
          {n.city.deployedRobots.map((r) => (
            <div key={r.robotId} className="card row between">
              <span className="small">🤖 {r.name}</span>
              <span className="tiny dim">{r.district}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- people */

function PeoplePane({ n, selected, onSelect }: { n: Nova; selected: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState("all");

  const npcs = useMemo(() => {
    let list = n.city.npcs;
    if (state !== "all") list = list.filter((a) => a.state === state);
    if (q.trim()) {
      const l = q.toLowerCase();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(l) || a.occupation.toLowerCase().includes(l) || a.district.toLowerCase().includes(l),
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, state, n.rev]);

  const states = ["all", ...new Set(n.city.npcs.map((a) => a.state))];

  return (
    <div className="col grow" style={{ minHeight: 0 }}>
      <div className="app-toolbar">
        <input className="input" style={{ width: 200 }} placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg value={state} onChange={setState} options={states.map((s) => ({ value: s, label: s }))} />
        <span className="spacer" />
        <Badge>{npcs.length} shown</Badge>
      </div>
      <div className="grow" style={{ minHeight: 0 }}>
        <DataTable
          height="100%"
          rows={npcs}
          selectedId={selected ?? undefined}
          onRowClick={(a) => onSelect(a.id)}
          columns={[
            {
              key: "name",
              label: "Name",
              render: (a) => (
                <div className="row" style={{ gap: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: `hsl(${a.hue} 62% 55%)` }} />
                  <span>{a.name}</span>
                </div>
              ),
            },
            { key: "age", label: "Age", width: 52, align: "right", render: (a) => <span className="mono tiny">{a.age}</span> },
            { key: "job", label: "Occupation", render: (a) => <span className="tiny">{a.occupation}</span> },
            { key: "district", label: "District", width: 130, render: (a) => <span className="tiny dim">{a.district}</span> },
            { key: "state", label: "Doing", width: 110, render: (a) => <span className="tiny">{a.state}</span> },
            {
              key: "needs",
              label: "Needs",
              width: 110,
              render: (a) => (
                <div className="row" style={{ gap: 3 }}>
                  <span title="hunger" style={{ fontSize: 10 }}>🍽</span>
                  <div style={{ flex: 1 }}><Meter pct={a.needs.hunger * 100} color="var(--warn)" /></div>
                  <span title="energy" style={{ fontSize: 10 }}>⚡</span>
                  <div style={{ flex: 1 }}><Meter pct={a.needs.energy * 100} color="var(--accent)" /></div>
                </div>
              ),
            },
            { key: "wallet", label: "Wallet", width: 70, align: "right", render: (a) => <span className="mono tiny">{a.wallet.toFixed(0)}</span> },
          ]}
          emptyText="No people matched"
        />
      </div>
    </div>
  );
}

function NpcInspector({ n, npc, onFollow }: { n: Nova; npc: Npc; onFollow: () => void }) {
  const home = n.city.buildings.find((b) => b.id === npc.homeId);
  const work = npc.workId ? n.city.buildings.find((b) => b.id === npc.workId) : null;
  const friends = npc.friends.map((id) => n.city.npcById.get(id)).filter(Boolean) as Npc[];

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12 }}>
        <div
          className="col center"
          style={{ width: 52, height: 52, borderRadius: "50%", background: `hsl(${npc.hue} 58% 44%)`, color: "#fff", fontWeight: 700, fontSize: 18, flex: "none" }}
        >
          {npc.name.split(" ").map((s) => s[0]).join("")}
        </div>
        <div className="col" style={{ gap: 2 }}>
          <strong style={{ fontSize: 16 }}>{npc.name}</strong>
          <span className="tiny dim">
            {npc.age} · {npc.occupation} · {npc.district}
          </span>
        </div>
        <span className="spacer" />
        <Btn size="sm" variant="primary" onClick={onFollow}>Follow</Btn>
      </div>

      <div className="row wrap" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 4, minWidth: 170 }}>
          <span className="tiny dim semi">NEEDS</span>
          <KV k="Hunger" v={`${(npc.needs.hunger * 100).toFixed(0)}%`} />
          <Meter pct={npc.needs.hunger * 100} color="var(--warn)" />
          <KV k="Energy" v={`${(npc.needs.energy * 100).toFixed(0)}%`} />
          <Meter pct={npc.needs.energy * 100} color="var(--accent)" />
          <KV k="Social" v={`${(npc.needs.social * 100).toFixed(0)}%`} />
          <Meter pct={npc.needs.social * 100} color="#f472b6" />
          <KV k="Fun" v={`${(npc.needs.fun * 100).toFixed(0)}%`} />
          <Meter pct={npc.needs.fun * 100} color="#a78bfa" />
        </div>
        <div className="col" style={{ gap: 2, minWidth: 170 }}>
          <span className="tiny dim semi">LIFE</span>
          <KV k="Currently" v={npc.state} />
          <KV k="Home" v={home?.name ?? "—"} />
          <KV k="Work" v={work?.name ?? "—"} />
          <KV k="Wallet" v={`${npc.wallet.toFixed(0)} cr`} />
          <KV k="Purchases" v={npc.stats.purchases} />
          <KV k="Meals" v={npc.stats.meals} />
          <KV k="Distance" v={`${npc.stats.distance.toFixed(0)} m`} />
          <KV k="Work hours" v={`${npc.stats.workHours.toFixed(1)} h`} />
        </div>
      </div>

      <div className="hr" />
      <div className="col" style={{ gap: 5 }}>
        <span className="tiny dim semi">SCHEDULE</span>
        {n.city.schedule(npc).map((s) => (
          <div key={s.time} className="row">
            <span className="mono tiny" style={{ width: 48, color: "var(--text-3)" }}>{s.time}</span>
            <span className="small">{s.what}</span>
          </div>
        ))}
      </div>

      <div className="hr" />
      <div className="col" style={{ gap: 5 }}>
        <span className="tiny dim semi">RELATIONSHIPS</span>
        {friends.length === 0 && <span className="tiny dim">No recorded relationships.</span>}
        <div className="row wrap" style={{ gap: 5 }}>
          {friends.map((f) => (
            <span key={f.id} className="badge" title={`${f.occupation} · ${f.district}`}>
              {f.name.split(" ")[0]} {f.age < 19 ? "🧒" : f.age > 60 ? "🧓" : "🧑"}
            </span>
          ))}
        </div>
      </div>

      {npc.path.length > 0 && (
        <>
          <div className="hr" />
          <div className="col" style={{ gap: 3 }}>
            <span className="tiny dim semi">ROUTE ({npc.path.length - npc.pathIdx} stops left)</span>
            {npc.path.slice(npc.pathIdx, npc.pathIdx + 5).map((p, i) => (
              <span key={i} className="tiny mono dim">
                → {p.x.toFixed(0)}, {p.y.toFixed(0)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- business */

function BusinessPane({ n, selected, onSelect }: { n: Nova; selected: string | null; onSelect: (id: string) => void }) {
  const [type, setType] = useState("all");
  const types = ["all", "shop", "restaurant", "office", "school", "hospital", "factory", "station", "park"];
  const list = useMemo(
    () => n.city.buildings.filter((b) => type === "all" || b.type === type).sort((a, b) => b.revenue - a.revenue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, n.rev],
  );
  const sel = selected ? n.city.buildings.find((b) => b.id === selected) ?? null : null;

  return (
    <div className="row grow" style={{ minHeight: 0 }}>
      <div className="col grow" style={{ minWidth: 0 }}>
        <div className="app-toolbar">
          <Seg value={type} onChange={setType} options={types.map((t) => ({ value: t, label: t }))} />
          <span className="spacer" />
          <Badge>{list.length} buildings</Badge>
        </div>
        <div className="grow" style={{ minHeight: 0 }}>
          <DataTable
            height="100%"
            rows={list.slice(0, 220)}
            selectedId={selected ?? undefined}
            onRowClick={(b) => onSelect(b.id)}
            emptyText="No buildings of this type"
            columns={[
              { key: "name", label: "Business", render: (b) => <span className="ellipsis">{b.name}</span> },
              { key: "type", label: "Type", width: 96, render: (b) => <span className="tiny dim">{b.type}</span> },
              { key: "district", label: "District", width: 130, render: (b) => <span className="tiny dim">{b.district}</span> },
              {
                key: "open",
                label: "Status",
                width: 84,
                render: (b) => <Badge tone={b.isOpen ? "ok" : undefined}>{b.isOpen ? "open" : "closed"}</Badge>,
              },
              { key: "hours", label: "Hours", width: 84, render: (b) => <span className="tiny mono dim">{b.openHour}–{b.closeHour}</span> },
              { key: "stock", label: "Stock", width: 62, align: "right", render: (b) => <span className="mono tiny">{b.stock}</span> },
              { key: "customers", label: "Cust.", width: 62, align: "right", render: (b) => <span className="mono tiny">{b.customers}</span> },
              { key: "revenue", label: "Revenue", width: 80, align: "right", render: (b) => <span className="mono tiny" style={{ color: "var(--ok)" }}>{b.revenue.toFixed(0)}</span> },
              { key: "expenses", label: "Cost", width: 70, align: "right", render: (b) => <span className="mono tiny" style={{ color: "var(--err)" }}>{b.expenses.toFixed(0)}</span> },
              { key: "power", label: "kW", width: 56, align: "right", render: (b) => <span className="mono tiny dim">{b.power.toFixed(0)}</span> },
            ]}
          />
        </div>
      </div>

      <aside className="sidebar" style={{ width: 286, borderRight: 0, borderLeft: "1px solid var(--border)" }}>
        {sel ? (
          <BuildingPanel b={sel} n={n} />
        ) : (
          <Empty icon="🏪" title="Select a building" hint="Inspect stock, customers, opening hours and energy." />
        )}
      </aside>
    </div>
  );
}

function BuildingPanel({ b, n }: { b: Building; n: Nova }) {
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row between">
        <div className="col" style={{ gap: 0 }}>
          <strong className="small">{b.name}</strong>
          <span className="tiny dim">{b.district}</span>
        </div>
        <Badge tone={b.isOpen ? "ok" : undefined}>{b.isOpen ? "open" : "closed"}</Badge>
      </div>
      <div className="hr" style={{ margin: 0 }} />
      <KV k="Type" v={b.type} />
      <KV k="Floors" v={b.floors} />
      <KV k="Capacity" v={b.capacity} />
      <KV k="Opening hours" v={`${b.openHour}:00 – ${b.closeHour}:00`} />
      <KV k="Power draw" v={`${b.power.toFixed(1)} kW`} />
      <div className="hr" style={{ margin: 0 }} />
      <span className="tiny dim semi">ECONOMY</span>
      <KV k="Inventory" v={b.stock} />
      <Meter pct={Math.min(100, (b.stock / 400) * 100)} />
      <KV k="Customers" v={b.customers} />
      <KV k="Revenue" v={`${b.revenue.toFixed(0)} cr`} />
      <KV k="Expenses" v={`${b.expenses.toFixed(0)} cr`} />
      <div className="row between">
        <span className="small semi">Profit</span>
        <span className="mono" style={{ color: b.revenue - b.expenses >= 0 ? "var(--ok)" : "var(--err)" }}>
          {(b.revenue - b.expenses).toFixed(0)} cr
        </span>
      </div>
      <Meter pct={Math.min(100, Math.max(0, ((b.revenue - b.expenses) / Math.max(b.revenue, 1)) * 100))} color="var(--ok)" />
      <div className="hr" style={{ margin: 0 }} />
      <Btn
        size="sm"
        onClick={() => {
          b.stock = Math.min(400, b.stock + 50);
          b.revenue += 120;
          n.markDirty("city");
        }}
      >
        Restock +50
      </Btn>
      <Btn
        size="sm"
        onClick={() => {
          const report = `${b.name} — ${b.type}\nDistrict: ${b.district}\nStock: ${b.stock}\nCustomers today: ${b.customers}\nRevenue: ${b.revenue.toFixed(0)} cr\nExpenses: ${b.expenses.toFixed(0)} cr\nPower: ${b.power.toFixed(1)} kW\nHours: ${b.openHour}:00–${b.closeHour}:00\nGenerated: ${new Date().toString()}\n`;
          n.fs.write(`/city/reports/${b.name.replace(/\W+/g, "-").toLowerCase()}.txt`, report, { origin: "city" });
          n.markDirty("city");
        }}
      >
        Export report to /city/reports
      </Btn>
    </div>
  );
}

/* ------------------------------------------------------------- dashboard */

function Dashboard({ n }: { n: Nova }) {
  const s = n.city.stats();
  const [auto, setAuto] = useState(true);

  const topNews = useMemo(
    () => [...n.db.all("city_news")].sort((a, b) => b.ts - a.ts).slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );

  return (
    <div className="scroll grow" style={{ padding: 14 }}>
      <div className="col" style={{ gap: 16 }}>
        <div className="row wrap" style={{ gap: 16, alignItems: "flex-start" }}>
          <StatCard title="Population" value={s.population.toLocaleString()} sub={`${s.activeNpcs} agents out now`} />
          <StatCard title="Congestion" value={`${(s.congestion * 100).toFixed(0)}%`} sub={`${s.traffic} vehicles`} pct={s.congestion * 100} />
          <StatCard title="Business" value={`${s.openBusinesses}`} sub={`of ${s.businesses} open`} pct={(s.openBusinesses / Math.max(s.businesses, 1)) * 100} />
          <StatCard title="Energy" value={`${Math.round(s.energyKw)} kW`} sub="grid demand" />
          <StatCard title="Transit" value={s.transitRiders.toLocaleString()} sub="boardings today" />
        </div>

        <div className="row wrap" style={{ gap: 16, alignItems: "flex-start" }}>
          <div className="panel-flat col" style={{ padding: 14, gap: 10, flex: "1 1 320px", minWidth: 280 }}>
            <div className="row between">
              <strong className="small">Economy</strong>
              <Badge tone={s.revenueToday >= s.expensesToday ? "ok" : "warn"}>
                {s.revenueToday >= s.expensesToday ? "surplus" : "deficit"}
              </Badge>
            </div>
            <div className="row" style={{ gap: 20 }}>
              <Ring pct={Math.min(100, (s.revenueToday / Math.max(s.expensesToday, 1)) * 70)} size={96} sub="ratio" />
              <div className="col grow" style={{ gap: 2 }}>
                <KV k="Revenue today" v={`${Math.round(s.revenueToday).toLocaleString()} cr`} />
                <KV k="Expenses today" v={`${Math.round(s.expensesToday).toLocaleString()} cr`} />
                <KV k="Net" v={`${Math.round(s.revenueToday - s.expensesToday).toLocaleString()} cr`} />
                <KV k="Open businesses" v={`${s.openBusinesses} / ${s.businesses}`} />
                <KV k="Total buildings" v={n.city.buildings.length} />
              </div>
            </div>
          </div>

          <div className="panel-flat col" style={{ padding: 14, gap: 10, flex: "1 1 320px", minWidth: 280 }}>
            <div className="row between">
              <strong className="small">Live wire</strong>
              <label className="checkbox small">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                publishing
              </label>
            </div>
            {topNews.length === 0 && <div className="tiny dim">The city has not published yet.</div>}
            {topNews.map((a) => (
              <div key={a.id} className="col" style={{ gap: 1 }}>
                <span className="small semi ellipsis">{a.title}</span>
                <span className="tiny dim">
                  {a.district} · {timeAgo(a.ts)}
                </span>
              </div>
            ))}
            <Btn size="sm" onClick={() => { wmPublish(n); }}>Publish a notice now</Btn>
          </div>
        </div>

        <div className="panel-flat col" style={{ padding: 14, gap: 8 }}>
          <strong className="small">Districts</strong>
          {CITY_DISTRICTS.map((d) => {
            const buildings = n.city.buildings.filter((b) => b.district === d);
            const residents = n.city.npcs.filter((a) => a.district === d).length;
            return (
              <div key={d} className="row" style={{ gap: 10 }}>
                <span className="small" style={{ width: 130 }}>{d}</span>
                <div className="grow">
                  <Meter pct={Math.min(100, (buildings.length / 40) * 100)} color="var(--accent-2)" />
                </div>
                <span className="tiny dim" style={{ width: 100, textAlign: "right" }}>
                  {buildings.length} buildings · {residents} residents
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, pct }: { title: string; value: string; sub: string; pct?: number }) {
  return (
    <div className="panel-flat col" style={{ padding: 14, gap: 4, flex: "1 1 170px", minWidth: 165 }}>
      <span className="tiny dim">{title}</span>
      <span className="huge" style={{ fontSize: 22 }}>{value}</span>
      {pct !== undefined && <Meter pct={pct} color={loadColor(pct)} />}
      <span className="tiny dim">{sub}</span>
    </div>
  );
}

function wmPublish(n: Nova) {
  const headlines = [
    "Transit works completed ahead of schedule",
    "New footpath opens between Lakeside and Ironworks",
    "Markets report a strong week for local produce",
    "City crews clear storm debris from the ring road",
  ];
  const h = headlines[Math.floor(Math.random() * headlines.length)];
  n.city.publishNews(h, `${h}.\n\nFiled by the NOVA city desk.\n\n— Aurora`);
  n.fs.mkdirp("/city/reports", { origin: "city" });
  n.fs.write(`/city/reports/${Date.now().toString(36)}.txt`, `${h}\n\nFiled by the NOVA city desk.`, { origin: "city" });
  n.markDirty("city");
}
