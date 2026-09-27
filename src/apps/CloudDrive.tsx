import { useMemo, useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { Badge, Btn, Empty, Meter, Seg } from "../ui/primitives";
import { fmtBytes, timeAgo } from "../core/rng";

export function CloudDriveApp(_props: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const [folder, setFolder] = useState("/cloud/bucket");
  const [view, setView] = useState<"local" | "cloud">("cloud");
  const [selected, setSelected] = useState<string | null>(null);

  const base = view === "cloud" ? "/cloud/bucket" : "/home/user";
  const dir = folder.startsWith(base) ? folder : base;
  const entries = useMemo(
    () => n.fs.list(dir),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dir, n.rev],
  );
  const queue = n.cloud.syncQueue;
  const used = n.cloud.storageUsedGb();
  const pct = n.cloud.storagePct();

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Seg
          value={view}
          onChange={(v) => {
            setView(v);
            setFolder(v === "cloud" ? "/cloud/bucket" : "/home/user");
            setSelected(null);
          }}
          options={[
            { value: "cloud", label: "☁️ Cloud bucket" },
            { value: "local", label: "💻 Local files" },
          ]}
        />
        <span style={{ width: 1, height: 20, background: "var(--border)" }} />
        <Btn size="sm" onClick={() => setFolder(base)}>⌂ {base}</Btn>
        <span className="spacer" />
        <Btn size="sm" variant="primary" onClick={() => { n.cloud.syncAll(); n.markDirty("cloud"); wm.notify({ title: "Synced", body: "All local files pushed to the bucket", tone: "ok" }); }}>
          ⇅ Sync all
        </Btn>
        <Btn size="sm" onClick={() => wm.openApp("browser", { args: { url: "novadrive.cloud" } })}>
          Open web app
        </Btn>
      </div>

      <div className="row grow" style={{ minHeight: 0 }}>
        <div className="grow" style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div className="row" style={{ padding: "6px 10px", gap: 4, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
            {dir.split("/").filter(Boolean).map((s, i, arr) => (
              <span key={i} className="row" style={{ gap: 4 }}>
                {i > 0 && <span className="dim tiny">›</span>}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setFolder("/" + arr.slice(0, i + 1).join("/"))}
                >
                  {s}
                </button>
              </span>
            ))}
          </div>

          <div className="scroll grow">
            {entries.length === 0 ? (
              <Empty
                icon={view === "cloud" ? "☁️" : "📁"}
                title={view === "cloud" ? "Bucket is empty" : "Nothing here"}
                hint={view === "cloud" ? "Sync a local path, or upload robot telemetry from the AI Robot Lab." : undefined}
              />
            ) : (
              <div className="col" style={{ padding: 8, gap: 3 }}>
                {entries.map((node) => {
                  const p = n.fs.pathOf(node);
                  const st = n.fs.stat(p)!;
                  const isSel = selected === p;
                  return (
                    <div
                      key={node.id}
                      className="row"
                      style={{
                        gap: 10,
                        padding: "7px 10px",
                        borderRadius: 8,
                        background: isSel ? "color-mix(in srgb, var(--accent) 14%, transparent)" : undefined,
                        border: `1px solid ${isSel ? "color-mix(in srgb, var(--accent) 34%, transparent)" : "transparent"}`,
                      }}
                      onClick={() => setSelected(p)}
                      onDoubleClick={() => node.type === "dir" && setFolder(p)}
                    >
                      <span style={{ fontSize: 15 }}>{node.type === "dir" ? "📁" : "📄"}</span>
                      <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
                        <span className="small ellipsis">{node.name}</span>
                        <span className="tiny dim mono ellipsis">{p}</span>
                      </div>
                      <span className="tiny dim nowrap">{node.origin}</span>
                      <span className="tiny dim nowrap" style={{ width: 70, textAlign: "right" }}>
                        {node.type === "dir" ? "—" : fmtBytes(st.size)}
                      </span>
                      <span className="tiny dim nowrap" style={{ width: 80, textAlign: "right" }}>
                        {timeAgo(st.modified)}
                      </span>
                      <div className="row" style={{ gap: 3 }}>
                        {view === "local" && (
                          <Btn size="sm" onClick={(e) => { e.stopPropagation(); n.cloud.syncPath(p, "drive"); n.markDirty("cloud"); }}>
                            ⇅ Sync
                          </Btn>
                        )}
                        {view === "cloud" && node.type === "file" && (
                          <Btn
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              const name = node.name;
                              const body = node.content;
                              n.fs.write(`/downloads/${name}`, body, { origin: "cloud" });
                              wm.notify({ title: "Downloaded", body: `${name} → /downloads`, tone: "ok" });
                            }}
                          >
                            ⬇
                          </Btn>
                        )}
                        {view === "cloud" && (
                          <Btn
                            size="sm"
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              n.fs.rm(p, { recursive: true });
                              n.markDirty("cloud");
                            }}
                          >
                            ✕
                          </Btn>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="sidebar" style={{ width: 264, borderRight: 0, borderLeft: "1px solid var(--border)" }}>
          <div className="col" style={{ gap: 10 }}>
            <strong className="small">Storage</strong>
            <Meter pct={pct} color={pct > 85 ? "var(--err)" : pct > 60 ? "var(--warn)" : "var(--ok)"} />
            <div className="row between tiny">
              <span className="dim">used</span>
              <span className="mono">{used.toFixed(2)} GB</span>
            </div>
            <div className="row between tiny">
              <span className="dim">quota</span>
              <span className="mono">{n.cloud.quotaGb} GB</span>
            </div>
            <div className="hr" style={{ margin: 0 }} />
            <strong className="small">Sync activity</strong>
            {queue.length === 0 && <div className="tiny dim">Nothing synced this session.</div>}
            {queue.slice(-10).reverse().map((i) => (
              <div key={i.path} className="col" style={{ gap: 0 }}>
                <span className="tiny mono ellipsis">{i.path}</span>
                <span className="tiny dim">
                  {i.state} · {fmtBytes(i.size)} · {i.device}
                </span>
              </div>
            ))}
            <div className="hr" style={{ margin: 0 }} />
            <strong className="small">Local sources</strong>
            <div className="col" style={{ gap: 4 }}>
              {["/robots", "/city", "/websites", "/documents", "/downloads", "/system/logs"].map((p) => (
                <Btn
                  key={p}
                  size="sm"
                  variant="ghost"
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => {
                    const r = n.cloud.syncPath(p, "drive");
                    if (r) wm.notify({ title: "Synced", body: r.path, tone: "ok" });
                    else wm.notify({ title: "Not found", body: p, tone: "warn" });
                  }}
                >
                  ⇅ {p}
                </Btn>
              ))}
            </div>
            <div className="hr" style={{ margin: 0 }} />
            <Btn size="sm" onClick={() => wm.openApp("robots")}>Upload robot telemetry →</Btn>
          </div>
        </aside>
      </div>

      <div className="app-status">
        <Badge tone={pct > 85 ? "warn" : "ok"}>{pct.toFixed(1)}% used</Badge>
        <span>{n.fs.count().files} files on disk</span>
        <span>{queue.length} tracked</span>
        <span className="spacer" />
        <span className="dim mono">{dir}</span>
      </div>
    </div>
  );
}
