import { useEffect, useMemo, useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { Btn, Modal } from "../ui/primitives";
import { fmtBytes } from "../core/rng";

export function EditorApp({ args }: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const winId = useMemo(() => wm.windows.find((w) => w.appId === "editor")?.id ?? "", [wm.windows]);
  const [path, setPath] = useState<string>((args.path as string) ?? "/home/user/Documents/welcome.md");
  const [draft, setDraft] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState("/");

  // load the file when the window opens with a path
  useEffect(() => {
    if (args.path) {
      const p = String(args.path);
      setPath(p);
      setDraft(n.fs.read(p) ?? "");
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.path]);

  useEffect(() => {
    if (winId) wm.setTitle(winId, `${dirty ? "• " : ""}${path.split("/").pop()} — Editor`);
  }, [path, dirty, winId, wm]);

  const save = () => {
    if (n.fs.write(path, draft, { origin: "user" })) {
      setDirty(false);
      n.markDirty("fs");
      wm.notify({ title: "Saved", body: `${path} written to the shared filesystem`, tone: "ok", source: "editor" });
    } else {
      wm.notify({ title: "Save failed", body: `Could not write ${path}`, tone: "warn", source: "editor" });
    }
  };

  const lines = draft.split("\n").length;
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const cursorLine = useMemo(() => draft.slice(0, draft.length).split("\n").length, [draft]);

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Btn size="sm" onClick={() => setOpen(true)}>Open…</Btn>
        <Btn size="sm" variant="primary" onClick={save} disabled={!dirty}>
          Save
        </Btn>
        <Btn size="sm" onClick={() => { setDraft(""); setDirty(true); }}>New</Btn>
        <span className="spacer" />
        <span className="tiny mono dim ellipsis" style={{ maxWidth: 320 }}>{path}</span>
      </div>

      <textarea
        className="textarea grow"
        value={draft}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            save();
          }
        }}
        style={{ border: 0, borderRadius: 0, background: "transparent", padding: 14, fontSize: 13, lineHeight: 1.65 }}
        aria-label="Editor"
      />

      <div className="app-status">
        <span className="mono">{path}</span>
        <span className="spacer" />
        <span>{lines} lines</span>
        <span>{words} words</span>
        <span>{fmtBytes(draft.length)}</span>
        <span>Ln {cursorLine}</span>
        <span style={{ color: dirty ? "var(--warn)" : "var(--ok)" }}>{dirty ? "modified" : "saved"}</span>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Open file" width={560}>
        <Breadcrumb path={browse} onChange={setBrowse} />
        <div className="col" style={{ gap: 2, marginTop: 8, maxHeight: 340, overflow: "auto" }}>
          {n.fs.list(browse).map((node) => {
            const p = n.fs.pathOf(node);
            return (
              <button
                key={node.id}
                className="sidebar-item"
                onClick={() => {
                  if (node.type === "dir") setBrowse(p);
                  else {
                    setPath(p);
                    setDraft(node.content);
                    setDirty(false);
                    setOpen(false);
                  }
                }}
              >
                <span>{node.type === "dir" ? "📁" : "📄"}</span>
                <span className="ellipsis">{node.name}</span>
                <span className="spacer" />
                <span className="tiny dim mono">{node.type === "dir" ? "" : fmtBytes(node.content.length)}</span>
              </button>
            );
          })}
          {n.fs.list(browse).length === 0 && <div className="small dim" style={{ padding: 10 }}>Empty folder</div>}
        </div>
      </Modal>
    </div>
  );
}

function Breadcrumb({ path, onChange }: { path: string; onChange: (p: string) => void }) {
  const segs = path.split("/").filter(Boolean);
  return (
    <div className="row wrap" style={{ gap: 3 }}>
      <button className="btn btn-sm" onClick={() => onChange("/")}>/</button>
      {segs.map((s, i) => (
        <span key={i} className="row" style={{ gap: 3 }}>
          <span className="dim">›</span>
          <button className="btn btn-sm btn-ghost" onClick={() => onChange("/" + segs.slice(0, i + 1).join("/"))}>
            {s}
          </button>
        </span>
      ))}
    </div>
  );
}
