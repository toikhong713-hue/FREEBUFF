// NOVA CLOUD PC kernel. One instance owns every subsystem, runs a single
// fixed-timestep simulation ticker, and persists the whole machine.
import { EventBus } from "./bus";
import { Cloud } from "./cloud";
import { Database, TABLES } from "./db";
import { FileSystem } from "./fs";
import { Network } from "./net";
import { ProcessManager, type SystemSnapshot } from "./proc";
import { City } from "./city";
import { RobotLab } from "./robots";
import { seedWorld } from "./world";
import { configDerived, defaultConfig, type RobotConfig } from "./robots";

const STORAGE_KEY = "nova-cloud-pc:v1";
const TICK_MS = 50; // 20 Hz simulation

export interface NovaSnapshot {
  bootedAt: number;
  system: SystemSnapshot;
  rev: number;
}

export class Nova {
  readonly bus = new EventBus();
  readonly fs = new FileSystem();
  readonly db = new Database();
  readonly proc = new ProcessManager();
  readonly net = new Network();
  readonly cloud: Cloud;
  readonly robots: RobotLab;
  readonly city: City;

  /** bumped whenever something observable changes, drives React re-renders */
  rev = 0;
  system: SystemSnapshot;
  citySpeed = 60;
  restored = false;
  private timer: number | null = null;
  private lastTick = 0;
  private accumulator = 0;
  private dirty = new Set<string>();
  private eventCounter = 0;

  constructor() {
    this.cloud = new Cloud(this.db, this.fs);
    this.robots = new RobotLab(this.db, this.fs);
    this.city = new City(this.db);
    seedWorld(this.db, this.net);
    this.seedSystemFiles();
    this.system = this.proc.tick(0);
    this.bootServices();
  }

  // ------------------------------------------------------------------ boot

  /** Bring up the background services that make Task Manager look alive. */
  bootServices(): void {
    const svcs = [
      { name: "systemd", appId: "system", title: "NOVA init", cpu: 1.2, ram: 88, net: 1, io: 3 },
      { name: "nova-shell", appId: "shell", title: "NOVA Shell", cpu: 2.4, ram: 180, net: 2, io: 6 },
      { name: "cloud_sync.exe", appId: "cloud", title: "Cloud Sync", cpu: 0.8, ram: 96, net: 12, io: 22 },
      { name: "network_service.exe", appId: "netmgr", title: "Network Service", cpu: 1.6, ram: 140, net: 26, io: 8 },
      { name: "dns_service.exe", appId: "netlab", title: "nova-dns", cpu: 0.6, ram: 72, net: 9, io: 4 },
      { name: "database.exe", appId: "cloud", title: "NovaDB engine", cpu: 2.1, ram: 512, net: 8, io: 30 },
      { name: "city_sim.exe", appId: "city", title: "Aurora City Simulation", cpu: 7.5, ram: 640, net: 3, io: 14 },
      { name: "robot_lab.exe", appId: "robots", title: "Robot Lab Runtime", cpu: 5.2, ram: 420, net: 6, io: 10 },
      { name: "metricsd", appId: "system", title: "Metrics daemon", cpu: 0.9, ram: 64, net: 1, io: 5 },
      { name: "indexer.exe", appId: "system", title: "Search indexer", cpu: 3.1, ram: 260, net: 2, io: 40 },
    ];
    for (const s of svcs) this.proc.spawn(s);
  }

  private seedSystemFiles(): void {
    const now = new Date();
    this.fs.write(
      "/system/kernel/kernel.log",
      [
        `[${new Date(now.getTime() - 4200).toISOString()}] nova-kernel 6.4.0 loading`,
        `[${new Date(now.getTime() - 4100).toISOString()}] memory 16384MB detected (16 banks)`,
        `[${new Date(now.getTime() - 3900).toISOString()}] 8 cores online, SMT enabled`,
        `[${new Date(now.getTime() - 3100).toISOString()}] mounting /system (ro)`,
        `[${new Date(now.getTime() - 2900).toISOString()}] starting network_service.exe`,
        `[${new Date(now.getTime() - 2800).toISOString()}] starting cloud_sync.exe`,
        `[${new Date(now.getTime() - 2000).toISOString()}] aurora-n1 region attached`,
        `[${new Date(now.getTime() - 1000).toISOString()}] all subsystems ready`,
        `[${new Date().toISOString()}] nova-shell handed off to user session`,
        "",
      ].join("\n"),
      { origin: "os" },
    );
    this.fs.write(
      "/system/sysinfo.json",
      JSON.stringify(
        {
          machine: "NOVA CLOUD PC",
          kernel: "nova-kernel 6.4.0",
          arch: "x86_64-v2",
          region: "aurora-n1",
          cores: 8,
          memoryMb: 16384,
          storageGb: 512,
          accelerator: "NovaTensor TPU-4",
          services: 10,
        },
        null,
        2,
      ),
      { origin: "os" },
    );
    this.fs.write(
      "/home/user/Documents/welcome.md",
      [
        "# Welcome to NOVA CLOUD PC",
        "",
        "This is one simulated computer. Everything you see is one kernel talking to itself:",
        "",
        "- **NOVAOS** — this desktop, the terminal, the process table",
        "- **Fake internet** — a browser with real sites, backed by the same database",
        "- **Mini Internet Lab** — a live topology with routing, firewalls and packets",
        "- **AI Robot Lab** — robots that log to `/robots/`, and can be deployed to the city",
        "- **Virtual City** — 200+ NPCs with schedules, traffic, weather and an economy",
        "- **Cloud Services** — storage, servers, database, accounts",
        "",
        "Try these:",
        "",
        "```",
        "ls /network",
        "ping 10.0.0.1",
        "robots list",
        "city stats",
        "netstat",
        "cat /robots/scout01/telemetry/telemetry.log",
        "```",
        "",
      ].join("\n"),
      { origin: "os" },
    );
    this.fs.mkdirp("/network/topology", { origin: "net" });
    this.fs.mkdirp("/network/packets", { origin: "net" });
    this.fs.mkdirp("/websites/my-site.nova", { origin: "web" });
    this.fs.write(
      "/websites/my-site.nova/index.html",
      "<!doctype html><html><head><title>My Site</title></head><body><h1>My Site</h1><p>Served from the Mini Internet Lab edge-web device.</p></body></html>",
      { origin: "web" },
    );
    this.fs.mkdirp("/city/reports", { origin: "city" });
    this.fs.mkdirp("/cloud/bucket", { origin: "cloud" });
    this.fs.mkdirp("/robots", { origin: "robot" });
    this.fs.mkdirp("/documents", { origin: "user" });
    this.fs.mkdirp("/downloads", { origin: "user" });
    this.fs.mkdirp("/projects", { origin: "user" });

    // starter robot config so the lab is never empty
    this.robots.saveConfig(defaultConfig("Scout-01"));
    this.robots.saveConfig({
      ...defaultConfig("Hauler-02"),
      parts: {
        cpu: "cpu-x9",
        ram: "ram-32",
        gpu: "gpu-v4",
        storage: "ssd-512",
        battery: "bat-60",
        sensor: "sen-depth",
        motor: "mot-heavy",
        comm: "com-5g",
        cooling: "cool-liquid",
      },
      behaviour: "work",
      color: "#f472b6",
      notes: "Payload hauler with an arm.",
    });
  }

  // ----------------------------------------------------------------- ticker

  start(): void {
    if (this.timer !== null) return;
    this.lastTick = performance.now();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const now = performance.now();
    let dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    if (dt > 0.5) dt = 0.5; // recover gracefully from a background tab
    this.accumulator += dt;

    const step = TICK_MS / 1000;
    let guard = 0;
    while (this.accumulator >= step && guard++ < 6) {
      this.accumulator -= step;
      this.net.step(step);
      this.robots.step(step);
      this.city.step(step, this.citySpeed);
      this.cloud.step();
    }

    this.eventCounter++;
    if (this.eventCounter % 4 === 0) {
      this.system = this.proc.tick(this.fs.usedBytes());
    }
    if (this.eventCounter % 20 === 0) {
      this.city.tickEvents();
      this.persistSoon();
    }

    this.rev++;
    this.bus.emit("tick", this.snapshot());
  }

  snapshot(): NovaSnapshot {
    return { bootedAt: this.proc.bootAt, system: this.system, rev: this.rev };
  }

  markDirty(topic: string): void {
    this.dirty.add(topic);
    this.rev++;
  }

  // ------------------------------------------------------------ persistence

  private persistTimer: number | null = null;
  private persistSoon(): void {
    if (this.persistTimer !== null) return;
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, 1500);
  }

  persist(): void {
    try {
      const payload = {
        v: 1,
        savedAt: Date.now(),
        fs: this.fs.serialize(),
        db: this.db.serialize(),
        net: this.net.serialize(),
        cloud: {
          servers: this.cloud.servers,
          accounts: this.cloud.accounts,
          quotaGb: this.cloud.quotaGb,
          region: this.cloud.region,
        },
        city: {
          minutes: this.city.minutes,
          day: this.city.day,
          weather: this.city.weather,
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      this.markDirty("persist");
    } catch (err) {
      console.warn("[nova] persist failed", err);
    }
  }

  restore(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as any;
      if (!data || data.v !== 1) return false;
      this.fs.load(data.fs);
      this.db.load(data.db);
      this.net.load(data.net);
      if (Array.isArray(data.cloud?.servers) && data.cloud.servers.length) {
        this.cloud.servers = data.cloud.servers;
      }
      if (Array.isArray(data.cloud?.accounts) && data.cloud.accounts.length) {
        this.cloud.accounts = data.cloud.accounts;
      }
      if (typeof data.cloud?.quotaGb === "number") this.cloud.quotaGb = data.cloud.quotaGb;
      if (typeof data.cloud?.region === "string") this.cloud.region = data.cloud.region;
      if (typeof data.city?.minutes === "number") this.city.minutes = data.city.minutes;
      if (typeof data.city?.day === "number") this.city.day = data.city.day;
      if (data.city?.weather) this.city.weather = data.city.weather;
      return true;
    } catch (err) {
      console.warn("[nova] restore failed", err);
      return false;
    }
  }

  factoryReset(): void {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  hasSave(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  // ------------------------------------------------------- shared app APIs

  /** Write a browser "page" into the unified filesystem (websites + cloud). */
  publishPage(host: string, _title: string, body: string, origin = "web"): string {
    const path = `/websites/${host}/index.html`;
    this.fs.mkdirp(`/websites/${host}`, { origin });
    this.fs.write(path, body, { origin });
    this.markDirty("web");
    return path;
  }

  /** Make a hosted page reachable from the browser's address bar. */
  publishToNetwork(host: string, title: string, body: string): boolean {
    const dev = Array.from(this.net.devices.values()).find((d) => d.type === "web");
    if (!dev) return false;
    dev.http = { host, title, kind: "custom", body, port: 80 };
    this.publishPage(host, title, body);
    this.net.bus.emit("change");
    this.markDirty("net");
    return true;
  }

  /** Ship a robot's telemetry into the cloud bucket and the shared filesystem. */
  uploadRobotTelemetry(robotId: string): { path: string; synced: boolean; id: string } | null {
    const r = this.robots.robots.find((x) => x.id === robotId);
    if (!r) return null;
    const logPath = this.robots.writeTelemetry(r);
    if (!logPath) return null;
    const fullPath = `/cloud/bucket${logPath}.log`;
    this.fs.mkdirp(fullPath.slice(0, fullPath.lastIndexOf("/")), { origin: "cloud" });
    this.fs.write(fullPath, this.robots.fullLog(r), { origin: "cloud" });
    this.cloud.syncPath(logPath, "robot-lab");
    this.fs.write(
      `/cloud/bucket/manifest.json`,
      JSON.stringify(
        {
          uploadedAt: new Date().toISOString(),
          robot: r.config.name,
          source: logPath,
          cloudPath: fullPath,
          derived: configDerived(r.config),
        },
        null,
        2,
      ),
      { origin: "cloud" },
    );
    const s = this.db.insert(TABLES.sites, {
      host: "telemetry.nova.cloud",
      title: `${r.config.name} telemetry`,
      kind: "telemetry",
      robotId: r.id,
      ts: Date.now(),
    });
    this.markDirty("cloud");
    return { path: fullPath, synced: true, id: s.id };
  }

  saveRobotConfig(cfg: RobotConfig): void {
    this.robots.saveConfig(cfg);
    this.fs.mkdirp(`/robots/${cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`, { origin: "robot" });
    this.fs.write(
      `/robots/${cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}/config.json`,
      JSON.stringify({ ...cfg, derived: configDerived(cfg) }, null, 2),
      { origin: "robot" },
    );
    this.markDirty("robots");
  }
}

let instance: Nova | null = null;

export function nova(): Nova {
  if (!instance) instance = new Nova();
  return instance;
}

export type { RobotConfig };
