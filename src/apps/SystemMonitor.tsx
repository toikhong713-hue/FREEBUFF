import { useEffect, useMemo, useRef, useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { Badge, Btn, KV, Ring, Sparkline, loadColor } from "../ui/primitives";
import { fmtBytes } from "../core/rng";

type Metric = "cpu" | "memory" | "network" | "disk" | "thermal";

const WINDOW = 90;

export function SystemMonitorApp(_props: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const [metric, setMetric] = useState<Metric>("cpu");
  const [range, setRange] = useState<"60s" | "5m" | "15m">("60s");
  const buffers = useRef<Record<string, number[]>>({});

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = n.system;
      const b = buffers.current;
      const push = (k: string, v: number) => {
        (b[k] ??= []).push(v);
        if (b[k].length > WINDOW) b[k].shift();
      };
      push("cpu", s.cpuLoad);
      s.cpuPerCore.forEach((c, i) => push(`core${i}`, c));
      push("mem", (s.memUsed / s.memTotal) * 100);
      push("netDown", s.netDown);
      push("netUp", s.netUp);
      push("disk", (s.diskUsed / s.diskTotal) * 100);
      push("temp", s.tempC);
      push("fps", wm.fps);
    }, 900);
    return () => window.clearInterval(id);
  }, [n, wm.fps]);

  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 900);
    return () => window.clearInterval(id);
  }, []);

  const b = buffers.current;
  const s = n.system;

  const series = useMemo(() => {
    switch (metric) {
      case "cpu": return { data: b.cpu ?? [], color: "var(--accent)", max: 100 };
      case "memory": return { data: b.mem ?? [], color: "var(--accent-2)", max: 100 };
      case "network": return { data: b.netDown ?? [], color: "var(--ok)", max: Math.max(60, ...(b.netDown ?? [60])) };
      case "disk": return { data: b.disk ?? [], color: "var(--warn)", max: 100 };
      case "thermal": return { data: b.temp ?? [], color: loadColor(Math.max(...(b.temp ?? [0]))), max: 100 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, b.cpu?.length, b.mem?.length, b.netDown?.length, b.disk?.length, b.temp?.length]);

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        {(["cpu", "memory", "network", "disk", "thermal"] as Metric[]).map((m) => (
          <Btn key={m} size="sm" variant={metric === m ? "primary" : "default"} onClick={() => setMetric(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </Btn>
        ))}
        <span className="spacer" />
        {(["60s", "5m", "15m"] as const).map((r) => (
          <Btn key={r} size="sm" variant={range === r ? "primary" : "ghost"} onClick={() => setRange(r)}>
            {r}
          </Btn>
        ))}
      </div>

      <div className="scroll grow" style={{ padding: 14 }}>
        <div className="row" style={{ gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <Ring
            pct={metric === "cpu" ? s.cpuLoad : metric === "memory" ? (s.memUsed / s.memTotal) * 100 : metric === "disk" ? (s.diskUsed / s.diskTotal) * 100 : metric === "thermal" ? ((s.tempC - 20) / 80) * 100 : Math.min(100, s.netDown / 2)}
            size={116}
            sub={
              metric === "cpu" ? `${s.cores} cores`
              : metric === "memory" ? "in use"
              : metric === "disk" ? "used"
              : metric === "thermal" ? `${s.tempC.toFixed(0)}°C`
              : "down"
            }
          />
          <div className="col grow" style={{ gap: 6, minWidth: 240 }}>
            <strong style={{ fontSize: 14 }}>{metricLabel(metric)}</strong>
            <Sparkline data={series.data} width={520} height={72} color={series.color} max={series.max} />
            <div className="row between tiny dim mono">
              <span>{range} window</span>
              <span>
                now {series.data.length ? series.data[series.data.length - 1].toFixed(1) : "—"}
                {metric === "network" ? " KB/s" : metric === "thermal" ? " °C" : " %"}
                · peak {series.data.length ? Math.max(...series.data).toFixed(1) : "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="hr" />
        <strong className="small">{metric === "cpu" ? "Per-core utilisation" : "Details"}</strong>

        {metric === "cpu" ? (
          <div className="row" style={{ gap: 5, marginTop: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            {s.cpuPerCore.map((c, i) => (
              <div key={i} className="col center" style={{ gap: 3, flex: "1 1 60px", minWidth: 54 }}>
                <Sparkline data={b[`core${i}`] ?? []} width={70} height={44} color={loadColor(c)} max={100} fill={false} />
                <span className="tiny dim mono">c{i} {c.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        ) : metric === "network" ? (
          <div className="col" style={{ gap: 8, marginTop: 8 }}>
            <div className="row" style={{ gap: 14 }}>
              <div className="col grow">
                <span className="tiny dim">Down ↓ {s.netDown.toFixed(1)} KB/s</span>
                <Sparkline data={b.netDown ?? []} width={400} height={54} color="var(--ok)" />
              </div>
              <div className="col grow">
                <span className="tiny dim">Up ↑ {s.netUp.toFixed(1)} KB/s</span>
                <Sparkline data={b.netUp ?? []} width={400} height={54} color="var(--warn)" />
              </div>
            </div>
            <div className="panel-flat" style={{ padding: 10 }}>
              <KV k="Devices" v={n.net.devices.size} />
              <KV k="Links" v={n.net.links.size} />
              <KV k="Packets in flight" v={n.net.packets.length} />
              <KV k="Cloud servers" v={n.cloud.servers.length} />
            </div>
          </div>
        ) : (
          <div className="panel-flat" style={{ padding: 12, marginTop: 8 }}>
            {metric === "memory" && (
              <>
                <KV k="Total" v={`${(s.memTotal / 1024).toFixed(1)} GiB`} />
                <KV k="Used" v={`${(s.memUsed / 1024).toFixed(2)} GiB`} />
                <KV k="Available" v={`${((s.memTotal - s.memUsed) / 1024).toFixed(2)} GiB`} />
                <KV k="Largest consumer" v={largestConsumer(n)} />
              </>
            )}
            {metric === "disk" && (
              <>
                <KV k="Total" v={`${(s.diskTotal / 1024).toFixed(0)} GiB novafs4`} />
                <KV k="Used" v={fmtBytes(s.diskUsed * 1024 * 1024)} />
                <KV k="Files" v={n.fs.count().files} />
                <KV k="Directories" v={n.fs.count().dirs} />
                <KV k="Cloud bucket" v={`${n.cloud.storageUsedGb().toFixed(2)} / ${n.cloud.quotaGb} GB`} />
              </>
            )}
            {metric === "thermal" && (
              <>
                <KV k="Package" v={`${s.tempC.toFixed(1)} °C`} />
                <KV k="Load-adjusted ceiling" v="95 °C" />
                <KV k="Fan state" v={s.cpuLoad > 70 ? "high" : s.cpuLoad > 40 ? "medium" : "low"} />
                <KV k="Hot processes" v={hotProcesses(n)} />
              </>
            )}
          </div>
        )}
      </div>

      <div className="app-status">
        <Badge tone={s.cpuLoad > 85 ? "err" : s.cpuLoad > 60 ? "warn" : "ok"}>CPU {s.cpuLoad.toFixed(0)}%</Badge>
        <Badge>MEM {(s.memUsed / 1024).toFixed(1)} GB</Badge>
        <Badge>NET {s.netDown.toFixed(0)} KB/s</Badge>
        <Badge tone={s.tempC > 80 ? "warn" : undefined}>{s.tempC.toFixed(0)} °C</Badge>
        <span className="spacer" />
        <span className="dim">{wm.fps} fps</span>
      </div>
    </div>
  );
}

function metricLabel(m: Metric): string {
  switch (m) {
    case "cpu": return "Processor utilisation";
    case "memory": return "Memory usage";
    case "network": return "Network throughput";
    case "disk": return "Disk usage";
    case "thermal": return "Thermal state";
  }
}

function largestConsumer(n: ReturnType<typeof useKernel>): string {
  const top = [...n.proc.list()].sort((a, b) => b.ram - a.ram)[0];
  return top ? `${top.name} (${top.ram.toFixed(0)} MB)` : "—";
}

function hotProcesses(n: ReturnType<typeof useKernel>): string {
  const top = [...n.proc.list()].sort((a, b) => b.cpu - a.cpu).slice(0, 3);
  return top.map((p) => p.name).join(", ") || "—";
}
