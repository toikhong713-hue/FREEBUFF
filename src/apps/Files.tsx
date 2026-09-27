import { useEffect, useMemo, useState } from "react";
import { nova } from "../core/nova";
import type { Stat } from "../core/fs";
import { Badge, Btn, DataTable, Empty, Modal, type Column } from "../ui/primitives";
import { fmtBytes, timeAgo } from "../core/rng";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";

const ORIGIN_TONE: Record<string, string> = {
  os: "#60a5fa",
  user: "#e2e8f0",
  robot: "#fbbf24",
  city: "#f59e0b",
  net: "#22d3ee",
  web: "#f472b6",
  cloud: "#34d399",
};

type View = "list" | "grid";

export function FilesApp({ args }: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const [cwd, setCwd] = useState<string>((args.path as string) || "/home/user");
  const [view, setView] = useState<View>((args.view as View) || "list");
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([cwd]);
  const [hi, setHi] = useState(0);
  const [query, setQuery] = useState("");
  const [showProps, setShowProps] = useState(false);
  const [showNew, setShowNew] = useState<null | "file" | "dir">(null);
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["/home", "/home/user", "/system"]));

  const entries = useMemo(() => {
    if (query.trim()) {
      return n.fs.find(query, "/").map((node) => n.fs.stat(n.fs.pathOf(node))!).filter(Boolean);
    }
    return n.fs.list(cwd).map((node) => n.fs.stat(n.fs.pathOf(node))!).filter(Boolean);
  }, [cwd, query, n.fs, n.rev]);

  useEffect(() => {
    setSelected(null);
  }, [cwd, query]);

  const go = (path: string) => {
    const norm = n.fs.normalize(path, cwd);
    if (!n.fs.exists(norm)) return;
    setCwd(norm);
    setHistory((h) => [...h.slice(0, hi + 1), norm]);
    setHi((v) => v + 1);
  };

  const crumbs = useMemo(() => {
    const out = [{ name: "🏠", path: "/" }];
    const segs = cwd.split("/").filter(Boolean);
    let acc = "";
    for (const s of segs) {
      acc += "/" + s;
      out.push({ name: s, path: acc });
    }
    return out;
  }, [cwd]);

  const selectedStat: Stat | null = useMemo(
    () => (selected ? n.fs.stat(selected) : null),
    [selected, n.fs, n.rev],
  );

  const tree = useMemo(
    () => renderTree(n, cwd, expanded, setExpanded, go, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cwd, expanded, n.rev],
  );

  const columns: Column<Stat>[] = [
    {
      key: "name",
      label: "Name",
      render: (r) => (
        <div className="row" style={{ gap: 7 }}>
          <span style={{ color: ORIGIN_TONE[r.origin] ?? "var(--text-3)", fontSize: 13 }}>
            {r.type === "dir" ? "📁" : r.name.endsWith(".json") ? "🧾" : r.name.endsWith(".log") ? "📄" : "📃"}
          </span>
          <span className="ellipsis">{r.name}</span>
        </div>
      ),
    },
    { key: "size", label: "Size", width: 92, align: "right", render: (r) => <span className="mono tiny dim">{r.type === "dir" ? "—" : fmtBytes(r.size)}</span> },
    { key: "origin", label: "From", width: 74, render: (r) => <span className="tiny dim">{r.origin}</span> },
    { key: "mode", label: "Perms", width: 92, render: (r) => <span className="mono tiny dim">{r.mode}</span> },
    { key: "modified", label: "Modified", width: 118, render: (r) => <span className="tiny dim nowrap">{timeAgo(r.modified)}</span> },
    {
      key: "actions",
      label: "",
      width: 74,
      align: "right",
      render: (r) => (
        <div className="row" style={{ gap: 2, justifyContent: "flex-end" }} data-nodrag>
          {r.type === "file" && (
            <Btn size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); wm.openApp("editor", { args: { path: r.path } }); }} title="Open in editor">
              ✎
            </Btn>
          )}
          <Btn
            size="sm"
            variant="ghost"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              if (n.fs.rm(r.path, { recursive: true })) n.markDirty("fs");
            }}
          >
            🗑
          </Btn>
        </div>
      ),
    },
  ];

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Btn size="sm" onClick={() => hi > 0 && setHi(hi - 1)} disabled={hi === 0} title="Back">←</Btn>
        <Btn size="sm" onClick={() => hi < history.length - 1 && setHi(hi + 1)} disabled={hi >= history.length - 1} title="Forward">→</Btn>
        <Btn size="sm" onClick={() => go("/home/user")} title="Home">🏠</Btn>
        <Btn size="sm" onClick={() => go(cwd)} title="Refresh" onDoubleClick={() => n.markDirty("fs")}>⟳</Btn>

        <div className="row nowrap-scroll" style={{ gap: 2, flex: "none" }}>
          {crumbs.map((c, i) => (
            <span key={c.path} className="row" style={{ gap: 2, flex: "none" }}>
              {i > 0 && <span className="dim tiny">›</span>}
              <button className="btn btn-ghost btn-sm" onClick={() => go(c.path)} style={{ padding: "2px 6px" }}>
                {c.name}
              </button>
            </span>
          ))}
        </div>

        <span className="spacer" />
        <input
          className="input"
          style={{ width: 150 }}
          placeholder="Search all files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Btn size="sm" onClick={() => { setShowNew("dir"); setNewName(""); }} title="New folder">📁+</Btn>
        <Btn size="sm" onClick={() => { setShowNew("file"); setNewName(""); }} title="New file">📄+</Btn>
        <Btn size="sm" onClick={() => setView(view === "list" ? "grid" : "list")} title="Toggle view">
          {view === "list" ? "▦" : "☰"}
        </Btn>
      </div>

      <div className="row grow" style={{ minHeight: 0 }}>
        <div className="sidebar" style={{ width: 168 }}>
          <div className="tiny dim semi" style={{ padding: "2px 6px 6px", letterSpacing: "0.05em" }}>PLACES</div>
          {[
            { label: "Home", path: "/home/user", icon: "🏠" },
            { label: "Documents", path: "/documents", icon: "📄" },
            { label: "Downloads", path: "/downloads", icon: "⬇" },
            { label: "Projects", path: "/projects", icon: "🧩" },
            { label: "Robots", path: "/robots", icon: "🤖" },
            { label: "City", path: "/city", icon: "🏙" },
            { label: "Network", path: "/network", icon: "🌐" },
            { label: "Websites", path: "/websites", icon: "🌐" },
            { label: "Cloud", path: "/cloud", icon: "☁" },
            { label: "System", path: "/system", icon: "⚙" },
          ].map((p) => (
            <button key={p.path} className="sidebar-item" aria-current={cwd === p.path} onClick={() => go(p.path)}>
              <span>{p.icon}</span>
              <span className="ellipsis">{p.label}</span>
            </button>
          ))}
          <div className="hr" />
          <div className="tiny dim semi" style={{ padding: "2px 6px 6px", letterSpacing: "0.05em" }}>TREE</div>
          {tree}
        </div>

        <div className="grow" style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          {query.trim() ? (
            <div className="app-status">
              <span>{entries.length} matches for “{query}” across the whole filesystem</span>
            </div>
          ) : null}
          <div className="grow" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
            {entries.length === 0 ? (
              <Empty
                icon={query ? "🔍" : "📂"}
                title={query ? "No files matched" : "This folder is empty"}
                hint={query ? "Try a different term — the search covers every subsystem's output." : "Create a file or folder to get started."}
              />
            ) : view === "list" ? (
              <DataTable
                columns={columns}
                rows={entries}
                selectedId={selected ?? undefined}
                onRowClick={(r) => setSelected(r.path)}
                onRowDoubleClick={(r) => {
                  if (r.type === "dir") go(r.path);
                  else wm.openApp("editor", { args: { path: r.path } });
                }}
                height="100%"
                emptyText="Empty folder"
              />
            ) : (
              <div className="scroll grow" style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
                {entries.map((r) => (
                  <div
                    key={r.path}
                    className="col center card card-hover"
                    data-selected={selected === r.path}
                    onClick={() => setSelected(r.path)}
                    onDoubleClick={() => {
                      if (r.type === "dir") go(r.path);
                      else wm.openApp("editor", { args: { path: r.path } });
                    }}
                    style={{ gap: 6, padding: 12, cursor: "pointer", textAlign: "center" }}
                  >
                    <span style={{ fontSize: 26 }}>{r.type === "dir" ? "📁" : "📄"}</span>
                    <span className="tiny ellipsis" style={{ maxWidth: "100%" }}>{r.name}</span>
                    <span className="tiny dim mono">{r.type === "dir" ? "—" : fmtBytes(r.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="app-status">
        <span>{entries.filter((e) => e.type === "file").length} files · {entries.filter((e) => e.type === "dir").length} folders</span>
        <span className="dim">|</span>
        <span>{n.fs.count().files} files total, {fmtBytes(n.fs.usedBytes())} used</span>
        <span className="spacer" />
        {selectedStat && (
          <Btn size="sm" variant="ghost" onClick={() => setShowProps(true)}>
            Properties
          </Btn>
        )}
        <Badge tone="info">{n.cloud.storagePct().toFixed(1)}% cloud</Badge>
      </div>

      <Modal open={showProps} onClose={() => setShowProps(false)} title="Properties" width={440}>
        {selectedStat && (
          <div className="col" style={{ gap: 4 }}>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 30 }}>{selectedStat.type === "dir" ? "📁" : "📄"}</span>
              <div className="col" style={{ gap: 0 }}>
                <strong>{selectedStat.name}</strong>
                <span className="tiny dim mono">{selectedStat.path}</span>
              </div>
            </div>
            <div className="kv"><span>Type</span><span>{selectedStat.type === "dir" ? "Directory" : "Text file"}</span></div>
            <div className="kv"><span>Size</span><span>{fmtBytes(selectedStat.size)}</span></div>
            <div className="kv"><span>Created</span><span>{new Date(selectedStat.created).toLocaleString()}</span></div>
            <div className="kv"><span>Modified</span><span>{new Date(selectedStat.modified).toLocaleString()}</span></div>
            <div className="kv"><span>Permissions</span><span>{selectedStat.mode}</span></div>
            <div className="kv"><span>Owner</span><span>{selectedStat.owner}</span></div>
            <div className="kv"><span>Written by</span><span>{selectedStat.origin}</span></div>
            {selectedStat.type === "file" && (
              <pre className="panel-flat scroll" style={{ marginTop: 8, padding: 10, maxHeight: 180, fontSize: 11, margin: "8px 0 0" }}>
                {(n.fs.read(selectedStat.path) ?? "").slice(0, 1800) || "(empty)"}
              </pre>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={showNew !== null}
        onClose={() => setShowNew(null)}
        title={showNew === "dir" ? "New folder" : "New file"}
        width={400}
        footer={
          <>
            <Btn onClick={() => setShowNew(null)}>Cancel</Btn>
            <Btn
              variant="primary"
              onClick={() => {
                if (!newName.trim()) return;
                if (showNew === "dir") n.fs.mkdir(`${cwd}/${newName}`, { origin: "user" });
                else n.fs.write(`${cwd}/${newName}`, "", { origin: "user" });
                n.markDirty("fs");
                setShowNew(null);
              }}
            >
              Create
            </Btn>
          </>
        }
      >
        <input
          className="input"
          autoFocus
          value={newName}
          placeholder={showNew === "dir" ? "folder-name" : "notes.txt"}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              if (showNew === "dir") n.fs.mkdir(`${cwd}/${newName}`, { origin: "user" });
              else n.fs.write(`${cwd}/${newName}`, "", { origin: "user" });
              n.markDirty("fs");
              setShowNew(null);
            }
          }}
        />
        <div className="tiny dim" style={{ marginTop: 6 }}>
          Will be created at <span className="mono">{cwd}/{newName || "…"}</span>
        </div>
      </Modal>
    </div>
  );
}

function renderTree(
  n: ReturnType<typeof nova>,
  cwd: string,
  expanded: Set<string>,
  setExpanded: (s: Set<string>) => void,
  go: (p: string) => void,
  depth: number,
): React.ReactNode {
  const kids = n.fs.list("/").filter((x) => x.type === "dir");
  return kids.map((d) => {
    const path = n.fs.pathOf(d);
    const isOpen = expanded.has(path);
    const sub = n.fs.list(path).filter((x) => x.type === "dir");
    return (
      <div key={d.id}>
        <button
          className="sidebar-item"
          aria-current={cwd === path}
          style={{ paddingLeft: 6 + depth * 9 }}
          onClick={() => {
            if (sub.length) {
              const next = new Set(expanded);
              if (isOpen) next.delete(path);
              else next.add(path);
              setExpanded(next);
            }
            go(path);
          }}
        >
          <span className="tiny dim" style={{ width: 9, flex: "none" }}>
            {sub.length ? (isOpen ? "▾" : "▸") : "·"}
          </span>
          <span className="ellipsis">{d.name || "/"}</span>
        </button>
        {isOpen && depth < 2 && renderTree(n, cwd, expanded, setExpanded, go, depth + 1)}
      </div>
    );
  });
}

export { ORIGIN_TONE };
