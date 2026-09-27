// Virtual City: a living district simulation with a road graph, A* pedestrian
// navigation, vehicle traffic, signals, weather, NPC needs/schedules and a
// running economy. It publishes events into the simulated internet.
import { EventBus } from "./bus";
import { Database, TABLES } from "./db";
import { Rng, uid, clamp } from "./rng";
import { FIRST, LAST, OCCUPATIONS, CITY_DISTRICTS } from "./world";

export const CITY_W = 3600;
export const CITY_H = 2600;
export const BLOCK = 220; // block pitch; roads sit between blocks
export const ROAD_W = 34;
export const SIDEWALK = 16;

export type BuildingType =
  | "residential"
  | "office"
  | "shop"
  | "restaurant"
  | "school"
  | "hospital"
  | "park"
  | "apartment"
  | "station"
  | "factory";

export type NpcState =
  | "home" | "commuting" | "working" | "studying"
  | "eating" | "shopping" | "socialising" | "roaming" | "sleeping";

export interface Building {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: BuildingType;
  district: string;
  name: string;
  floors: number;
  hue: number;
  /** for shops / restaurants */
  stock: number;
  capacity: number;
  customers: number;
  revenue: number;
  expenses: number;
  openHour: number;
  closeHour: number;
  power: number; // kW while open
  isOpen: boolean;
  seedNpcIds: string[];
}

export interface Npc {
  id: string;
  name: string;
  age: number;
  occupation: string;
  homeId: string;
  workId: string | null;
  district: string;
  x: number;
  y: number;
  path: { x: number; y: number }[];
  pathIdx: number;
  state: NpcState;
  speed: number;
  hue: number;
  needs: { hunger: number; energy: number; social: number; fun: number };
  friends: string[];
  wallet: number;
  carrying: string | null;
  commuteStart: number;
  stats: { purchases: number; distance: number; meals: number; workHours: number };
}

export interface Vehicle {
  id: string;
  kind: "car" | "bus" | "truck" | "robot";
  x: number;
  y: number;
  dir: 0 | 1 | 2 | 3;
  speed: number;
  color: string;
  route: number[][];
  t: number;
  nodeIdx: number;
  waiting: number;
  occupant: string | null;
}

export interface TrafficLight {
  id: string;
  gx: number;
  gy: number;
  x: number;
  y: number;
  phase: 0 | 1;
  timer: number;
}

export type WeatherKind = "sunny" | "cloudy" | "rain" | "storm";

export interface Weather {
  kind: WeatherKind;
  intensity: number;
  until: number;
  windKph: number;
  tempC: number;
}

export interface CityStats {
  population: number;
  activeNpcs: number;
  traffic: number;
  congestion: number;
  businesses: number;
  openBusinesses: number;
  energyKw: number;
  revenueToday: number;
  expensesToday: number;
  transitRiders: number;
  weather: WeatherKind;
  tempC: number;
  clock: string;
  day: number;
  weekday: string;
}

interface GraphNode {
  id: number;
  x: number;
  y: number;
  edges: { to: number; cost: number }[];
}

const ROAD_XS: number[] = [];
const ROAD_YS: number[] = [];
for (let x = 0; x <= CITY_W; x += BLOCK) ROAD_XS.push(x);
for (let y = 0; y <= CITY_H; y += BLOCK) ROAD_YS.push(y);

const nodeIndex = (gx: number, gy: number): number => gy * ROAD_XS.length + gx;

export class City {
  bus = new EventBus();
  rng = new Rng(90210);
  buildings: Building[] = [];
  npcs: Npc[] = [];
  vehicles: Vehicle[] = [];
  lights: TrafficLight[] = [];
  weather: Weather = { kind: "sunny", intensity: 0.4, until: Date.now() + 600_000, windKph: 8, tempC: 19 };
  graph: GraphNode[] = [];
  buildingAt = new Map<string, Building>();
  npcById = new Map<string, Npc>();

  /** simulated clock: minutes since day 0, 06:00 */
  minutes = 360;
  day = 1;
  totalRevenue = 0;
  totalExpenses = 0;
  transitRiders = 0;
  targetNpcCount = 260;
  /** robots deployed from the AI Robot Lab into the city */
  deployedRobots: {
    robotId: string;
    name: string;
    behaviour: string;
    x: number;
    y: number;
    district: string;
    deployedAt: number;
    tasks: number;
  }[] = [];

  constructor(private db: Database) {
    this.buildGraph();
    this.generate();
  }

  // ------------------------------------------------------------- geometry

  private buildGraph(): void {
    this.graph = [];
    for (let gy = 0; gy < ROAD_YS.length; gy++) {
      for (let gx = 0; gx < ROAD_XS.length; gx++) {
        this.graph.push({
          id: nodeIndex(gx, gy),
          x: ROAD_XS[gx],
          y: ROAD_YS[gy],
          edges: [],
        });
      }
    }
    for (let gy = 0; gy < ROAD_YS.length; gy++) {
      for (let gx = 0; gx < ROAD_XS.length; gx++) {
        const n = this.graph[nodeIndex(gx, gy)];
        if (gx < ROAD_XS.length - 1) {
          const e = this.graph[nodeIndex(gx + 1, gy)];
          n.edges.push({ to: e.id, cost: ROAD_XS[gx + 1] - ROAD_XS[gx] });
          e.edges.push({ to: n.id, cost: ROAD_XS[gx + 1] - ROAD_XS[gx] });
        }
        if (gy < ROAD_YS.length - 1) {
          const e = this.graph[nodeIndex(gx, gy + 1)];
          n.edges.push({ to: e.id, cost: ROAD_YS[gy + 1] - ROAD_YS[gy] });
          e.edges.push({ to: n.id, cost: ROAD_YS[gy + 1] - ROAD_YS[gy] });
        }
      }
    }
  }

  private generate(): void {
    this.buildings = [];
    this.buildingAt.clear();

    // 10 districts laid out as 5 columns x 2 rows of blocks

    for (let by = 0; by < ROAD_YS.length - 1; by++) {
      for (let bx = 0; bx < ROAD_XS.length - 1; bx++) {
        const ox = ROAD_XS[bx] + ROAD_W + SIDEWALK;
        const oy = ROAD_YS[by] + ROAD_W + SIDEWALK;
        const bw = BLOCK - ROAD_W - SIDEWALK * 2;
        const bh = BLOCK - ROAD_W - SIDEWALK * 2;
        if (bw < 40 || bh < 40) continue;
        const dIdx = by < ROAD_YS.length / 2 - 1 ? bx : bx + 5;
        const district = CITY_DISTRICTS[clamp(dIdx, 0, CITY_DISTRICTS.length - 1)];
        const kind = this.rng.pick(this.zoneKinds(dIdx));

        // split large blocks into 1-4 buildings
        const parts = this.rng.int(1, 4);
        const cols = parts <= 1 ? 1 : this.rng.int(1, 2);
        const rows = Math.ceil(parts / cols);
        for (let i = 0; i < parts; i++) {
          const c = i % cols;
          const rw = Math.floor(i / cols);
          const w = (bw / cols) * this.rng.range(0.72, 0.94);
          const h = (bh / rows) * this.rng.range(0.72, 0.94);
          const x = ox + (bw / cols) * c + this.rng.range(0, Math.max(1, (bw / cols) - w));
          const y = oy + (bh / rows) * rw + this.rng.range(0, Math.max(1, (bh / rows) - h));
          const b: Building = this.makeBuilding(kind, x, y, w, h, district);
          this.buildings.push(b);
          this.buildingAt.set(`${Math.floor(x / 40)},${Math.floor(y / 40)}`, b);
          this.registerCells(b);
        }
      }
    }

    // transit stations on a few road intersections
    for (let i = 0; i < 6; i++) {
      const gx = 2 + i * 3;
      const gy = i % 2 === 0 ? 3 : ROAD_YS.length - 4;
      if (gx >= ROAD_XS.length) break;
      const b = this.makeBuilding("station", ROAD_XS[gx] - 34, ROAD_YS[gy] - 26, 68, 52, CITY_DISTRICTS[i % 5]);
      b.name = `Transit Hub ${String.fromCharCode(65 + i)}`;
      this.buildings.push(b);
      this.registerCells(b);
    }

    this.lights = [];
    for (let gy = 1; gy < ROAD_YS.length - 1; gy += 3) {
      for (let gx = 1; gx < ROAD_XS.length - 1; gx += 3) {
        this.lights.push({
          id: uid("tl"),
          gx,
          gy,
          x: ROAD_XS[gx],
          y: ROAD_YS[gy],
          phase: (gx + gy) % 2 === 0 ? 0 : 1,
          timer: (gx * 7 + gy * 13) % 12,
        });
      }
    }

    this.spawnNpcs();
    this.spawnVehicles();
    this.applyWeather("sunny");
  }

  private registerCells(b: Building): void {
    const c0 = Math.floor(b.x / 60);
    const c1 = Math.floor((b.x + b.w) / 60);
    const r0 = Math.floor(b.y / 60);
    const r1 = Math.floor((b.y + b.h) / 60);
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) this.buildingAt.set(`${c},${r}`, b);
    }
  }

  buildingAtPoint(x: number, y: number): Building | null {
    return this.buildingAt.get(`${Math.floor(x / 60)},${Math.floor(y / 60)}`) ?? null;
  }

  private zoneKinds(dIdx: number): BuildingType[] {
    switch (dIdx % 5) {
      case 0:
        return ["residential", "apartment", "residential", "shop", "park"];
      case 1:
        return ["apartment", "office", "shop", "restaurant", "office"];
      case 2:
        return ["park", "school", "residential", "restaurant", "shop"];
      case 3:
        return ["factory", "office", "shop", "restaurant", "office"];
      default:
        return ["residential", "shop", "restaurant", "hospital", "office"];
    }
  }

  private makeBuilding(
    type: BuildingType,
    x: number,
    y: number,
    w: number,
    h: number,
    district: string,
  ): Building {
    const floors = type === "park" ? 0 : this.rng.int(2, type === "factory" ? 4 : 18);
    const isBiz = type === "shop" || type === "restaurant" || type === "factory";
    const openHour = type === "restaurant" ? 11 : 8;
    return {
      id: uid("bld"),
      x,
      y,
      w,
      h,
      type,
      district,
      name: this.buildingName(type, district),
      floors,
      hue: this.hueFor(type),
      stock: isBiz ? this.rng.int(40, 400) : 0,
      capacity: floors * 4 + this.rng.int(2, 20),
      customers: 0,
      revenue: 0,
      expenses: this.rng.int(40, 400),
      openHour,
      closeHour: type === "restaurant" ? 23 : 19,
      power: isBiz ? this.rng.range(8, 60) : floors * 1.6,
      isOpen: false,
      seedNpcIds: [],
    };
  }

  private hueFor(t: BuildingType): number {
    switch (t) {
      case "residential":
        return 24;
      case "apartment":
        return 200;
      case "office":
        return 218;
      case "shop":
        return 330;
      case "restaurant":
        return 16;
      case "school":
        return 48;
      case "hospital":
        return 168;
      case "park":
        return 120;
      case "station":
        return 260;
      case "factory":
        return 36;
      default:
        return 220;
    }
  }

  private buildingName(type: BuildingType, district: string): string {
    const noun: Record<BuildingType, string[]> = {
      residential: ["House", "Cottage", "Row House", "Bungalow"],
      apartment: ["Apartments", "Residences", "Heights", "Flats"],
      office: ["Offices", "Works", "Tower", "Exchange"],
      shop: ["Market", "Goods", "Supply", "Emporium"],
      restaurant: ["Kitchen", "Bistro", "Grill", "Cafe"],
      school: ["School", "Academy", "College", "Institute"],
      hospital: ["Hospital", "Clinic", "Medical Centre"],
      park: ["Park", "Green", "Commons", "Gardens"],
      station: ["Transit Hub", "Station", "Interchange"],
      factory: ["Works", "Foundry", "Plant", "Depot"],
    };
    return `${this.rng.pick(noun[type])} — ${district}`;
  }

  // ------------------------------------------------------------------ npcs

  private spawnNpcs(): void {
    this.npcs = [];
    this.npcById.clear();
    const homes = this.buildings.filter((b) => b.type === "residential" || b.type === "apartment");
    const works = this.buildings.filter(
      (b) => b.type === "office" || b.type === "school" || b.type === "hospital" || b.type === "factory" || b.type === "shop" || b.type === "restaurant",
    );
    if (!homes.length) return;
    for (let i = 0; i < this.targetNpcCount; i++) {
      const home = this.rng.pick(homes);
      const work = works.length ? this.rng.pick(works) : null;
      const npc = this.makeNpc(home, work);
      this.npcs.push(npc);
      this.npcById.set(npc.id, npc);
      home.seedNpcIds.push(npc.id);
    }
    // relationships: NPCs living in the same building know each other
    for (const b of homes) {
      const res = b.seedNpcIds.map((id) => this.npcById.get(id)!).filter(Boolean);
      for (const n of res) {
        n.friends = this.rng.shuffle(res.filter((o) => o.id !== n.id).map((o) => o.id)).slice(0, this.rng.int(1, 4));
      }
    }
  }

  private makeNpc(home: Building, work: Building | null): Npc {
    const first = this.rng.pick(FIRST);
    const last = this.rng.pick(LAST);
    const age = this.rng.bool(0.22) ? this.rng.int(7, 18) : this.rng.int(19, 76);
    return {
      id: uid("npc"),
      name: `${first} ${last}`,
      age,
      occupation: age < 19 ? "Student" : work?.type === "school" ? "Teacher" : this.rng.pick(OCCUPATIONS),
      homeId: home.id,
      workId: work?.id ?? null,
      district: home.district,
      x: home.x + home.w / 2,
      y: home.y + home.h / 2,
      path: [],
      pathIdx: 0,
      state: this.rng.pick(["home", "commuting", "working", "roaming", "socialising", "eating", "shopping"]),
      speed: this.rng.range(0.55, 1.5),
      hue: this.rng.int(0, 359),
      needs: { hunger: this.rng.f(), energy: this.rng.f(), social: this.rng.f(), fun: this.rng.f() },
      friends: [],
      wallet: this.rng.range(12, 480),
      carrying: null,
      commuteStart: 0,
      stats: { purchases: 0, distance: 0, meals: 0, workHours: 0 },
    };
  }

  private spawnVehicles(): void {
    this.vehicles = [];
    for (let i = 0; i < 46; i++) {
      const kind = this.rng.f() < 0.12 ? "bus" : this.rng.f() < 0.2 ? "truck" : "car";
      const vx = this.rng.int(0, ROAD_XS.length - 1);
      const vy = this.rng.int(0, ROAD_YS.length - 1);
      const horizontal = this.rng.bool();
      this.vehicles.push({
        id: uid("veh"),
        kind,
        x: horizontal ? this.rng.f() * CITY_W : ROAD_XS[vx],
        y: horizontal ? ROAD_YS[vy] : this.rng.f() * CITY_H,
        dir: this.rng.int(0, 3) as 0 | 1 | 2 | 3,
        speed: this.rng.range(0.5, 1.3) * (kind === "bus" ? 0.8 : 1),
        color: `hsl(${this.rng.int(0, 359)} 70% 55%)`,
        route: horizontal
          ? [[0, ROAD_YS[vy]], [CITY_W, ROAD_YS[vy]]]
          : [[ROAD_XS[vx], 0], [ROAD_XS[vx], CITY_H]],
        t: this.rng.f(),
        nodeIdx: 0,
        waiting: 0,
        occupant: null,
      });
    }
  }

  // -------------------------------------------------------------- pathing

  /** A* over the road-graph nodes; returns a polyline of waypoints. */
  findPath(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
    const start = this.nearestNode(from);
    const goal = this.nearestNode(to);
    if (start === goal) return [{ x: to.x, y: to.y }];

    const open = new Set<number>([start]);
    const came = new Map<number, number>();
    const gScore = new Map<number, number>([[start, 0]]);
    const fScore = new Map<number, number>([[start, this.heur(start, goal)]]);
    let guard = 0;

    while (open.size && guard++ < 6000) {
      let cur = -1;
      let best = Infinity;
      for (const n of open) {
        const f = fScore.get(n) ?? Infinity;
        if (f < best) {
          best = f;
          cur = n;
        }
      }
      if (cur === goal) break;
      open.delete(cur);
      const node = this.graph[cur];
      for (const e of node.edges) {
        const tentative = (gScore.get(cur) ?? Infinity) + e.cost;
        if (tentative < (gScore.get(e.to) ?? Infinity)) {
          came.set(e.to, cur);
          gScore.set(e.to, tentative);
          fScore.set(e.to, tentative + this.heur(e.to, goal));
          open.add(e.to);
        }
      }
    }

    if (!came.has(goal)) return [{ x: to.x, y: to.y }];
    const path: { x: number; y: number }[] = [];
    let cur: number | undefined = goal;
    while (cur !== undefined) {
      const n = this.graph[cur];
      path.unshift({ x: n.x, y: n.y });
      cur = came.get(cur);
    }
    path.push({ x: to.x, y: to.y });
    return path;
  }

  private nearestNode(p: { x: number; y: number }): number {
    let gx = Math.round(p.x / BLOCK);
    let gy = Math.round(p.y / BLOCK);
    gx = clamp(gx, 0, ROAD_XS.length - 1);
    gy = clamp(gy, 0, ROAD_YS.length - 1);
    return nodeIndex(gx, gy);
  }

  private heur(a: number, b: number): number {
    const na = this.graph[a];
    const nb = this.graph[b];
    return Math.abs(na.x - nb.x) + Math.abs(na.y - nb.y);
  }

  // ------------------------------------------------------------- schedules

  private hour(): number {
    return (this.minutes / 60) % 24;
  }

  private isWeekend(): boolean {
    return this.day % 7 === 0 || this.day % 7 === 6;
  }

  /** Where this NPC should be right now, given the clock and their needs. */
  private decide(n: Npc): { dest: Building | null; state: NpcState } {
    const h = this.hour();
    const home = this.buildings.find((b) => b.id === n.homeId)!;
    const work = n.workId ? this.buildings.find((b) => b.id === n.workId) ?? null : null;
    const weekend = this.isWeekend();

    if (h < 6.5) return { dest: home, state: "sleeping" };
    if (h < 7.5) return { dest: home, state: "home" };
    if (h < 12) {
      if (n.needs.hunger > 0.7) {
        const cafe = this.nearestOfType(n, "restaurant", 900);
        if (cafe) return { dest: cafe, state: "eating" };
      }
      if (n.age < 19 || n.occupation === "Teacher" || (work && work.type === "school")) {
        if (work) return { dest: work, state: "studying" };
      }
      if (!weekend && work) return { dest: work, state: "working" };
      if (n.needs.social > 0.65) {
        const friend = n.friends.length ? this.npcById.get(n.friends[0]) : null;
        if (friend) return { dest: this.buildings.find((b) => b.id === friend.homeId) ?? home, state: "socialising" };
      }
      return { dest: home, state: "home" };
    }
    if (h < 13.5) {
      const cafe = this.nearestOfType(n, "restaurant", 1200);
      return cafe ? { dest: cafe, state: "eating" } : { dest: work ?? home, state: work ? "working" : "home" };
    }
    if (h < 17) {
      if (n.needs.hunger > 0.6) {
        const cafe = this.nearestOfType(n, "restaurant", 900);
        if (cafe) return { dest: cafe, state: "eating" };
      }
      if (!weekend && work) return { dest: work, state: "working" };
      return { dest: home, state: "home" };
    }
    if (h < 19.5) {
      if (n.needs.hunger > 0.5 || weekend) {
        const shop = this.nearestOfType(n, "shop", 1400) ?? this.nearestOfType(n, "restaurant", 1400);
        if (shop) return { dest: shop, state: "shopping" };
      }
      const friend = n.friends.length ? this.npcById.get(n.friends[0]) : null;
      if (friend) {
        const fb = this.buildings.find((b) => b.id === friend.homeId);
        if (fb) return { dest: fb, state: "socialising" };
      }
      const park = this.nearestOfType(n, "park", 1600);
      return park ? { dest: park, state: "roaming" } : { dest: home, state: "home" };
    }
    if (h < 22.5) {
      const cafe = this.nearestOfType(n, "restaurant", 1200);
      if (cafe) return { dest: cafe, state: "eating" };
      return { dest: home, state: "home" };
    }
    return { dest: home, state: "home" };
  }

  private nearestOfType(n: Npc, type: BuildingType, maxDist: number): Building | null {
    let best: Building | null = null;
    let bestD = maxDist;
    for (const b of this.buildings) {
      if (b.type !== type) continue;
      const d = Math.hypot(b.x + b.w / 2 - n.x, b.y + b.h / 2 - n.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  // ----------------------------------------------------------------- step

  step(dt: number, speed = 60): void {
    // clock: `speed` sim-minutes per real second
    this.minutes += (dt * speed) / 60 * 60;
    while (this.minutes >= 1440) {
      this.minutes -= 1440;
      this.day++;
      this.onNewDay();
    }

    this.updateWeather();
    this.updateLights(dt);
    this.updateBuildings();
    this.updateNpcs(dt);
    this.updateVehicles(dt, speed);
  }

  private onNewDay(): void {
    for (const b of this.buildings) {
      b.customers = 0;
      b.expenses += b.floors * 0.4 + (b.stock ? b.stock * 0.05 : 0);
      this.totalExpenses += b.expenses * 0;
    }
    this.transitRiders = 0;
    this.bus.emit("newday", this.day);
  }

  private updateWeather(): void {
    if (Date.now() > this.weather.until) {
      const roll = this.rng.f();
      const kind: WeatherKind = roll < 0.55 ? "sunny" : roll < 0.78 ? "cloudy" : roll < 0.93 ? "rain" : "storm";
      this.applyWeather(kind);
    }
  }

  applyWeather(kind: WeatherKind): void {
    const intensity =
      kind === "sunny" ? this.rng.range(0.5, 1) : kind === "cloudy" ? this.rng.range(0.3, 0.6) : kind === "rain" ? this.rng.range(0.4, 0.8) : this.rng.range(0.8, 1);
    this.weather = {
      kind,
      intensity,
      until: Date.now() + this.rng.int(90_000, 420_000),
      windKph: kind === "storm" ? this.rng.int(45, 90) : kind === "rain" ? this.rng.int(15, 35) : this.rng.int(3, 18),
      tempC: Math.round(
        (kind === "sunny" ? this.rng.range(17, 26) : kind === "cloudy" ? this.rng.range(12, 20) : this.rng.range(7, 15)) * 10,
      ) / 10,
    };
    this.bus.emit("weather", this.weather);
  }

  private updateLights(dt: number): void {
    for (const l of this.lights) {
      l.timer += dt;
      if (l.timer > 9) {
        l.timer = 0;
        l.phase = l.phase === 0 ? 1 : 0;
      }
    }
  }

  private updateBuildings(): void {
    const h = this.hour();
    for (const b of this.buildings) {
      const wasOpen = b.isOpen;
      b.isOpen = h >= b.openHour && h <= b.closeHour && b.type !== "park";
      if (b.isOpen && !wasOpen) {
        b.customers = 0;
        if (b.stock > 0) b.stock = Math.max(0, b.stock - this.rng.int(0, 6));
      }
    }
  }

  private updateNpcs(dt: number): void {
    const weatherPenalty =
      this.weather.kind === "storm" ? 0.55 : this.weather.kind === "rain" ? 0.78 : 1;

    for (const n of this.npcs) {
      // needs drift
      n.needs.hunger = clamp(n.needs.hunger + dt * 0.016 * weatherPenalty, 0, 1);
      n.needs.energy = clamp(n.needs.energy + dt * 0.012, 0, 1);
      n.needs.social = clamp(n.needs.social + dt * 0.010 * (n.age < 25 ? 1.6 : 1), 0, 1);
      n.needs.fun = clamp(n.needs.fun + dt * 0.009, 0, 1);

      const { dest, state } = this.decide(n);
      if (state !== n.state || !n.path.length) {
        n.state = state;
        n.path = dest ? this.findPath(n, { x: dest.x + dest.w / 2, y: dest.y + dest.h / 2 }) : [];
        n.pathIdx = 0;
      }

      if (n.path.length && n.pathIdx < n.path.length) {
        const wp = n.path[n.pathIdx];
        const dx = wp.x - n.x;
        const dy = wp.y - n.y;
        const d = Math.hypot(dx, dy);
        if (d < 6) {
          n.pathIdx++;
        } else {
          const v = n.speed * 24 * weatherPenalty;
          const step = Math.min(v * dt, d);
          n.x += (dx / d) * step;
          n.y += (dy / d) * step;
          n.stats.distance += step;
        }
      } else if (dest) {
        // arrived: satisfy needs and move money around
        n.commuteStart += dt;
        switch (state) {
          case "eating":
            n.needs.hunger = clamp(n.needs.hunger - dt * 0.22, 0, 1);
            n.stats.meals++;
            if (dest.stock > 0 && n.wallet > 6) {
              n.wallet -= this.rng.range(4, 18);
              dest.revenue += this.rng.range(4, 18);
              this.totalRevenue += 18;
              dest.stock--;
              n.stats.purchases++;
              dest.customers++;
            }
            break;
          case "shopping":
            n.needs.fun = clamp(n.needs.fun - dt * 0.18, 0, 1);
            if (dest.stock > 0 && n.wallet > 10) {
              const spend = this.rng.range(10, 45);
              n.wallet -= spend;
              dest.revenue += spend;
              this.totalRevenue += spend;
              dest.stock--;
              n.stats.purchases++;
              dest.customers++;
            }
            break;
          case "working":
          case "studying":
            n.needs.energy = clamp(n.needs.energy - dt * 0.03, 0, 1);
            n.stats.workHours += dt;
            break;
          case "socialising":
            n.needs.social = clamp(n.needs.social - dt * 0.3, 0, 1);
            n.needs.fun = clamp(n.needs.fun - dt * 0.2, 0, 1);
            break;
          case "sleeping":
            n.needs.energy = clamp(n.needs.energy - dt * 0.35, 0, 1);
            break;
          case "roaming":
            n.needs.fun = clamp(n.needs.fun - dt * 0.22, 0, 1);
            break;
          default:
            n.needs.energy = clamp(n.needs.energy + dt * 0.012, 0, 1);
        }
      }
    }
  }

  private updateVehicles(dt: number, speed: number): void {
    const night = this.hour() < 6 || this.hour() > 20;
    const congestion = this.congestion();
    const weatherFactor = this.weather.kind === "storm" ? 0.6 : this.weather.kind === "rain" ? 0.8 : 1;
    const lightIndex = new Map<string, TrafficLight>();
    for (const l of this.lights) lightIndex.set(`${Math.round(l.x)},${Math.round(l.y)}`, l);

    for (const v of this.vehicles) {
      const [sx, sy] = v.route[0];
      const [ex, ey] = v.route[1];
      const len = Math.hypot(ex - sx, ey - sy);
      if (len < 1) continue;
      const baseSpeed = (v.kind === "bus" ? 60 : v.kind === "truck" ? 48 : 70) * congestion * weatherFactor;
      const base = night && v.kind !== "bus" && v.kind !== "truck" ? baseSpeed * 0.55 : baseSpeed;
      v.t += (base * dt) / Math.max(len, 1) * (speed / 60);
      if (v.t >= 1) {
        v.t = 0;
        v.route = v.route[0][0] === sx ? [[ex, ey], [sx, sy]] : [[sx, sy], [ex, ey]];
        if (v.kind === "bus") this.transitRiders += this.rng.int(3, 22);
      }
      v.x = sx + (ex - sx) * v.t;
      v.y = sy + (ey - sy) * v.t;
      v.speed = base;
      const key = `${Math.round(v.x)},${Math.round(v.y)}`;
      const tl = lightIndex.get(key);
      if (tl) {
        const crossVertical = Math.abs(v.y - ROAD_YS[tl.gy]) < 3;
        const green = crossVertical ? tl.phase === 1 : tl.phase === 0;
        if (!green) v.waiting += dt;
        else v.waiting = 0;
      }
    }
  }

  congestion(): number {
    const night = this.hour() < 6 || this.hour() > 20;
    const rush = !night && (this.hour() > 7.5 && this.hour() < 9.5) || (this.hour() > 16.5 && this.hour() < 18.5);
    const base = night ? 0.42 : rush ? 0.55 : 0.78;
    const weather = this.weather.kind === "storm" ? -0.2 : this.weather.kind === "rain" ? -0.1 : 0;
    return clamp(base + weather + (this.rng.f() - 0.5) * 0.08, 0.15, 0.98);
  }

  // ----------------------------------------------------------------- stats

  stats(): CityStats {
    const h = Math.floor(this.hour());
    const m = Math.floor((this.hour() % 1) * 60);
    const businesses = this.buildings.filter((b) => b.stock > 0 || b.type === "restaurant");
    return {
      population: 210_000 + this.npcs.length * 140,
      activeNpcs: this.npcs.filter((n) => n.state !== "sleeping" && n.state !== "home").length,
      traffic: this.vehicles.length,
      congestion: this.congestion(),
      businesses: businesses.length,
      openBusinesses: businesses.filter((b) => b.isOpen).length,
      energyKw: this.buildings.reduce((a, b) => a + (b.isOpen ? b.power : b.power * 0.15), 0),
      revenueToday: this.buildings.reduce((a, b) => a + b.revenue, 0),
      expensesToday: this.buildings.reduce((a, b) => a + b.expenses, 0),
      transitRiders: this.transitRiders,
      weather: this.weather.kind,
      tempC: this.weather.tempC,
      clock: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      day: this.day,
      weekday: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][this.day % 7],
    };
  }

  /** Human-readable schedule used by the NPC inspector. */
  schedule(n: Npc): { time: string; what: string }[] {
    const weekend = this.isWeekend();
    return [
      { time: "06:30", what: "wake up" },
      { time: "07:15", what: `commute to ${n.occupation === "Student" ? "school" : "work"}` },
      { time: n.age < 19 ? "09:00" : weekend ? "10:00" : "08:30", what: weekend ? "free time in the district" : n.occupation === "Student" || n.occupation === "Teacher" ? "classes / lessons" : "work shift" },
      { time: "12:30", what: "lunch" },
      { time: "13:30", what: weekend ? "roam" : "back to work" },
      { time: "17:30", what: "commute home" },
      { time: "18:00", what: "shop / errands" },
      { time: "19:30", what: "socialise" },
      { time: "22:30", what: "sleep" },
    ];
  }

  /**
   * Deploy a robot from the lab into the city as a public-service unit.
   * It joins the NPC traffic and gets its own roster entry.
   */
  deployRobot(robot: { id: string; config: { name: string; behaviour: string } }, name: string, _log?: unknown): void {
    if (this.deployedRobots.some((r) => r.robotId === robot.id)) return;
    const hub = this.buildings.find((b) => b.type === "station") ?? this.buildings[0];
    this.deployedRobots.push({
      robotId: robot.id,
      name,
      behaviour: robot.config.behaviour,
      x: hub.x + hub.w / 2,
      y: hub.y + hub.h / 2,
      district: hub.district,
      deployedAt: Date.now(),
      tasks: 0,
    });
    this.publishNews(
      `${name} joins the Aurora municipal fleet`,
      `The ${name} unit has been deployed at the ${hub.district} interchange. ` +
        `It will run ${robot.config.behaviour} patterns and report telemetry to the city operations desk.`,
    );
    this.db.insert(TABLES.posts, {
      author: "aurora.citybot",
      body: `${name} just rolled out at ${hub.name}. Free real-time telemetry at telemetry.nova.cloud.`,
      topic: "robots",
      ts: Date.now(),
      likes: 12,
      comments: 0,
      fromCity: true,
    });
    this.bus.emit("robots", this.deployedRobots);
  }

  /** Publish a city event to the simulated internet (news + social). */
  publishNews(headline: string, body: string): void {
    const source = "Aurora Herald";
    this.db.insert(TABLES.news, {
      title: headline,
      source,
      hue: 210,
      category: "City",
      ts: Date.now(),
      breaking: true,
      views: this.rng.int(400, 9000),
      body,
      fromCity: true,
    });
    this.db.insert(TABLES.cityNews, {
      title: headline,
      ts: Date.now(),
      body,
      district: this.rng.pick(CITY_DISTRICTS),
    });
    this.bus.emit("news", { headline, body });
  }

  /** Called on a timer by the app shell — generates plausible city events. */
  tickEvents(): void {
    if (this.rng.f() > 0.09) return;
    const s = this.stats();
    const templates: [string, string][] = [
      [
        `Traffic heavier than usual in ${this.rng.pick(CITY_DISTRICTS)}`,
        `Roadworks are slowing traffic across the ${this.rng.pick(["Northgate", "Ironworks", "Cobalt Row"])} approaches. The transit authority has diverted two bus routes.`,
      ],
      [
        `${s.openBusinesses} businesses now open across Aurora`,
        `Shops, cafés and clinics across the city entered their trading day. City centre footfall is up on the weekly average.`,
      ],
      [
        `Weather alert: ${s.weather} conditions expected`,
        `The forecast service has issued a ${s.weather} advisory. Parks and open areas are advised to take care.`,
      ],
      [
        `Transit ridership passes ${this.transitRiders.toLocaleString()}`,
        `Interchange hubs recorded ${this.transitRiders} boardings so far today, up on the same point last week.`,
      ],
      [
        `Energy draw hits ${Math.round(s.energyKw).toLocaleString()} kW`,
        `The grid operator confirmed demand remains within reserve margins despite the current weather.`,
      ],
    ];
    const [title, body] = this.rng.pick(templates);
    this.publishNews(title, `${body}\n\n— Aurora City desk`);
    this.db.insert(TABLES.posts, {
      author: "aurora.citybot",
      body: `${title} — live from the city feed.`,
      topic: "Nova city",
      ts: Date.now(),
      likes: this.rng.int(0, 40),
      comments: 0,
      fromCity: true,
    });
  }
}
