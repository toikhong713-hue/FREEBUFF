import { useMemo, useState } from "react";
import { useKernel } from "../os/hooks";
import { useNovaContext } from "../os/wm";
import { BarRow, Badge, Btn, DataTable, Meter, Ring, Seg, Tabs, loadColor, type Column } from "../ui/primitives";
import type { Process } from "../core/proc";
import { fmtBytes } from "../core/rng";

type View = "processes" | "performance" | "startup" | "details";

export function TaskManagerApp(_props: { args: Record<string, unknown> }) {
  const n = useKernel();
  const wm = useNovaContext();
  const [view, setView] = useState<View>("processes");
  const [sortBy, setSortBy] = useState<"cpu" | "mem" | "pid" | "name">("cpu");
  const [desc, setDesc] = useState(true);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const s = n.system;

  const rows = useMemo(() => {
    let list = n.proc.list();
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter((p) => p.name.includes(q) || p.title.toLowerCase().includes(q));
    }
    const dir = desc ? -1 : 1;
    return list.sort((a, b) => dir * compare(a, b, sortBy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.rev, sortBy, desc, filter]);

  const cols: Column<Process>[] = [
    {
      key: "name",
      label: "Process",
      render: (p) => (
        <div className="row" style={{ gap: 6 }}>
          <span className="dim" style={{ fontSize: 10 }}>{stateDot(p.state)}</span>
          <span className="ellipsis">{p.name}</span>
          {p.windowId && <span className="tiny dim">window</span>}
        </div>
      ),
    },
    { key: "pid", label: "PID", width: 58, align: "right", render: (p) => <span className="mono tiny">{p.pid}</span> },
    { key: "title", label: "Description", render: (p) => <span className="tiny muted ellipsis">{p.title}</span> },
    {
      key: "cpu",
      label: "CPU",
      width: 110,
      align: "right",
      render: (p) => (
        <div className="col" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="mono tiny">{p.cpu.toFixed(1)}%</span>
          <div style={{ width: 70 }}>
            <Meter pct={(p.cpu / 100) * 100} color={loadColor(p.cpu)} />
          </div>
        </div>
      ),
    },
    {
      key: "mem",
      label: "Memory",
      width: 100,
      align: "right",
      render: (p) => (
        <div className="col" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="mono tiny">{p.ram.toFixed(0)} MB</span>
          <div style={{ width: 70 }}>
            <Meter pct={(p.ram / s.memTotal) * 100} color="var(--accent-2)" />
          </div>
        </div>
      ),
    },
    { key: "net", label: "Net", width: 74, align: "right", render: (p) => <span className="mono tiny dim">{p.net.toFixed(0)} K/s</span> },
    { key: "io", label: "Disk", width: 70, align: "right", render: (p) => <span className="mono tiny dim">{p.io.toFixed(0)} op/s</span> },
    {
      key: "act",
      label: "",
      width: 62,
      align: "right",
      render: (p) => (
        <Btn
          size="sm"
          variant="ghost"
          title="End task"
          onClick={(e) => {
            e.stopPropagation();
            endTask(p);
          }}
        >
          ✕
        </Btn>
      ),
    },
  ];

  const endTask = (p: Process) => {
    if (p.windowId) wm.close(p.windowId);
    else n.proc.kill(p.pid);
    wm.notify({ title: "Process ended", body: `${p.name} (${p.pid}) terminated`, tone: "warn", source: "taskmgr" });
  };

  const sel = selected ? n.proc.find(selected) : null;

  return (
    <div className="app-shell">
      <div className="app-toolbar">
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: "processes", label: "Processes" },
            { value: "performance", label: "Performance" },
            { value: "startup", label: "Startup" },
            { value: "details", label: "Details" },
          ]}
        />
        <span className="spacer" />
        {view === "processes" && (
          <input
            className="input"
            style={{ width: 150 }}
            placeholder="Filter processes…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
      </div>

      {view === "processes" && (
        <div className="grow" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="row" style={{ padding: "6px 10px", gap: 6, borderBottom: "1px solid var(--border)" }}>
            <span className="tiny dim">Sort by</span>
            <Seg
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: "cpu", label: "CPU" },
                { value: "mem", label: "Memory" },
                { value: "pid", label: "PID" },
                { value: "name", label: "Name" },
              ]}
            />
            <Btn size="sm" variant="ghost" onClick={() => setDesc((d) => !d)} title="Reverse order">
              {desc ? "↓ desc" : "↑ asc"}
            </Btn>
            <span className="spacer" />
            <span className="tiny dim">{rows.length} processes</span>
            <Btn
              size="sm"
              variant="danger"
              onClick={() => {
                wm.closeAll();
                wm.notify({ title: "All windows closed", body: "Background services keep running", tone: "warn" });
              }}
            >
              End all tasks
            </Btn>
          </div>
          <div className="grow" style={{ minHeight: 0 }}>
            <DataTable
              columns={cols}
              rows={rows}
              selectedId={selected ? String(selected) : undefined}
              onRowClick={(p) => setSelected(p.pid)}
              height="100%"
              emptyText="No processes matched"
            />
          </div>
        </div>
      )}

      {view === "performance" && (
        <div className="scroll grow" style={{ padding: 14 }}>
          <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
            <PerfCard
              title="CPU"
              detail={`${s.cpuLoad.toFixed(1)}% of ${s.cores * 100}% · ${s.tempC.toFixed(0)}°C`}
              pct={s.cpuLoad}
              sub={`${s.cores} cores`}
            />
            <PerfCard
              title="Memory"
              detail={`${(s.memUsed / 1024).toFixed(2)} / ${(s.memTotal / 1024).toFixed(0)} GiB`}
              pct={(s.memUsed / s.memTotal) * 100}
              sub="used"
            />
            <PerfCard
              title="Disk"
              detail={`${(s.diskUsed / 1024).toFixed(1)} / ${(s.diskTotal / 1024).toFixed(0)} GiB`}
              pct={(s.diskUsed / s.diskTotal) * 100}
              sub="novafs4"
            />
            <PerfCard
              title="Network"
              detail={`↓ ${s.netDown.toFixed(0)} KB/s  ↑ ${s.netUp.toFixed(0)} KB/s`}
              pct={Math.min(100, s.netDown / 2)}
              sub="throughput"
            />
          </div>

          <div className="hr" />
          <strong className="small">Per-core load</strong>
          <div className="row" style={{ gap: 4, marginTop: 6, alignItems: "flex-end" }}>
            {s.cpuPerCore.map((c, i) => (
              <div key={i} className="col center" style={{ gap: 3, flex: 1 }}>
                <div
                  style={{
                    width: "100%",
                    height: 92,
                    background: "color-mix(in srgb, var(--bg-0) 50%, transparent)",
                    borderRadius: 5,
                    display: "flex",
                    alignItems: "flex-end",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: `${c}%`,
                      background: loadColor(c),
                      opacity: 0.85,
                      transition: "height 200ms linear",
                    }}
                  />
                </div>
                <span className="tiny dim mono">{c.toFixed(0)}</span>
              </div>
            ))}
          </div>

          <div className="hr" />
          <strong className="small">Top processes by CPU</strong>
          <div className="col" style={{ gap: 7, marginTop: 8 }}>
            {[...n.proc.list()].sort((a, b) => b.cpu - a.cpu).slice(0, 8).map((p) => (
              <BarRow
                key={p.pid}
                label={p.name}
                value={p.cpu}
                max={100}
                right={`${p.cpu.toFixed(1)}%`}
                color={loadColor(p.cpu)}
              />
            ))}
          </div>
        </div>
      )}

      {view === "startup" && (
        <div className="scroll grow" style={{ padding: 14 }}>
          <strong className="small">Background services</strong>
          <p className="tiny dim" style={{ margin: "4px 0 10px" }}>
            These are started by the init system at boot and run for the whole session.
          </p>
          <div className="col" style={{ gap: 6 }}>
            {n.proc.list().filter((p) => !p.windowId).map((p) => (
              <div key={p.pid} className="card row between">
                <div className="col" style={{ gap: 1, minWidth: 0 }}>
                  <span className="small semi ellipsis">{p.title}</span>
                  <span className="tiny dim mono">{p.name} · pid {p.pid}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="mono tiny dim">{p.ram.toFixed(0)} MB</span>
                  <Btn size="sm" variant="danger" onClick={() => endTask(p)}>Stop</Btn>
                </div>
              </div>
            ))}
          </div>
          <div className="hr" />
          <strong className="small">Desktop apps that autostart</strong>
          <div className="col" style={{ gap: 5, marginTop: 6 }}>
            {wm.settings.autoStartApps.length === 0 && <span className="tiny dim">None configured.</span>}
            {wm.settings.autoStartApps.map((id) => (
              <div key={id} className="card row between">
                <span className="small">{id}</span>
                <Btn
                  size="sm"
                  onClick={() =>
                    wm.setSettings({ autoStartApps: wm.settings.autoStartApps.filter((x) => x !== id) })
                  }
                >
                  Remove
                </Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "details" && (
        <div className="scroll grow" style={{ padding: 14 }}>
          {sel ? (
            <div className="col" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 10 }}>
                <span style={{ fontSize: 26 }}>⚙️</span>
                <div className="col" style={{ gap: 1 }}>
                  <strong>{sel.title}</strong>
                  <span className="tiny dim mono">{sel.name}</span>
                </div>
              </div>
              <div className="panel-flat" style={{ padding: 12 }}>
                <KVRow k="PID" v={sel.pid} />
                <KVRow k="User" v={sel.user} />
                <KVRow k="State" v={sel.state} />
                <KVRow k="CPU" v={`${sel.cpu.toFixed(2)}%`} />
                <KVRow k="Memory" v={`${sel.ram.toFixed(1)} MB`} />
                <KVRow k="Network" v={`${sel.net.toFixed(1)} KB/s`} />
                <KVRow k="Disk I/O" v={`${sel.io.toFixed(1)} op/s`} />
                <KVRow k="Base CPU" v={`${sel.base.cpu.toFixed(1)}%`} />
                <KVRow k="Window" v={sel.windowId ?? "—"} />
                <KVRow k="Started" v={new Date(sel.startedAt).toLocaleTimeString()} />
              </div>
              <div className="col" style={{ gap: 4 }}>
                <span className="tiny dim semi">SIMULATED LOAD BIAS</span>
                <input
                  type="range"
                  min={0.4}
                  max={3}
                  step={0.1}
                  value={sel.load}
                  onChange={(e) => {
                    sel.load = Number(e.target.value);
                    n.proc.bus.emit("change");
                    n.markDirty("proc");
                  }}
                />
                <span className="tiny dim">Drag to make this process demand more or less of the machine.</span>
              </div>
              <Btn variant="danger" onClick={() => endTask(sel)}>End task</Btn>
            </div>
          ) : (
            <div className="small dim" style={{ padding: 20, textAlign: "center" }}>
              Select a process in the Processes tab to inspect it.
            </div>
          )}
        </div>
      )}

      <div className="app-status">
        <Badge tone="ok">{n.proc.list().filter((p) => p.state === "running").length} running</Badge>
        <span>CPU {s.cpuLoad.toFixed(0)}%</span>
        <span>MEM {(s.memUsed / 1024).toFixed(1)}/{(s.memTotal / 1024).toFixed(0)} GB</span>
        <span>DISK {fmtBytes(s.diskUsed * 1024 * 1024)}</span>
        <span className="spacer" />
        <span className="dim">Uptime {Math.floor(s.uptimeMs / 60000)}m</span>
      </div>
    </div>
  );
}

function KVRow({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span className="mono">{v}</span>
    </div>
  );
}

function PerfCard({ title, detail, pct, sub }: { title: string; detail: string; pct: number; sub: string }) {
  return (
    <div className="panel-flat col center" style={{ padding: 14, gap: 6, minWidth: 158 }}>
      <span className="small semi">{title}</span>
      <Ring pct={pct} size={92} sub={sub} />
      <span className="tiny dim mono ellipsis" style={{ maxWidth: 150 }}>{detail}</span>
    </div>
  );
}

function compare(a: Process, b: Process, by: "cpu" | "mem" | "pid" | "name"): number {
  if (by === "cpu") return a.cpu - b.cpu;
  if (by === "mem") return a.ram - b.ram;
  if (by === "pid") return a.pid - b.pid;
  return a.name.localeCompare(b.name);
}

function stateDot(state: Process["state"]): string {
  return state === "running" ? "🟢" : state === "sleeping" ? "🟡" : "⭕";
}
