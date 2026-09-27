import { memo, useMemo } from "react";
import { nova } from "../core/nova";
import { SITE_LIST, SiteNav, siteByHost } from "./shell";
import { SocialSite } from "./Social";
import { SearchSite } from "./Search";
import { NewsSite } from "./News";
import { MailSite } from "./Mail";
import { DriveSite, TubeSite, DocsSite, DevSite } from "./Media";
import { ShopSite, ForumSite, CitySite, TelemetrySite } from "./Commerce";

export { SITE_LIST, siteByHost };

interface RouterProps {
  url: string;
  navigate: (url: string) => void;
  onTitle: (title: string) => void;
  onDownload?: (name: string, from: string) => void;
}

export const SiteRouter = memo(function SiteRouter({ url, navigate }: RouterProps) {
  const host = url.split("/")[0].split(":")[0];
  const path = url.slice(host.length).replace(/^\//, "");
  const def = siteByHost(host);

  const body = useMemo(() => {
    if (host === "telemetry.nova.cloud") return <TelemetrySite path={path} />;
    if (!def) return <HostedPage host={host} />;
    switch (host) {
      case "novasearch.net":
        return <SearchSite path={path} />;
      case "nova.social":
        return <SocialSite path={path} />;
      case "novanews.org":
        return <NewsSite path={path} />;
      case "novamail.io":
        return <MailSite path={path} />;
      case "novadrive.cloud":
        return <DriveSite path={path} />;
      case "novatube.tv":
        return <TubeSite path={path} />;
      case "novadocs.dev":
        return <DocsSite path={path} />;
      case "novadev.io":
        return <DevSite path={path} />;
      case "novashop.com":
        return <ShopSite path={path} />;
      case "novaforum.net":
      case "helios-forum.net":
        return <ForumSite path={path} />;
      case "aurora-city.gov":
        return <CitySite path={path} />;
      default:
        return <HostedPage host={host} />;
    }
  }, [host, path, def]);

  return <SiteNav.Provider value={navigate}>{body}</SiteNav.Provider>;
});

/**
 * Pages the user published themselves — from `serve` in the terminal, the
 * Network Manager, or a cloud web server. Rendered in a sandboxed iframe.
 */
function HostedPage({ host }: { host: string }) {
  const n = nova();
  const edge = [...n.net.devices.values()].find((d) => d.http?.host === host);
  const cloud = n.cloud.servers.find((s) => s.host === host);
  const site = edge?.http ?? (cloud ? { host, title: cloud.hostTitle, body: cloud.hostBody, port: 80, kind: "custom" as const } : null);

  if (!site) {
    return (
      <div className="col center" style={{ minHeight: 320, gap: 8, textAlign: "center", padding: 24 }}>
        <span style={{ fontSize: 34 }}>📄</span>
        <strong>No page is hosted at {host}</strong>
        <span className="small dim" style={{ maxWidth: 420 }}>
          The address resolved but nothing is serving it. Publish a page with{" "}
          <span className="mono">serve {host} 80 /path/to/file.html</span> in the terminal, or create a web
          server in the NOVA Cloud console.
        </span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div
        className="row between"
        style={{ padding: "7px 14px", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="small semi">{site.title}</span>
        <span className="tiny dim mono">
          {edge ? `${edge.name} · ${edge.ifaces[0]?.ip}` : `NOVA Cloud ${cloud?.kind} · ${cloud?.ip}`}
        </span>
      </div>
      <iframe
        title={site.title}
        srcDoc={site.body}
        sandbox="allow-same-origin"
        style={{ flex: 1, width: "100%", border: 0, background: "#fff", minHeight: 320 }}
      />
    </div>
  );
}
