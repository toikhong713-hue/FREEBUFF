import type { ReactNode } from "react";
import { createContext, useContext } from "react";

export interface SiteDef {
  host: string;
  name: string;
  icon: string;
  hue: number;
  blurb: string;
}

/** The simulated internet, resolved through the shared DNS layer. */
export const SITE_LIST: SiteDef[] = [
  { host: "novasearch.net", name: "NovaSearch", icon: "🔎", hue: 200, blurb: "Search the whole simulated web" },
  { host: "nova.social", name: "NOVA Social", icon: "🫧", hue: 210, blurb: "Profiles, posts, followers, trends" },
  { host: "novanews.org", name: "NovaNews", icon: "📰", hue: 8, blurb: "Aurora's news, from five sources" },
  { host: "novamail.io", name: "NovaMail", icon: "✉️", hue: 152, blurb: "Inbox, sent, drafts, spam" },
  { host: "novadrive.cloud", name: "NovaDrive", icon: "☁️", hue: 36, blurb: "Cloud storage, shared with your PC" },
  { host: "novatube.tv", name: "NovaTube", icon: "▶️", hue: 0, blurb: "Video platform with real playback state" },
  { host: "novadocs.dev", name: "NovaDocs", icon: "📘", hue: 186, blurb: "Documentation for NOVAOS" },
  { host: "novadev.io", name: "NovaDev", icon: "⌨️", hue: 262, blurb: "Developer portal, APIs, status" },
  { host: "novashop.com", name: "NovaShop", icon: "🛍", hue: 330, blurb: "Marketplace with carts and orders" },
  { host: "novaforum.net", name: "NovaForum", icon: "💬", hue: 268, blurb: "Boards, threads, replies" },
  { host: "aurora-city.gov", name: "Aurora City", icon: "🏛", hue: 28, blurb: "Official city site, live from the sim" },
  { host: "helios-forum.net", name: "Helios Forum", icon: "🛰", hue: 190, blurb: "Technology and infrastructure chatter" },
];

export function siteByHost(host: string): SiteDef | undefined {
  return SITE_LIST.find((s) => s.host === host);
}

/** Every site gets in-app navigation for free through this context. */
export const SiteNav = createContext<(href: string) => void>(() => {});
export function useSiteNav(): (href: string) => void {
  return useContext(SiteNav);
}

export function SiteShell({
  def,
  path,
  children,
  links,
  actions,
}: {
  def: SiteDef;
  path: string;
  children: ReactNode;
  links?: { label: string; href: string; active?: boolean }[];
  actions?: ReactNode;
}) {
  const go = useSiteNav();
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: "var(--bg-1)" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: `linear-gradient(120deg, hsl(${def.hue} 55% 14%), hsl(${def.hue} 50% 10%))`,
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div className="row" style={{ padding: "10px 16px", gap: 14, maxWidth: 1180, margin: "0 auto" }}>
          <span className="row" style={{ gap: 8, flex: "none" }}>
            <span style={{ fontSize: 19 }}>{def.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>{def.name}</span>
          </span>
          {links && (
            <div className="row nowrap-scroll grow" style={{ gap: 2, minWidth: 0 }}>
              {links.map((x) => (
                <button
                  key={x.href}
                  onClick={() => go(x.href)}
                  className="btn btn-ghost btn-sm"
                  aria-current={x.active}
                  style={{
                    color: x.active ? "var(--text)" : "var(--text-2)",
                    background: x.active ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent",
                    flex: "none",
                  }}
                >
                  {x.label}
                </button>
              ))}
            </div>
          )}
          {actions}
        </div>
      </header>
      <main className="grow" style={{ maxWidth: 1180, width: "100%", margin: "0 auto", padding: 16 }}>
        {children}
      </main>
      <footer
        className="row wrap"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "14px 16px",
          fontSize: 11.5,
          color: "var(--text-3)",
          gap: 12,
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >
        <span>© {new Date().getFullYear()} {def.name} — part of the NOVA simulated internet</span>
        <span className="mono">{def.host}{path ? `/${path}` : ""}</span>
        <span className="spacer" />
        <span>Served by the NOVA edge</span>
      </footer>
    </div>
  );
}

export function Avatar({ name, hue, size = 34 }: { name: string; hue: number; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      aria-hidden
      className="col center"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `hsl(${hue} 58% 42%)`,
        color: "#fff",
        fontSize: size * 0.36,
        fontWeight: 700,
        flex: "none",
      }}
    >
      {initials}
    </div>
  );
}

export function SiteLink({ href, children }: { href: string; children: ReactNode }) {
  const go = useSiteNav();
  return (
    <a
      href={`#${href}`}
      onClick={(e) => {
        e.preventDefault();
        go(href);
      }}
      style={{ color: "var(--accent)", textDecoration: "none", cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
    >
      {children}
    </a>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: "ok" | "warn" | "info" }) {
  const color = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--info)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 99,
        fontSize: 10.5,
        fontWeight: 600,
        color,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
