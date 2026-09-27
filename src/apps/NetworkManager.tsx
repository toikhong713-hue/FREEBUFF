import { useEffect, useMemo, useRef, useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { Badge, Btn, Empty, KV, Modal, Seg, Sparkline, loadColor } from "../ui/primitives";
import { uid } from "../core/rng";
import type { DeviceType, NetDevice, Packet, Protocol } from "../core/net";

type Tab = "devices" | "packets" | "firewall" | "tools";

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

function linkBetween(links: { a: string; b: string; id: string; latency: number }[], x: string, y: string) {
  return links.find((l) => (l.a === x && l.b === y) || (l.b === x && l.a === y));
}

export function NetworkManagerApp(_props: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const [tab, setTab] = useState<Tab>("devices");
  const [selected, setSelected] = useState<string | null>(null);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const devices = useMemo(
    () => [...n.net.devices.values()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const dev = selected ? n.net.devices.get(selected) ?? null : null;

  useEffect(() => {
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  });

  const pc = devices.find((d) => d.type === "pc");
  const pcIp = pc?.ifaces[0]?.ip ?? "10.0.0.1";

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: "devices", label: "Devices" },
            { value: "packets", label: "Packets" },
            { value: "firewall", label: "Firewall" },
            { value: "tools", label: "Tools" },
          ]}
        />
        <span className="spacer" />
        <Badge tone="ok">{devices.length} devices</Badge>
        <Badge>{n.net.links.size} links</Badge>
        <Badge tone={n.net.packets.length ? "info" : undefined}>{n.net.packets.length} in flight</Badge>
        <Btn size="sm" onClick={() => wm.openApp("netlab")}>Open Lab →</Btn>
      </div>

      <div className="row grow" style={{ minHeight: 0 }}>
        <div className="sidebar" style={{ width: 200 }}>
          <div className="tiny dim semi" style={{ padding: "2px 6px 6px" }}>DEVICES</div>
          {devices.map((d) => (
            <button
              key={d.id}
              className="sidebar-item"
              aria-current={selected === d.id}
              onClick={() => {
                setSelected(d.id);
                setTab("devices");
              }}
            >
              <span>{TYPE_ICON[d.type]}</span>
              <span className="ellipsis grow">{d.name}</span>
              <span className="tiny dim mono">{d.ifaces[0]?.ip.split(".").pop()}</span>
            </button>
          ))}
        </div>

        <div className="grow" style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          {tab === "devices" && <DevicePane n={n} dev={dev} setSelected={setSelected} />}
          {tab === "packets" && (
            <PacketPane logRef={logRef} onPick={setPacket} autoScroll={autoScroll} setAutoScroll={setAutoScroll} />
          )}
          {tab === "firewall" && <FirewallPane n={n} dev={dev} devices={devices} selected={selected} setSelected={setSelected} />}
          {tab === "tools" && <ToolsPane n={n} pcIp={pcIp} />}
        </div>
      </div>

      <Modal open={!!packet} onClose={() => setPacket(null)} title="Packet inspector" width={460}>
        {packet && (
          <div className="col" style={{ gap: 2 }}>
            <KV k="Source" v={`${packet.srcIp}:${packet.srcPort}`} />
            <KV k="Destination" v={`${packet.dstIp}:${packet.dstPort}`} />
            <KV k="Protocol" v={packet.protocol} />
            <KV k="TTL" v={packet.ttl} />
            <KV k="Size" v={`${packet.size} bytes`} />
            <KV k="Hops" v={packet.path.length} />
            <KV k="Current node" v={n.net.devices.get(packet.path[packet.path.length - 1])?.name ?? "—"} />
            <KV k="State" v={packet.state} />
            <KV k="Reason" v={packet.reason || "—"} />
            <div className="hr" />
            <span className="tiny dim semi">PATH</span>
            <div className="row wrap tiny mono" style={{ gap: 4 }}>
              {packet.path.map((id, i) => (
                <span key={i} className="badge">
                  {i > 0 && <span className="dim">→ </span>}
                  {n.net.devices.get(id)?.name ?? "?"}
                </span>
              ))}
            </div>
            {packet.payload && (
              <>
                <div className="hr" />
                <span className="tiny dim semi">PAYLOAD</span>
                <div className="tiny mono">{packet.payload}</div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function DevicePane({ n, dev, setSelected }: { n: Nova; dev: NetDevice | null; setSelected: (id: string) => void }) {
  const devices = [...n.net.devices.values()];
  const links = [...n.net.links.values()];

  if (!dev) {
    return (
      <div className="scroll grow" style={{ padding: 14 }}>
        <div className="col" style={{ gap: 12 }}>
          <Empty icon="🛰" title="Select a device" hint="Pick one from the list to inspect its interfaces, routes, services and firewall." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
            {devices.map((d) => {
              const count = links.filter((l) => l.a === d.id || l.b === d.id).length;
              return (
                <button
                  key={d.id}
                  className="panel card-hover col"
                  style={{ gap: 4, cursor: "pointer", textAlign: "left", border: 0, font: "inherit", color: "var(--text)" }}
                  onClick={() => setSelected(d.id)}
                >
                  <div className="row between">
                    <span style={{ fontSize: 18 }}>{TYPE_ICON[d.type]}</span>
                    <Badge tone={d.up ? "ok" : "err"}>{d.up ? "up" : "down"}</Badge>
                  </div>
                  <span className="small semi ellipsis">{d.name}</span>
                  <span className="tiny dim mono">{d.ifaces[0]?.ip}</span>
                  <span className="tiny dim">{count} links · {d.firewall.length} rules</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll grow" style={{ padding: 14 }}>
      <div className="col" style={{ gap: 14 }}>
        <div className="panel-flat col" style={{ padding: 14, gap: 8 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 10 }}>
              <span style={{ fontSize: 24 }}>{TYPE_ICON[dev.type]}</span>
              <div className="col" style={{ gap: 0 }}>
                <strong style={{ fontSize: 15 }}>{dev.name}</strong>
                <span className="tiny dim mono">
                  {dev.type} · {dev.hostname}
                </span>
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Badge tone={dev.up ? "ok" : "err"}>{dev.up ? "up" : "down"}</Badge>
              <Btn
                size="sm"
                onClick={() => {
                  dev.up = !dev.up;
                  n.net.bus.emit("change");
                  n.markDirty("net");
                }}
              >
                {dev.up ? "Shut down" : "Bring up"}
              </Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() => {
                  n.net.removeDevice(dev.id);
                  setSelected("");
                  n.markDirty("net");
                }}
              >
                Delete
              </Btn>
            </div>
          </div>
          <div className="hr" style={{ margin: "4px 0" }} />
          <div className="row wrap" style={{ gap: 14, alignItems: "flex-start" }}>
            <div className="col grow" style={{ gap: 2, minWidth: 210 }}>
              <span className="tiny dim semi">INTERFACES</span>
              {dev.ifaces.map((i) => (
                <div key={i.name} className="kv">
                  <span className="mono">{i.name}</span>
                  <span className="mono">
                    {i.ip}/{bits(i.netmask)} · {i.mac}
                  </span>
                </div>
              ))}
            </div>
            <div className="col grow" style={{ gap: 2, minWidth: 210 }}>
              <span className="tiny dim semi">ROUTING TABLE</span>
              {dev.routes.length === 0 && <span className="tiny dim">no routes</span>}
              {dev.routes.map((r, i) => (
                <div key={i} className="kv">
                  <span className="mono">
                    {r.net}/{bits(r.mask)}
                  </span>
                  <span className="mono">via {r.via ?? "on-link"} dev {r.iface} m{r.metric}</span>
                </div>
              ))}
            </div>
            <div className="col grow" style={{ gap: 2, minWidth: 180 }}>
              <span className="tiny dim semi">SERVICES</span>
              <div className="kv"><span>DNS</span><span>{dev.isDns ? "port 53" : "—"}</span></div>
              <div className="kv"><span>Database</span><span>{dev.isDb ? "port 5432" : "—"}</span></div>
              <div className="kv"><span>HTTP</span><span>{dev.http ? `${dev.http.host}:${dev.http.port}` : "—"}</span></div>
              <div className="kv"><span>CPU</span><span>{dev.cpu.toFixed(0)}%</span></div>
              <div className="kv"><span>Firewall rules</span><span>{dev.firewall.length}</span></div>
            </div>
          </div>
        </div>

        <div className="panel-flat col" style={{ padding: 14, gap: 6 }}>
          <span className="tiny dim semi">EDIT DEVICE</span>
          <div className="row wrap" style={{ gap: 6 }}>
            <Btn
              size="sm"
              onClick={() => {
                const idx = n.net.devices.size + 1;
                dev.ifaces.push({
                  name: `eth${dev.ifaces.length}`,
                  ip: `10.9.${idx}.2`,
                  netmask: "255.255.255.0",
                  mac: `02:42:aa:00:00:${String(idx % 256).padStart(2, "0")}`,
                  up: true,
                });
                n.net.bus.emit("change");
                n.markDirty("net");
              }}
            >
              + IPv4 interface
            </Btn>
            {dev.type !== "router" && dev.type !== "firewall" && (
              <Btn
                size="sm"
                onClick={() => {
                  dev.routes.push({ net: "0.0.0.0", mask: "0.0.0.0", via: "203.0.113.1", iface: dev.ifaces[0].name, metric: 5 });
                  n.net.bus.emit("change");
                  n.markDirty("net");
                }}
              >
                + default route
              </Btn>
            )}
            <Btn
              size="sm"
              onClick={() => {
                const body = n.fs.read("/websites/my-site.nova/index.html") ?? "<h1>Hello</h1>";
                dev.http = { host: `${dev.hostname}.nova`, title: dev.name, kind: "custom", body, port: 80 };
                n.publishPage(`${dev.hostname}.nova`, dev.name, body);
                n.net.bus.emit("change");
                n.markDirty("net");
              }}
            >
              🌐 Host a page here
            </Btn>
          </div>
          <span className="tiny dim">
            Hosting a page makes it resolvable in the browser at{" "}
            <span className="mono">{dev.hostname}.nova</span>.
          </span>
        </div>

        <div className="panel-flat col" style={{ padding: 14, gap: 6 }}>
          <span className="tiny dim semi">CONNECTIONS</span>
          <div className="row wrap" style={{ gap: 5 }}>
            {devices
              .filter((d) => d.id !== dev.id)
              .map((d) => {
                const link = linkBetween(links, dev.id, d.id);
                return (
                  <Btn
                    key={d.id}
                    size="sm"
                    variant={link ? "primary" : "default"}
                    onClick={() => {
                      if (link) n.net.disconnect(link.id);
                      else n.net.connect(dev.id, d.id);
                      n.markDirty("net");
                    }}
                  >
                    {link ? "⛓" : "＋"} {d.name}
                    {link && <span className="tiny dim"> {link.latency.toFixed(1)}ms</span>}
                  </Btn>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

function bits(mask: string): number {
  return mask
    .split(".")
    .reduce((a, o) => a * 256 + Number(o), 0)
    .toString(2)
    .replace(/0+$/, "").length;
}

function PacketPane({
  logRef,
  onPick,
  autoScroll,
  setAutoScroll,
}: {
  logRef: React.RefObject<HTMLDivElement>;
  onPick: (p: Packet) => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
}) {
  const n = useKernel();
  const [filter, setFilter] = useState<"all" | Protocol>("all");
  const rows = useMemo(
    () =>
      (filter === "all" ? n.net.log : n.net.log.filter((p) => p.protocol === filter))
        .slice(-160)
        .reverse(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev, filter],
  );

  return (
    <div className="col grow" style={{ minHeight: 0 }}>
      <div className="row" style={{ gap: 6, padding: "6px 10px", borderBottom: "1px solid var(--border)" }}>
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "ICMP", label: "ICMP" },
            { value: "TCP", label: "TCP" },
            { value: "UDP", label: "UDP" },
            { value: "DNS", label: "DNS" },
            { value: "HTTP", label: "HTTP" },
          ]}
        />
        <span className="spacer" />
        <label className="checkbox tiny">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
          follow
        </label>
        <Btn
          size="sm"
          onClick={() => {
            n.net.log.length = 0;
            n.markDirty("net");
          }}
        >
          Clear
        </Btn>
      </div>
      <div ref={logRef} className="scroll grow" style={{ padding: 8 }}>
        {rows.length === 0 && (
          <Empty icon="📡" title="No packets yet" hint="Open a page in the browser, run a tool, or send a packet from the Lab." />
        )}
        {rows.map((p) => (
          <div
            key={p.id}
            className="row card card-hover"
            style={{ gap: 8, padding: "5px 8px", cursor: "pointer", marginBottom: 3 }}
            onClick={() => onPick(p)}
          >
            <span style={{ width: 6, height: 6, borderRadius: 99, background: p.color, flex: "none" }} />
            <span className="tiny mono dim" style={{ width: 66 }}>{new Date(p.createdAt).toLocaleTimeString()}</span>
            <span className="tiny mono semi" style={{ width: 44 }}>{p.protocol}</span>
            <span className="tiny mono ellipsis grow">
              {p.srcIp}:{p.srcPort} → {p.dstIp}:{p.dstPort}
            </span>
            <span className="tiny dim" style={{ width: 42 }}>ttl {p.ttl}</span>
            <span className="tiny dim" style={{ width: 50 }}>{p.size} B</span>
            <span
              className="badge"
              style={{
                color: p.state === "delivered" ? "var(--ok)" : p.state === "flying" ? "var(--info)" : "var(--err)",
                width: 86,
                justifyContent: "center",
              }}
            >
              {p.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FirewallPane({
  n,
  dev,
  devices,
  selected,
  setSelected,
}: {
  n: Nova;
  dev: NetDevice | null;
  devices: NetDevice[];
  selected: string | null;
  setSelected: (id: string) => void;
}) {
  const [draft, setDraft] = useState({
    action: "block",
    srcIp: "*",
    dstIp: "*",
    protocol: "any",
    dstPort: "",
  });

  const apply = (device: NetDevice) => {
    const port = draft.dstPort.trim() ? Number(draft.dstPort) : null;
    device.firewall.push({
      id: uid("fw"),
      action: draft.action as "allow" | "block",
      srcIp: draft.srcIp || "*",
      dstIp: draft.dstIp || "*",
      protocol: draft.protocol as Protocol | "any",
      dstPort: port,
      priority: (device.firewall.length + 1) * 10,
      enabled: true,
      hits: 0,
    });
    n.net.bus.emit("change");
    n.markDirty("net");
  };

  return (
    <div className="scroll grow" style={{ padding: 14 }}>
      <div className="col" style={{ gap: 12 }}>
        <div className="panel-flat col" style={{ padding: 12, gap: 8 }}>
          <strong className="small">New rule</strong>
          <div className="row wrap" style={{ gap: 6 }}>
            <select
              className="select"
              style={{ width: 104 }}
              value={draft.action}
              onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            >
              <option value="block">Block</option>
              <option value="allow">Allow</option>
            </select>
            <input
              className="input mono"
              style={{ width: 132 }}
              placeholder="src 10.0.0.0/24"
              value={draft.srcIp}
              onChange={(e) => setDraft({ ...draft, srcIp: e.target.value })}
            />
            <span className="dim tiny">→</span>
            <input
              className="input mono"
              style={{ width: 132 }}
              placeholder="dst *"
              value={draft.dstIp}
              onChange={(e) => setDraft({ ...draft, dstIp: e.target.value })}
            />
            <select
              className="select"
              style={{ width: 104 }}
              value={draft.protocol}
              onChange={(e) => setDraft({ ...draft, protocol: e.target.value })}
            >
              <option value="any">any</option>
              <option value="ICMP">ICMP</option>
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
              <option value="DNS">DNS</option>
              <option value="HTTP">HTTP</option>
            </select>
            <input
              className="input mono"
              style={{ width: 82 }}
              placeholder="port"
              value={draft.dstPort}
              onChange={(e) => setDraft({ ...draft, dstPort: e.target.value })}
            />
            <select
              className="select"
              style={{ width: 150 }}
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">choose a device…</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Btn variant="primary" disabled={!dev} onClick={() => dev && apply(dev)}>
              Add rule
            </Btn>
          </div>
          <span className="tiny dim">
            Rules evaluate in priority order; the first match wins. CIDR blocks and <span className="mono">*</span>{" "}
            wildcards are supported. Default rule blocks inbound TCP/23 and the external subnet.
          </span>
        </div>

        {devices.map((d) => (
          <div key={d.id} className="panel-flat col" style={{ padding: 12, gap: 6 }}>
            <div className="row between">
              <span className="row" style={{ gap: 6 }}>
                {TYPE_ICON[d.type]} <strong className="small">{d.name}</strong>
                <span className="tiny dim mono">{d.ifaces[0]?.ip}</span>
              </span>
              <span className="tiny dim">{d.firewall.length} rules</span>
            </div>
            {d.firewall.length === 0 && <div className="tiny dim">No rules — everything is permitted.</div>}
            {d.firewall
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((r) => (
                <div
                  key={r.id}
                  className="row between"
                  style={{
                    padding: "4px 8px",
                    borderRadius: 7,
                    background: "color-mix(in srgb, var(--bg-0) 32%, transparent)",
                    opacity: r.enabled ? 1 : 0.45,
                  }}
                >
                  <div className="row tiny mono wrap" style={{ gap: 8 }}>
                    <span className="badge" style={{ color: r.action === "block" ? "var(--err)" : "var(--ok)" }}>
                      {r.action}
                    </span>
                    <span className="dim">#{r.priority}</span>
                    <span>{r.srcIp}</span>
                    <span className="dim">→</span>
                    <span>{r.dstIp}</span>
                    <span className="dim">{r.protocol}</span>
                    {r.dstPort !== null && <span className="dim">:{r.dstPort}</span>}
                    <span className="dim">{r.hits} hits</span>
                  </div>
                  <div className="row" style={{ gap: 3 }}>
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        r.enabled = !r.enabled;
                        n.markDirty("net");
                      }}
                    >
                      {r.enabled ? "⏸" : "▶"}
                    </Btn>
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        d.firewall = d.firewall.filter((x) => x.id !== r.id);
                        n.markDirty("net");
                      }}
                    >
                      ✕
                    </Btn>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolsPane({ n, pcIp }: { n: Nova; pcIp: string }) {
  const [target, setTarget] = useState("10.0.0.1");
  const [out, setOut] = useState<string[]>([]);
  const [count, setCount] = useState(4);
  const [history, setHistory] = useState<number[]>([]);

  const run = (kind: "ping" | "traceroute" | "nslookup" | "netstat" | "ipconfig") => {
    let res: { lines: string[]; ok: boolean };
    const ip = /^\d+\.\d+\.\d+\.\d+$/.test(target) ? target : (n.net.resolveDns(target) ?? "");
    if (kind === "ping" && ip) res = n.net.ping(pcIp, ip, count);
    else if (kind === "traceroute" && ip) res = n.net.traceroute(pcIp, ip);
    else if (kind === "nslookup") res = n.net.nslookup(target);
    else if (kind === "netstat") res = n.net.netstat();
    else res = n.net.ipconfig();
    setOut(res.lines);
    setHistory((h) => [...h, res.ok ? 1 : 0].slice(-40));
    n.markDirty("net");
  };

  const okRate = history.length ? (history.filter((x) => x === 1).length / history.length) * 100 : 0;

  return (
    <div className="scroll grow" style={{ padding: 14 }}>
      <div className="col" style={{ gap: 12 }}>
        <div className="panel-flat col" style={{ padding: 12, gap: 8 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <input
              className="input mono"
              style={{ width: 180 }}
              placeholder="10.0.0.1 or hostname"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <input
              className="input mono"
              style={{ width: 62 }}
              type="number"
              min={1}
              max={12}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              aria-label="Ping count"
            />
            <Btn size="sm" variant="primary" onClick={() => run("ping")}>ping</Btn>
            <Btn size="sm" onClick={() => run("traceroute")}>traceroute</Btn>
            <Btn size="sm" onClick={() => run("nslookup")}>nslookup</Btn>
            <Btn size="sm" onClick={() => run("netstat")}>netstat</Btn>
            <Btn size="sm" onClick={() => run("ipconfig")}>ipconfig</Btn>
            <span className="spacer" />
            <Sparkline data={history} width={90} height={22} color={loadColor(okRate)} max={1} />
          </div>
          <span className="tiny dim">source {pcIp}</span>
        </div>
        <pre
          className="panel-flat small mono scroll"
          style={{ margin: 0, padding: 12, lineHeight: 1.55, minHeight: 260, whiteSpace: "pre-wrap" }}
        >
          {out.length
            ? out.join("\n")
            : "Pick a tool and press enter. Packets will also appear on the Lab canvas."}
        </pre>
      </div>
    </div>
  );
}

export { TYPE_ICON };
