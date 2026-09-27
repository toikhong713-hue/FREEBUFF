import { useMemo, useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { Badge, Btn, DataTable, Empty, KV, Meter, Modal, Ring, Seg, Tabs, loadColor } from "../ui/primitives";
import { REGIONS, SIZE_SPECS, type AccountRole, type ServerKind } from "../core/cloud";
import { fmtBytes } from "../core/rng";
import { TABLES, type Row } from "../core/db";

type Tab = "overview" | "storage" | "servers" | "database" | "accounts";
type Nova = ReturnType<typeof useKernel>;

const KIND_LABEL: Record<ServerKind, string> = {
  web: "Web server",
  database: "Database",
  game: "Game server",
  dns: "DNS",
  file: "File server",
};

export function CloudApp(_props: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const [tab, setTab] = useState<Tab>("overview");
  const metrics = n.cloud.metrics();

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview", label: "Overview" },
            { value: "storage", label: "Storage", badge: `${n.cloud.storagePct().toFixed(0)}%` },
            { value: "servers", label: "Servers", badge: n.cloud.servers.length },
            { value: "database", label: "Database", badge: n.db.tableNames().length },
            { value: "accounts", label: "Accounts", badge: n.cloud.accounts.length },
          ]}
        />
        <span className="spacer" />
        <Badge tone="ok">region {metrics.zone}</Badge>
        <Badge>{metrics.uptimePct}% uptime</Badge>
      </div>

      <div className="scroll grow" style={{ padding: 14 }}>
        {tab === "overview" && <Overview n={n} metrics={metrics} onOpen={setTab} />}
        {tab === "storage" && <Storage n={n} />}
        {tab === "servers" && <Servers n={n} />}
        {tab === "database" && <Database n={n} />}
        {tab === "accounts" && <Accounts n={n} />}
      </div>

      <div className="app-status">
        <Badge tone="ok">{metrics.zone} healthy</Badge>
        <span>CPU {metrics.cpuUsed.toFixed(0)}/{metrics.cpuTotal.toFixed(0)} vCPU</span>
        <span>MEM {(metrics.memUsed / 1024).toFixed(1)} GiB</span>
        <span>↓ {metrics.netInMbps.toFixed(0)} Mbps</span>
        <span className="spacer" />
        <span className="dim">{n.cloud.monthlyCost} credits / month</span>
        <Btn size="sm" onClick={() => wm.openApp("drive")}>Cloud Drive →</Btn>
      </div>
    </div>
  );
}

function Overview({ n, metrics, onOpen }: { n: Nova; metrics: ReturnType<Nova["cloud"]["metrics"]>; onOpen: (t: Tab) => void }) {
  const proc = n.proc.list();
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 16, alignItems: "flex-start" }}>
        <Card pct={(metrics.cpuUsed / metrics.cpuTotal) * 100} title="CPU" sub={`${metrics.cpuUsed.toFixed(0)} / ${metrics.cpuTotal} vCPU`} />
        <Card pct={(metrics.memUsed / metrics.memTotal) * 100} title="Memory" sub={`${(metrics.memUsed / 1024).toFixed(0)} / ${(metrics.memTotal / 1024).toFixed(0)} GiB`} />
        <Card pct={n.cloud.storagePct()} title="Storage" sub={`${metrics.storageUsedGb.toFixed(2)} / ${metrics.storageTotalGb} GB`} />
        <Card pct={Math.min(100, metrics.netInMbps / 4)} title="Network in" sub={`${metrics.netInMbps.toFixed(0)} Mbps`} />
        <Card pct={Math.min(100, metrics.reqPerMin / 60)} title="Requests" sub={`${metrics.reqPerMin.toLocaleString()}/min`} />
      </div>

      <div className="row wrap" style={{ gap: 16, alignItems: "flex-start" }}>
        <div className="panel-flat col" style={{ padding: 14, gap: 6, flex: "1 1 320px", minWidth: 280 }}>
          <strong className="small">Region</strong>
          <KV k="Region" v={metrics.region} />
          <KV k="Availability zone" v={metrics.zone} />
          <KV k="Uptime" v={`${metrics.uptimePct}%`} />
          <KV k="Monthly cost" v={`${n.cloud.monthlyCost} credits`} />
          <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
            {REGIONS.map((r) => (
              <Btn
                key={r}
                size="sm"
                variant={n.cloud.region === r ? "primary" : "default"}
                onClick={() => {
                  n.cloud.region = r;
                  n.markDirty("cloud");
                }}
              >
                {r}
              </Btn>
            ))}
          </div>
        </div>

        <div className="panel-flat col" style={{ padding: 14, gap: 6, flex: "1 1 320px", minWidth: 280 }}>
          <strong className="small">Running processes</strong>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {proc.filter((p) => !p.windowId).map((p) => (
              <span key={p.pid} className="badge">
                {p.name} <span className="dim">{p.cpu.toFixed(0)}%</span>
              </span>
            ))}
          </div>
          <div className="hr" style={{ margin: "4px 0" }} />
          <strong className="small">Running services</strong>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {n.cloud.servers.filter((s) => s.status === "running").map((s) => (
              <span key={s.id} className="badge badge-ok">
                {s.name} · {s.kind}
              </span>
            ))}
            {n.net.devices.size > 0 && (
              <span className="badge badge-info">
                network_service · {n.net.devices.size} devices
              </span>
            )}
            {n.robots.robots.length > 0 && (
              <span className="badge badge-info">
                robot_lab · {n.robots.robots.length} running
              </span>
            )}
            {n.city.npcs.length > 0 && (
              <span className="badge badge-info">
                city_sim · {n.city.npcs.length} agents
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        <Btn onClick={() => onOpen("storage")}>Manage storage</Btn>
        <Btn onClick={() => onOpen("servers")}>Create a server</Btn>
        <Btn onClick={() => onOpen("database")}>Browse the database</Btn>
        <Btn onClick={() => onOpen("accounts")}>Manage accounts</Btn>
      </div>
    </div>
  );
}

function Card({ pct, title, sub }: { pct: number; title: string; sub: string }) {
  return (
    <div className="panel-flat col center" style={{ padding: 14, gap: 8, minWidth: 150, flex: "1 1 150px" }}>
      <span className="small semi">{title}</span>
      <Ring pct={pct} size={92} sub="" />
      <span className="tiny dim mono" style={{ textAlign: "center" }}>{sub}</span>
    </div>
  );
}

function Storage({ n }: { n: Nova }) {
  const wm = useNovaContext();
  const [folder, setFolder] = useState("/");
  const entries = useMemo(
    () => n.fs.list(folder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folder, n.rev],
  );
  const used = n.cloud.storageUsedGb();

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel-flat col" style={{ padding: 14, gap: 8 }}>
        <div className="row between">
          <strong className="small">Quota</strong>
          <span className="mono small">
            {used.toFixed(2)} / {n.cloud.quotaGb} GB ({n.cloud.storagePct().toFixed(1)}%)
          </span>
        </div>
        <Meter pct={n.cloud.storagePct()} color={n.cloud.storagePct() > 85 ? "var(--err)" : "var(--ok)"} />
        <div className="row wrap" style={{ gap: 6 }}>
          {[16, 32, 64, 128, 256].map((q) => (
            <Btn key={q} size="sm" variant={n.cloud.quotaGb === q ? "primary" : "default"} onClick={() => { n.cloud.quotaGb = q; n.markDirty("cloud"); }}>
              {q} GB
            </Btn>
          ))}
          <Btn size="sm" variant="primary" onClick={() => { const items = n.cloud.syncAll(); n.markDirty("cloud"); wm.notify({ title: "Sync complete", body: `${items.length} files synced to the cloud bucket`, tone: "ok" }); }}>
            Sync everything
          </Btn>
        </div>
      </div>

      <div className="panel-flat col" style={{ padding: 14, gap: 8 }}>
        <div className="row between">
          <strong className="small">Unified filesystem</strong>
          <span className="tiny dim">select a folder to sync</span>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <Btn size="sm" onClick={() => setFolder("/")}>/</Btn>
          {folder.split("/").filter(Boolean).map((s, i) => (
            <span key={i} className="row" style={{ gap: 4 }}>
              <span className="dim tiny">›</span>
              <Btn size="sm" variant="ghost" onClick={() => setFolder("/" + folder.split("/").filter(Boolean).slice(0, i + 1).join("/"))}>
                {s}
              </Btn>
            </span>
          ))}
        </div>
        {entries.length === 0 ? (
          <div className="tiny dim">Empty folder.</div>
        ) : (
          <div className="col" style={{ gap: 2, maxHeight: 280, overflow: "auto" }}>
            {entries.map((e) => {
              const p = n.fs.pathOf(e);
              const st = n.fs.stat(p)!;
              return (
                <div key={e.id} className="row between" style={{ padding: "4px 8px", borderRadius: 6, background: "color-mix(in srgb, var(--bg-0) 28%, transparent)" }}>
                  <button className="btn btn-ghost btn-sm row grow" style={{ minWidth: 0 }} onClick={() => e.type === "dir" && setFolder(p)}>
                    <span>{e.type === "dir" ? "📁" : "📄"}</span>
                    <span className="ellipsis">{e.name}</span>
                    <span className="tiny dim">{e.origin}</span>
                  </button>
                  <span className="tiny dim mono" style={{ width: 70, textAlign: "right" }}>
                    {e.type === "dir" ? "—" : fmtBytes(st.size)}
                  </span>
                  <Btn size="sm" onClick={() => { n.cloud.syncPath(p, "cloud-console"); n.markDirty("cloud"); }}>Sync</Btn>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel-flat col" style={{ padding: 14, gap: 6 }}>
        <strong className="small">Sync queue</strong>
        {n.cloud.syncQueue.length === 0 && <div className="tiny dim">Nothing synced yet.</div>}
        {n.cloud.syncQueue.slice(-12).reverse().map((i) => (
          <div key={i.path} className="row between">
            <span className="tiny mono ellipsis">{i.path}</span>
            <span className="tiny dim">
              {i.state} · {fmtBytes(i.size)} · {i.device}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Servers({ n }: { n: Nova }) {
  const wm = useNovaContext();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("web-01");
  const [kind, setKind] = useState<ServerKind>("web");
  const [size, setSize] = useState<"micro" | "small" | "medium" | "large">("small");
  const [host, setHost] = useState(true);

  const create = () => {
    const s = n.cloud.createServer({ name: name || "server", kind, size, host: host ? `${name || "server"}.nova` : undefined });
    if (host) {
      const ip = n.net.resolveDns(s.ip) ?? null;
      void ip;
      // attach a cloud-hosted edge device so the browser can reach it
      const dev = n.net.devices.get([...n.net.devices.keys()].find((id) => n.net.devices.get(id)!.type === "cloud") ?? "");
      if (dev) {
        dev.http = { host: s.host!, title: s.hostTitle, kind: "custom", body: s.hostBody, port: 80 };
        n.net.bus.emit("change");
      }
      n.publishPage(s.host!, s.hostTitle, s.hostBody);
    }
    n.markDirty("cloud");
    wm.notify({ title: "Server created", body: `${s.name} · ${s.ip} · ${s.monthlyCost} credits/month`, tone: "ok", source: "cloud" });
    setOpen(false);
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row between">
        <strong className="small">Cloud servers</strong>
        <Btn variant="primary" size="sm" onClick={() => setOpen(true)}>+ Create server</Btn>
      </div>

      {n.cloud.servers.length === 0 ? (
        <Empty icon="🗄" title="No servers" hint="Create a web, database, game, DNS or file server. Web servers become reachable from the browser." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {n.cloud.servers.map((s) => (
            <div key={s.id} className="panel col" style={{ padding: 14, gap: 8 }}>
              <div className="row between">
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{s.kind === "web" ? "🌐" : s.kind === "database" ? "🗄" : s.kind === "game" ? "🎮" : s.kind === "dns" ? "📇" : "📁"}</span>
                  <div className="col" style={{ gap: 0 }}>
                    <strong className="small">{s.name}</strong>
                    <span className="tiny dim">
                      {KIND_LABEL[s.kind]} · {s.size}
                    </span>
                  </div>
                </div>
                <Badge tone={s.status === "running" ? "ok" : "err"}>{s.status}</Badge>
              </div>
              <div className="hr" style={{ margin: 0 }} />
              <KV k="IP" v={s.ip} />
              <KV k="vCPU / RAM / Disk" v={`${s.cpu} / ${s.memMb}MB / ${s.diskGb}GB`} />
              <KV k="Uptime" v={`${s.uptimePct}%`} />
              <KV k="Region" v={s.region} />
              <KV k="Cost" v={`${s.monthlyCost} cr/mo`} />
              {s.host && <KV k="Hosting" v={s.host} />}
              <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
                <Btn size="sm" onClick={() => { n.cloud.toggleServer(s.id); n.markDirty("cloud"); }}>
                  {s.status === "running" ? "Stop" : "Start"}
                </Btn>
                {s.host && (
                  <Btn size="sm" onClick={() => wm.openApp("browser", { args: { url: s.host! } })}>
                    Open in browser
                  </Btn>
                )}
                <Btn size="sm" variant="danger" onClick={() => { n.cloud.removeServer(s.id); n.markDirty("cloud"); }}>
                  Delete
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="panel-flat col" style={{ padding: 14, gap: 6 }}>
        <strong className="small">Instance sizes</strong>
        {Object.entries(SIZE_SPECS).map(([k, v]) => (
          <KV key={k} k={k} v={`${v.cpu} vCPU · ${v.memMb} MB · ${v.diskGb} GB · ${v.cost} cr/mo`} />
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a cloud server"
        width={460}
        footer={
          <>
            <Btn onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={create}>Create</Btn>
          </>
        }
      >
        <div className="col" style={{ gap: 10 }}>
          <div className="col" style={{ gap: 4 }}>
            <span className="tiny dim semi">NAME</span>
            <input className="input mono" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <span className="tiny dim semi">KIND</span>
            <Seg
              value={kind}
              onChange={setKind}
              options={[
                { value: "web", label: "Web" },
                { value: "database", label: "Database" },
                { value: "game", label: "Game" },
                { value: "dns", label: "DNS" },
                { value: "file", label: "File" },
              ]}
            />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <span className="tiny dim semi">SIZE</span>
            <Seg
              value={size}
              onChange={setSize}
              options={[
                { value: "micro", label: "Micro" },
                { value: "small", label: "Small" },
                { value: "medium", label: "Medium" },
                { value: "large", label: "Large" },
              ]}
            />
          </div>
          <label className="checkbox small">
            <input type="checkbox" checked={host} onChange={(e) => setHost(e.target.checked)} />
            Publish a site at {name || "server"}.nova
          </label>
          <div className="tiny dim">
            Cost: {SIZE_SPECS[size].cost} credits/month · {SIZE_SPECS[size].cpu} vCPU · {SIZE_SPECS[size].memMb} MB RAM
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Database({ n }: { n: Nova }) {
  const [table, setTable] = useState(n.db.tableNames()[0] ?? "");
  const [q, setQ] = useState("");
  const tables = useMemo(
    () => n.db.rowCount(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const active = table || tables[0]?.table || "";
  const rows = useMemo(() => {
    const list = n.db.all(active);
    if (!q.trim()) return list.slice(0, 60);
    return n.db.search(active, q, Object.keys(list[0] ?? {}).filter((k) => typeof (list[0] ?? {})[k] === "string"), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, q, n.rev]);

  const columns = useMemo(() => {
    const keys = Object.keys(rows[0] ?? {});
    return keys.slice(0, 7).map((k) => ({
      key: k,
      label: k,
      render: (r: Row) => {
        const v = r[k];
        return (
          <span className="ellipsis" title={typeof v === "object" ? JSON.stringify(v) : String(v)}>
            {typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
          </span>
        );
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const totalBytes = tables.reduce((a, t) => a + t.bytes, 0);

  return (
    <div className="row grow" style={{ minHeight: 0, gap: 12 }}>
      <div className="sidebar" style={{ width: 210 }}>
        <div className="tiny dim semi" style={{ padding: "2px 6px 6px" }}>TABLES</div>
        {tables.map((t) => (
          <button key={t.table} className="sidebar-item" aria-current={active === t.table} onClick={() => setTable(t.table)}>
            <span>🗄</span>
            <span className="ellipsis grow">{t.table}</span>
            <span className="tiny dim">{t.rows}</span>
          </button>
        ))}
        <div className="hr" />
        <div className="tiny dim" style={{ padding: "0 6px", lineHeight: 1.6 }}>
          {tables.length} tables · {fmtBytes(totalBytes)} of data
        </div>
      </div>

      <div className="grow col" style={{ minWidth: 0, gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <strong className="small">{active}</strong>
          <Badge>{rows.length} rows</Badge>
          <span className="spacer" />
          <input className="input" style={{ width: 190 }} placeholder="Filter rows…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grow" style={{ minHeight: 0 }}>
          {rows.length === 0 ? (
            <Empty icon="🗄" title="No rows" />
          ) : (
            <DataTable columns={columns} rows={rows} height="100%" />
          )}
        </div>
      </div>
    </div>
  );
}

function Accounts({ n }: { n: Nova }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccountRole>("user");

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row between">
        <strong className="small">Cloud accounts</strong>
        <Btn size="sm" variant="primary" onClick={() => setOpen(true)}>+ Add account</Btn>
      </div>
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {n.cloud.accounts.map((a) => (
          <div key={a.id} className="row between" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <div className="row" style={{ gap: 10 }}>
              <span style={{ fontSize: 18 }}>{a.role === "admin" ? "🛡" : a.role === "guest" ? "👤" : "🧑‍💻"}</span>
              <div className="col" style={{ gap: 0 }}>
                <span className="small semi">{a.name}</span>
                <span className="tiny dim mono">{a.email}</span>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Badge tone={a.role === "admin" ? "err" : a.role === "guest" ? undefined : "info"}>{a.role}</Badge>
              <Badge tone={a.mfa ? "ok" : undefined}>{a.mfa ? "MFA on" : "MFA off"}</Badge>
              <span className="tiny dim">{Math.floor((Date.now() - a.createdAt) / 86400000)} days</span>
              <Btn
                size="sm"
                onClick={() => {
                  a.mfa = !a.mfa;
                  n.markDirty("cloud");
                }}
              >
                Toggle MFA
              </Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() => {
                  n.cloud.removeAccount(a.id);
                  n.markDirty("cloud");
                }}
              >
                Remove
              </Btn>
            </div>
          </div>
        ))}
      </div>
      <div className="panel-flat col" style={{ padding: 14, gap: 6 }}>
        <strong className="small">Roles</strong>
        <KV k="admin" v="full control, can delete servers and accounts" />
        <KV k="user" v="standard workspace access" />
        <KV k="guest" v="read-only, sessions expire quickly" />
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a cloud account"
        width={420}
        footer={
          <>
            <Btn onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                n.cloud.addAccount(name, email || `${name}@nova.cloud`, role);
                n.markDirty("cloud");
                setOpen(false);
                setName("");
                setEmail("");
              }}
            >
              Add
            </Btn>
          </>
        }
      >
        <div className="col" style={{ gap: 10 }}>
          <input className="input" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Seg
            value={role}
            onChange={setRole}
            options={[
              { value: "user", label: "User" },
              { value: "admin", label: "Admin" },
              { value: "guest", label: "Guest" },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}

export { loadColor, KIND_LABEL, TABLES };
