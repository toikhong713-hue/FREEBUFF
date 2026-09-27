// AI Robot Lab simulation. Component-driven robots with real pathing, obstacle
// avoidance, task scheduling, power management, telemetry and benchmarks.
import { EventBus } from "./bus";
import { Database, TABLES } from "./db";
import { FileSystem } from "./fs";
import { Rng, uid, clamp } from "./rng";

export type Behavior = "explore" | "follow" | "patrol" | "recharge" | "work";
export type RobotStatus = "idle" | "moving" | "working" | "charging" | "blocked" | "deployed" | "error";

export interface ComponentSpec {
  id: string;
  name: string;
  category: "cpu" | "ram" | "gpu" | "storage" | "battery" | "sensor" | "motor" | "comm" | "cooling";
  cost: number;
  massKg: number;
  powerW: number;
  spec: Record<string, number>;
  blurb: string;
}

export interface RobotConfig {
  id: string;
  name: string;
  parts: Record<string, string>; // category -> component id
  behaviour: Behavior;
  speed: number; // 0.2 - 2 multiplier
  sensorRange: number;
  createdAt: number;
  color: string;
  notes: string;
}

export interface Robot {
  id: string;
  config: RobotConfig;
  x: number;
  y: number;
  heading: number;
  speed: number;
  status: RobotStatus;
  battery: number; // 0-100
  distance: number;
  waypoints: { x: number; y: number }[];
  target: { x: number; y: number } | null;
  taskProgress: number;
  carried: string | null;
  log: { ts: number; level: "info" | "warn" | "error" | "telemetry"; msg: string }[];
  metrics: {
    cpu: number;
    ram: number;
    gpu: number;
    temp: number;
    net: number;
    sensorHz: number;
    collisions: number;
    batteryDrain: number;
  };
  spawnedAt: number;
}

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "wall" | "crate" | "plant" | "pillar" | "barrier";
}

export interface WorldObject {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: "marker" | "package" | "sample";
  pickedUpBy: string | null;
}

export interface Charger {
  x: number;
  y: number;
  active: boolean;
}

export interface NavTarget {
  id: string;
  x: number;
  y: number;
  label: string;
  active: boolean;
}

export interface BenchResult {
  robot: string;
  navigationMs: number;
  cpuWorkload: number;
  memoryMb: number;
  batteryPct: number;
  sensorHz: number;
  renderMs: number;
  score: number;
  ts: number;
}

// ---------------------------------------------------------------- components

export const COMPONENTS: ComponentSpec[] = [
  { id: "cpu-n1", name: "NovaCore N1", category: "cpu", cost: 45, massKg: 0.12, powerW: 6, spec: { mhz: 1200, cores: 2 }, blurb: "Efficient single-board controller." },
  { id: "cpu-n4", name: "NovaCore N4", category: "cpu", cost: 140, massKg: 0.2, powerW: 14, spec: { mhz: 2400, cores: 4 }, blurb: "Quad-core workhorse for mapping." },
  { id: "cpu-x9", name: "NovaCore X9", category: "cpu", cost: 320, massKg: 0.38, powerW: 32, spec: { mhz: 4200, cores: 8 }, blurb: "High-perf for dense point clouds." },
  { id: "ram-2", name: "LPDDR 2GB", category: "ram", cost: 18, massKg: 0.03, powerW: 1.2, spec: { gb: 2 }, blurb: "Enough for basic navigation." },
  { id: "ram-8", name: "LPDDR 8GB", category: "ram", cost: 62, massKg: 0.05, powerW: 2.4, spec: { gb: 8 }, blurb: "Comfortable for vision stacks." },
  { id: "ram-32", name: "LPDDR 32GB", category: "ram", cost: 210, massKg: 0.09, powerW: 4.1, spec: { gb: 32 }, blurb: "Onboard learning buffers." },
  { id: "gpu-t2", name: "Tensor Core T2", category: "gpu", cost: 180, massKg: 0.22, powerW: 22, spec: { tops: 8 }, blurb: "Object detection at 30fps." },
  { id: "gpu-v4", name: "Vision SoC V4", category: "gpu", cost: 520, massKg: 0.34, powerW: 48, spec: { tops: 40 }, blurb: "Full-depth from a single module." },
  { id: "ssd-64", name: "NVMe 64GB", category: "storage", cost: 40, massKg: 0.04, powerW: 1.8, spec: { gb: 64 }, blurb: "Maps and telemetry logs." },
  { id: "ssd-512", name: "NVMe 512GB", category: "storage", cost: 160, massKg: 0.07, powerW: 3.2, spec: { gb: 512 }, blurb: "Long survey deployments." },
  { id: "bat-20", name: "LiPo 20Ah", category: "battery", cost: 95, massKg: 1.1, powerW: 0, spec: { wh: 370 }, blurb: "~5 hour patrol." },
  { id: "bat-60", name: "LiPo 60Ah", category: "battery", cost: 240, massKg: 2.6, powerW: 0, spec: { wh: 1110 }, blurb: "Full-day survey endurance." },
  { id: "bat-swap", name: "Hot-swap Pack", category: "battery", cost: 310, massKg: 1.4, powerW: 0, spec: { wh: 500, swap: 1 }, blurb: "Zero-downtime battery change." },
  { id: "sen-lidar", name: "RPLidar A2", category: "sensor", cost: 95, massKg: 0.16, powerW: 2.1, spec: { range: 12, hz: 10 }, blurb: "360° 2D scanning." },
  { id: "sen-depth", name: "DepthCam S3", category: "sensor", cost: 210, massKg: 0.19, powerW: 3.4, spec: { range: 6, hz: 30 }, blurb: "RGB-D obstacle and grasp." },
  { id: "sen-gps", name: "RTK GPS", category: "sensor", cost: 130, massKg: 0.05, powerW: 0.9, spec: { range: 0, hz: 20 }, blurb: "Centimetre outdoor fix." },
  { id: "sen-thermal", name: "Thermal Array", category: "sensor", cost: 170, massKg: 0.1, powerW: 1.6, spec: { range: 3, hz: 15 }, blurb: "Finds heat signatures." },
  { id: "mot-standard", name: "Drive Motors ×2", category: "motor", cost: 70, massKg: 0.4, powerW: 9, spec: { torque: 4, top: 1.2 }, blurb: "Balanced indoor drive." },
  { id: "mot-heavy", name: "Traction Drive ×2", category: "motor", cost: 190, massKg: 1.2, powerW: 26, spec: { torque: 18, top: 0.8 }, blurb: "Hauls payloads over gravel." },
  { id: "mot-arm", name: "6-DOF Arm", category: "motor", cost: 420, massKg: 2.1, powerW: 18, spec: { torque: 12, top: 0, dof: 6 }, blurb: "Manipulator for picking tasks." },
  { id: "com-wifi", name: "Wi-Fi 6E", category: "comm", cost: 32, massKg: 0.03, powerW: 2.2, spec: { mbps: 900 }, blurb: "Telemetry to the lab." },
  { id: "com-lora", name: "LoRa Mesh", category: "comm", cost: 58, massKg: 0.05, powerW: 0.7, spec: { mbps: 0.05, range: 4000 }, blurb: "Kilometre range, low rate." },
  { id: "com-5g", name: "5G modem", category: "comm", cost: 110, massKg: 0.06, powerW: 5.5, spec: { mbps: 220 }, blurb: "Low latency to the city grid." },
  { id: "cool-passive", name: "Passive shell", category: "cooling", cost: 0, massKg: 0.1, powerW: 0, spec: { cDelta: 12 }, blurb: "No power, modest rise." },
  { id: "cool-fan", name: "Forced airflow", category: "cooling", cost: 26, massKg: 0.2, powerW: 3.5, spec: { cDelta: 26 }, blurb: "Keeps tensor cores in range." },
  { id: "cool-liquid", name: "Liquid loop", category: "cooling", cost: 118, massKg: 0.45, powerW: 6, spec: { cDelta: 42 }, blurb: "All-day heavy compute." },
];

export const PART_CATEGORIES: ComponentSpec["category"][] = [
  "cpu", "ram", "gpu", "storage", "battery", "sensor", "motor", "comm", "cooling",
];

export function partsFor(category: ComponentSpec["category"]): ComponentSpec[] {
  return COMPONENTS.filter((c) => c.category === category);
}

export function compById(id: string): ComponentSpec | undefined {
  return COMPONENTS.find((c) => c.id === id);
}

export function configDerived(cfg: RobotConfig) {
  const cpu = compById(cfg.parts.cpu);
  const ram = compById(cfg.parts.ram);
  const gpu = compById(cfg.parts.gpu);
  const battery = compById(cfg.parts.battery);
  const sensor = compById(cfg.parts.sensor);
  const motor = compById(cfg.parts.motor);
  const cool = compById(cfg.parts.cooling);
  const mhz = cpu?.spec.mhz ?? 800;
  const cores = cpu?.spec.cores ?? 1;
  const gb = ram?.spec.gb ?? 1;
  const tops = gpu?.spec.tops ?? 0;
  const wh = battery?.spec.wh ?? 100;
  const cDelta = cool?.spec.cDelta ?? 10;
  const topSpeed = motor?.spec.top ?? 1;
  const sensorRange = sensor?.spec.range ?? 3;
  const sensorHz = sensor?.spec.hz ?? 5;
  const drawW = COMPONENTS.filter((c) => cfg.parts[c.category] === c.id).reduce((a, c) => a + c.powerW, 0);
  const mass = COMPONENTS.filter((c) => cfg.parts[c.category] === c.id).reduce((a, c) => a + c.massKg, 0);
  const cost = COMPONENTS.filter((c) => cfg.parts[c.category] === c.id).reduce((a, c) => a + c.cost, 0);
  const compute = Math.round((mhz / 1000) * cores * 10 + tops * 12);
  const enduranceH = wh / Math.max(drawW, 1);
  const agility = clamp((topSpeed * 40) / Math.max(mass, 0.5), 1, 100);
  return {
    compute,
    memoryGb: gb,
    enduranceH,
    drawW,
    mass,
    cost,
    topSpeed,
    agilityScore: agility,
    sensorRange: sensorRange || cfg.sensorRange,
    sensorHz,
    cooling: cDelta,
    score: Math.round(
      (compute * 0.45 + enduranceH * 6 + agility * 0.9 - mass * 2 + sensorHz * 1.4) / 1.6,
    ),
  };
}

// --------------------------------------------------------------- simulation

export const WORLD_W = 1400;
export const WORLD_H = 900;

export class RobotLab {
  bus = new EventBus();
  rng = new Rng(4242);
  robots: Robot[] = [];
  obstacles: Obstacle[] = [];
  chargers: Charger[] = [];
  targets: NavTarget[] = [];
  objects: WorldObject[] = [];
  benches: BenchResult[] = [];
  paused = false;
  /** spatial hash over obstacles for O(1) nearby queries */
  private grid = new Map<string, Obstacle[]>();
  private CELL = 80;

  constructor(private db: Database, private fs: FileSystem) {
    this.buildWorld();
  }

  buildWorld(): void {
    this.obstacles = [];
    this.chargers = [];
    this.targets = [];
    this.objects = [];
    // perimeter
    this.obstacles.push({ x: 0, y: 0, w: WORLD_W, h: 18, kind: "wall" });
    this.obstacles.push({ x: 0, y: WORLD_H - 18, w: WORLD_W, h: 18, kind: "wall" });
    this.obstacles.push({ x: 0, y: 0, w: 18, h: WORLD_H, kind: "wall" });
    this.obstacles.push({ x: WORLD_W - 18, y: 0, w: 18, h: WORLD_H, kind: "wall" });
    // internal structure
    for (let i = 0; i < 26; i++) {
      const kind = this.rng.pick(["crate", "pillar", "barrier", "plant"] as const);
      const w = kind === "barrier" ? 120 : kind === "pillar" ? 34 : kind === "plant" ? 44 : 48;
      const h = kind === "barrier" ? 16 : kind === "pillar" ? 34 : kind === "plant" ? 44 : 48;
      this.obstacles.push({
        x: this.rng.int(60, WORLD_W - 120),
        y: this.rng.int(60, WORLD_H - 120),
        w,
        h,
        kind,
      });
    }
    // a dividing wall with gaps, to force real pathing
    this.obstacles.push({ x: 700, y: 18, w: 22, h: 220, kind: "wall" });
    this.obstacles.push({ x: 700, y: 420, w: 22, h: 460, kind: "wall" });
    this.obstacles.push({ x: 420, y: 430, w: 260, h: 20, kind: "wall" });

    for (let i = 0; i < 3; i++) {
      this.chargers.push({ x: 80 + i * 620, y: WORLD_H - 70, active: true });
    }
    for (let i = 0; i < 5; i++) {
      this.targets.push({
        id: uid("tgt"),
        x: this.rng.int(120, WORLD_W - 120),
        y: this.rng.int(120, WORLD_H - 200),
        label: `Sector ${String.fromCharCode(65 + i)}`,
        active: true,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.objects.push({
        id: uid("obj"),
        x: this.rng.int(120, WORLD_W - 120),
        y: this.rng.int(120, WORLD_H - 120),
        label: `Package P${i + 1}`,
        kind: "package",
        pickedUpBy: null,
      });
    }
    this.rebuildGrid();
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const o of this.obstacles) {
      const c0 = Math.floor(o.x / this.CELL);
      const c1 = Math.floor((o.x + o.w) / this.CELL);
      const r0 = Math.floor(o.y / this.CELL);
      const r1 = Math.floor((o.y + o.h) / this.CELL);
      for (let c = c0; c <= c1; c++) {
        for (let r = r0; r <= r1; r++) {
          const k = `${c},${r}`;
          let arr = this.grid.get(k);
          if (!arr) {
            arr = [];
            this.grid.set(k, arr);
          }
          arr.push(o);
        }
      }
    }
  }

  obstaclesNear(x: number, y: number, radius: number): Obstacle[] {
    const out: Obstacle[] = [];
    const c0 = Math.floor((x - radius) / this.CELL);
    const c1 = Math.floor((x + radius) / this.CELL);
    const r0 = Math.floor((y - radius) / this.CELL);
    const r1 = Math.floor((y + radius) / this.CELL);
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const arr = this.grid.get(`${c},${r}`);
        if (arr) out.push(...arr);
      }
    }
    return out;
  }

  isBlocked(x: number, y: number, pad = 14): boolean {
    for (const o of this.obstaclesNear(x, y, pad + 40)) {
      if (x + pad > o.x && x - pad < o.x + o.w && y + pad > o.y && y - pad < o.y + o.h) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- configs

  saveConfig(cfg: RobotConfig): void {
    this.db.insert(TABLES.robotConfigs, {
      id: cfg.id,
      name: cfg.name,
      behaviour: cfg.behaviour,
      parts: JSON.stringify(cfg.parts),
      speed: cfg.speed,
      sensorRange: cfg.sensorRange,
      color: cfg.color,
      notes: cfg.notes,
      cost: configDerived(cfg).cost,
    });
    this.bus.emit("change");
  }

  listConfigs(): RobotConfig[] {
    return this.db.all(TABLES.robotConfigs).map((r) => ({
      id: r.id,
      name: r.name,
      parts: JSON.parse(r.parts),
      behaviour: r.behaviour,
      speed: r.speed,
      sensorRange: r.sensorRange,
      createdAt: r.createdAt ?? Date.now(),
      color: r.color,
      notes: r.notes ?? "",
    }));
  }

  // --------------------------------------------------------------- runtime

  spawn(cfg: RobotConfig): Robot {
    const d = configDerived(cfg);
    const x = 120;
    const y = WORLD_H - 140 + this.rng.int(-30, 30);
    const r: Robot = {
      id: uid("bot"),
      config: { ...cfg, parts: { ...cfg.parts } },
      x,
      y,
      heading: 0,
      speed: 0,
      status: "idle",
      battery: 100,
      distance: 0,
      waypoints: [],
      target: null,
      taskProgress: 0,
      carried: null,
      log: [],
      metrics: {
        cpu: 0, ram: 0, gpu: 0, temp: 32, net: 0, sensorHz: d.sensorHz, collisions: 0, batteryDrain: 0,
      },
      spawnedAt: Date.now(),
    };
    this.log(r, "info", `${r.config.name} online — compute ${d.compute}, endurance ${d.enduranceH.toFixed(1)}h`);
    this.robots.push(r);
    this.bus.emit("change");
    return r;
  }

  remove(id: string): void {
    const r = this.robots.find((x) => x.id === id);
    this.robots = this.robots.filter((x) => x.id !== id);
    if (r?.carried) {
      const o = this.objects.find((obj) => obj.id === r.carried);
      if (o) {
        o.pickedUpBy = null;
        o.x = r.x;
        o.y = r.y;
      }
    }
    this.bus.emit("change");
  }

  clear(): void {
    this.robots = [];
    this.bus.emit("change");
  }

  private log(r: Robot, level: Robot["log"][number]["level"], msg: string): void {
    r.log.push({ ts: Date.now(), level, msg });
    if (r.log.length > 200) r.log.shift();
  }

  /** Fixed-timestep simulation step. dt in seconds. */
  step(dt: number): void {
    if (this.paused) return;
    for (const r of this.robots) this.stepRobot(r, dt);
  }

  private stepRobot(r: Robot, dt: number): void {
    const d = configDerived(r.config);
    const m = r.metrics;

    // ---- power: discharge is a direct function of the config's real endurance
    const load = r.status === "moving" || r.status === "working" ? 1 : 0.45;
    const drawW = d.drawW * load;
    const secondsOfRunTime = Math.max(d.enduranceH * 3600 * load, 1);
    const drainPct = (dt / secondsOfRunTime) * 100;
    m.batteryDrain = (drainPct / Math.max(dt, 0.0001)) * 3600;
    r.battery = clamp(r.battery - drainPct, 0, 100);
    m.temp = clamp(
      m.temp + ((d.compute / 12) * (drawW / Math.max(d.drawW, 1)) - d.cooling) * dt * 0.35 + (this.rng.f() - 0.5) * 0.6,
      28,
      95,
    );

    if (r.battery <= 0 && r.status !== "charging") {
      r.status = "deployed";
      this.log(r, "warn", "battery depleted — full stop");
    }

    // ---- charging
    if (r.status === "charging") {
      const c = this.chargers.find(
        (ch) => ch.active && Math.hypot(ch.x - r.x, ch.y - r.y) < 40,
      );
      r.battery = clamp(r.battery + 14 * dt, 0, 100);
      m.cpu = 6 + this.rng.f() * 4;
      m.gpu = 0;
      m.net = 1;
      m.temp -= 2 * dt;
      if (r.battery >= 99.5 || !c) {
        r.status = "deployed";
        this.log(r, "info", "charged to 100% — resuming");
      }
      return;
    }

    // ---- behaviour selection
    if (r.status === "idle") r.status = "deployed";
    let wantTarget: { x: number; y: number } | null = null;
    switch (r.config.behaviour) {
      case "explore":
        wantTarget = this.pickExploreTarget(r);
        break;
      case "patrol":
        wantTarget = r.waypoints.length ? r.waypoints[0] : this.pickPatrolPoint(r);
        break;
      case "follow":
        wantTarget = this.objects.find((o) => !o.pickedUpBy) ?? this.pickExploreTarget(r);
        break;
      case "work":
        wantTarget = r.target ?? this.pickPackage(r);
        break;
      case "recharge":
        if (r.battery < 45) {
          wantTarget = this.chargers.find((c) => c.active) ?? null;
          if (wantTarget && Math.hypot(wantTarget.x - r.x, wantTarget.y - r.y) < 34) {
            r.status = "charging";
            this.log(r, "info", "docked at charger");
            return;
          }
        } else {
          wantTarget = this.pickExploreTarget(r);
        }
        break;
    }

    if (!wantTarget) {
      r.speed = 0;
      m.cpu = 8 + this.rng.f() * 6;
      m.gpu = this.rng.f() * 3;
      m.net = 1;
      return;
    }
    r.target = wantTarget;

    // ---- steering (potential-field style obstacle avoidance)
    const range = Math.max(d.sensorRange * 26, 40);
    let desired = Math.atan2(wantTarget.y - r.y, wantTarget.x - r.x);
    let avoid = 0;
    let nearest = Infinity;
    for (const o of this.obstaclesNear(r.x, r.y, range)) {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const d = Math.hypot(cx - r.x, cy - r.y) - Math.max(o.w, o.h) / 2;
      if (d < range && d > -2) {
        const bearing = Math.atan2(cy - r.y, cx - r.x);
        let diff = normalizeAngle(bearing - r.heading);
        if (Math.abs(diff) > Math.PI * 0.75) continue; // behind us
        const strength = 1 - d / range;
        avoid += diff * strength * 1.9;
        nearest = Math.min(nearest, d);
      }
    }
    const steer = clamp(desired + avoid, -1, 1);
    r.heading = normalizeAngle(r.heading + steer * dt * 2.4);

    const blockedAhead = nearest < 26;
    const maxSpeed = d.topSpeed * 1.6 * r.config.speed;
    r.speed = blockedAhead ? maxSpeed * 0.35 : maxSpeed;
    r.status = r.speed > 0.05 ? "moving" : "blocked";

    const nx = r.x + Math.cos(r.heading) * r.speed * 40 * dt;
    const ny = r.y + Math.sin(r.heading) * r.speed * 40 * dt;
    if (this.isBlocked(nx, ny, 16)) {
      m.collisions++;
      if (m.collisions % 12 === 1) this.log(r, "warn", "obstacle contact — backing off");
      r.heading = normalizeAngle(r.heading + (this.rng.f() > 0.5 ? 1.2 : -1.2));
    } else {
      r.x = clamp(nx, 24, WORLD_W - 24);
      r.y = clamp(ny, 24, WORLD_H - 24);
      r.distance += Math.hypot(nx - r.x, ny - r.y) + r.speed * 40 * dt * 0.5;
    }

    // ---- arrival
    const distToTarget = Math.hypot(wantTarget.x - r.x, wantTarget.y - r.y);
    if (distToTarget < 24) {
      this.onArrive(r, wantTarget);
    }

    // ---- hardware metrics
    const work = 0.25 + (r.speed / Math.max(maxSpeed, 0.01)) * 0.5 + (this.rng.f() * 0.2);
    m.cpu = clamp((d.compute / 90) * 100 * work, 1, 99);
    m.gpu = clamp((d.compute / 160) * 100 * work * (r.config.parts.gpu ? 1 : 0.05), 0, 99);
    m.ram = clamp((d.memoryGb / 32) * 100 * (0.5 + work * 0.6), 1, 99);
    m.net = d.drawW * 0.02 * (1 + this.rng.f() * 3) * 10;
    m.sensorHz = d.sensorHz * (0.85 + this.rng.f() * 0.3);
  }

  private onArrive(r: Robot, at: { x: number; y: number }): void {
    switch (r.config.behaviour) {
      case "patrol":
        r.waypoints.shift();
        r.target = null;
        break;
      case "work": {
        const pkg = this.objects.find((o) => !o.pickedUpBy && Math.hypot(o.x - at.x, o.y - at.y) < 60);
        if (pkg && !r.carried) {
          pkg.pickedUpBy = r.id;
          r.carried = pkg.id;
          r.status = "working";
          this.log(r, "info", `picked up ${pkg.label}`);
          // deliver to a charger pad (acts as depot)
          r.target = this.chargers.find((c) => c.active) ?? null;
        } else if (r.carried) {
          r.status = "working";
          const done = this.objects.find((o) => o.id === r.carried);
          if (done) {
            done.pickedUpBy = null;
            this.log(r, "info", `delivered ${done.label} to depot`);
          }
          r.carried = null;
          r.target = this.pickPackage(r);
        }
        break;
      }
      case "follow": {
        const o = this.objects.find((obj) => !obj.pickedUpBy);
        if (o) {
          r.log.push({
            ts: Date.now(),
            level: "telemetry",
            msg: `tracking ${o.label} @ ${o.x.toFixed(0)},${o.y.toFixed(0)}`,
          });
        }
        r.target = null;
        break;
      }
      default:
        r.target = null;
    }
    if (r.log.length > 200) r.log.shift();
  }

  private pickExploreTarget(r: Robot): { x: number; y: number } {
    for (let i = 0; i < 8; i++) {
      const p = { x: this.rng.int(60, WORLD_W - 60), y: this.rng.int(60, WORLD_H - 60) };
      if (!this.isBlocked(p.x, p.y, 30) && Math.hypot(p.x - r.x, p.y - r.y) > 90) return p;
    }
    return { x: WORLD_W / 2, y: WORLD_H / 2 };
  }

  private pickPatrolPoint(r: Robot): { x: number; y: number } {
    const t = this.rng.pick(this.targets);
    r.waypoints = [{ x: t.x, y: t.y }];
    return t;
  }

  private pickPackage(_r: Robot): { x: number; y: number } | null {
    const o = this.objects.find((obj) => !obj.pickedUpBy);
    return o ? { x: o.x, y: o.y } : this.pickExploreTarget(_r);
  }

  // ------------------------------------------------------------- telemetry

  /** Append a telemetry record to the unified filesystem at /robots/<id>/. */
  writeTelemetry(r: Robot): string | null {
    const dir = `/robots/${slug(r.config.name)}-${r.id.slice(-4)}`;
    this.fs.mkdirp(dir, { origin: "robot" });
    this.fs.mkdirp(`${dir}/telemetry`, { origin: "robot" });
    const d = configDerived(r.config);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      robot: r.config.name,
      id: r.id,
      status: r.status,
      pos: [Math.round(r.x), Math.round(r.y)],
      battery: Number(r.battery.toFixed(1)),
      cpu: Number(r.metrics.cpu.toFixed(1)),
      temp: Number(r.metrics.temp.toFixed(1)),
      distance: Number(r.distance.toFixed(1)),
      collisions: r.metrics.collisions,
      compute: d.compute,
    });
    const path = `${dir}/telemetry/telemetry.log`;
    this.fs.append(path, line + "\n", { origin: "robot" });
    this.db.insert(TABLES.telemetry, {
      robotId: r.id,
      robot: r.config.name,
      ts: Date.now(),
      battery: r.battery,
      cpu: r.metrics.cpu,
      temp: r.metrics.temp,
      x: r.x,
      y: r.y,
      status: r.status,
    });
    // keep the db log bounded
    if (this.db.count(TABLES.telemetry) > 800) {
      const all = this.db.all(TABLES.telemetry);
      for (let i = 0; i < 200; i++) this.db.remove(TABLES.telemetry, all[i].id);
    }
    return path;
  }

  fullLog(r: Robot): string {
    const d = configDerived(r.config);
    const head = [
      `=== ${r.config.name} (${r.id}) ===`,
      `status      : ${r.status}`,
      `behaviour   : ${r.config.behaviour}`,
      `position    : ${r.x.toFixed(1)}, ${r.y.toFixed(1)}`,
      `battery     : ${r.battery.toFixed(1)}%`,
      `distance    : ${r.distance.toFixed(1)} m`,
      `collisions  : ${r.metrics.collisions}`,
      `compute     : ${d.compute} pts`,
      `draw        : ${d.drawW.toFixed(1)} W`,
      `endurance   : ${d.enduranceH.toFixed(2)} h`,
      `mass        : ${d.mass.toFixed(2)} kg`,
      `score       : ${d.score}`,
      "",
      "--- log ---",
    ];
    const tail = r.log.map((l) => `${new Date(l.ts).toISOString().slice(11, 19)} [${l.level}] ${l.msg}`);
    return [...head, ...tail].join("\n");
  }

  // ------------------------------------------------------------ benchmarks

  benchmark(robotId: string): BenchResult | null {
    const r = this.robots.find((x) => x.id === robotId);
    if (!r) return null;
    const d = configDerived(r.config);
    const start = performance.now();
    let acc = 0;
    for (let i = 0; i < 5000; i++) acc += Math.sin(i * 0.01) * Math.cos(i * 0.003);
    const navigationMs = performance.now() - start;
    const sensorWork = 200 + d.sensorHz * 8;
    const renderStart = performance.now();
    let sum = 0;
    for (let i = 0; i < 8000; i++) sum += Math.sqrt(i % 997);
    const renderMs = performance.now() - renderStart;
    const result: BenchResult = {
      robot: r.config.name,
      navigationMs: Number(navigationMs.toFixed(2)),
      cpuWorkload: Number((d.compute * 0.9 + 12).toFixed(1)),
      memoryMb: Number((d.memoryGb * 180 + 64).toFixed(0)),
      batteryPct: Number(r.battery.toFixed(1)),
      sensorHz: Number(sensorWork.toFixed(0)),
      renderMs: Number(renderMs.toFixed(2)),
      score: Math.round(
        (2000 / Math.max(navigationMs, 0.1)) * 0.25 +
          d.compute * 0.02 +
          (d.enduranceH * 10) * 0.2 +
          (120 / Math.max(renderMs, 0.1)) * 0.2,
      ),
      ts: Date.now(),
    };
    void acc;
    void sum;
    this.benches.unshift(result);
    if (this.benches.length > 40) this.benches.pop();
    this.log(r, "telemetry", `benchmark complete — nav ${result.navigationMs}ms score ${result.score}`);
    this.bus.emit("change");
    return result;
  }
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "bot";
}

export function defaultConfig(name = "Scout-01"): RobotConfig {
  return {
    id: uid("cfg"),
    name,
    parts: {
      cpu: "cpu-n4",
      ram: "ram-8",
      gpu: "gpu-t2",
      storage: "ssd-64",
      battery: "bat-20",
      sensor: "sen-lidar",
      motor: "mot-standard",
      comm: "com-wifi",
      cooling: "cool-fan",
    },
    behaviour: "explore",
    speed: 1,
    sensorRange: 6,
    createdAt: Date.now(),
    color: "#38bdf8",
    notes: "Baseline lab rover.",
  };
}
