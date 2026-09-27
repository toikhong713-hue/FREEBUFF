import { useMemo, useState } from "react";
import { TABLES, type Row } from "../core/db";
import { useKernel } from "../os/hooks";
import { Avatar, Pill, SiteLink, SiteShell, hueOf, siteByHost, useSiteNav } from "./shell";
import { Badge, Btn, Empty, Meter } from "../ui/primitives";
import { fmtBytes, timeAgo } from "../core/rng";

/* ================================================================== SHOP */

export function ShopSite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost("novashop.com")!;
  const go = useSiteNav();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [placed, setPlaced] = useState<Row | null>(null);

  const productId = path.startsWith("p/") ? path.slice(2) : null;
  const products = useMemo(
    () => [...n.db.all(TABLES.products)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const cats = ["all", ...new Set(products.map((p) => p.category as string))];
  const filtered = products.filter(
    (p) => (cat === "all" || p.category === cat) && (!q.trim() || String(p.name).toLowerCase().includes(q.toLowerCase())),
  );
  const current = productId ? products.find((p) => p.id === productId) : null;
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = products.reduce((a, p) => a + (cart[p.id] ?? 0) * Number(p.price), 0);

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));

  const checkout = () => {
    if (!cartCount) return;
    const order = n.db.insert(TABLES.orders, {
      id: `ord_${Date.now().toString(36)}`,
      ts: Date.now(),
      items: Object.entries(cart).map(([id, qty]) => ({
        name: products.find((p) => p.id === id)?.name,
        qty,
        price: products.find((p) => p.id === id)?.price,
      })),
      total: Number(cartTotal.toFixed(2)),
      status: "processing",
    });
    n.fs.write(
      `/documents/order-${order.id}.txt`,
      `NOVA SHOP ORDER ${order.id}\n\n` +
        Object.entries(cart)
          .map(([id, qty]) => {
            const p = products.find((x) => x.id === id);
            return `${qty} × ${p?.name} — ${(Number(p?.price ?? 0) * qty).toFixed(2)} credits`;
          })
          .join("\n") +
        `\n\nTOTAL: ${cartTotal.toFixed(2)} credits\nPlaced: ${new Date().toString()}\n`,
      { origin: "web" },
    );
    n.db.insert(TABLES.mail, {
      folder: "inbox",
      from: "orders@novashop.com",
      to: "you@nova.cloud",
      subject: `Order ${order.id} confirmed`,
      ts: Date.now(),
      read: false,
      starred: false,
      flagged: false,
      hasAttachment: true,
      attachment: `${order.id}.txt`,
      body: `Thanks for your order.\n\n${Object.entries(cart).map(([id, qty]) => `${qty} × ${products.find((p) => p.id === id)?.name}`).join("\n")}\n\nTotal ${cartTotal.toFixed(2)} credits. A copy is in /documents.`,
    });
    setPlaced(order);
    setCart({});
    n.markDirty("web");
  };

  if (current) {
    return (
      <SiteShell def={def} path={path} links={[{ label: "Shop", href: "home", active: true }]}>
        <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
          <div
            style={{
              width: 260, height: 260, borderRadius: 14, flex: "none",
              background: `linear-gradient(140deg, hsl(${hueOf(current.name)} 55% 42%), hsl(${hueOf(current.name) + 40} 50% 22%))`,
              display: "grid", placeItems: "center", fontSize: 64,
            }}
          >
            📦
          </div>
          <div className="grow col" style={{ gap: 10, minWidth: 0 }}>
            <Btn size="sm" onClick={() => go("home")}>← Back to shop</Btn>
            <h1 style={{ margin: 0, fontSize: 22 }}>{current.name}</h1>
            <div className="row" style={{ gap: 8 }}>
              <Pill>{current.category}</Pill>
              <span className="small" style={{ color: "var(--warn)" }}>{"★".repeat(Math.round(current.rating))}</span>
              <span className="tiny dim">{current.rating} · {current.reviews} reviews</span>
            </div>
            <div className="huge">{Number(current.price).toFixed(2)} <span className="small dim">credits</span></div>
            <div className="small muted" style={{ maxWidth: 520, lineHeight: 1.7 }}>
              Sold by <SiteLink href={`nova.social/u/${current.seller}`}>@{current.seller}</SiteLink> · ships in {current.ships}.
              Stock in the simulated warehouse: {current.stock} units. The Aurora city economy draws down
              the same inventory as the shops you can visit in the Virtual City.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Btn variant="primary" onClick={() => add(current.id)} disabled={current.stock <= 0}>
                {current.stock > 0 ? "Add to cart" : "Out of stock"}
              </Btn>
              <span className="tiny dim" style={{ alignSelf: "center" }}>
                {cart[current.id] ? `${cart[current.id]} in cart` : ""}
              </span>
            </div>
          </div>
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell
      def={def}
      path={path}
      actions={<Badge tone={cartCount ? "info" : undefined}>{cartCount} in cart</Badge>}
    >
      {placed && (
        <div className="panel row between" style={{ padding: 12, marginBottom: 14, borderColor: "var(--ok)" }}>
          <span className="small">
            Order <span className="mono">{placed.id}</span> placed for {Number(placed.total).toFixed(2)} credits.
            A receipt was written to <span className="mono">/documents</span> and a confirmation landed in your mail.
          </span>
          <Btn size="sm" onClick={() => setPlaced(null)}>Dismiss</Btn>
        </div>
      )}

      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        {cats.map((c) => (
          <Btn key={c} size="sm" variant={cat === c ? "primary" : "default"} onClick={() => setCat(c)}>
            {c}
          </Btn>
        ))}
        <span className="spacer" />
        <input className="input" style={{ width: 190 }} placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12, flex: 1, minWidth: 0 }}>
          {filtered.slice(0, 24).map((p) => (
            <div key={p.id} className="panel col card-hover" style={{ padding: 0, overflow: "hidden" }}>
              <div
                onClick={() => go(`p/${p.id}`)}
                style={{
                  height: 110,
                  background: `linear-gradient(140deg, hsl(${hueOf(p.name)} 52% 40%), hsl(${hueOf(p.name) + 40} 48% 20%))`,
                  display: "grid", placeItems: "center", fontSize: 34, cursor: "pointer",
                }}
              >
                📦
              </div>
              <div className="col" style={{ padding: 10, gap: 5 }}>
                <span className="small semi clamp2" style={{ cursor: "pointer" }} onClick={() => go(`p/${p.id}`)}>{p.name}</span>
                <div className="row between">
                  <span className="small semi">{Number(p.price).toFixed(2)}</span>
                  <span className="tiny dim">{p.stock} left</span>
                </div>
                <Btn size="sm" onClick={() => add(p.id)} disabled={p.stock <= 0}>
                  {p.stock > 0 ? "Add" : "Sold out"}
                </Btn>
              </div>
            </div>
          ))}
        </div>

        <aside className="panel col" style={{ padding: 14, gap: 10, width: 250, flex: "none" }}>
          <strong className="small">Cart</strong>
          {cartCount === 0 && <div className="tiny dim">Empty.</div>}
          {Object.entries(cart).map(([id, qty]) => {
            const p = products.find((x) => x.id === id);
            return (
              <div key={id} className="row between">
                <span className="small ellipsis">{p?.name}</span>
                <span className="row" style={{ gap: 4 }}>
                  <span className="tiny mono">×{qty}</span>
                  <Btn size="sm" variant="ghost" onClick={() => setCart((c) => { const n = { ...c }; n[id] = qty - 1; if (n[id] <= 0) delete n[id]; return n; })}>−</Btn>
                </span>
              </div>
            );
          })}
          <div className="hr" style={{ margin: "4px 0" }} />
          <div className="row between">
            <span className="small semi">Total</span>
            <span className="mono">{cartTotal.toFixed(2)}</span>
          </div>
          <Btn variant="primary" disabled={!cartCount} onClick={checkout}>Checkout</Btn>
          {n.db.all(TABLES.orders).length > 0 && (
            <>
              <div className="hr" style={{ margin: "4px 0" }} />
              <span className="tiny dim">Recent orders</span>
              {n.db.all(TABLES.orders).slice(-3).reverse().map((o) => (
                <div key={o.id} className="row between tiny">
                  <span className="mono">{o.id}</span>
                  <span className="dim">{Number(o.total).toFixed(2)}</span>
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    </SiteShell>
  );
}

/* ================================================================ FORUM */

const BOARDS = ["networking", "nova", "city", "hardware", "off-topic"];

export function ForumSite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost(path.startsWith("helios") ? "helios-forum.net" : "novaforum.net")!;
  const go = useSiteNav();
  const board = path.startsWith("b/") ? path.slice(2) : "all";
  const threadId = path.startsWith("t/") ? path.slice(2) : null;
  const [draft, setDraft] = useState("");

  const threads = useMemo(
    () =>
      [...n.db.all(TABLES.threads)]
        .filter((t) => board === "all" || t.board === board)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.ts - a.ts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, n.rev],
  );
  const thread = threadId ? n.db.find(TABLES.threads, threadId) : null;
  const replies = threadId ? n.db.all(TABLES.comments).filter((c) => c.threadId === threadId) : [];

  return (
    <SiteShell
      def={def}
      path={path}
      links={[{ label: "All boards", href: "all", active: board === "all" }, ...BOARDS.map((b) => ({ label: b, href: `b/${b}`, active: board === b }))]}
    >
      {thread ? (
        <div className="col" style={{ gap: 12, maxWidth: 800 }}>
          <Btn size="sm" onClick={() => go(`b/${thread.board}`)}>← {thread.board}</Btn>
          <h1 style={{ margin: 0, fontSize: 20 }}>{thread.title}</h1>
          <div className="tiny dim">
            started by @{thread.author} · {timeAgo(thread.ts)} · {thread.views} views
          </div>
          {replies.map((r) => {
            const u = n.db.all(TABLES.users).find((x) => x.handle === r.author);
            return (
              <div key={r.id} className="panel row" style={{ padding: 12, gap: 10, alignItems: "flex-start" }}>
                <Avatar name={u?.name ?? r.author} hue={hueOf(r.author)} size={30} />
                <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="small semi">{u?.name ?? r.author}</span>
                    <span className="tiny dim">{timeAgo(r.ts)}</span>
                  </div>
                  <span className="small muted">{r.body}</span>
                </div>
              </div>
            );
          })}
          <div className="panel row" style={{ padding: 10, gap: 8 }}>
            <input
              className="input"
              placeholder="Write a reply…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim() && thread) {
                  n.db.insert(TABLES.comments, { threadId: thread.id, author: "you", body: draft.trim(), ts: Date.now(), likes: 0 });
                  n.db.update(TABLES.threads, thread.id, { views: (thread.views ?? 0) + 1 });
                  n.markDirty("web");
                  setDraft("");
                }
              }}
            />
            <Btn
              variant="primary"
              disabled={!draft.trim()}
              onClick={() => {
                if (!thread) return;
                n.db.insert(TABLES.comments, { threadId: thread.id, author: "you", body: draft.trim(), ts: Date.now(), likes: 0 });
                n.db.update(TABLES.threads, thread.id, { views: (thread.views ?? 0) + 1 });
                n.markDirty("web");
                setDraft("");
              }}
            >
              Reply
            </Btn>
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          <div className="row between">
            <strong style={{ fontSize: 15 }}>{board === "all" ? "All boards" : `/${board}`}</strong>
            <span className="tiny dim">{threads.length} threads</span>
          </div>
          {threads.length === 0 && <Empty icon="💬" title="No threads on this board" />}
          {threads.map((t) => {
            const count = n.db.count(TABLES.comments, (c) => c.threadId === t.id);
            return (
              <button
                key={t.id}
                className="panel row between card-hover"
                style={{ gap: 12, textAlign: "left", cursor: "pointer", border: 0, font: "inherit", color: "var(--text)" }}
                onClick={() => go(`t/${t.id}`)}
              >
                <div className="col" style={{ gap: 3, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    {t.pinned && <Pill tone="warn">pinned</Pill>}
                    <span className="small semi ellipsis">{t.title}</span>
                  </div>
                  <span className="tiny dim">
                    @{t.author} · {timeAgo(t.ts)} · {t.views.toLocaleString()} views
                  </span>
                </div>
                <span className="badge">{count} replies</span>
              </button>
            );
          })}
        </div>
      )}
    </SiteShell>
  );
}

/* ============================================================== CITY SITE */

export function CitySite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost("aurora-city.gov")!;
  const go = useSiteNav();
  const stats = n.city.stats();
  const news = useMemo(
    () => [...n.db.all(TABLES.news)].filter((a) => a.fromCity).sort((a, b) => b.ts - a.ts).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const services = path.startsWith("s/") ? path.slice(2) : "overview";

  return (
    <SiteShell
      def={def}
      path={path}
      links={[
        { label: "Overview", href: "s/overview", active: services === "overview" },
        { label: "Transport", href: "s/transport", active: services === "transport" },
        { label: "Economy", href: "s/economy", active: services === "economy" },
        { label: "Notices", href: "notices", active: services === "notices" },
      ]}
    >
      <div className="col" style={{ gap: 16 }}>
        <div className="panel col" style={{ padding: 18, gap: 12, background: "linear-gradient(120deg, color-mix(in srgb, var(--warn) 12%, transparent), transparent 65%)" }}>
          <span className="tiny dim semi" style={{ letterSpacing: "0.1em" }}>CITY OF AURORA · DAY {stats.day} · {stats.weekday.toUpperCase()}</span>
          <div className="row wrap" style={{ gap: 20, alignItems: "flex-end" }}>
            <div className="col" style={{ gap: 0 }}>
              <span className="huge">{stats.clock}</span>
              <span className="small dim">{stats.weather} · {stats.tempC}°C</span>
            </div>
            <span style={{ fontSize: 40 }}>{stats.weather === "sunny" ? "☀️" : stats.weather === "cloudy" ? "☁️" : stats.weather === "rain" ? "🌧️" : "⛈️"}</span>
            <span className="spacer" />
            <Btn variant="primary" onClick={() => go("notices")}>City notices</Btn>
          </div>
        </div>

        {services === "overview" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              {[
                ["Population", stats.population.toLocaleString()],
                ["Active agents", String(stats.activeNpcs)],
                ["Buildings", String(n.city.buildings.length)],
                ["Traffic congestion", `${Math.round(stats.congestion * 100)}%`],
                ["Energy draw", `${Math.round(stats.energyKw)} kW`],
                ["Transit riders", stats.transitRiders.toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="panel col" style={{ padding: 12, gap: 2 }}>
                  <span className="tiny dim">{k}</span>
                  <strong style={{ fontSize: 17 }}>{v}</strong>
                </div>
              ))}
            </div>
            <div className="panel col" style={{ padding: 14, gap: 8 }}>
              <strong className="small">About this site</strong>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
                Every figure on this page is read directly from the Virtual City simulation running inside
                this PC. Open the city from NOVAOS and watch these numbers move.
              </p>
            </div>
          </>
        )}

        {services === "transport" && (
          <div className="panel col" style={{ padding: 16, gap: 12 }}>
            <strong>Aurora Transit Authority</strong>
            <div className="row" style={{ gap: 16 }}>
              <span className="small muted">Live network status</span>
              <Badge tone={stats.congestion > 0.8 ? "warn" : "ok"}>
                {stats.congestion > 0.8 ? "Delays" : "Running to timetable"}
              </Badge>
            </div>
            <Meter pct={stats.congestion * 100} color={stats.congestion > 0.8 ? "var(--warn)" : "var(--ok)"} />
            <div className="row tiny dim" style={{ gap: 14, flexWrap: "wrap" }}>
              <span>Vehicles: {stats.traffic}</span>
              <span>Interchange boardings: {stats.transitRiders.toLocaleString()}</span>
              <span>Signals: {n.city.lights.length}</span>
            </div>
          </div>
        )}

        {services === "economy" && (
          <div className="panel col" style={{ padding: 16, gap: 12 }}>
            <strong>City economy</strong>
            <div className="row wrap" style={{ gap: 16 }}>
              <div className="col"><span className="tiny dim">Businesses</span><strong>{stats.businesses}</strong></div>
              <div className="col"><span className="tiny dim">Open now</span><strong>{stats.openBusinesses}</strong></div>
              <div className="col"><span className="tiny dim">Revenue</span><strong>{Math.round(stats.revenueToday).toLocaleString()}</strong></div>
              <div className="col"><span className="tiny dim">Expenses</span><strong>{Math.round(stats.expensesToday).toLocaleString()}</strong></div>
            </div>
            <Meter pct={Math.min(100, (stats.revenueToday / Math.max(1, stats.expensesToday)) * 60)} color="var(--ok)" />
            <p className="small muted" style={{ margin: 0 }}>
              Shopkeepers restock from the same inventory the NovaShop marketplace lists.
            </p>
          </div>
        )}

        {services === "notices" && (
          <div className="col" style={{ gap: 10 }}>
            <strong style={{ fontSize: 15 }}>City notices</strong>
            {news.length === 0 && <Empty icon="📰" title="No notices yet" hint="The city publishes notices as it runs." />}
            {news.map((a) => (
              <div key={a.id} className="panel col" style={{ padding: 12, gap: 5 }}>
                <div className="row" style={{ gap: 8 }}>
                  <Pill tone="info">{a.category}</Pill>
                  <span className="tiny dim">{a.district} · {timeAgo(a.ts)}</span>
                </div>
                <SiteLink href={`novanews.org/news/${a.id}`}>
                  <span className="small semi">{a.title}</span>
                </SiteLink>
                <span className="tiny muted clamp2">{String(a.body).split("\n")[0]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}

/* ========================================================== TELEMETRY SITE */

export function TelemetrySite({ path }: { path: string }) {
  const n = useKernel();
  const records = useMemo(
    () => [...n.db.all(TABLES.telemetry)].sort((a, b) => b.ts - a.ts).slice(0, 120),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const uploads = useMemo(
    () => n.db.all(TABLES.sites).filter((s) => s.kind === "telemetry").sort((a, b) => b.ts - a.ts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const name = path.startsWith("r/") ? decodeURIComponent(path.slice(2)) : (uploads[0]?.robot as string) ?? "";

  const rows = records.filter((r) => !name || r.robot === name);
  const live = n.robots.robots.find((r) => r.config.name === name) ?? n.robots.robots[0];
  const manifest = n.fs.read("/cloud/bucket/manifest.json");

  return (
    <SiteShell def={{ host: "telemetry.nova.cloud", name: "Robot Telemetry", icon: "🤖", hue: 44, blurb: "Live robot telemetry from the AI Robot Lab" }} path={path}>
      <div className="col" style={{ gap: 14 }}>
        <div className="panel col" style={{ padding: 14, gap: 8 }}>
          <div className="row between">
            <strong style={{ fontSize: 14 }}>Telemetry archive</strong>
            <Badge tone="ok">{records.length} records</Badge>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {uploads.length === 0 && <span className="tiny dim">No robots uploaded yet. Use the AI Robot Lab → Upload.</span>}
            {uploads.map((u) => (
              <a
                key={u.id}
                href={`#r/${encodeURIComponent(String(u.robot))}`}
                className="btn btn-sm"
                style={{ textDecoration: "none" }}
              >
                🤖 {String(u.robot)}
              </a>
            ))}
          </div>
        </div>

        {live && (
          <div className="panel col" style={{ padding: 14, gap: 10 }}>
            <div className="row between">
              <strong className="small">Live — {live.config.name}</strong>
              <span className="tiny dim mono">{live.status} · pid {live.id}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              <Metric label="Battery" value={`${live.battery.toFixed(0)}%`} pct={live.battery} />
              <Metric label="CPU" value={`${live.metrics.cpu.toFixed(0)}%`} pct={live.metrics.cpu} />
              <Metric label="GPU" value={`${live.metrics.gpu.toFixed(0)}%`} pct={live.metrics.gpu} />
              <Metric label="Temp" value={`${live.metrics.temp.toFixed(0)}°C`} pct={(live.metrics.temp / 95) * 100} />
            </div>
            <div className="row tiny dim" style={{ gap: 14, flexWrap: "wrap" }}>
              <span>position {live.x.toFixed(0)}, {live.y.toFixed(0)}</span>
              <span>distance {live.distance.toFixed(0)} m</span>
              <span>collisions {live.metrics.collisions}</span>
              <span>sensors {live.metrics.sensorHz.toFixed(1)} Hz</span>
            </div>
          </div>
        )}

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 12, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-3)" }}>
            <span style={{ flex: 2 }}>Time</span>
            <span style={{ flex: 1 }}>Robot</span>
            <span style={{ flex: 1 }}>Status</span>
            <span style={{ flex: 1 }}>Battery</span>
            <span style={{ flex: 1 }}>CPU</span>
            <span style={{ flex: 1 }}>Temp</span>
          </div>
          {rows.slice(0, 40).map((r) => (
            <div
              key={r.id}
              className="row"
              style={{ padding: "6px 12px", borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)", gap: 12, fontSize: 12 }}
            >
              <span className="mono tiny" style={{ flex: 2 }}>{new Date(r.ts).toLocaleTimeString()}</span>
              <span style={{ flex: 1 }} className="ellipsis">{r.robot}</span>
              <span style={{ flex: 1 }} className="dim">{r.status}</span>
              <span style={{ flex: 1 }} className="mono">{Number(r.battery).toFixed(0)}%</span>
              <span style={{ flex: 1 }} className="mono">{Number(r.cpu).toFixed(0)}%</span>
              <span style={{ flex: 1 }} className="mono">{Number(r.temp).toFixed(0)}°C</span>
            </div>
          ))}
          {rows.length === 0 && <div className="small dim" style={{ padding: 20, textAlign: "center" }}>No telemetry uploaded yet.</div>}
        </div>

        {manifest && (
          <div className="panel col" style={{ padding: 14, gap: 6 }}>
            <strong className="small">Cloud manifest</strong>
            <pre className="tiny mono scroll" style={{ margin: 0, maxHeight: 220 }}>{manifest}</pre>
          </div>
        )}

        <div className="small dim">
          Total telemetry volume: {fmtBytes(manifest?.length ?? 0)} in the manifest, {n.db.count(TABLES.telemetry)} rows in
          NovaDB, and a mirror at <span className="mono">/cloud/bucket</span> on the filesystem.
        </div>
      </div>
    </SiteShell>
  );
}

function Metric({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="col" style={{ gap: 3 }}>
      <span className="tiny dim">{label}</span>
      <strong>{value}</strong>
      <Meter pct={pct} />
    </div>
  );
}
