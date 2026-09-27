import { useEffect, useMemo, useState } from "react";
import { TABLES } from "../core/db";
import { useKernel } from "../os/hooks";
import { Pill, SiteLink, SiteShell, siteByHost, useSiteNav } from "./shell";
import { Btn, Seg } from "../ui/primitives";
import { timeAgo } from "../core/rng";

export function NewsSite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost("novanews.org")!;
  const go = useSiteNav();
  const articleId = path.startsWith("news/") ? path.slice(5) : null;
  const category = path.startsWith("c/") ? decodeURIComponent(path.slice(2)) : "all";

  const links = [
    { label: "Top", href: "top", active: !articleId && category === "all" },
    { label: "City", href: "c/City", active: category === "City" },
    { label: "Tech", href: "c/Tech", active: category === "Tech" },
    { label: "Weather", href: "c/Weather", active: category === "Weather" },
  ];

  if (articleId) {
    const a = n.db.find(TABLES.news, articleId);
    if (!a) {
      return (
        <SiteShell def={def} path={path} links={links}>
          <div className="panel col center" style={{ padding: 30, gap: 6 }}>
            <strong>Article not found</strong>
            <Btn onClick={() => go("top")}>← Back to the front page</Btn>
          </div>
        </SiteShell>
      );
    }
    return (
      <SiteShell def={def} path={path} links={links}>
        <article className="col" style={{ gap: 12, maxWidth: 720 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Pill tone={a.breaking ? "warn" : "info"}>{a.breaking ? "Breaking" : a.category}</Pill>
            <span className="tiny dim">{a.source}</span>
            <span className="tiny dim">· {timeAgo(a.ts)}</span>
            <span className="tiny dim">· {Number(a.views).toLocaleString()} reads</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, letterSpacing: "-0.02em" }}>{a.title}</h1>
          <div
            style={{
              height: 180,
              borderRadius: 10,
              background: `linear-gradient(135deg, hsl(${a.hue} 60% 38%), hsl(${Number(a.hue) + 50} 55% 22%))`,
            }}
          />
          {String(a.body).split("\n\n").map((p, i) => (
            <p key={i} className="small" style={{ margin: 0, lineHeight: 1.7, color: "var(--text-2)" }}>
              {p}
            </p>
          ))}
          {a.fromCity && (
            <div className="card small">
              This story was published by the running Virtual City simulation. Open the city in NOVAOS to
              watch the event happen, or run <span className="mono">city publish "…"</span> in the terminal.
            </div>
          )}
          <Btn onClick={() => go("top")}>← More stories</Btn>
        </article>
      </SiteShell>
    );
  }

  return (
    <SiteShell def={def} path={path} links={links}>
      <NewsIndex category={category} />
    </SiteShell>
  );
}

function NewsIndex({ category }: { category: string }) {
  const n = useKernel();
  const go = useSiteNav();
  const [live, setLive] = useState(false);

  const all = useMemo(
    () => [...n.db.all(TABLES.news)].sort((a, b) => Number(b.breaking) - Number(a.breaking) || b.ts - a.ts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const filtered = category === "all" ? all : all.filter((a) => a.category === category);
  const lead = filtered[0];
  const rest = filtered.slice(1);
  const breaking = all.filter((a) => a.breaking).slice(0, 6);
  const sources = n.db.all(TABLES.sources);

  return (
    <div className="col" style={{ gap: 18 }}>
      {breaking.length > 0 && (
        <div
          className="row"
          style={{
            gap: 10,
            padding: "7px 12px",
            borderRadius: 99,
            background: "color-mix(in srgb, var(--err) 14%, transparent)",
            border: "1px solid color-mix(in srgb, var(--err) 35%, transparent)",
            overflow: "hidden",
          }}
        >
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--err)", flex: "none" }}>BREAKING</span>
          <div className="nowrap-scroll grow" style={{ fontSize: 12 }}>
            {breaking.map((b, i) => (
              <span key={b.id}>
                <SiteLink href={`news/${b.id}`}>{b.title}</SiteLink>
                {i < breaking.length - 1 && <span className="dim"> • </span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        <div className="grow col" style={{ gap: 16, minWidth: 0 }}>
          {lead && (
            <article className="panel col" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  height: 200,
                  background: `linear-gradient(130deg, hsl(${lead.hue} 62% 40%), hsl(${Number(lead.hue) + 45} 58% 20%))`,
                }}
              />
              <div className="col" style={{ padding: 14, gap: 6 }}>
                <div className="row" style={{ gap: 8 }}>
                  <Pill tone="info">{lead.category}</Pill>
                  <span className="tiny dim">{lead.source}</span>
                  <span className="tiny dim">· {timeAgo(lead.ts)}</span>
                </div>
                <SiteLink href={`news/${lead.id}`}>
                  <h2 style={{ margin: 0, fontSize: 21, lineHeight: 1.25, letterSpacing: "-0.02em", color: "var(--text)" }}>
                    {lead.title}
                  </h2>
                </SiteLink>
                <p className="small muted clamp3" style={{ margin: 0, lineHeight: 1.6 }}>
                  {String(lead.body).split("\n\n")[0]}
                </p>
              </div>
            </article>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
            {rest.map((a) => (
              <article key={a.id} className="panel col card-hover" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => go(`news/${a.id}`)}>
                <div style={{ height: 110, background: `linear-gradient(130deg, hsl(${a.hue} 58% 42%), hsl(${Number(a.hue) + 40} 55% 22%))` }} />
                <div className="col" style={{ padding: 10, gap: 5 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <Pill tone={a.breaking ? "warn" : undefined}>{a.breaking ? "Breaking" : a.category}</Pill>
                    <span className="tiny dim">{a.source}</span>
                  </div>
                  <SiteLink href={`news/${a.id}`}>
                    <span className="small semi" style={{ lineHeight: 1.35, display: "block" }}>{a.title}</span>
                  </SiteLink>
                  <span className="tiny dim">
                    {timeAgo(a.ts)} · {Number(a.views).toLocaleString()} reads
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="col" style={{ gap: 14, width: 260, flex: "none" }}>
          <div className="panel col" style={{ padding: 12, gap: 8 }}>
            <strong className="small">Sources</strong>
            {sources.map((s) => (
              <div key={s.id} className="row" style={{ gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: `hsl(${s.hue} 65% 55%)` }} />
                <span className="small grow">{s.name}</span>
                <span className="tiny dim">{s.kind}</span>
              </div>
            ))}
          </div>

          <div className="panel col" style={{ padding: 12, gap: 8 }}>
            <strong className="small">Live wire</strong>
            <div className="tiny dim">
              The city simulation publishes into this feed. Press start and new stories will appear.
            </div>
            <Seg
              value={live ? "on" : "off"}
              onChange={(v) => setLive(v === "on")}
              options={[
                { value: "off", label: "Idle" },
                { value: "on", label: "Auto-refresh" },
              ]}
            />
            {live && <LiveFeed />}
          </div>

          <div className="panel col" style={{ padding: 12, gap: 6 }}>
            <strong className="small">Categories</strong>
            {["City", "Tech", "Transport", "Weather", "Culture", "Business"].map((c) => (
              <SiteLink key={c} href={`c/${c}`}>
                <span className="small">{c}</span>
              </SiteLink>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LiveFeed() {
  const n = useKernel();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 2000);
    return () => window.clearInterval(id);
  }, []);
  const items = n.db.all(TABLES.cityNews).slice(-5).reverse();
  return (
    <div className="col" style={{ gap: 6, maxHeight: 200, overflow: "auto" }} key={tick}>
      {items.length === 0 && <div className="tiny dim">Waiting for the city to publish…</div>}
      {items.map((it) => (
        <div key={it.id} className="col" style={{ gap: 0 }}>
          <span className="tiny semi">{it.title}</span>
          <span className="tiny dim">{it.district} · {timeAgo(it.ts)}</span>
        </div>
      ))}
    </div>
  );
}
