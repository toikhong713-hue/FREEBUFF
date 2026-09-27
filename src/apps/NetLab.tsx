import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { Badge, Btn, Empty, KV, Modal, Seg, Toggle } from "../ui/primitives";
import { buildDefaultTopology } from "../core/world";
import type { DeviceType, NetDevice, Packet, Protocol } from "../core/net";

type Nova = ReturnType<typeof useKernel>;

const TYPE_ICON: Record<DeviceType, string> = {
  pc: "🖥",
  server: "🗄",
  router: "🧭",
  switch: "🔀",
  firewall: "🧱",
  dns: "📇",
  web: "🌐",
  cloud: "☁️",
};

const TYPE_COLOR: Record<DeviceType, string> = {
  pc: "#60a5fa",
  server: "#a78bfa",
  router: "#fbbf24",
  switch: "#34d399",
  firewall: "#fb7185",
  dns: "#22d3ee",
  web: "#f472b6",
  cloud: "#818cf8",
};

const CANVAS_W = 1200;
const CANVAS_H = 560;
const NODE_R = 26;

export function NetLabApp(_props: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [inspect, setInspect] = useState<Packet | null>(null);
  const [tool, setTool] = useState<"select" | "link">("select");
  const [showLabels, setShowLabels] = useState(true);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const hoverRef = useRef<string | null>(null);

  const devices = useMemo(
    () => [...n.net.devices.values()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const links = useMemo(
    () => [...n.net.links.values()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );

  /* ------------------------------------------------------------ rendering */

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.016;
      const css = getComputedStyle(document.documentElement);
      const bg = css.getPropertyValue("--bg-1").trim() || "#080c16";
      const border = css.getPropertyValue("--border").trim() || "rgba(125,160,215,0.16)";
      const text = css.getPropertyValue("--text").trim() || "#e6eefc";
      const dim = css.getPropertyValue("--text-3").trim() || "#6c7f9f";

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // grid
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      for (let x = 0; x < CANVAS_W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, CANVAS_H);
        ctx.stroke();
      }
      for (let y = 0; y < CANVAS_H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(CANVAS_W, y + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      void bg;

      // links
      for (const l of links) {
        const a = n.net.devices.get(l.a);
        const b = n.net.devices.get(l.b);
        if (!a || !b) continue;
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, l.up ? TYPE_COLOR[a.type] : "#475569");
        grad.addColorStop(1, l.up ? TYPE_COLOR[b.type] : "#475569");
        ctx.strokeStyle = grad;
        ctx.lineWidth = l.up ? 2.2 : 1;
        ctx.globalAlpha = l.up ? 0.55 : 0.25;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (showLabels) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          ctx.fillStyle = dim;
          ctx.font = "10px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${l.latency.toFixed(1)}ms ${(l.loss * 100).toFixed(1)}%`, mx, my - 5);
        }
      }

      // packets
      for (const p of n.net.packets) {
        const a = n.net.devices.get(p.from);
        const b = n.net.devices.get(p.to);
        if (!a || !b) continue;
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fill();
        if (showLabels && p.protocol === "HTTP" && Math.random() < 0.08) {
          ctx.fillStyle = p.color;
          ctx.font = "9px ui-monospace, monospace";
          ctx.fillText(p.protocol, x + 8, y - 6);
        }
      }

      // devices
      for (const d of n.net.devices.values()) {
        const isSel = selected === d.id;
        const isHover = hoverRef.current === d.id;
        const isFrom = linkFrom === d.id;
        const color = TYPE_COLOR[d.type];

        ctx.save();
        ctx.shadowBlur = isSel ? 18 : 8;
        ctx.shadowColor = color;
        ctx.fillStyle = d.up ? "rgba(10,17,32,0.95)" : "rgba(40,44,55,0.9)";
        ctx.strokeStyle = isSel || isFrom ? "#fff" : isHover ? color : color + "cc";
        ctx.lineWidth = isSel ? 2.6 : 1.8;
        ctx.beginPath();
        roundRect(ctx, d.x - NODE_R, d.y - NODE_R, NODE_R * 2, NODE_R * 2, 10);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = d.up ? text : dim;
        ctx.font = "18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(TYPE_ICON[d.type], d.x, d.y);

        if (showLabels) {
          ctx.fillStyle = text;
          ctx.font = "600 11px system-ui, sans-serif";
          ctx.fillText(d.name, d.x, d.y + NODE_R + 13);
          ctx.fillStyle = dim;
          ctx.font = "9px ui-monospace, monospace";
          ctx.fillText(d.ifaces[0]?.ip ?? "", d.x, d.y + NODE_R + 24);
          if (d.http) {
            ctx.fillStyle = "#f472b6";
            ctx.font = "9px ui-monospace, monospace";
            ctx.fillText(d.http.host, d.x, d.y + NODE_R + 34);
          }
          if (d.firewall.length) {
            ctx.fillStyle = "#fb7185";
            ctx.font = "9px ui-monospace, monospace";
            ctx.fillText(`${d.firewall.length} rules`, d.x, d.y - NODE_R - 6);
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [n, selected, linkFrom, showLabels, links, devices]);

  /* -------------------------------------------------------------- input */

  const toWorld = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    const cvs = canvasRef.current!;
    const r = cvs.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * CANVAS_W,
      y: ((e.clientY - r.top) / r.height) * CANVAS_H,
    };
  }, []);

  const hit = useCallback(
    (p: { x: number; y: number }) =>
      n.net.devices.get([...n.net.devices.keys()].find((id) => {
        const d = n.net.devices.get(id)!;
        return Math.hypot(d.x - p.x, d.y - p.y) <= NODE_R + 3;
      }) ?? ""),
    [n],
  );

  const onDown = (e: React.PointerEvent) => {
    const p = toWorld(e);
    const d = hit(p);
    if (tool === "link") {
      if (!d) return setLinkFrom(null);
      if (!linkFrom) return setLinkFrom(d.id);
      n.net.connect(linkFrom, d.id);
      n.markDirty("net");
      setLinkFrom(null);
      return;
    }
    if (!d) {
      setSelected(null);
      return;
    }
    setSelected(d.id);
    dragRef.current = { id: d.id, dx: d.x - p.x, dy: d.y - p.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = toWorld(e);
    hoverRef.current = hit(p)?.id ?? null;
    const dr = dragRef.current;
    if (!dr) return;
    const d = n.net.devices.get(dr.id);
    if (!d) return;
    d.x = Math.max(NODE_R, Math.min(CANVAS_W - NODE_R, p.x + dr.dx));
    d.y = Math.max(NODE_R, Math.min(CANVAS_H - NODE_R, p.y + dr.dy));
  };

  const onUp = () => {
    if (dragRef.current) {
      n.net.bus.emit("change");
      n.markDirty("net");
    }
    dragRef.current = null;
  };

  /* -------------------------------------------------------------- tools */

  const sendPacket = (protocol: Protocol, dst?: string) => {
    const from = devices.find((d) => d.type === "pc") ?? devices[0];
    if (!from) return;
    const target = dst
      ? n.net.resolveDns(dst) ?? dst
      : devices.find((d) => d.type === "web" || d.type === "cloud")?.ifaces[0]?.ip;
    if (!target) return;
    n.net.send({
      srcIp: from.ifaces[0].ip,
      dstIp: target,
      protocol,
      dstPort: protocol === "HTTP" ? 80 : protocol === "DNS" ? 53 : protocol === "TCP" ? 443 : 0,
      payload: `${protocol} from ${from.name}`,
    });
    n.markDirty("net");
  };

  const addDevice = (type: DeviceType) => {
    const count = devices.filter((d) => d.type === type).length + 1;
    const d = n.net.createDevice({
      type,
      name: `${type}-${String(count).padStart(2, "0")}`,
      hostname: `${type}${count}`,
      x: 80 + ((devices.length * 67) % (CANVAS_W - 160)),
      y: 70 + ((devices.length * 97) % (CANVAS_H - 140)),
      isDns: type === "dns",
      isDb: type === "server",
    });
    n.markDirty("net");
    setSelected(d.id);
  };

  const dev = selected ? n.net.devices.get(selected) ?? null : null;

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Seg
          value={tool}
          onChange={(v) => {
            setTool(v);
            setLinkFrom(null);
          }}
          options={[
            { value: "select", label: "✥ Select / drag" },
            { value: "link", label: "⇄ Connect" },
          ]}
        />
        <span style={{ width: 1, height: 20, background: "var(--border)" }} />
        <Btn size="sm" onClick={() => addDevice("pc")}>+ PC</Btn>
        <Btn size="sm" onClick={() => addDevice("server")}>+ Server</Btn>
        <Btn size="sm" onClick={() => addDevice("router")}>+ Router</Btn>
        <Btn size="sm" onClick={() => addDevice("switch")}>+ Switch</Btn>
        <Btn size="sm" onClick={() => addDevice("firewall")}>+ Firewall</Btn>
        <Btn size="sm" onClick={() => addDevice("dns")}>+ DNS</Btn>
        <Btn size="sm" onClick={() => addDevice("web")}>+ Web</Btn>
        <Btn size="sm" onClick={() => addDevice("cloud")}>+ Cloud</Btn>
        <span className="spacer" />
        <Toggle checked={showLabels} onChange={setShowLabels} label="Labels" />
      </div>

      <div className="row grow" style={{ minHeight: 0 }}>
        <div className="grow rel" style={{ minWidth: 0, background: "var(--bg-1)" }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: tool === "link" ? "crosshair" : "grab" }}
          />
          <div
            className="row"
            style={{
              position: "absolute", left: 10, bottom: 10, gap: 10, padding: "5px 10px",
              borderRadius: 99, background: "color-mix(in srgb, var(--panel-solid) 82%, transparent)",
              border: "1px solid var(--border)", fontSize: 11, flexWrap: "wrap", maxWidth: "90%",
            }}
          >
            {(["ICMP", "TCP", "UDP", "DNS", "HTTP"] as Protocol[]).map((p) => (
              <button key={p} className="btn btn-sm" onClick={() => sendPacket(p)} style={{ padding: "2px 8px" }}>
                send {p}
              </button>
            ))}
            <span style={{ width: 1, height: 14, background: "var(--border)" }} />
            <span className="dim">{n.net.packets.length} in flight · {n.net.log.length} captured</span>
          </div>
          {linkFrom && (
            <div
              className="panel"
              style={{ position: "absolute", top: 10, left: 10, padding: "6px 12px", fontSize: 12 }}
            >
              Linking from <strong>{n.net.devices.get(linkFrom)?.name}</strong> — click a target device
            </div>
          )}
        </div>

        <aside className="sidebar" style={{ width: 264, borderRight: 0, borderLeft: "1px solid var(--border)" }}>
          {dev ? (
            <DeviceInspector n={n} dev={dev} onDelete={() => { n.net.removeDevice(dev.id); setSelected(null); }} />
          ) : (
            <div className="col" style={{ gap: 10 }}>
              <strong className="small">Topology</strong>
              <div className="tiny dim">
                Drag devices to move them. Use <strong>Connect</strong> to wire them together. Packets fly the
                real path, honouring link latency, loss, TTL and every firewall rule.
              </div>
              {devices.length === 0 && <Empty icon="🔗" title="No devices" hint="Add one from the toolbar." />}
              {devices.map((d) => (
                <button key={d.id} className="sidebar-item" onClick={() => setSelected(d.id)}>
                  <span>{TYPE_ICON[d.type]}</span>
                  <span className="ellipsis grow">{d.name}</span>
                  <span className="tiny dim mono">{d.ifaces[0]?.ip}</span>
                </button>
              ))}
              <div className="hr" />
              <div className="col" style={{ gap: 4 }}>
                <span className="tiny dim semi">PRESETS</span>
                <Btn size="sm" onClick={() => { n.net.devices.clear(); n.net.links.clear(); resetTopology(n); n.markDirty("net"); }}>
                  Restore default topology
                </Btn>
                <Btn size="sm" onClick={() => { n.net.links.forEach((l) => (l.up = !l.up)); n.net.bus.emit("change"); }}>
                  Toggle all links
                </Btn>
                <Btn size="sm" onClick={() => { n.net.lossScale = n.net.lossScale === 1 ? 8 : 1; }}>
                  Loss shaping: {n.net.lossScale === 1 ? "normal" : "congested"}
                </Btn>
              </div>
              <div className="hr" />
              <div className="col" style={{ gap: 4 }}>
                <span className="tiny dim semi">RECENT PACKETS</span>
                {n.net.log.slice(-8).reverse().map((p) => (
                  <button key={p.id} className="card card-hover" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setInspect(p)}>
                    <div className="row between">
                      <span className="tiny mono semi" style={{ color: p.color }}>{p.protocol}</span>
                      <span
                        className="tiny"
                        style={{ color: p.state === "delivered" ? "var(--ok)" : p.state === "flying" ? "var(--info)" : "var(--err)" }}
                      >
                        {p.state}
                      </span>
                    </div>
                    <div className="tiny dim mono ellipsis">{p.srcIp} → {p.dstIp}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="app-status">
        <Badge tone="ok">{devices.length} devices</Badge>
        <Badge>{n.net.links.size} links</Badge>
        <Badge tone="info">{n.net.packets.length} in flight</Badge>
        <span className="spacer" />
        <Btn size="sm" onClick={() => wm.openApp("browser", { args: { url: "novasearch.net" } })}>Open browser →</Btn>
        <Btn size="sm" onClick={() => wm.openApp("netmgr")}>Network Manager →</Btn>
      </div>

      <Modal open={!!inspect} onClose={() => setInspect(null)} title="Packet inspector" width={440}>
        {inspect && (
          <div className="col" style={{ gap: 2 }}>
            <KV k="Source" v={`${inspect.srcIp}:${inspect.srcPort}`} />
            <KV k="Destination" v={`${inspect.dstIp}:${inspect.dstPort}`} />
            <KV k="Protocol" v={inspect.protocol} />
            <KV k="TTL" v={inspect.ttl} />
            <KV k="Size" v={`${inspect.size} bytes`} />
            <KV k="State" v={inspect.state} />
            <KV k="Reason" v={inspect.reason || "—"} />
            <div className="hr" />
            <div className="row wrap tiny mono" style={{ gap: 4 }}>
              {inspect.path.map((id, i) => (
                <span key={i} className="badge">
                  {i > 0 && "→ "}
                  {n.net.devices.get(id)?.name ?? "?"}
                </span>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DeviceInspector({ n, dev, onDelete }: { n: Nova; dev: NetDevice; onDelete: () => void }) {
  const [host, setHost] = useState(dev.http?.host ?? `${dev.hostname}.nova`);

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row between">
        <span className="row" style={{ gap: 8 }}>
          <span style={{ fontSize: 20 }}>{TYPE_ICON[dev.type]}</span>
          <div className="col" style={{ gap: 0 }}>
            <strong className="small">{dev.name}</strong>
            <span className="tiny dim mono">{dev.hostname}</span>
          </div>
        </span>
        <Btn size="sm" variant="danger" onClick={onDelete}>Delete</Btn>
      </div>

      <div className="hr" style={{ margin: 0 }} />
      <span className="tiny dim semi">INTERFACES</span>
      {dev.ifaces.map((i) => (
        <div key={i.name} className="col" style={{ gap: 2 }}>
          <div className="row between">
            <span className="tiny mono semi">{i.name}</span>
            <input
              className="input mono"
              style={{ width: 118, padding: "2px 6px", fontSize: 11 }}
              value={i.ip}
              onChange={(e) => {
                i.ip = e.target.value;
                n.net.bus.emit("change");
              }}
            />
          </div>
          <span className="tiny dim mono">{i.mac}</span>
        </div>
      ))}

      <span className="tiny dim semi">LINKS</span>
      {n.net.links.size === 0 && <span className="tiny dim">none</span>}
      {[...n.net.links.values()]
        .filter((l) => l.a === dev.id || l.b === dev.id)
        .map((l) => {
          const other = n.net.devices.get(l.a === dev.id ? l.b : l.a);
          return (
            <div key={l.id} className="col" style={{ gap: 3, padding: 6, borderRadius: 7, background: "color-mix(in srgb, var(--bg-0) 30%, transparent)" }}>
              <div className="row between">
                <span className="tiny semi ellipsis">→ {other?.name}</span>
                <span className="row" style={{ gap: 3 }}>
                  <Btn size="sm" variant="ghost" onClick={() => { l.up = !l.up; n.net.bus.emit("change"); }}>
                    {l.up ? "⏸" : "▶"}
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => { n.net.disconnect(l.id); n.markDirty("net"); }}>✕</Btn>
                </span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <label className="tiny dim" style={{ width: 44 }}>latency</label>
                <input
                  type="range" min={0.2} max={80} step={0.2} value={l.latency}
                  onChange={(e) => { l.latency = Number(e.target.value); }}
                  style={{ flex: 1 }}
                  aria-label="Link latency"
                />
                <span className="tiny mono" style={{ width: 48 }}>{l.latency.toFixed(1)}ms</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <label className="tiny dim" style={{ width: 44 }}>loss</label>
                <input
                  type="range" min={0} max={0.5} step={0.005} value={l.loss}
                  onChange={(e) => { l.loss = Number(e.target.value); }}
                  style={{ flex: 1 }}
                  aria-label="Packet loss"
                />
                <span className="tiny mono" style={{ width: 48 }}>{(l.loss * 100).toFixed(1)}%</span>
              </div>
            </div>
          );
        })}

      <span className="tiny dim semi">WEB SERVICE</span>
      <div className="row" style={{ gap: 4 }}>
        <input className="input mono" style={{ fontSize: 11 }} value={host} onChange={(e) => setHost(e.target.value)} />
        <Btn
          size="sm"
          onClick={() => {
            const body = n.fs.read("/websites/my-site.nova/index.html") ?? "<h1>Hello</h1>";
            n.publishToNetwork(host, dev.name, body);
            n.markDirty("net");
          }}
        >
          Host
        </Btn>
      </div>
      {dev.http && <span className="tiny dim">serving <span className="mono">{dev.http.host}</span></span>}

      <span className="tiny dim semi">FIREWALL</span>
      <div className="row wrap" style={{ gap: 4 }}>
        {dev.firewall.length === 0 && <span className="tiny dim">no rules</span>}
        {dev.firewall.map((r) => (
          <span
            key={r.id}
            className="badge"
            style={{ color: r.action === "block" ? "var(--err)" : "var(--ok)", cursor: "pointer" }}
            title="Click to remove"
            onClick={() => {
              dev.firewall = dev.firewall.filter((x) => x.id !== r.id);
              n.markDirty("net");
            }}
          >
            {r.action} {r.srcIp}→{r.dstIp} {r.protocol}
            {r.dstPort !== null ? `:${r.dstPort}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function resetTopology(n: Nova) {
  // rebuilds the reference LAN by re-seeding just the network layer
  buildDefaultTopology(n.net);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
