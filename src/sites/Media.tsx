import { useEffect, useMemo, useRef, useState } from "react";
import { TABLES } from "../core/db";
import { useKernel } from "../os/hooks";
import { Pill, SiteLink, SiteShell, hueOf, siteByHost, useSiteNav } from "./shell";
import { Badge, Btn, Empty, Meter } from "../ui/primitives";
import { fmtBytes, timeAgo } from "../core/rng";

/* ================================================================== DRIVE */

export function DriveSite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost("novadrive.cloud")!;
  const [folder, setFolder] = useState("/cloud/bucket");
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<"name" | "size" | "modified">("modified");

  const entries = useMemo(() => {
    const list = n.fs.list(folder);
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return n.fs.stat(n.fs.pathOf(b))!.size - n.fs.stat(n.fs.pathOf(a))!.size;
      return b.modified - a.modified;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, sort, n.rev]);

  const used = n.cloud.storageUsedGb();
  const pct = n.cloud.storagePct();

  return (
    <SiteShell
      def={def}
      path={path}
      actions={
        <Btn size="sm" variant="primary" onClick={() => { n.cloud.syncAll(); n.markDirty("cloud"); }}>
          Sync all
        </Btn>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="panel col" style={{ padding: 14, gap: 8 }}>
          <div className="row between">
            <strong style={{ fontSize: 14 }}>NOVA Drive — bucket /cloud/bucket</strong>
            <span className="small mono">
              {used.toFixed(2)} / {n.cloud.quotaGb} GB
            </span>
          </div>
          <Meter pct={pct} color={pct > 85 ? "var(--err)" : pct > 60 ? "var(--warn)" : "var(--ok)"} />
          <div className="row tiny dim" style={{ gap: 12, flexWrap: "wrap" }}>
            <span>{n.cloud.syncQueue.length} tracked items</span>
            <span>{n.fs.count().files} files on the PC</span>
            <span>Quota region {n.cloud.region}</span>
          </div>
        </div>

        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <div className="grow col" style={{ gap: 10, minWidth: 0 }}>
            <div className="row" style={{ gap: 6 }}>
              <Btn size="sm" onClick={() => setFolder("/cloud/bucket")}>🏁 bucket</Btn>
              <span className="dim tiny mono" style={{ alignSelf: "center" }}>{folder}</span>
              <span className="spacer" />
              <select className="select" style={{ width: 120 }} value={sort} onChange={(e) => setSort(e.target.value as never)}>
                <option value="modified">Newest first</option>
                <option value="name">By name</option>
                <option value="size">Largest first</option>
              </select>
            </div>
            {entries.length === 0 ? (
              <Empty icon="☁️" title="Bucket is empty" hint="Sync a path from the PC, or upload robot telemetry from the AI Robot Lab." />
            ) : (
              <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                {entries.map((node) => {
                  const p = n.fs.pathOf(node);
                  const st = n.fs.stat(p)!;
                  return (
                    <div
                      key={node.id}
                      className="row"
                      style={{
                        gap: 10,
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        background: selected === p ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined,
                      }}
                      onClick={() => setSelected(p)}
                      onDoubleClick={() => node.type === "dir" && setFolder(p)}
                    >
                      <span style={{ fontSize: 15 }}>{node.type === "dir" ? "📁" : "📄"}</span>
                      <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
                        <span className="small ellipsis">{node.name}</span>
                        <span className="tiny dim mono ellipsis">{p}</span>
                      </div>
                      <span className="tiny dim nowrap">{node.type === "dir" ? "—" : fmtBytes(st.size)}</span>
                      <span className="tiny dim nowrap">{timeAgo(st.modified)}</span>
                      <Btn
                        size="sm"
                        variant="ghost"
                        title="Sync this path to the cloud"
                        onClick={(e) => { e.stopPropagation(); n.cloud.syncPath(p, "drive-web"); n.markDirty("cloud"); }}
                      >
                        ↻
                      </Btn>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="col" style={{ gap: 12, width: 270, flex: "none" }}>
            <div className="panel col" style={{ padding: 12, gap: 8 }}>
              <strong className="small">Details</strong>
              {selected ? (
                <>
                  <div className="tiny dim mono ellipsis">{selected}</div>
                  <Btn size="sm" onClick={() => {
                    const body = n.fs.read(selected);
                    if (body === null) return;
                    const name = selected.split("/").pop() ?? "file.txt";
                    n.fs.write(`/downloads/${name}`, body, { origin: "web" });
                    n.db.insert(TABLES.downloads, { name, from: "novadrive.cloud", ts: Date.now() });
                    n.markDirty("web");
                  }}>
                    ⬇ Download to /downloads
                  </Btn>
                  <Btn size="sm" onClick={() => { n.fs.rm(selected, { recursive: true }); n.markDirty("cloud"); }}>
                    🗑 Delete
                  </Btn>
                </>
              ) : (
                <div className="tiny dim">Select a file to see its actions.</div>
              )}
            </div>
            <div className="panel col" style={{ padding: 12, gap: 6 }}>
              <strong className="small">Uploads from other systems</strong>
              {n.cloud.syncQueue.length === 0 && <div className="tiny dim">Nothing synced yet.</div>}
              {n.cloud.syncQueue.slice(-6).reverse().map((i) => (
                <div key={i.path} className="col" style={{ gap: 0 }}>
                  <span className="tiny semi ellipsis">{i.path}</span>
                  <span className="tiny dim">
                    {i.state} · {fmtBytes(i.size)} · {i.device}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </SiteShell>
  );
}

/* ================================================================== TUBE */

export function TubeSite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost("novatube.tv")!;
  const go = useSiteNav();
  const [playing, setPlaying] = useState<string | null>(null);
  const [subs, setSubs] = useState<Set<string>>(new Set());

  const videos = useMemo(
    () =>
      n.db.all(TABLES.posts)
        .filter((p) => p.fromCity)
        .map((p) => ({
          id: p.id,
          title: String(p.body).slice(0, 64),
          author: p.author as string,
          views: 1000 + Math.floor(Math.random() * 0) + (p.likes ?? 0) * 37,
          dur: `${Math.floor(2 + Math.random() * 16)}:${String(Math.floor(Math.random() * 59)).padStart(2, "0")}`,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );

  const all = useMemo(
    () => [
      ...videos,
      ...n.db.all(TABLES.news).slice(0, 10).map((a) => ({
        id: a.id,
        title: String(a.title),
        author: String(a.source),
        views: Number(a.views),
        dur: `${Math.floor(1 + Math.random() * 22)}:${String(Math.floor(Math.random() * 59)).padStart(2, "0")}`,
      })),
    ],
    [videos, n.rev],
  );

  const current = all.find((v) => v.id === playing) ?? null;

  return (
    <SiteShell def={def} path={path} links={[{ label: "Home", href: "home", active: true }, { label: "City live", href: "live", active: path === "live" }]}>
      {current ? (
        <div className="col" style={{ gap: 12 }}>
          <Btn size="sm" onClick={() => setPlaying(null)}>← Back</Btn>
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <VideoSurface title={current.title} playing onToggle={() => setPlaying(null)} />
            <div className="col" style={{ padding: 14, gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{current.title}</h2>
              <div className="row" style={{ gap: 10 }}>
                <span className="small muted">{current.author}</span>
                <span className="tiny dim">{current.views.toLocaleString()} views</span>
                <span className="spacer" />
                <Btn size="sm" onClick={() => {
                  const next = new Set(subs);
                  if (next.has(current.author)) next.delete(current.author);
                  else next.add(current.author);
                  setSubs(next);
                }}>
                  {subs.has(current.author) ? "✓ Subscribed" : "Subscribe"}
                </Btn>
              </div>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
                Recorded live from the NOVA Virtual City simulation. Playback position and quality are real
                UI state — the video surface is a canvas, not an image.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            {["All", "City live", "Tech", "Weather", "News"].map((c, i) => (
              <Pill key={c} tone={i === 0 ? "info" : undefined}>{c}</Pill>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
            {all.map((v) => (
              <div key={v.id} className="panel col card-hover" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => { setPlaying(v.id); go(`v/${v.id}`); }}>
                <VideoSurface title={v.title} playing={false} onToggle={() => setPlaying(v.id)} />
                <div className="col" style={{ padding: 10, gap: 4 }}>
                  <span className="small semi clamp2">{v.title}</span>
                  <span className="tiny dim">{v.author}</span>
                  <span className="tiny dim">
                    {v.views.toLocaleString()} views · {v.dur}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SiteShell>
  );
}

function VideoSurface({ title, playing, onToggle }: { title: string; playing: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = ref.current;
      const ctx = c?.getContext("2d");
      if (c && ctx) {
        tRef.current += 0.016;
        const w = c.width;
        const h = c.height;
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, `hsl(${hueOf(title)} 55% 26%)`);
        g.addColorStop(1, `hsl(${hueOf(title) + 60} 50% 14%)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // animated skyline so playback is visibly live
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        for (let i = 0; i < 22; i++) {
          const bx = (i / 22) * w;
          const bh = 18 + Math.abs(Math.sin(tRef.current * 0.6 + i)) * h * 0.45;
          ctx.fillRect(bx, h - bh, w / 26, bh);
        }
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        for (let i = 0; i < 40; i++) {
          const sx = ((i * 97 + tRef.current * 42) % w);
          const sy = ((i * 53 + tRef.current * 18) % h);
          ctx.fillRect(sx, sy * 0.5, 1.5, 1.5);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [title]);

  return (
    <div className="rel" style={{ aspectRatio: "16 / 9", background: "#05070d" }} onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onToggle()}>
      <canvas ref={ref} width={320} height={180} style={{ width: "100%", height: "100%", display: "block" }} />
      <div
        className="col center"
        style={{
          position: "absolute",
          inset: 0,
          background: playing ? "transparent" : "rgba(3,6,12,0.4)",
          color: "#fff",
          fontSize: 30,
        }}
      >
        {playing ? "" : "▶"}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "rgba(255,255,255,0.25)" }}>
        <div
          style={{
            height: "100%",
            width: `${playing ? 42 : 0}%`,
            background: "var(--err)",
            transition: "width 600ms linear",
          }}
        />
      </div>
    </div>
  );
}

/* ================================================================== DOCS */

const DOC_PAGES: { id: string; title: string; body: string }[] = [
  {
    id: "start",
    title: "Getting started",
    body: `NOVA CLOUD PC is a single simulated computer. Boot it, sign in, and everything you open is a window on the same kernel.

**The six subsystems**

1. **NOVAOS** — this shell: windows, taskbar, start menu, the terminal and the process table.
2. **Fake Internet** — twelve simulated sites backed by the same NovaDB engine.
3. **Mini Internet Lab** — a real topology with routing tables, firewall rules and packets in flight.
4. **AI Robot Lab** — component-driven robots that log to /robots/ and can be deployed to the city.
5. **Virtual City** — 260 agents with schedules, traffic, weather and an economy.
6. **NOVA Cloud** — storage, servers, a database and accounts.

**Everything shares one filesystem**

    /home       user files
    /robots     robot configs and telemetry
    /city       city reports
    /network    topology exports
    /websites   pages you publish
    /cloud      the cloud bucket`,
  },
  {
    id: "terminal",
    title: "Terminal reference",
    body: `The terminal is not a mock. Every command reads or writes the running machine.

**Filesystem** — ls, cd, pwd, mkdir, touch, cat, echo, cp, mv, rm, tree, find, df
**System** — ps, kill, top, mem, sysinfo, uptime, whoami
**Network** — ping, traceroute, nslookup, netstat, ipconfig, ifconfig, arp, route, netdevices, packets
**Dev** — npm, python, g++, rustc
**Lab** — robots, city, cloud, serve, db
**Internet** — search, web, history

Try these:

    city stats
    robots run Scout-01
    robots upload
    ping 10.0.0.1
    netstat
    cat /robots/scout01/telemetry/telemetry.log`,
  },
  {
    id: "network",
    title: "Networking model",
    body: `There is one network layer. The browser, the city, the robots and the lab all send packets through it.

A packet is created with a source, destination, protocol, ports, size and TTL. It then walks the topology hop by hop:

* each hop costs the link latency plus a serialisation delay from packet size and bandwidth
* link loss is applied probabilistically
* TTL decrements per hop and expires at zero
* every device evaluates its firewall rules in priority order
* routers pick a next hop by longest-prefix match on their routing table

Delivered, dropped, rejected and expired packets all land in the inspector with a reason.

Hosting a page from the terminal makes it reachable in the browser:

    serve my-site.nova 80 /websites/my-site.nova/index.html`,
  },
  {
    id: "robots",
    title: "Robot development",
    body: `Robots are configured from nine component categories, each with real consequences.

    compute     from CPU clock × cores plus GPU TOPS
    endurance   battery watt-hours ÷ total draw
    speed       motor top speed, scaled by mass
    thermal     load minus the cooling system's temperature delta

**Behaviours** — explore, patrol, follow, work, recharge

Work robots pick up packages and deliver them to a depot. Recharge robots return to a dock under 45%
battery. All robots avoid obstacles using a potential-field steer over the lab's spatial hash.

Telemetry is written to /robots/<name>/telemetry/telemetry.log and can be uploaded to the cloud bucket:

    robots upload`,
  },
  {
    id: "api",
    title: "Kernel API",
    body: `These modules are the shared surface. Apps call them instead of reimplementing anything.

    FileSystemAPI   resolve, read, write, walk, stat, rm
    ProcessAPI      spawn, kill, list, tick
    NetworkAPI      send, step, resolveDns, pathBetween, checkFirewall
    CloudAPI        createServer, syncPath, metrics
    DatabaseAPI     insert, update, where, search
    RobotAPI        saveConfig, spawn, step, writeTelemetry
    CityAPI         findPath, publishNews, stats, deployRobot`,
  },
];

export function DocsSite({ path }: { path: string }) {
  const def = siteByHost("novadocs.dev")!;
  const go = useSiteNav();
  const id = path.startsWith("doc/") ? path.slice(4) : "start";
  const page = DOC_PAGES.find((p) => p.id === id) ?? DOC_PAGES[0];
  return (
    <SiteShell def={def} path={path} links={DOC_PAGES.map((p) => ({ label: p.title, href: `doc/${p.id}`, active: p.id === page.id }))}>
      <article className="col" style={{ gap: 14, maxWidth: 760 }}>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>{page.title}</h1>
        <div className="col" style={{ gap: 12 }}>
          {page.body.split("\n\n").map((block, i) =>
            block.startsWith("    ") ? (
              <pre key={i} className="panel-flat small mono" style={{ margin: 0, padding: 12, overflow: "auto", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {block.replace(/^ {4}/gm, "")}
              </pre>
            ) : (
              <p key={i} className="small" style={{ margin: 0, lineHeight: 1.75, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
                {block.replace(/\*\*/g, "").replace(/^ {4}/gm, "    ")}
              </p>
            ),
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {DOC_PAGES.map((p) => (
            <Btn key={p.id} size="sm" variant={p.id === page.id ? "primary" : "default"} onClick={() => go(`doc/${p.id}`)}>
              {p.title}
            </Btn>
          ))}
        </div>
      </article>
    </SiteShell>
  );
}

/* ==================================================================== DEV */

export function DevSite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost("novadev.io")!;
  const [key, setKey] = useState("");
  const [resp, setResp] = useState<string | null>(null);

  const endpoints: { path: string; desc: string; run: () => unknown }[] = [
    { path: "/v1/status", desc: "Region and service health", run: () => n.cloud.metrics() },
    { path: "/v1/devices", desc: "List simulated network devices", run: () => [...n.net.devices.values()].map((d) => ({ name: d.name, type: d.type, ip: d.ifaces[0]?.ip })) },
    { path: "/v1/npcs", desc: "Sample of city agents", run: () => n.city.npcs.slice(0, 5).map((a) => ({ name: a.name, age: a.age, state: a.state, district: a.district })) },
    { path: "/v1/robots", desc: "Saved robot configurations", run: () => n.robots.listConfigs().map((c) => c.name) },
    { path: "/v1/news", desc: "Latest headlines", run: () => n.db.all(TABLES.news).slice(0, 5).map((a) => a.title) },
    { path: "/v1/fs", desc: "Filesystem summary", run: () => n.fs.count() },
  ];

  const call = (p: string) => {
    setKey(key || "demo_nova_7f3a2291");
    const ep = endpoints.find((e) => e.path === p);
    setResp(JSON.stringify(ep ? ep.run() : { error: "unknown endpoint" }, null, 2));
  };

  return (
    <SiteShell def={def} path={path}>
      <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        <div className="grow col" style={{ gap: 12, minWidth: 0 }}>
          <div className="panel col" style={{ padding: 14, gap: 10 }}>
            <strong style={{ fontSize: 15 }}>NOVA Developer API</strong>
            <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
              Every endpoint below is a live read of the machine you are running on. Nothing is cached and
              nothing leaves this browser.
            </p>
            <div className="row" style={{ gap: 6 }}>
              <input className="input mono" placeholder="API key" value={key} onChange={(e) => setKey(e.target.value)} />
              <Btn size="sm" onClick={() => call("/v1/status")}>Test key</Btn>
            </div>
          </div>
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            {endpoints.map((e) => (
              <div
                key={e.path}
                className="row between"
                style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)", gap: 10 }}
              >
                <div className="col" style={{ gap: 1, minWidth: 0 }}>
                  <span className="small mono semi" style={{ color: "var(--accent)" }}>GET {e.path}</span>
                  <span className="tiny dim">{e.desc}</span>
                </div>
                <Btn size="sm" onClick={() => call(e.path)}>Run</Btn>
              </div>
            ))}
          </div>
        </div>
        <aside className="col" style={{ gap: 12, width: 330, flex: "none" }}>
          <div className="panel col" style={{ padding: 12, gap: 8 }}>
            <strong className="small">Service status</strong>
            {[
              ["API gateway", "ok"],
              ["NovaDB", "ok"],
              ["Storage", n.cloud.storagePct() > 90 ? "degraded" : "ok"],
              ["Packet fabric", n.net.devices.size ? "ok" : "down"],
              ["City feed", "ok"],
              ["Robot lab", "ok"],
            ].map(([name, state]) => (
              <div key={name} className="row between">
                <span className="small">{name}</span>
                <Badge tone={state === "ok" ? "ok" : state === "degraded" ? "warn" : "err"}>{state}</Badge>
              </div>
            ))}
          </div>
          <div className="panel col" style={{ padding: 12, gap: 6 }}>
            <strong className="small">Response</strong>
            <pre className="tiny mono scroll" style={{ margin: 0, maxHeight: 340, background: "color-mix(in srgb, var(--bg-0) 45%, transparent)", padding: 10, borderRadius: 8 }}>
              {resp ?? "Run an endpoint to see a live response."}
            </pre>
          </div>
          <SiteLink href="novadocs.dev/doc/api">
            <span className="small">Read the kernel API docs →</span>
          </SiteLink>
        </aside>
      </div>
    </SiteShell>
  );
}
