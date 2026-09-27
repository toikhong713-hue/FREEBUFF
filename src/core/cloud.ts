// Simulated cloud infrastructure behind the cloud PC: accounts, storage quotas,
// virtual servers, sync, region health and billing.
import { EventBus } from "./bus";
import { Database, TABLES } from "./db";
import { FileSystem } from "./fs";
import { Rng, uid } from "./rng";

export type ServerKind = "web" | "database" | "game" | "dns" | "file";
export type AccountRole = "admin" | "user" | "guest";

export interface CloudServer {
  id: string;
  name: string;
  kind: ServerKind;
  size: "micro" | "small" | "medium" | "large";
  ip: string;
  status: "running" | "stopped" | "provisioning";
  cpu: number; // allocated vCPU
  memMb: number;
  diskGb: number;
  createdAt: number;
  monthlyCost: number;
  region: string;
  uptimePct: number;
  host: string | null; // website hosted here
  hostBody: string;
  hostTitle: string;
  netIn: number;
  netOut: number;
}

export interface CloudAccount {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  createdAt: number;
  mfa: boolean;
  suspended: boolean;
}

export interface SyncItem {
  path: string;
  size: number;
  state: "synced" | "syncing" | "pending" | "conflict";
  updatedAt: number;
  device: string;
}

export interface CloudMetrics {
  region: string;
  zone: string;
  cpuUsed: number;
  cpuTotal: number;
  memUsed: number;
  memTotal: number;
  storageUsedGb: number;
  storageTotalGb: number;
  netInMbps: number;
  netOutMbps: number;
  reqPerMin: number;
  uptimePct: number;
}

const REGIONS = ["aurora-n1", "helios-e2", "cobalt-s3"];

const SIZE_SPECS: Record<CloudServer["size"], { cpu: number; memMb: number; diskGb: number; cost: number }> = {
  micro: { cpu: 1, memMb: 1024, diskGb: 20, cost: 3 },
  small: { cpu: 2, memMb: 4096, diskGb: 60, cost: 11 },
  medium: { cpu: 4, memMb: 8192, diskGb: 160, cost: 29 },
  large: { cpu: 8, memMb: 16384, diskGb: 400, cost: 74 },
};

export class Cloud {
  bus = new EventBus();
  rng = new Rng(777);
  servers: CloudServer[] = [];
  accounts: CloudAccount[] = [];
  syncQueue: SyncItem[] = [];
  quotaGb = 64;
  region = REGIONS[0];
  seed = 20260927;
  private tickCount = 0;

  constructor(private db: Database, private fs: FileSystem) {
    this.accounts = [
      { id: uid("acc"), name: "Nova Admin", email: "admin@nova.cloud", role: "admin", createdAt: Date.now() - 400 * 86400_000, mfa: true, suspended: false },
      { id: uid("acc"), name: "Nova User", email: "you@nova.cloud", role: "user", createdAt: Date.now() - 200 * 86400_000, mfa: false, suspended: false },
      { id: uid("acc"), name: "Guest", email: "guest@nova.cloud", role: "guest", createdAt: Date.now() - 20 * 86400_000, mfa: false, suspended: false },
    ];
  }

  // ------------------------------------------------------------- servers

  createServer(opts: { name: string; kind: ServerKind; size: CloudServer["size"]; host?: string }): CloudServer {
    const spec = SIZE_SPECS[opts.size];
    const idx = this.servers.length + 1;
    const s: CloudServer = {
      id: uid("srv"),
      name: opts.name,
      kind: opts.kind,
      size: opts.size,
      ip: `198.51.100.${100 + idx}`,
      status: "running",
      cpu: spec.cpu,
      memMb: spec.memMb,
      diskGb: spec.diskGb,
      createdAt: Date.now(),
      monthlyCost: spec.cost,
      region: this.region,
      uptimePct: Number(this.rng.range(99.1, 99.999).toFixed(3)),
      host: opts.host ?? null,
      hostBody: `<!doctype html><html><body style="font-family:system-ui;background:#0b1120;color:#e2e8f0;padding:40px"><h1>${opts.name}</h1><p>Served from a NOVA Cloud ${opts.size} instance in ${this.region}.</p></body></html>`,
      hostTitle: `${opts.name} — NOVA Cloud`,
      netIn: 0,
      netOut: 0,
    };
    this.servers.push(s);
    this.db.insert(TABLES.cloudServers, {
      id: s.id,
      name: s.name,
      kind: s.kind,
      size: s.size,
      ip: s.ip,
      status: s.status,
    });
    this.bus.emit("change");
    return s;
  }

  removeServer(id: string): void {
    this.servers = this.servers.filter((s) => s.id !== id);
    this.db.remove(TABLES.cloudServers, id);
    this.bus.emit("change");
  }

  toggleServer(id: string): void {
    const s = this.servers.find((x) => x.id === id);
    if (!s) return;
    s.status = s.status === "running" ? "stopped" : "running";
    this.db.update(TABLES.cloudServers, s.id, { status: s.status });
    this.bus.emit("change");
  }

  // ------------------------------------------------------------- storage

  storageUsedGb(): number {
    return this.fs.usedBytes() / 1024 ** 3;
  }

  storagePct(): number {
    return Math.min(100, (this.storageUsedGb() / this.quotaGb) * 100);
  }

  /** Sync a filesystem path into the cloud bucket, writing a manifest to /cloud. */
  syncPath(path: string, device = "cloud-pc"): SyncItem | null {
    const node = this.fs.resolve(path);
    if (!node) return null;
    const size = this.fs.stat(path)?.size ?? 0;
    const item: SyncItem = {
      path,
      size,
      state: "syncing",
      updatedAt: Date.now(),
      device,
    };
    const existing = this.syncQueue.find((i) => i.path === path);
    if (existing) Object.assign(existing, item);
    else this.syncQueue.push(item);
    const manifestPath = "/cloud/bucket" + (path === "/" ? "/index" : path) + ".meta";
    this.fs.mkdirp(manifestPath.slice(0, manifestPath.lastIndexOf("/")), { origin: "cloud" });
    this.fs.write(
      manifestPath,
      `# sync manifest\npath: ${path}\nsize: ${size} bytes\ndevice: ${device}\nsynced: ${new Date().toISOString()}\nstatus: complete\n`,
      { origin: "cloud" },
    );
    this.bus.emit("sync", item);
    return item;
  }

  syncAll(device = "cloud-pc"): SyncItem[] {
    const out: SyncItem[] = [];
    this.fs.walk("/", (node, path) => {
      if (node.type === "file" && path !== "/") out.push(this.syncPath(path, device)!);
    });
    this.bus.emit("change");
    return out;
  }

  completeSync(): void {
    for (const i of this.syncQueue) if (i.state === "syncing") i.state = "synced";
    this.bus.emit("change");
  }

  // ------------------------------------------------------------ accounts

  addAccount(name: string, email: string, role: AccountRole): CloudAccount {
    const acc: CloudAccount = {
      id: uid("acc"),
      name,
      email,
      role,
      createdAt: Date.now(),
      mfa: false,
      suspended: false,
    };
    this.accounts.push(acc);
    this.bus.emit("change");
    return acc;
  }

  removeAccount(id: string): void {
    this.accounts = this.accounts.filter((a) => a.id !== id);
    this.bus.emit("change");
  }

  // ------------------------------------------------------------- metrics

  metrics(): CloudMetrics {
    this.tickCount++;
    const running = this.servers.filter((s) => s.status === "running");
    const cpuTotal = running.reduce((a, s) => a + s.cpu, 0) + 16;
    const cpuUsed =
      cpuTotal * (0.18 + 0.42 * this.rng.f()) +
      running.reduce((a, s) => a + this.rng.f() * s.cpu, 0) * 0.4;
    const memTotal = running.reduce((a, s) => a + s.memMb, 0) + 32768;
    const memUsed = memTotal * (0.22 + 0.5 * this.rng.f());
    return {
      region: this.region,
      zone: `${this.region}${String.fromCharCode(65 + (this.tickCount % 3))}`,
      cpuUsed,
      cpuTotal,
      memUsed,
      memTotal,
      storageUsedGb: this.storageUsedGb(),
      storageTotalGb: this.quotaGb,
      netInMbps: 40 + this.rng.f() * 320,
      netOutMbps: 30 + this.rng.f() * 260,
      reqPerMin: Math.floor(400 + this.rng.f() * 5200),
      uptimePct: Number((99.94 + this.rng.f() * 0.059).toFixed(3)),
    };
  }

  step(): void {
    for (const s of this.servers) {
      s.netIn = s.netOut = s.status === "running" ? this.rng.f() * 18 : 0;
    }
    if (this.tickCount % 3 === 0) this.completeSync();
  }

  get monthlyCost(): number {
    return this.servers.reduce((a, s) => a + s.monthlyCost, 0);
  }
}

export { REGIONS, SIZE_SPECS };
