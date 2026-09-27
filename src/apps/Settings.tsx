import { useMemo, useState } from "react";
import { useNovaContext } from "../os/wm";
import { useKernel } from "../os/hooks";
import { Badge, Btn, KV, Modal, Seg, Slider, Toggle } from "../ui/primitives";
import { APP_LIST, GROUPS } from "../os/registry";
import { fmtBytes } from "../core/rng";
import { nova } from "../core/nova";

type Section = "appearance" | "desktop" | "machine" | "network" | "city" | "data" | "about";

const WALLPAPERS: { id: string; label: string; css: string }[] = [
  { id: "aurora", label: "Aurora", css: "linear-gradient(140deg,#0ea5e9,#8b5cf6 55%,#10b981)" },
  { id: "mesh", label: "Mesh", css: "linear-gradient(140deg,#1e293b,#0ea5e9 60%,#f472b6)" },
  { id: "grid", label: "Blueprint", css: "linear-gradient(140deg,#0b1220,#1e3a5f 60%,#0ea5e9)" },
  { id: "carbon", label: "Carbon", css: "linear-gradient(140deg,#111827,#4f46e5 60%,#0f172a)" },
];

const ACCENTS = ["#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#fbbf24", "#fb7185", "#22d3ee", "#f59e0b"];

export function SettingsApp(_props: { args: Record<string, unknown> }) {
  const wm = useNovaContext();
  const n = useKernel();
  const [section, setSection] = useState<Section>("appearance");
  const [confirmReset, setConfirmReset] = useState(false);
  const s = wm.settings;
  const sys = n.system;
  const count = useMemo(() => n.fs.count(), [n.rev, n.fs]);

  return (
    <div className="app-shell">
      <div className="row grow" style={{ minHeight: 0 }}>
        <div className="sidebar" style={{ width: 170 }}>
          {([
            ["appearance", "🎨", "Appearance"],
            ["desktop", "🖥", "Desktop"],
            ["machine", "🧠", "Machine"],
            ["network", "🌐", "Network"],
            ["city", "🏙", "City"],
            ["data", "💾", "Data"],
            ["about", "ℹ️", "About"],
          ] as [Section, string, string][]).map(([id, icon, label]) => (
            <button key={id} className="sidebar-item" aria-current={section === id} onClick={() => setSection(id)}>
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="scroll grow" style={{ padding: 16 }}>
          {section === "appearance" && (
            <div className="col" style={{ gap: 16 }}>
              <SectionTitle title="Theme" sub="Applies instantly across every window." />
              <Seg
                value={s.theme}
                onChange={(v) => wm.setSettings({ theme: v })}
                options={[
                  { value: "dark", label: "🌙 Dark" },
                  { value: "light", label: "☀️ Light" },
                ]}
              />

              <div className="col" style={{ gap: 6 }}>
                <span className="tiny dim semi">ACCENT</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      onClick={() => wm.setSettings({ accent: c })}
                      aria-label={`Accent ${c}`}
                      style={{
                        width: 26, height: 26, borderRadius: 8, background: c, cursor: "pointer",
                        border: s.accent === c ? "2px solid var(--text)" : "2px solid transparent",
                        boxShadow: s.accent === c ? "0 0 0 2px var(--panel-solid)" : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="col" style={{ gap: 6 }}>
                <span className="tiny dim semi">WALLPAPER</span>
                <div className="row wrap" style={{ gap: 8 }}>
                  {WALLPAPERS.map((wp) => (
                    <button
                      key={wp.id}
                      onClick={() => wm.setSettings({ wallpaper: wp.id })}
                      className="col"
                      style={{
                        gap: 5, padding: 0, border: 0, background: "none", cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          width: 96, height: 58, borderRadius: 8, background: wp.css, display: "block",
                          border: s.wallpaper === wp.id ? "2px solid var(--accent)" : "1px solid var(--border)",
                        }}
                      />
                      <span className="tiny dim">{wp.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="hr" />
              <Toggle
                checked={s.reduceMotion}
                onChange={(v) => wm.setSettings({ reduceMotion: v })}
                label="Reduce motion (fewer animations)"
              />
              <Toggle
                checked={s.showCpu}
                onChange={(v) => wm.setSettings({ showCpu: v })}
                label="Show CPU and memory in the taskbar"
              />
              <Toggle
                checked={s.clock24}
                onChange={(v) => wm.setSettings({ clock24: v })}
                label="24-hour clock"
              />
            </div>
          )}

          {section === "desktop" && (
            <div className="col" style={{ gap: 14 }}>
              <SectionTitle title="Start-up" sub="Windows opened automatically after sign-in." />
              <div className="col" style={{ gap: 5 }}>
                {APP_LIST.map((a) => (
                  <Toggle
                    key={a.id}
                    checked={s.autoStartApps.includes(a.id)}
                    onChange={(v) =>
                      wm.setSettings({
                        autoStartApps: v
                          ? [...s.autoStartApps, a.id]
                          : s.autoStartApps.filter((x) => x !== a.id),
                      })
                    }
                    label={`${a.icon}  ${a.name}`}
                  />
                ))}
              </div>
              <div className="hr" />
              <SectionTitle title="Windows" sub="Arrange what is open right now." />
              <div className="row wrap" style={{ gap: 6 }}>
                <Btn onClick={wm.cascade}>Tile windows</Btn>
                <Btn onClick={wm.closeAll}>Close all windows</Btn>
                <span className="tiny dim" style={{ alignSelf: "center" }}>{wm.windows.length} open</span>
              </div>
              <div className="hr" />
              <SectionTitle title="Applications" sub="Everything installed on NOVAOS." />
              <div className="col" style={{ gap: 6 }}>
                {GROUPS.map((g) => (
                  <div key={g.id}>
                    <div className="tiny dim semi" style={{ marginBottom: 4 }}>{g.label}</div>
                    <div className="row wrap" style={{ gap: 5 }}>
                      {APP_LIST.filter((a) => a.group === g.id).map((a) => (
                        <Btn key={a.id} size="sm" onClick={() => wm.openApp(a.id)}>
                          {a.icon} {a.name}
                        </Btn>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === "machine" && (
            <div className="col" style={{ gap: 14 }}>
              <SectionTitle title="Hardware" sub="Detected at boot by the BIOS." />
              <div className="panel-flat" style={{ padding: 12 }}>
                <KV k="Machine" v="NOVA CLOUD PC" />
                <KV k="Processor" v="NOVA N9-8C @ 4.20GHz" />
                <KV k="Cores / threads" v={`${sys.cores} / ${sys.cores * 2}`} />
                <KV k="Memory" v={`${(sys.memTotal / 1024).toFixed(0)} GiB`} />
                <KV k="Storage" v={`${(sys.diskTotal / 1024).toFixed(0)} GiB novafs4`} />
                <KV k="Accelerator" v="NovaTensor TPU-4" />
                <KV k="Region" v={n.cloud.region} />
                <KV k="Temperature" v={`${sys.tempC.toFixed(1)} °C`} />
                <KV k="Uptime" v={`${Math.floor(sys.uptimeMs / 60000)} min`} />
              </div>
              <SectionTitle title="Load" sub="Live from the process manager." />
              <Slider label="City simulation speed" min={0} max={600} step={30} value={n.citySpeed} format={(v) => (v === 0 ? "paused" : `${v}× real time`)} onChange={(v) => { n.citySpeed = v; wm.setSettings({ citySpeed: v }); }} />
              <div className="panel-flat" style={{ padding: 12 }}>
                <KV k="Processes" v={n.proc.list().length} />
                <KV k="Memory in use" v={`${(sys.memUsed / 1024).toFixed(2)} GiB`} />
                <KV k="Network down" v={`${sys.netDown.toFixed(0)} KB/s`} />
                <KV k="Network up" v={`${sys.netUp.toFixed(0)} KB/s`} />
                <KV k="Render rate" v={`${wm.fps} fps`} />
              </div>
            </div>
          )}

          {section === "network" && (
            <div className="col" style={{ gap: 14 }}>
              <SectionTitle title="Simulated fabric" sub="Every app routes through this." />
              <div className="panel-flat" style={{ padding: 12 }}>
                <KV k="Devices" v={n.net.devices.size} />
                <KV k="Links" v={n.net.links.size} />
                <KV k="Packets in flight" v={n.net.packets.length} />
                <KV k="Captured packets" v={n.net.log.length} />
                <KV k="Cloud servers" v={n.cloud.servers.length} />
                <KV k="Region zone" v={n.cloud.metrics().zone} />
              </div>
              <Btn onClick={() => wm.openApp("netlab")}>Open Mini Internet Lab →</Btn>
            </div>
          )}

          {section === "city" && (
            <div className="col" style={{ gap: 14 }}>
              <SectionTitle title="Aurora" sub="The simulated city running inside this machine." />
              <Slider
                label="Simulation speed"
                min={0}
                max={600}
                step={30}
                value={n.citySpeed}
                format={(v) => (v === 0 ? "paused" : `${v}×`)}
                onChange={(v) => {
                  n.citySpeed = v;
                  wm.setSettings({ citySpeed: v });
                }}
              />
              <div className="panel-flat" style={{ padding: 12 }}>
                <KV k="Day" v={`${n.city.day} (${n.city.stats().weekday})`} />
                <KV k="Clock" v={n.city.stats().clock} />
                <KV k="Weather" v={`${n.city.weather.kind} ${n.city.weather.tempC}°C`} />
                <KV k="Agents" v={n.city.npcs.length} />
                <KV k="Buildings" v={n.city.buildings.length} />
                <KV k="Deployed robots" v={n.city.deployedRobots.length} />
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                {(["sunny", "cloudy", "rain", "storm"] as const).map((w) => (
                  <Btn key={w} size="sm" onClick={() => n.city.applyWeather(w)}>
                    {w[0].toUpperCase() + w.slice(1)}
                  </Btn>
                ))}
              </div>
              <Btn onClick={() => wm.openApp("city")}>Open Virtual City →</Btn>
            </div>
          )}

          {section === "data" && (
            <div className="col" style={{ gap: 14 }}>
              <SectionTitle title="Storage" sub="The unified filesystem plus the cloud bucket." />
              <div className="panel-flat" style={{ padding: 12 }}>
                <KV k="Files" v={count.files} />
                <KV k="Directories" v={count.dirs} />
                <KV k="Tree size" v={fmtBytes(n.fs.usedBytes())} />
                <KV k="Cloud quota" v={`${n.cloud.quotaGb} GB`} />
                <KV k="Cloud used" v={`${n.cloud.storageUsedGb().toFixed(2)} GB`} />
                <KV k="NovaDB tables" v={n.db.tableNames().length} />
                <KV k="Last save" v={localStorage.getItem("nova-cloud-pc:v1") ? "saved" : "not yet saved"} />
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <Btn variant="primary" onClick={() => { n.persist(); wm.notify({ title: "Saved", body: "Machine state written to local storage", tone: "ok" }); }}>
                  Save now
                </Btn>
                <Btn onClick={() => n.cloud.syncAll()}>Sync everything to cloud</Btn>
                <Btn variant="danger" onClick={() => setConfirmReset(true)}>Factory reset</Btn>
              </div>
              <div className="small dim">
                The whole machine — filesystem, database, network topology, cloud servers, robots and
                city state — is saved to this browser and restored on your next visit.
              </div>
            </div>
          )}

          {section === "about" && (
            <div className="col" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 12, alignItems: "center" }}>
                <div
                  className="col center"
                  style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(140deg, var(--accent), var(--accent-2))", color: "#04121c", fontWeight: 800, fontSize: 22 }}
                >
                  N
                </div>
                <div className="col" style={{ gap: 1 }}>
                  <span className="huge" style={{ fontSize: 18 }}>NOVA CLOUD PC</span>
                  <span className="small dim">One simulated cloud computer · version 1.0.0</span>
                </div>
              </div>
              <div className="panel-flat" style={{ padding: 12 }}>
                <KV k="Kernel" v="nova-kernel 6.4.0" />
                <KV k="Shell" v="nova-shell 6.4.0" />
                <KV k="Components" v="NOVAOS, Internet, Net Lab, Robot Lab, City, Cloud" />
                <KV k="Region" v={n.cloud.region} />
                <KV k="Render rate" v={`${wm.fps} fps`} />
                <KV k="Signed in as" v={s.username} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Badge tone="ok">all services running</Badge>
                <Badge tone="info">{n.proc.list().length} processes</Badge>
                <Badge>{count.files} files</Badge>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Factory reset?"
        width={420}
        footer={
          <>
            <Btn onClick={() => setConfirmReset(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => nova().factoryReset()}>Erase and reboot</Btn>
          </>
        }
      >
        <p className="small">
          This deletes the entire saved machine: every file you created, the network topology, your cloud
          servers, robot configurations and the city&apos;s current state. It cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="col" style={{ gap: 1 }}>
      <strong style={{ fontSize: 13.5 }}>{title}</strong>
      {sub && <span className="tiny dim">{sub}</span>}
    </div>
  );
}
