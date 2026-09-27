import { useEffect, useMemo, useRef, useState } from "react";
import { nova } from "../core/nova";
import { Btn, Panel } from "../ui/primitives";
import { useNovaContext } from "./wm";
import type { BootLine, NovaUser, Session } from "./types";

const ACCOUNTS: NovaUser[] = [
  { name: "user", role: "user", home: "/home/user", shell: "/bin/nova-shell", uid: "1000" },
  { name: "admin", role: "admin", home: "/home/admin", shell: "/bin/nova-shell", uid: "0" },
  { name: "guest", role: "guest", home: "/home/guest", shell: "/bin/nova-shell", uid: "65534" },
];

type Phase = Session["phase"];

export function Boot({ onDesktop }: { onDesktop: (u: NovaUser) => void }) {
  const [phase, setPhase] = useState<Phase>("bios");
  const [logs, setLogs] = useState<BootLine[]>([]);
  const [user, setUser] = useState<NovaUser>(ACCOUNTS[0]);
  const { setSettings } = useNovaContext();
  const t0 = useRef(performance.now());

  const elapsed = () => (performance.now() - t0.current) / 1000;

  const push = (text: string, kind: BootLine["kind"] = "info") => {
    setLogs((prev) => [...prev, { t: elapsed(), text, kind }].slice(-60));
  };

  // ------------------------------------------------------------ power-on
  useEffect(() => {
    let cancelled = false;
    const n = nova();
    n.start();
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    at(600, () => push("NOVA BIOS v6.4.0 — (C) Nova Computing", "info"));
    at(900, () => push("CPU0: NOVA N9-8C @ 4.20GHz  8 cores / 16 threads", "ok"));
    at(1150, () => push("Memory test: 16384MB OK  (16 banks, 6400 MT/s)", "ok"));
    at(1400, () => push("Detected nova-tensor TPU-4 accelerator", "ok"));
    at(1650, () => push("Storage: NVMe 512GB  novafs4  healthy", "ok"));
    at(1900, () => push("NIC0: virtio-net  52:54:00:12:34:56", "ok"));
    at(2100, () => push("Region attachment: aurora-n1 (12ms)", "ok"));
    at(2400, () => push("Press DEL to enter setup  •  F12 boot menu", "info"));
    at(2800, () => {
      if (cancelled) return;
      setPhase("bootloader");
      push("── nova-bootloader ──────────────────────────", "info");
    });

    at(3000, () => push("GRUB-compatible loader 0.9.14", "info"));
    at(3200, () => push("Loading /system/kernel/kernel.bin ........ ok", "ok"));
    at(3500, () => push("Loading /system/drivers/net.ko ............ ok", "ok"));
    at(3800, () => push("Loading /system/drivers/gfx.ko ........... ok", "ok"));
    at(4100, () => {
      if (cancelled) return;
      setPhase("kernel");
      push("── nova-kernel 6.4.0 ───────────────────────", "info");
    });
    at(4250, () => push("smp: bringing up 8 cpus .......................... ok", "ok"));
    at(4450, () => push("sched: cfs initialised, 4.20GHz nominal", "ok"));
    at(4650, () => push("mm: buddy allocator, 16 banks, overcommit on", "ok"));
    at(4900, () => push("net: virtio-net registered, virtio-pci bus", "ok"));
    at(5100, () => push("fs: novafs4 mounted read-write on /", "ok"));
    at(5350, () => push("init: starting system services", "ok"));
    at(5600, () => push("systemd 1/10  nova-shell ................. started", "ok"));
    at(5800, () => push("systemd 2/10  network_service.exe ....... started", "ok"));
    at(6000, () => push("systemd 3/10  cloud_sync.exe ............. started", "ok"));
    at(6200, () => push("systemd 4/10  dns_service.exe ............. started", "ok"));
    at(6400, () => push("systemd 5/10  database.exe ................ started", "ok"));
    at(6600, () => push("systemd 6/10  city_sim.exe ................ started", "ok"));
    at(6800, () => push("systemd 7/10  robot_lab.exe .............. started", "ok"));
    at(7000, () => push("systemd 8/10  metricsd ................... started", "ok"));
    at(7200, () => push("systemd 9/10  indexer.exe ................ started", "ok"));
    at(7450, () => push("nova-cloud: attached to aurora-n1, quota 64GB", "ok"));
    at(7650, () => push("Reached target multi-user. Starting nova-shell...", "ok"));
    at(7900, () => {
      if (cancelled) return;
      setPhase("login");
    });

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // login hands off to the desktop
  const signIn = (u: NovaUser) => {
    setUser(u);
    setSettings({ username: u.name });
    setPhase("desktop");
    onDesktop(u);
  };

  return (
    <div
      className="nova-root"
      style={{
        background:
          "radial-gradient(900px 600px at 50% -10%, rgba(56,189,248,0.18), transparent 60%), #03060c",
        display: "grid",
        placeItems: "center",
        color: "#cfe4ff",
        fontFamily: "var(--mono)",
      }}
    >
      <BootBackdrop phase={phase} />
      {phase === "bios" && <BiosScreen />}
      {phase === "bootloader" && <LoaderScreen title="nova-bootloader" pct={0.4} lines={logs} />}
      {phase === "kernel" && <LoaderScreen title="nova-kernel 6.4.0" pct={0.75} lines={logs} />}
      {phase === "login" && <LoginScreen onSignIn={signIn} />}
      <div className="col" style={{ gap: 4, padding: 14, position: "absolute", right: 12, bottom: 10, textAlign: "right" }}>
        <div className="tiny" style={{ opacity: 0.5 }}>
          {phase === "login" ? "Press Enter to sign in as " + user.name : "NOVA CLOUD PC · region aurora-n1"}
        </div>
      </div>
    </div>
  );
}

function BootBackdrop({ phase }: { phase: Phase }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(120,180,255,0.035) 0 1px, transparent 1px 3px)",
        pointerEvents: "none",
        opacity: phase === "login" ? 0.4 : 1,
      }}
    />
  );
}

function BiosScreen() {
  const lines = useMemo(() => {
    return [
      "NOVA BIOS Configuration",
      "",
      "System  ─────────────────────────────────────────",
      "  Machine            NOVA CLOUD PC (virtual)",
      "  Firmware           6.4.0  2026-04-18",
      "  Serial             NC-7F3A-2291-88",
      "  SKU                NC-AURORA-N1",
      "",
      "Processor ───────────────────────────────────────",
      "  Model              NOVA N9-8C",
      "  Cores / Threads    8 / 16  @ 4.20 GHz",
      "  Cache              L2 8MB  L3 32MB",
      "  Accelerator        nova-tensor TPU-4 (64 TOPS)",
      "",
      "Memory ──────────────────────────────────────────",
      "  Total              16384 MB",
      "  Speed              6400 MT/s",
      "  ECC                enabled",
      "",
      "Storage ─────────────────────────────────────────",
      "  nova-nvme-0       512 GB  novafs4",
      "",
      "Network ─────────────────────────────────────────",
      "  virtio-net0        52:54:00:12:34:56",
      "  Cloud attachment   aurora-n1",
      "",
    ];
  }, []);

  return (
    <div style={{ position: "relative", width: "min(720px, 92vw)", animation: "fadeIn 200ms" }}>
      <div style={{ color: "#7dd3fc", marginBottom: 10, fontWeight: 700 }}>╔══════════════════════════════════════════════╗</div>
      <pre
        style={{
          margin: 0,
          fontSize: 12.5,
          lineHeight: 1.55,
          color: "#a8c8f0",
          textShadow: "0 0 12px rgba(90,160,255,0.35)",
        }}
      >
        {lines.join("\n")}
      </pre>
      <div className="row" style={{ gap: 6, marginTop: 10, height: 20 }}>
        <span style={{ color: "#7dd3fc" }}>{"▮".repeat(1)}</span>
      </div>
    </div>
  );
}

function LoaderScreen({ title, pct, lines }: { title: string; pct: number; lines: BootLine[] }) {
  const recent = lines.slice(-13);
  return (
    <div style={{ position: "relative", width: "min(720px, 92vw)" }}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <span style={{ color: "#7dd3fc", fontWeight: 700 }}>{title}</span>
        <span className="tiny" style={{ opacity: 0.6 }}>{Math.round(pct * 100)}%</span>
      </div>
      <div style={{ height: 6, background: "rgba(120,180,255,0.14)", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}>
        <div
          style={{
            height: "100%",
            width: `${pct * 100}%`,
            background: "linear-gradient(90deg, #38bdf8, #a78bfa)",
            transition: "width 500ms cubic-bezier(0.2,0,0.2,1)",
          }}
        />
      </div>
      <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.5, minHeight: 240, color: "#8fb8e8" }}>
        {recent.map((l, i) => (
          <div
            key={`${i}-${l.text}`}
            style={{
              color:
                l.kind === "ok" ? "#6ee7b7" : l.kind === "warn" ? "#fcd34d" : l.kind === "err" ? "#fca5a5" : "#8fb8e8",
            }}
          >
            <span style={{ opacity: 0.45 }}>[{l.t.toFixed(3).padStart(6)}] </span>
            {l.text}
          </div>
        ))}
      </pre>
    </div>
  );
}

function LoginScreen({ onSignIn }: { onSignIn: (u: NovaUser) => void }) {
  const [idx, setIdx] = useState(0);
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { settings, setSettings } = useNovaContext();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const attempt = () => {
    const u = ACCOUNTS[idx];
    if (u.role === "admin" && pw !== "nova") {
      setError("Incorrect password for admin — hint: nova");
      return;
    }
    setError("");
    setBusy(true);
    window.setTimeout(() => onSignIn(u), 620);
  };

  return (
    <Panel
      pad={0}
      style={{
        position: "relative",
        width: "min(400px, 92vw)",
        overflow: "hidden",
        animation: "pop 320ms cubic-bezier(0.2,0,0.2,1)",
        fontFamily: "var(--font)",
      }}
    >
      <div
        style={{
          padding: "26px 24px 20px",
          background: "linear-gradient(150deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="col center" style={{ gap: 8, textAlign: "center" }}>
          <div
            className="col center"
            style={{
              width: 52, height: 52, borderRadius: 14,
              background: "linear-gradient(140deg, var(--accent), var(--accent-2))",
              color: "#04121c", fontWeight: 800, fontSize: 22,
              boxShadow: "0 8px 24px -6px color-mix(in srgb, var(--accent) 60%, transparent)",
            }}
          >
            N
          </div>
          <div>
            <div className="huge" style={{ fontSize: 20 }}>NOVA CLOUD PC</div>
            <div className="small dim">Sign in to your cloud computer</div>
          </div>
        </div>
      </div>

      <div className="col" style={{ padding: 18, gap: 12 }}>
        <div className="row" style={{ gap: 6 }}>
          {ACCOUNTS.map((a, i) => (
            <button
              key={a.name}
              onClick={() => {
                setIdx(i);
                setError("");
                inputRef.current?.focus();
              }}
              className="col center grow"
              style={{
                gap: 4,
                padding: "9px 4px",
                borderRadius: 10,
                border: `1px solid ${i === idx ? "var(--accent)" : "var(--border)"}`,
                background: i === idx ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
                color: "var(--text)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <span style={{ fontSize: 18 }}>{a.role === "admin" ? "🛡" : a.role === "guest" ? "👤" : "🧑‍💻"}</span>
              <span className="tiny semi">{a.name}</span>
              <span className="tiny dim" style={{ textTransform: "capitalize" }}>{a.role}</span>
            </button>
          ))}
        </div>

        <div className="col" style={{ gap: 4 }}>
          <span className="tiny dim semi">PASSWORD</span>
          <input
            ref={inputRef}
            className="input"
            type="password"
            value={pw}
            placeholder={ACCOUNTS[idx].role === "admin" ? "admin password" : "any password (Enter to continue)"}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && attempt()}
            style={{ padding: "8px 10px" }}
            aria-label="Password"
          />
          {error && <span className="tiny" style={{ color: "var(--err)" }}>{error}</span>}
        </div>

        <Btn
          variant="primary"
          onClick={attempt}
          disabled={busy}
          style={{ width: "100%", justifyContent: "center", padding: "9px 0", fontSize: 13 }}
        >
          {busy ? "Authenticating…" : `Sign in as ${ACCOUNTS[idx].name}`}
        </Btn>

        <div className="tiny dim" style={{ textAlign: "center" }}>
          Tip: admin password is <span className="mono">nova</span>. Your machine is saved automatically.
        </div>

        <label className="row tiny dim" style={{ gap: 6, justifyContent: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.clock24}
            onChange={(e) => setSettings({ clock24: e.target.checked })}
            style={{ accentColor: "var(--accent)" }}
          />
          24-hour clock
        </label>
      </div>
    </Panel>
  );
}

export { ACCOUNTS };

if (typeof document !== "undefined" && !document.getElementById("nova-keyframes")) {
  const el = document.createElement("style");
  el.id = "nova-keyframes";
  el.textContent = `@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`;
  document.head.appendChild(el);
}
