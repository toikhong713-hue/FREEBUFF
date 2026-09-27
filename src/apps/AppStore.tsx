import { useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { APP_LIST, APPS } from "../os/registry";
import { Badge, Btn, Seg } from "../ui/primitives";

interface StoreApp {
  id: string;
  name: string;
  icon: string;
  hue: number;
  cat: string;
  blurb: string;
  /** window app id this installs, if any */
  appId?: string;
  pkg: string;
  size: string;
  installed: boolean;
}

const CATALOG: Omit<StoreApp, "installed">[] = [
  { id: "s-files", name: "Files", icon: "🗂", hue: 210, cat: "System", blurb: "Browse the shared filesystem", appId: "files", pkg: "nova-files", size: "2.1 MB" },
  { id: "s-term", name: "Terminal", icon: "❯", hue: 150, cat: "System", blurb: "Full command set on the live machine", appId: "terminal", pkg: "nova-shell", size: "1.4 MB" },
  { id: "s-editor", name: "Text Editor", icon: "📝", hue: 45, cat: "System", blurb: "Edit anything on disk", appId: "editor", pkg: "nova-editor", size: "1.9 MB" },
  { id: "s-calc", name: "Calculator", icon: "🧮", hue: 265, cat: "Utilities", blurb: "Standard and scientific", appId: "calculator", pkg: "nova-calc", size: "0.8 MB" },
  { id: "s-task", name: "Task Manager", icon: "📊", hue: 0, cat: "System", blurb: "Live processes and resources", appId: "taskmgr", pkg: "nova-taskmgr", size: "2.4 MB" },
  { id: "s-mon", name: "System Monitor", icon: "📈", hue: 330, cat: "System", blurb: "Per-core graphs and temperature", appId: "sysmon", pkg: "nova-sysmon", size: "2.2 MB" },
  { id: "s-set", name: "Settings", icon: "⚙️", hue: 210, cat: "System", blurb: "Theme, wallpaper and session", appId: "settings", pkg: "nova-settings", size: "1.6 MB" },
  { id: "s-browse", name: "NOVA Browser", icon: "🌐", hue: 195, cat: "Internet", blurb: "Browse the simulated internet", appId: "browser", pkg: "nova-browser", size: "18.4 MB" },
  { id: "s-netm", name: "Network Manager", icon: "🛰️", hue: 175, cat: "Network", blurb: "Interfaces, routes and firewall", appId: "netmgr", pkg: "nova-netmgr", size: "4.2 MB" },
  { id: "s-lab", name: "Mini Internet Lab", icon: "🔗", hue: 185, cat: "Network", blurb: "Topology editor and packet flight", appId: "netlab", pkg: "nova-netlab", size: "6.8 MB" },
  { id: "s-cloud", name: "NOVA Cloud", icon: "☁️", hue: 205, cat: "Cloud", blurb: "Regions, servers, database, accounts", appId: "cloud", pkg: "nova-cloud", size: "9.1 MB" },
  { id: "s-drive", name: "Cloud Drive", icon: "💾", hue: 150, cat: "Cloud", blurb: "Sync local paths to the bucket", appId: "drive", pkg: "nova-sync", size: "3.3 MB" },
  { id: "s-robots", name: "AI Robot Lab", icon: "🤖", hue: 45, cat: "Labs", blurb: "Build, simulate and deploy robots", appId: "robots", pkg: "nova-robots", size: "12.6 MB" },
  { id: "s-city", name: "Virtual City", icon: "🏙️", hue: 30, cat: "Labs", blurb: "A living city with a real economy", appId: "city", pkg: "nova-city", size: "15.2 MB" },
  { id: "s-pkg-net", name: "nova-net", icon: "🧬", hue: 190, cat: "Developer", blurb: "Packet and routing helpers for the lab", pkg: "nova-net", size: "0.4 MB" },
  { id: "s-pkg-fs", name: "nova-fs", icon: "🗄", hue: 160, cat: "Developer", blurb: "Filesystem API bindings for scripts", pkg: "nova-fs", size: "0.3 MB" },
  { id: "s-pkg-ui", name: "nova-ui", icon: "🎨", hue: 280, cat: "Developer", blurb: "Window toolkit used by every NOVAOS app", pkg: "nova-ui", size: "0.9 MB" },
];

export function AppStoreApp(_props: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [installed, setInstalled] = useState<Set<string>>(() => {
    const s = new Set<string>();
    try {
      const raw = localStorage.getItem("nova-installed");
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      /* fall through */
    }
    // everything ships pre-installed on a cloud image
    CATALOG.forEach((a) => s.add(a.id));
    return s;
  });

  const persist = (next: Set<string>) => {
    setInstalled(next);
    try {
      localStorage.setItem("nova-installed", JSON.stringify([...next]));
    } catch {
      /* storage full */
    }
  };

  const cats = ["All", ...new Set(CATALOG.map((a) => a.cat))];
  const list = CATALOG.filter(
    (a) => (cat === "All" || a.cat === cat) && (!q.trim() || a.name.toLowerCase().includes(q.toLowerCase()) || a.blurb.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Seg value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c }))} />
        <span className="spacer" />
        <input className="input" style={{ width: 190 }} placeholder="Search the store…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="scroll grow" style={{ padding: 14 }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <div className="col" style={{ gap: 1 }}>
            <strong style={{ fontSize: 15 }}>NOVA Store</strong>
            <span className="tiny dim">Everything installs onto this machine and runs against the same kernel.</span>
          </div>
          <Badge tone="info">{installed.size} installed</Badge>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {list.map((a) => {
            const isInstalled = installed.has(a.id);
            return (
              <div
                key={a.id}
                className="panel col"
                style={{
                  padding: 14,
                  gap: 8,
                  borderColor: isInstalled ? `hsl(${a.hue} 60% 50% / 0.35)` : undefined,
                }}
              >
                <div className="row" style={{ gap: 10 }}>
                  <div
                    className="col center"
                    style={{
                      width: 40, height: 40, borderRadius: 10, fontSize: 20, flex: "none",
                      background: `linear-gradient(140deg, hsl(${a.hue} 58% 42%), hsl(${a.hue + 35} 55% 26%))`,
                    }}
                  >
                    {a.icon}
                  </div>
                  <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
                    <span className="semi small ellipsis">{a.name}</span>
                    <span className="tiny dim mono ellipsis">{a.pkg} · {a.size}</span>
                  </div>
                </div>
                <span className="tiny muted" style={{ minHeight: 32, lineHeight: 1.5 }}>{a.blurb}</span>
                <div className="row" style={{ gap: 5 }}>
                  {a.appId ? (
                    <>
                      <Btn
                        size="sm"
                        variant="primary"
                        onClick={() => wm.openApp(a.appId as never)}
                      >
                        Open
                      </Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        title="Toggle launch at sign-in"
                        onClick={() => {
                          const id = a.appId!;
                          const cur = wm.settings.autoStartApps;
                          wm.setSettings({
                            autoStartApps: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
                          });
                        }}
                      >
                        {wm.settings.autoStartApps.includes(a.appId!) ? "✓ autostart" : "autostart"}
                      </Btn>
                    </>
                  ) : isInstalled ? (
                    <Btn size="sm" onClick={() => { n.fs.mkdirp(`/projects/node_modules/${a.pkg}`, { origin: "user" }); n.fs.write(`/projects/node_modules/${a.pkg}/package.json`, JSON.stringify({ name: a.pkg, version: "3.2.1", description: a.blurb }, null, 2), { origin: "user" }); n.markDirty("fs"); }}>
                      Use in project
                    </Btn>
                  ) : null}
                  <span className="spacer" />
                  {isInstalled ? (
                    <Btn
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        const next = new Set(installed);
                        next.delete(a.id);
                        persist(next);
                        if (a.appId) wm.closeAll();
                      }}
                    >
                      Uninstall
                    </Btn>
                  ) : (
                    <Btn
                      size="sm"
                      onClick={() => {
                        const next = new Set(installed);
                        next.add(a.id);
                        persist(next);
                      }}
                    >
                      Install
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="hr" style={{ margin: "18px 0" }} />
        <div className="panel-flat col" style={{ padding: 14, gap: 8 }}>
          <strong className="small">NOVAOS components</strong>
          <span className="tiny dim">The core shell cannot be removed.</span>
          <div className="row wrap" style={{ gap: 5 }}>
            {APP_LIST.map((a) => (
              <span key={a.id} className="badge badge-ok">
                {a.icon} {a.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="app-status">
        <Badge tone="ok">{installed.size} / {CATALOG.length} installed</Badge>
        <span className="dim">
          {APP_LIST.length} window apps · {Object.keys(APPS).length} registered
        </span>
        <span className="spacer" />
        <span className="dim mono">{n.proc.list().length} processes running</span>
      </div>
    </div>
  );
}
