import { useEffect, useMemo, useState } from "react";
import { TABLES } from "../core/db";
import { useKernel } from "../os/hooks";
import { Pill, SiteLink, SiteShell, hueOf, siteByHost, useSiteNav } from "./shell";
import { SITE_LIST } from "./shell";
import { Btn, Seg } from "../ui/primitives";
import { timeAgo } from "../core/rng";

type Scope = "all" | "web" | "people" | "news" | "docs";

export function SearchSite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost("novasearch.net")!;
  const go = useSiteNav();
  const query = new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?") + 1) : "").get("q") ?? "";
  const [q, setQ] = useState(query);
  const [scope, setScope] = useState<Scope>("all");
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => {
    setQ(query);
  }, [query]);

  const suggestions = useMemo(() => {
    if (q.trim().length < 2) return [];
    const base = [
      ...n.db.all(TABLES.trends).map((t) => t.term as string),
      ...n.db.all(TABLES.users).map((u) => u.name as string),
      ...n.db.all(TABLES.news).map((a) => a.title as string),
    ];
    const ql = q.toLowerCase();
    return base.filter((b) => b.toLowerCase().includes(ql)).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, n.rev]);

  const results = useMemo(() => computeResults(n, query, scope), [n, query, scope, n.rev]);
  const history = useMemo(
    () => [...n.db.all(TABLES.searchHistory)].sort((a, b) => b.ts - a.ts).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const trends = useMemo(
    () => [...n.db.all(TABLES.trends)].sort((a, b) => b.volume - a.volume).slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );

  const run = (term: string) => {
    setQ(term);
    setSuggestOpen(false);
    if (!term.trim()) return;
    n.db.insert(TABLES.searchHistory, { q: term, ts: Date.now() });
    n.db.bus.emit("change");
    go(`search?q=${encodeURIComponent(term)}`);
  };

  return (
    <SiteShell def={def} path={path} links={[{ label: "Web", href: "search", active: true }]}>
      <div className="col center" style={{ gap: 12, marginBottom: 18 }}>
        <div className="row" style={{ gap: 10 }}>
          <span style={{ fontSize: 30 }}>🔎</span>
          <span className="huge">NovaSearch</span>
        </div>
        <div style={{ position: "relative", width: "min(620px, 100%)" }}>
          <input
            className="input"
            style={{ padding: "10px 14px", fontSize: 15, borderRadius: 99 }}
            placeholder="Search the NOVA internet, people, news and documents"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => window.setTimeout(() => setSuggestOpen(false), 160)}
            onKeyDown={(e) => e.key === "Enter" && run(q)}
            aria-label="Search"
          />
          {suggestOpen && suggestions.length > 0 && (
            <div className="panel" style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 20, padding: 4 }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="sidebar-item"
                  onMouseDown={() => { run(s); setSuggestOpen(false); }}
                >
                  <span className="dim">🔎</span>
                  <span className="ellipsis">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Seg
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: "All" },
              { value: "web", label: "Web" },
              { value: "people", label: "People" },
              { value: "news", label: "News" },
              { value: "docs", label: "Documents" },
            ]}
          />
        </div>
      </div>

      {!query && (
        <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
          <div className="grow col" style={{ gap: 10 }}>
            <strong className="small">Trending searches</strong>
            {trends.map((t, i) => (
              <button key={t.id} className="card card-hover row between" style={{ textAlign: "left" }} onClick={() => run(t.term)}>
                <span className="col" style={{ gap: 0 }}>
                  <span className="tiny dim">#{i + 1} trending in Aurora</span>
                  <span className="small semi">{t.term}</span>
                </span>
                <span className="tiny dim">{compact(t.volume)} searches</span>
              </button>
            ))}
          </div>
          <div className="col" style={{ gap: 10, width: 300, flex: "none" }}>
            <strong className="small">Recent searches</strong>
            {history.length === 0 && <div className="card tiny dim">No history yet.</div>}
            {history.map((h) => (
              <button key={h.id} className="card card-hover row between" onClick={() => run(h.q)}>
                <span className="small ellipsis">{h.q}</span>
                <span className="tiny dim">{timeAgo(h.ts)}</span>
              </button>
            ))}
            <div className="card tiny dim">
              Every query is stored in the shared NovaDB table <span className="mono">search_history</span> and
              is readable from the terminal.
            </div>
          </div>
        </div>
      )}

      {query && (
        <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
          <div className="grow col" style={{ gap: 14, minWidth: 0 }}>
            <div className="small dim">
              {results.total} results for <strong style={{ color: "var(--text)" }}>“{query}”</strong>
            </div>
            {(scope === "all" || scope === "web") && results.sites.length > 0 && (
              <Section title="Sites">
                {results.sites.map((s) => (
                  <div key={s.host} className="panel col" style={{ padding: 12, gap: 3 }}>
                    <SiteLink href={s.host}>
                      <span className="small semi">{s.name}</span>
                    </SiteLink>
                    <span className="tiny mono dim">{s.host}</span>
                    <span className="small muted">{s.blurb}</span>
                  </div>
                ))}
              </Section>
            )}
            {(scope === "all" || scope === "people") && results.people.length > 0 && (
              <Section title="People">
                {results.people.map((u) => (
                  <div key={u.id} className="panel row" style={{ padding: 12, gap: 10 }}>
                    <SiteLink href={`nova.social/u/${u.handle}`}>
                      <span style={{ fontSize: 20 }}>{hueOf(u.handle) % 2 ? "🧑" : "👩"}</span>
                    </SiteLink>
                    <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
                      <SiteLink href={`nova.social/u/${u.handle}`}>
                        <span className="small semi">{u.name}</span>
                      </SiteLink>
                      <span className="tiny dim">
                        {u.occupation} · {u.district} · {u.followers.toLocaleString()} followers
                      </span>
                    </div>
                  </div>
                ))}
              </Section>
            )}
            {(scope === "all" || scope === "news") && results.news.length > 0 && (
              <Section title="News">
                {results.news.map((a) => (
                  <div key={a.id} className="panel row" style={{ padding: 12, gap: 10 }}>
                    <div
                      style={{
                        width: 54, height: 54, borderRadius: 8, flex: "none",
                        background: `linear-gradient(140deg, hsl(${a.hue} 60% 40%), hsl(${a.hue + 40} 60% 28%))`,
                      }}
                    />
                    <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                      <SiteLink href={`novanews.org/news/${a.id}`}>
                        <span className="small semi">{a.title}</span>
                      </SiteLink>
                      <span className="tiny dim">
                        {a.source} · {a.category} · {timeAgo(a.ts)}
                      </span>
                      <span className="tiny muted clamp2">{String(a.body).split("\n")[0]}</span>
                    </div>
                    {a.breaking && <Pill tone="warn">breaking</Pill>}
                  </div>
                ))}
              </Section>
            )}
            {(scope === "all" || scope === "docs") && results.docs.length > 0 && (
              <Section title="Documents & files">
                {results.docs.map((d) => (
                  <div key={d.id} className="panel row" style={{ padding: 12, gap: 10 }}>
                    <span style={{ fontSize: 18 }}>📄</span>
                    <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
                      <span className="small semi ellipsis">{d.name}</span>
                      <span className="tiny dim mono">
                        {d.path} · {d.origin} · {timeAgo(d.modified)}
                      </span>
                    </div>
                  </div>
                ))}
              </Section>
            )}
            {results.total === 0 && (
              <div className="panel col center" style={{ padding: 30, gap: 6, textAlign: "center" }}>
                <span style={{ fontSize: 26 }}>🫙</span>
                <strong>Nothing found</strong>
                <span className="small dim">Try a broader term, or search a different scope.</span>
              </div>
            )}
          </div>
          <aside className="col" style={{ gap: 10, width: 250, flex: "none" }}>
            <div className="panel col" style={{ padding: 12, gap: 6 }}>
              <strong className="small">About this index</strong>
              <div className="tiny dim">Crawls</div>
              <div className="small mono">{SITE_LIST.length} simulated sites</div>
              <div className="tiny dim">Documents</div>
              <div className="small mono">{n.fs.count().files} files on this PC</div>
              <div className="tiny dim">Records</div>
              <div className="small mono">{n.db.tableNames().length} database tables</div>
            </div>
            <Btn size="sm" onClick={() => n.db.removeWhere(TABLES.searchHistory, () => true)}>
              Clear search history
            </Btn>
          </aside>
        </div>
      )}
    </SiteShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="tiny dim semi" style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</div>
      <div className="col" style={{ gap: 7 }}>{children}</div>
    </div>
  );
}

function computeResults(
  n: ReturnType<typeof useKernel>,
  query: string,
  scope: Scope,
): {
  total: number;
  sites: typeof SITE_LIST;
  people: any[];
  news: any[];
  docs: any[];
} {
  if (!query.trim()) return { total: 0, sites: [], people: [], news: [], docs: [] };
  const ql = query.toLowerCase();
  const sites = SITE_LIST.filter(
    (s) => s.name.toLowerCase().includes(ql) || s.host.includes(ql) || s.blurb.toLowerCase().includes(ql),
  );
  const people = n.db.search(TABLES.users, query, ["name", "handle", "occupation", "district", "bio"], 6);
  const news = n.db.search(TABLES.news, query, ["title", "body", "category", "source"], 6);
  const docs = n.db.search("files", query, ["name", "content"], 8).map((r) => ({
    id: r.id,
    name: r.name,
    path: r.path,
    origin: r.origin,
    modified: r.modified,
  }));
  const filtered = { total: 0, sites, people, news, docs };
  if (scope === "web") return { ...filtered, total: sites.length, people: [], news: [], docs: [] };
  if (scope === "people") return { ...filtered, total: people.length, sites: [], news: [], docs: [] };
  if (scope === "news") return { ...filtered, total: news.length, sites: [], people: [], docs: [] };
  if (scope === "docs") return { ...filtered, total: docs.length, sites: [], people: [], news: [] };
  return { ...filtered, total: sites.length + people.length + news.length + docs.length };
}

function compact(v: number): string {
  if (v > 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v > 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(v);
}
