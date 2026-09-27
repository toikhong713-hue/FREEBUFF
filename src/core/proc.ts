// Unified process + system metrics layer. Every app in NOVAOS registers a
// process here, and every process consumes simulated CPU/RAM/network/storage.
import { EventBus } from "./bus";

export type ProcState = "running" | "sleeping" | "stopped";

export interface Process {
  pid: number;
  name: string;
  appId: string;
  title: string;
  user: string;
  state: ProcState;
  startedAt: number;
  /** percent of total system CPU, 0-100 */
  cpu: number;
  /** MB of RAM */
  ram: number;
  /** KB/s of simulated network throughput */
  net: number;
  /** IO operations per second */
  io: number;
  /** pid of the owning window, if any */
  windowId?: string;
  cmd?: string;
  /** user-tunable load bias, 0.5-2 */
  load: number;
  base: { cpu: number; ram: number; net: number; io: number };
}

export interface SystemSnapshot {
  cpuLoad: number;
  cpuPerCore: number[];
  memUsed: number;
  memTotal: number;
  diskUsed: number;
  diskTotal: number;
  netDown: number;
  netUp: number;
  tempC: number;
  uptimeMs: number;
  cores: number;
}

export class ProcessManager {
  processes = new Map<number, Process>();
  bus = new EventBus();
  private nextPid = 100;

  // simulated machine specs
  readonly cores = 8;
  readonly memTotalMb = 16384;
  readonly diskTotalMb = 512 * 1024;
  readonly bootAt = Date.now();

  cpuPerCore: number[] = new Array(this.cores).fill(0);
  memUsedMb = 0;
  diskUsedMb = 0;
  netDown = 0;
  netUp = 0;
  tempC = 42;
  private frame = 0;

  spawn(opts: {
    name: string;
    appId: string;
    title?: string;
    user?: string;
    windowId?: string;
    cpu?: number;
    ram?: number;
    net?: number;
    io?: number;
    cmd?: string;
  }): Process {
    const p: Process = {
      pid: this.nextPid++,
      name: opts.name,
      appId: opts.appId,
      title: opts.title ?? opts.name,
      user: opts.user ?? "user",
      state: "running",
      startedAt: Date.now(),
      cpu: 0,
      ram: 0,
      net: 0,
      io: 0,
      windowId: opts.windowId,
      cmd: opts.cmd,
      load: 1,
      base: {
        cpu: opts.cpu ?? 2,
        ram: opts.ram ?? 120,
        net: opts.net ?? 4,
        io: opts.io ?? 12,
      },
    };
    this.processes.set(p.pid, p);
    this.bus.emit("spawn", p);
    this.bus.emit("change");
    return p;
  }

  kill(pid: number): boolean {
    const p = this.processes.get(pid);
    if (!p) return false;
    this.processes.delete(pid);
    this.bus.emit("kill", p);
    this.bus.emit("change");
    return true;
  }

  byWindow(windowId: string): Process | undefined {
    for (const p of this.processes.values()) if (p.windowId === windowId) return p;
    return undefined;
  }

  find(pid: number): Process | undefined {
    return this.processes.get(pid);
  }

  list(): Process[] {
    return Array.from(this.processes.values()).sort((a, b) => a.pid - b.pid);
  }

  /** Called at ~5Hz by the system ticker. */
  tick(fsUsedBytes: number): SystemSnapshot {
    void fsUsedBytes;
    this.frame++;
    let cpuTarget = 0;
    let mem = 0;
    let netD = 0;
    let netU = 0;
    let io = 0;
    for (const p of this.processes.values()) {
      if (p.state === "stopped") {
        p.cpu = 0;
        p.ram = 0;
        p.net = 0;
        p.io = 0;
        continue;
      }
      const jitter = 0.7 + 0.6 * pseudo(this.frame * 7919 + p.pid * 104729);
      const active = p.state === "running" ? 1 : 0.18;
      p.cpu = clampNum(p.base.cpu * p.load * jitter * active, 0.4, 100);
      p.ram = p.base.ram * p.load * (0.94 + 0.12 * pseudo(p.pid * 31 + this.frame));
      p.net = p.base.net * p.load * jitter * active;
      p.io = p.base.io * p.load * jitter * active;
      cpuTarget += p.cpu;
      mem += p.ram;
      netD += p.net;
      netU += p.net * (0.35 + 0.3 * pseudo(p.pid + this.frame * 3));
      io += p.io;
    }
    // idle system overhead
    const idleCpu = 3 + 4 * pseudo(this.frame);
    const totalCpu = clampNum(cpuTarget + idleCpu, 1, 100);

    this.cpuPerCore = this.cpuPerCore.map((_, i) => {
      const t = totalCpu * (0.72 + 0.55 * pseudo(i * 613 + this.frame * 17));
      return clampNum(t, 0, 100);
    });
    this.memUsedMb = clampNum(mem + 420 + 180 * pseudo(this.frame * 3), 0, this.memTotalMb);
    this.diskUsedMb = clampNum(8 * 1024 + fsUsedBytes / 1024, 0, this.diskTotalMb);
    this.netDown = netD;
    this.netUp = netU;
    this.tempC = clampNum(36 + (totalCpu / 100) * 26 + 4 * pseudo(this.frame * 13), 30, 95);

    return {
      cpuLoad: totalCpu,
      cpuPerCore: this.cpuPerCore,
      memUsed: this.memUsedMb,
      memTotal: this.memTotalMb,
      diskUsed: this.diskUsedMb,
      diskTotal: this.diskTotalMb,
      netDown: this.netDown,
      netUp: this.netUp,
      tempC: this.tempC,
      uptimeMs: Date.now() - this.bootAt,
      cores: this.cores,
    };
  }

  snapshot(fsUsedBytes: number): SystemSnapshot {
    void fsUsedBytes;
    return {
      cpuLoad: this.cpuPerCore.reduce((a, b) => a + b, 0) / this.cores,
      cpuPerCore: [...this.cpuPerCore],
      memUsed: this.memUsedMb,
      memTotal: this.memTotalMb,
      diskUsed: this.diskUsedMb,
      diskTotal: this.diskTotalMb,
      netDown: this.netDown,
      netUp: this.netUp,
      tempC: this.tempC,
      uptimeMs: Date.now() - this.bootAt,
      cores: this.cores,
    };
  }
}

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** cheap deterministic 0..1 noise for metric jitter */
function pseudo(x: number): number {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
