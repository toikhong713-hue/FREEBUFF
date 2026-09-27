import { useCallback, useEffect, useRef, useState } from "react";
import { nova } from "../core/nova";
import { TABLES } from "../core/db";
import { Btn, Modal } from "../ui/primitives";
import { useKernel } from "../os/hooks";
import { SiteRouter, SITE_LIST } from "../sites";
import { timeAgo } from "../core/rng";

export interface Tab {
  id: string;
  url: string;
  title: string;
  history: string[];
  hi: number;
  loading: boolean;
  error: string | null;
  progress: number;
}

export function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return "novasearch.net";
  u = u.replace(/^[a-z]+:\/\//i, "");
  if (SITE_LIST.some((s) => u === s.host || u.startsWith(s.host + "/"))) return u;
  if (/\s/.test(u) || !u.includes(".")) return `novasearch.net/search?q=${encodeURIComponent(u)}`;
  return u.replace(/\/$/, "");
}

/** Resolve an in-site link ("home", "/news/1", "nova.social") against the current page. */
export function resolveNav(currentUrl: string, target: string): string {
  const t = target.trim();
  if (SITE_LIST.some((s) => t === s.host || t.startsWith(s.host + "/"))) return normalizeUrl(t);
  if (t.startsWith("http") || t.includes("://")) return normalizeUrl(t);
  const host = currentUrl.split("/")[0] || "novasearch.net";
  return normalizeUrl(`${host}/${t.replace(/^\/+/, "")}`);
}

let tabSeq = 0;

export function BrowserApp({ args }: { args: Record<string, unknown> }) {
  const n = useKernel();
  const [tabs, setTabs] = useState<Tab[]>(() => [
    {
      id: "t1",
      url: (args.url as string) || "novasearch.net",
      title: "New tab",
      history: [(args.url as string) || "novasearch.net"],
      hi: 0,
      loading: false,
      error: null,
      progress: 0,
    },
  ]);
  const [active, setActive] = useState(0);
  const [omni, setOmni] = useState<string | null>(null);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const timerRef = useRef<number | null>(null);

  const tab = tabs[Math.min(active, tabs.length - 1)];

  const update = useCallback((idx: number, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }, []);

  /** The simulated network fetch: resolve DNS, hop the fabric, then render. */
  const load = useCallback(
    (idx: number, url: string) => {
      const norm = normalizeUrl(url);
      update(idx, { url: norm, loading: true, error: null, progress: 0 });
      if (timerRef.current) window.clearInterval(timerRef.current);

      // fire a real packet through the fabric so the network light up
      const host = norm.split("/")[0].split(":")[0];
      const ip = n.net.resolveDns(host);
      if (ip) {
        const src = [...n.net.devices.values()].find((d) => d.type === "pc")?.ifaces[0]?.ip;
        if (src) {
          n.net.send({ srcIp: src, dstIp: ip, protocol: "HTTP", dstPort: 80, payload: `GET / ${host}` });
          n.net.send({ srcIp: src, dstIp: ip, protocol: "DNS", dstPort: 53, payload: `A? ${host}` });
        }
      }

      let p = 0;
      timerRef.current = window.setInterval(() => {
        p += 8 + Math.random() * 18;
        if (p >= 100) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          const known = SITE_LIST.some((s) => s.host === host) || !!ip;
          if (!known) {
            update(idx, { loading: false, progress: 100, error: `ERR_NAME_NOT_RESOLVED`, title: host });
          } else {
            const title = resolveTitle(norm, host);
            setTabs((prev) =>
              prev.map((t, i) => {
                if (i !== idx) return t;
                const history = [...t.history.slice(0, t.hi + 1), norm];
                return {
                  ...t,
                  history,
                  hi: history.length - 1,
                  loading: false,
                  progress: 100,
                  error: null,
                  title,
                };
              }),
            );
            n.db.insert(TABLES.history, { url: norm, title, ts: Date.now() });
          }
          n.markDirty("web");
        } else {
          update(idx, { progress: p });
        }
      }, 55);
    },
    [n, update],
  );

  useEffect(() => {
    if (tab) load(active, tab.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabs.length]);

  const navigate = (url: string) => {
    setOmni(null);
    load(active, resolveNav(tab?.url ?? "novasearch.net", url));
  };

  const go = (delta: number) => {
    const t = tabs[active];
    const next = t.hi + delta;
    if (next < 0 || next >= t.history.length) return;
    update(active, { hi: next, url: t.history[next] });
    load(active, t.history[next]);
  };

  const newTab = () => {
    tabSeq++;
    const t: Tab = { id: `t${tabSeq}`, url: "novasearch.net", title: "New tab", history: ["novasearch.net"], hi: 0, loading: false, error: null, progress: 0 };
    setTabs((prev) => [...prev, t]);
    setActive(tabs.length);
  };

  const closeTab = (idx: number) => {
    setTabs((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
    if (active >= tabs.length - 1) setActive(Math.max(0, active - 1));
  };

  const bookmarks = n.db.all(TABLES.bookmarks);
  const history = n.db.all(TABLES.history).sort((a, b) => b.ts - a.ts).slice(0, 40);
  const downloads = n.db.all(TABLES.downloads).sort((a, b) => b.ts - a.ts).slice(0, 30);

  return (
    <div className="app-shell">
      {/* tabs */}
      <div className="row" style={{ gap: 2, padding: "5px 6px 0", flex: "none", alignItems: "flex-end" }}>
        <div className="row nowrap-scroll grow" style={{ gap: 2 }}>
          {tabs.map((t, i) => (
            <div
              key={t.id}
              className="row"
              onClick={() => setActive(i)}
              style={{
                gap: 6,
                padding: "4px 6px 4px 9px",
                borderRadius: "8px 8px 0 0",
                cursor: "pointer",
                maxWidth: 190,
                background: i === active ? "var(--panel-2)" : "transparent",
                border: `1px solid ${i === active ? "var(--border)" : "transparent"}`,
                borderBottom: "none",
                minWidth: 90,
              }}
            >
              <span style={{ fontSize: 11, flex: "none" }}>{t.loading ? "◌" : "◉"}</span>
              <span className="ellipsis small" style={{ color: i === active ? "var(--text)" : "var(--text-3)" }}>{t.title}</span>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: "0 3px" }}
                onClick={(e) => { e.stopPropagation(); closeTab(i); }}
                title="Close tab"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <Btn size="sm" variant="ghost" onClick={newTab} title="New tab">＋</Btn>
      </div>

      {/* chrome */}
      <div className="app-toolbar" style={{ paddingTop: 5, paddingBottom: 6 }}>
        <Btn size="sm" variant="ghost" onClick={() => go(-1)} disabled={!tab || tab.hi === 0} title="Back">←</Btn>
        <Btn size="sm" variant="ghost" onClick={() => go(1)} disabled={!tab || tab.hi >= tab.history.length - 1} title="Forward">→</Btn>
        <Btn size="sm" variant="ghost" onClick={() => tab && load(active, tab.url)} title="Reload">⟳</Btn>
        <div style={{ position: "relative", flex: 1, minWidth: 120 }}>
          <input
            className="input mono"
            style={{ paddingLeft: 28 }}
            value={omni ?? tab?.url ?? ""}
            placeholder="Search or enter address"
            onChange={(e) => setOmni(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") navigate(omni ?? tab?.url ?? "");
            }}
            aria-label="Address bar"
          />
          <span style={{ position: "absolute", left: 9, top: 7, fontSize: 11, opacity: 0.6 }}>🔒</span>
        </div>
        <Btn size="sm" variant="ghost" onClick={() => setShowBookmarks(true)} title="Bookmarks">★</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setShowHistory(true)} title="History">🕘</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setShowDownloads(true)} title="Downloads">⬇</Btn>
        <Btn
          size="sm"
          variant="ghost"
          title={bookmarks.some((b) => b.url === tab?.url) ? "Remove bookmark" : "Bookmark this page"}
          onClick={() => {
            if (!tab) return;
            if (bookmarks.some((b) => b.url === tab.url)) {
              n.db.removeWhere(TABLES.bookmarks, (b) => b.url === tab.url);
            } else {
              n.db.insert(TABLES.bookmarks, { url: tab.url, title: tab.title, ts: Date.now() });
            }
            n.markDirty("web");
          }}
        >
          {bookmarks.some((b) => b.url === tab?.url) ? "★" : "☆"}
        </Btn>
      </div>

      {/* progress */}
      <div style={{ height: 2, flex: "none", background: "var(--border)" }}>
        <div
          style={{
            height: "100%",
            width: `${tab?.progress ?? 0}%`,
            background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
            transition: "width 90ms linear",
          }}
        />
      </div>

      {/* viewport */}
      <div className="grow" style={{ minHeight: 0, position: "relative", background: "var(--bg-1)" }}>
        {tab?.error ? (
          <ErrorPage url={tab.url} error={tab.error} onHome={() => navigate("novasearch.net")} />
        ) : (
          <SiteRouter
            url={tab?.url ?? ""}
            navigate={navigate}
            onTitle={(t) => update(active, { title: t })}
            onDownload={(name, from) => {
              n.db.insert(TABLES.downloads, { name, from, ts: Date.now() });
              n.fs.write(`/downloads/${name}`, `fetched from ${from}\n\n${new Date().toString()}`, { origin: "web" });
              n.markDirty("web");
            }}
          />
        )}
      </div>

      <div className="app-status">
        <span className="ellipsis" style={{ maxWidth: 260 }}>{tab?.url}</span>
        <span className="dim">|</span>
        <span>{SITE_LIST.length} simulated sites</span>
        <span className="spacer" />
        <span className="dim mono">{n.net.packets.length} packets in flight</span>
      </div>

      <Modal open={showBookmarks} onClose={() => setShowBookmarks(false)} title="Bookmarks" width={480}>
        {bookmarks.length === 0 && <div className="small dim">No bookmarks yet — star a page to save it.</div>}
        {bookmarks.map((b) => (
          <div key={b.id} className="card row between">
            <button className="btn btn-ghost row grow ellipsis" style={{ minWidth: 0 }} onClick={() => { navigate(b.url); setShowBookmarks(false); }}>
              ★ <span className="ellipsis">{b.title}</span> <span className="tiny dim">— {b.url}</span>
            </button>
            <Btn size="sm" variant="ghost" onClick={() => n.db.remove(TABLES.bookmarks, b.id)}>✕</Btn>
          </div>
        ))}
        <div className="hr" />
        <strong className="small">Suggested</strong>
        <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
          {SITE_LIST.map((s) => (
            <Btn key={s.host} size="sm" onClick={() => { navigate(s.host); setShowBookmarks(false); }}>
              {s.icon} {s.name}
            </Btn>
          ))}
        </div>
      </Modal>

      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="History" width={480}>
        {history.length === 0 && <div className="small dim">Nothing visited yet.</div>}
        {history.map((h) => (
          <div key={h.id} className="card row between">
            <button className="btn btn-ghost row grow ellipsis" style={{ minWidth: 0 }} onClick={() => { navigate(h.url); setShowHistory(false); }}>
              <span className="col" style={{ alignItems: "flex-start", gap: 0, minWidth: 0 }}>
                <span className="ellipsis small">{h.title}</span>
                <span className="tiny dim mono ellipsis">{h.url}</span>
              </span>
            </button>
            <span className="tiny dim nowrap">{timeAgo(h.ts)}</span>
            <Btn size="sm" variant="ghost" onClick={() => n.db.remove(TABLES.history, h.id)}>✕</Btn>
          </div>
        ))}
        {history.length > 0 && (
          <Btn size="sm" variant="danger" style={{ marginTop: 8 }} onClick={() => n.db.removeWhere(TABLES.history, () => true)}>
            Clear history
          </Btn>
        )}
      </Modal>

      <Modal open={showDownloads} onClose={() => setShowDownloads(false)} title="Downloads" width={460}>
        {downloads.length === 0 && <div className="small dim">No downloads. Visit a file on a hosted site to fetch it.</div>}
        {downloads.map((d) => (
          <div key={d.id} className="card row between">
            <div className="col" style={{ gap: 0, minWidth: 0 }}>
              <span className="small ellipsis">{d.name}</span>
              <span className="tiny dim mono ellipsis">from {d.from}</span>
            </div>
            <span className="tiny dim nowrap">{timeAgo(d.ts)}</span>
          </div>
        ))}
      </Modal>
    </div>
  );
}

function resolveTitle(url: string, host: string): string {
  const site = SITE_LIST.find((s) => s.host === host);
  if (site) {
    const path = url.slice(host.length);
    if (path.startsWith("/u/")) return decodeURIComponent(path.slice(3)) + " · " + site.name;
    if (path.startsWith("/news/")) return "Article · " + site.name;
    if (path.startsWith("/mail")) return "Mail · " + site.name;
    if (path.startsWith("/forum/")) return "Thread · " + site.name;
    if (path.startsWith("/search")) return "Search · " + site.name;
    if (path.startsWith("/doc/")) return "Docs · " + site.name;
    return site.name;
  }
  const edge = [...nova().net.devices.values()].find((d) => d.http?.host === host);
  if (edge?.http) return edge.http.title;
  const srv = nova().cloud.servers.find((s) => s.host === host);
  if (srv) return srv.hostTitle;
  return host;
}

function ErrorPage({ url, error, onHome }: { url: string; error: string; onHome: () => void }) {
  return (
    <div className="col center" style={{ height: "100%", gap: 10, textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 40 }}>🛰️</div>
      <h2 style={{ margin: 0, fontSize: 17 }}>This site can’t be reached</h2>
      <div className="small dim mono">{url}</div>
      <div className="small" style={{ color: "var(--err)" }}>{error}</div>
      <div className="small dim" style={{ maxWidth: 420 }}>
        The address did not resolve in the NOVA network. Try one of the simulated sites, or host your own
        page from the Mini Internet Lab and it will appear here.
      </div>
      <Btn variant="primary" onClick={onHome}>Go to NovaSearch</Btn>
    </div>
  );
}
