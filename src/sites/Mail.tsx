import { useMemo, useState } from "react";
import { TABLES, type Row } from "../core/db";
import { useKernel } from "../os/hooks";
import { Pill, SiteShell, siteByHost, useSiteNav } from "./shell";
import { Badge, Btn, Empty } from "../ui/primitives";
import { timeAgo } from "../core/rng";

const FOLDERS = [
  { id: "inbox", label: "Inbox", icon: "📥" },
  { id: "starred", label: "Starred", icon: "⭐" },
  { id: "sent", label: "Sent", icon: "📤" },
  { id: "drafts", label: "Drafts", icon: "📝" },
  { id: "archive", label: "Archive", icon: "🗄" },
  { id: "spam", label: "Spam", icon: "🚫" },
  { id: "trash", label: "Trash", icon: "🗑" },
] as const;

type Folder = (typeof FOLDERS)[number]["id"];

export function MailSite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost("novamail.io")!;
  const go = useSiteNav();
  const [query, setQuery] = useState("");

  const folder: Folder = (FOLDERS.find((f) => path === `f/${f.id}`)?.id ?? "inbox") as Folder;
  const selectedId = path.startsWith("m/") ? path.slice(2) : null;
  const composing = path === "compose";

  const all = useMemo(
    () => [...n.db.all(TABLES.mail)].sort((a, b) => b.ts - a.ts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );

  const inFolder = (m: Row, f: Folder): boolean => {
    if (f === "starred") return !!m.starred;
    return m.folder === f;
  };

  const messages = useMemo(() => {
    let list = all.filter((m) => inFolder(m, folder));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          String(m.subject).toLowerCase().includes(q) ||
          String(m.from).toLowerCase().includes(q) ||
          String(m.body).toLowerCase().includes(q),
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, folder, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FOLDERS) c[f.id] = all.filter((m) => inFolder(m, f.id)).length;
    c.inboxUnread = all.filter((m) => m.folder === "inbox" && !m.read).length;
    return c;
  }, [all]);

  const open = selectedId ? all.find((m) => m.id === selectedId) ?? null : null;

  return (
    <SiteShell
      def={def}
      path={path}
      actions={
        <Btn size="sm" variant="primary" onClick={() => go("compose")}>
          ✎ Compose
        </Btn>
      }
    >
      <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
        <aside className="col" style={{ gap: 2, width: 176, flex: "none" }}>
          {FOLDERS.map((f) => (
            <button
              key={f.id}
              className="sidebar-item"
              aria-current={folder === f.id && !selectedId}
              onClick={() => go(`f/${f.id}`)}
            >
              <span>{f.icon}</span>
              <span className="grow">{f.label}</span>
              {f.id === "inbox" && counts.inboxUnread ? (
                <span className="badge badge-info">{counts.inboxUnread}</span>
              ) : counts[f.id] ? (
                <span className="badge">{counts[f.id]}</span>
              ) : null}
            </button>
          ))}
          <div className="hr" />
          <div className="tiny dim" style={{ padding: "0 8px" }}>
            Storage for attachments and sent items lands in <span className="mono">/downloads</span> on your PC.
          </div>
        </aside>

        <div className="grow col" style={{ gap: 10, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="Search mail…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Btn
              size="sm"
              disabled={!all.some((m) => m.folder === "inbox" && !m.read)}
              onClick={() => {
                n.db.removeWhere(TABLES.mail, (m) => m.folder === "inbox" && !m.read);
                n.markDirty("web");
              }}
            >
              Mark all read
            </Btn>
            <Btn
              size="sm"
              disabled={!all.some((m) => m.folder === "spam")}
              onClick={() => {
                n.db.removeWhere(TABLES.mail, (m) => m.folder === "spam");
                n.markDirty("web");
              }}
            >
              Empty spam
            </Btn>
          </div>

          {open ? (
            <MailReader n={n} mail={open} />
          ) : messages.length === 0 ? (
            <Empty icon="📭" title="Nothing here" hint="This folder is empty." />
          ) : (
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              {messages.map((m) => (
                <MailRow key={m.id} n={n} mail={m} onOpen={() => go(`m/${m.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {composing && <Compose n={n} onClose={() => go(`f/${folder}`)} />}
    </SiteShell>
  );
}

function MailRow({ n, mail, onOpen }: { n: ReturnType<typeof useKernel>; mail: Row; onOpen: () => void }) {
  return (
    <div
      className="row"
      style={{
        gap: 10,
        padding: "9px 12px",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        background: mail.read ? "transparent" : "color-mix(in srgb, var(--accent) 7%, transparent)",
      }}
      onClick={() => {
        n.db.update(TABLES.mail, mail.id, { read: true });
        n.markDirty("web");
        onOpen();
      }}
    >
      {!mail.read && <span className="dot dot-live" />}
      {mail.starred && <span style={{ color: "var(--warn)" }}>★</span>}
      <div className="col grow" style={{ gap: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="small semi ellipsis">{mail.from}</span>
          {mail.flagged && <Pill tone="warn">flagged</Pill>}
          {mail.hasAttachment && <span title="Has attachment">📎</span>}
        </div>
        <span className="small ellipsis" style={{ fontWeight: mail.read ? 400 : 600 }}>
          {mail.subject}
        </span>
        <span className="tiny dim ellipsis">{String(mail.body).replace(/\s+/g, " ").slice(0, 96)}</span>
      </div>
      <span className="tiny dim nowrap" style={{ alignSelf: "flex-start" }}>{timeAgo(mail.ts)}</span>
    </div>
  );
}

function MailReader({ n, mail }: { n: ReturnType<typeof useKernel>; mail: Row }) {
  const go = useSiteNav();
  return (
    <div className="panel col" style={{ padding: 16, gap: 12 }}>
      <div className="row between wrap">
        <Btn size="sm" onClick={() => go("f/inbox")}>← Inbox</Btn>
        <div className="row" style={{ gap: 5 }}>
          <Btn size="sm" onClick={() => { n.db.update(TABLES.mail, mail.id, { starred: !mail.starred }); n.markDirty("web"); }}>
            {mail.starred ? "★ Unstar" : "☆ Star"}
          </Btn>
          <Btn size="sm" onClick={() => { n.db.update(TABLES.mail, mail.id, { folder: "archive" }); n.markDirty("web"); go("f/archive"); }}>
            Archive
          </Btn>
          <Btn size="sm" variant="danger" onClick={() => { n.db.update(TABLES.mail, mail.id, { folder: "trash" }); n.markDirty("web"); go("f/trash"); }}>
            Delete
          </Btn>
        </div>
      </div>
      <div className="col" style={{ gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{mail.subject}</h2>
        <div className="row tiny dim wrap" style={{ gap: 8 }}>
          <span className="mono">{mail.from}</span>
          <span>→</span>
          <span className="mono">{mail.to}</span>
          <span>· {new Date(mail.ts).toLocaleString()}</span>
        </div>
      </div>
      <pre
        className="small"
        style={{
          margin: 0,
          padding: 14,
          borderRadius: 10,
          background: "color-mix(in srgb, var(--bg-0) 40%, transparent)",
          border: "1px solid var(--border)",
          whiteSpace: "pre-wrap",
          lineHeight: 1.65,
          fontFamily: "var(--font)",
        }}
      >
        {mail.body}
      </pre>
      {mail.attachment && (
        <div className="card row between">
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 18 }}>📎</span>
            <div className="col" style={{ gap: 0 }}>
              <span className="small semi">{mail.attachment}</span>
              <span className="tiny dim">saving writes it to /downloads on your PC</span>
            </div>
          </div>
          <Btn
            size="sm"
            onClick={() => {
              n.fs.write(
                `/downloads/${mail.attachment}`,
                `Attachment from ${mail.from}\nSubject: ${mail.subject}\n\n${mail.body}`,
                { origin: "web" },
              );
              n.db.insert(TABLES.downloads, { name: mail.attachment, from: "novamail.io", ts: Date.now() });
              n.markDirty("web");
            }}
          >
            Download
          </Btn>
        </div>
      )}
      <Badge>{n.db.count(TABLES.mail)} messages total in NovaDB</Badge>
    </div>
  );
}

function Compose({ n, onClose }: { n: ReturnType<typeof useKernel>; onClose: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState(false);

  const send = (asDraft: boolean) => {
    if (!subject.trim() && !body.trim()) return;
    n.db.insert(TABLES.mail, {
      folder: asDraft ? "drafts" : "sent",
      from: "you@nova.cloud",
      to: to || "recipient@novanet.io",
      subject: subject || "(no subject)",
      ts: Date.now(),
      read: true,
      starred: false,
      flagged: false,
      hasAttachment: attach,
      attachment: attach ? "attachment.txt" : null,
      body: body + (attach ? "\n\n— attachment.txt attached" : ""),
    });
    n.markDirty("web");
    onClose();
  };

  return (
    <div
      className="panel col"
      style={{
        position: "absolute",
        right: 20,
        bottom: 20,
        width: 420,
        maxWidth: "calc(100% - 40px)",
        zIndex: 30,
        padding: 0,
        boxShadow: "var(--shadow)",
        animation: "pop 160ms cubic-bezier(0.2,0,0.2,1)",
      }}
    >
      <div className="row between" style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
        <strong className="small">New message</strong>
        <Btn size="sm" variant="ghost" onClick={onClose}>✕</Btn>
      </div>
      <div className="col" style={{ padding: 12, gap: 8 }}>
        <input className="input" placeholder="To…" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="input" placeholder="Subject…" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea className="textarea" rows={7} placeholder="Write something…" value={body} onChange={(e) => setBody(e.target.value)} />
        <label className="checkbox small">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
          Attach a file
        </label>
        <div className="row end" style={{ gap: 6 }}>
          <Btn size="sm" onClick={() => send(true)}>Save draft</Btn>
          <Btn size="sm" variant="primary" onClick={() => send(false)}>Send</Btn>
        </div>
      </div>
    </div>
  );
}
