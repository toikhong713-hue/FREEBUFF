// Unified network layer. The fake internet, the Mini Internet Lab topology and
// cloud services all run on this one simulated fabric: real routing tables,
// real firewall evaluation, real TTL, latency, loss and visible packet flight.
import { EventBus } from "./bus";
import { Rng, uid, clamp } from "./rng";

export type DeviceType =
  | "pc"
  | "server"
  | "router"
  | "switch"
  | "firewall"
  | "dns"
  | "web"
  | "cloud";

export type Protocol = "ICMP" | "TCP" | "UDP" | "DNS" | "HTTP";

export interface NetIface {
  name: string;
  ip: string;
  netmask: string;
  mac: string;
  up: boolean;
}

export interface Route {
  net: string;
  mask: string;
  via: string | null; // next-hop ip, null = directly connected
  iface: string;
  metric: number;
}

export interface FwRule {
  id: string;
  action: "allow" | "block";
  srcIp: string;
  dstIp: string;
  protocol: Protocol | "any";
  dstPort: number | null;
  priority: number;
  enabled: boolean;
  hits: number;
}

export interface HttpSite {
  host: string;
  title: string;
  /** where the rendered page comes from */
  kind: "nova" | "custom";
  body: string;
  port: number;
}

export interface NetDevice {
  id: string;
  type: DeviceType;
  name: string;
  hostname: string;
  x: number;
  y: number;
  up: boolean;
  ifaces: NetIface[];
  routes: Route[];
  firewall: FwRule[];
  /** simulated services hosted here */
  http: HttpSite | null;
  isDns: boolean;
  isDb: boolean;
  notes?: string;
  rx: number;
  tx: number;
  cpu: number;
}

export interface NetLink {
  id: string;
  a: string;
  b: string;
  latency: number; // ms
  loss: number; // 0..1
  up: boolean;
  bandwidth: number; // Mbps
}

export interface Packet {
  id: string;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  protocol: Protocol;
  size: number;
  ttl: number;
  createdAt: number;
  /** device ids the packet is currently travelling between */
  from: string;
  to: string;
  t: number; // 0..1 progress along the current hop
  hop: number;
  path: string[];
  state: "flying" | "delivered" | "dropped" | "expired" | "rejected";
  reason: string;
  payload: string;
  /** reply packets are marked so the UI can colour them differently */
  reply: boolean;
  color: string;
}

export interface ToolResult {
  lines: string[];
  ok: boolean;
}

const PROTOCOL_COLOR: Record<Protocol, string> = {
  ICMP: "#38bdf8",
  TCP: "#a78bfa",
  UDP: "#34d399",
  DNS: "#fbbf24",
  HTTP: "#f472b6",
};

export class Network {
  devices = new Map<string, NetDevice>();
  links = new Map<string, NetLink>();
  packets: Packet[] = [];
  bus = new EventBus();
  rng = new Rng(20260927);
  /** packets retained for the inspector */
  log: Packet[] = [];
  /** bandwidth shaping applied to the whole fabric */
  lossScale = 1;
  private macCounter = 0x02;
  private netCounter = 10;

  // --------------------------------------------------------------- factories

  private nextMac(): string {
    const n = this.macCounter++;
    const b = (v: number) => v.toString(16).padStart(2, "0");
    return `02:42:${b((n >> 16) & 255)}:${b((n >> 8) & 255)}:${b(n & 255)}`;
  }

  private nextIp(): string {
    const n = this.netCounter++;
    return `10.0.${Math.floor(n / 254) % 254}.${(n % 254) + 1}`;
  }

  createDevice(opts: {
    type: DeviceType;
    name: string;
    hostname?: string;
    x?: number;
    y?: number;
    ip?: string;
    isDns?: boolean;
    isDb?: boolean;
  }): NetDevice {
    const ip = opts.ip ?? this.nextIp();
    const d: NetDevice = {
      id: uid("dev"),
      type: opts.type,
      name: opts.name,
      hostname: opts.hostname ?? opts.name.toLowerCase().replace(/\s+/g, "-"),
      x: opts.x ?? 120,
      y: opts.y ?? 120,
      up: true,
      ifaces: [
        {
          name: opts.type === "router" || opts.type === "firewall" ? "eth0" : "eth0",
          ip,
          netmask: "255.255.255.0",
          mac: this.nextMac(),
          up: true,
        },
      ],
      routes: [],
      firewall: [],
      http: null,
      isDns: opts.isDns ?? false,
      isDb: opts.isDb ?? false,
      rx: 0,
      tx: 0,
      cpu: 0,
    };
    this.installDefaultRoutes(d);
    if (opts.type === "router" || opts.type === "firewall") {
      d.ifaces.push({
        name: "eth1",
        ip: `203.0.113.${this.netCounter++}`,
        netmask: "255.255.0.0",
        mac: this.nextMac(),
        up: true,
      });
    }
    this.devices.set(d.id, d);
    this.bus.emit("change");
    return d;
  }

  private installDefaultRoutes(d: NetDevice): void {
    const lan = d.ifaces[0];
    if (!lan) return;
    const octets = lan.ip.split(".");
    const lanNet = `${octets[0]}.${octets[1]}.0.0`;
    // gateway convention: the .1 address of the device's own subnet
    const gateway = `${octets[0]}.${octets[1]}.${octets[2]}.1`;
    d.routes = [{ net: lanNet, mask: lan.netmask, via: null, iface: "eth0", metric: 0 }];
    if (d.type === "router" || d.type === "firewall") {
      d.routes.push({ net: "0.0.0.0", mask: "0.0.0.0", via: "203.0.113.1", iface: "eth1", metric: 1 });
    } else {
      d.routes.push({ net: "0.0.0.0", mask: "0.0.0.0", via: gateway, iface: "eth0", metric: 10 });
    }
  }

  removeDevice(id: string): void {
    this.devices.delete(id);
    for (const l of Array.from(this.links.values())) {
      if (l.a === id || l.b === id) this.links.delete(l.id);
    }
    this.packets = this.packets.filter((p) => p.from !== id && p.to !== id);
    this.bus.emit("change");
  }

  connect(a: string, b: string, opts: Partial<NetLink> = {}): NetLink | null {
    if (a === b) return null;
    if (!this.devices.has(a) || !this.devices.has(b)) return null;
    for (const l of this.links.values()) {
      if ((l.a === a && l.b === b) || (l.a === b && l.b === a)) return l;
    }
    const link: NetLink = {
      id: uid("lnk"),
      a,
      b,
      latency: opts.latency ?? Number((1 + this.rng.f() * 12).toFixed(2)),
      loss: opts.loss ?? Number((this.rng.f() * 0.02).toFixed(3)),
      up: true,
      bandwidth: opts.bandwidth ?? 1000,
    };
    this.links.set(link.id, link);
    this.bus.emit("change");
    return link;
  }

  disconnect(linkId: string): void {
    this.links.delete(linkId);
    this.bus.emit("change");
  }

  byIp(ip: string): NetDevice | undefined {
    for (const d of this.devices.values()) {
      for (const i of d.ifaces) if (i.ip === ip && i.up) return d;
    }
    return undefined;
  }

  byHostname(host: string): NetDevice | undefined {
    for (const d of this.devices.values()) {
      if (d.hostname.toLowerCase() === host.toLowerCase()) return d;
      if (d.http?.host.toLowerCase() === host.toLowerCase()) return d;
    }
    return undefined;
  }

  // ------------------------------------------------------------------- dns

  /** Hostname -> ip, served by DNS devices and the built-in resolver. */
  resolveDns(host: string): string | null {
    const h = host.toLowerCase().trim();
    if (h === "localhost") return "127.0.0.1";
    const d = this.byHostname(h);
    if (d) return d.ifaces[0]?.ip ?? null;
    // NRD-style records for the built-in sites
    const builtin = BUILTIN_HOSTS[h];
    if (builtin) return builtin;
    return null;
  }

  reverseDns(ip: string): string {
    const d = this.byIp(ip);
    if (d) return d.hostname;
    for (const [host, addr] of Object.entries(BUILTIN_HOSTS)) if (addr === ip) return host;
    return ip;
  }

  // ---------------------------------------------------------------- routing

  /** Longest-prefix lookup in a device's routing table. */
  route(device: NetDevice, dstIp: string): Route | null {
    const sorted = [...device.routes].sort(
      (a, b) => prefixLen(b.mask) - prefixLen(a.mask) || a.metric - b.metric,
    );
    for (const r of sorted) if (inSubnet(dstIp, r.net, r.mask)) return r;
    return null;
  }

  /** Neighbouring device ids reachable in one hop over a live link. */
  neighbors(deviceId: string): string[] {
    const out: string[] = [];
    for (const l of this.links.values()) {
      if (!l.up) continue;
      if (l.a === deviceId) out.push(l.b);
      else if (l.b === deviceId) out.push(l.a);
    }
    return out;
  }

  /** Bidirectional walk used by the lab's traceroute display. */
  pathBetween(srcIp: string, dstIp: string): string[] | null {
    const start = this.byIp(srcIp);
    const goal = this.byIp(dstIp);
    if (!start || !goal) return null;
    const prev = new Map<string, string>();
    const seen = new Set([start.id]);
    const queue: string[] = [start.id];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === goal.id) break;
      for (const nb of this.neighbors(cur)) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
    if (!seen.has(goal.id)) return null;
    const path: string[] = [start.id];
    let cur = goal.id;
    while (prev.has(cur)) {
      cur = prev.get(cur)!;
      path.unshift(cur);
    }
    return path;
  }

  /** Firewall evaluation. Returns null when allowed, or a drop reason. */
  checkFirewall(device: NetDevice, p: { srcIp: string; dstIp: string; protocol: Protocol; dstPort: number }): string | null {
    const rules = [...device.firewall].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
    for (const r of rules) {
      if (r.protocol !== "any" && r.protocol !== p.protocol) continue;
      if (r.dstPort !== null && r.dstPort !== p.dstPort) continue;
      if (r.srcIp !== "*" && !ipIn(r.srcIp, p.srcIp)) continue;
      if (r.dstIp !== "*" && !ipIn(r.dstIp, p.dstIp)) continue;
      r.hits++;
      if (r.action === "block") return `blocked by firewall rule #${r.priority}`;
      return null;
    }
    return null;
  }

  // ---------------------------------------------------------------- packets

  /**
   * Launch a packet into the fabric. It walks hop by hop, honouring TTL,
   * firewall rules, link latency and loss. Returns the created packet.
   */
  send(opts: {
    srcIp: string;
    dstIp: string;
    protocol: Protocol;
    srcPort?: number;
    dstPort?: number;
    size?: number;
    ttl?: number;
    payload?: string;
    reply?: boolean;
  }): Packet {
    const src = this.byIp(opts.srcIp);
    const packet: Packet = {
      id: uid("pkt"),
      srcIp: opts.srcIp,
      dstIp: opts.dstIp,
      srcPort: opts.srcPort ?? (this.rng.int(49152, 65535)),
      dstPort: opts.dstPort ?? defaultPort(opts.protocol),
      protocol: opts.protocol,
      size: opts.size ?? this.rng.int(64, 1400),
      ttl: opts.ttl ?? 64,
      createdAt: Date.now(),
      from: src?.id ?? "",
      to: "",
      t: 0,
      hop: 0,
      path: src ? [src.id] : [],
      state: "flying",
      reason: "",
      payload: opts.payload ?? "",
      reply: opts.reply ?? false,
      color: PROTOCOL_COLOR[opts.protocol],
    };
    if (!src) {
      packet.state = "dropped";
      packet.reason = `source ${opts.srcIp} is not a known interface`;
      this.packets.push(packet);
      this.logPacket(packet);
      this.bus.emit("change");
      return packet;
    }
    const path = this.pathBetween(opts.srcIp, opts.dstIp);
    if (!path || path.length < 2) {
      packet.state = "dropped";
      packet.reason = `no route to ${opts.dstIp}`;
      this.packets.push(packet);
      this.logPacket(packet);
      this.bus.emit("change");
      return packet;
    }
    packet.path = path;
    packet.to = path[1];
    this.packets.push(packet);
    src.tx += packet.size;
    this.bus.emit("change");
    return packet;
  }

  private logPacket(p: Packet): void {
    this.log.push({ ...p, path: [...p.path] });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  /** Advance all in-flight packets. dt in seconds. */
  step(dt: number): void {
    const keep: Packet[] = [];
    for (const p of this.packets) {
      if (p.state !== "flying") {
        keep.push(p);
        continue;
      }
      const link = this.findLink(p.from, p.to);
      if (!link || !link.up) {
        p.state = "dropped";
        p.reason = "link down";
        this.logPacket(p);
        continue;
      }
      const hopMs = link.latency + (link.bandwidth > 0 ? (p.size * 8) / link.bandwidth : 0);
      p.t += (dt * 1000) / Math.max(hopMs, 1);
      if (this.rng.f() < link.loss * this.lossScale * dt * 60 * 0.02) {
        p.state = "dropped";
        p.reason = "packet lost in transit";
        this.logPacket(p);
        continue;
      }
      if (p.t < 1) {
        keep.push(p);
        continue;
      }
      p.t = 0;
      p.hop++;
      if (p.ttl-- <= 0) {
        p.state = "expired";
        p.reason = "TTL exceeded";
        this.logPacket(p);
        continue;
      }
      const previous = p.from;
      p.from = p.to;
      const arrived = this.devices.get(p.from);
      if (!arrived) {
        p.state = "dropped";
        p.reason = "next hop unreachable";
        this.logPacket(p);
        continue;
      }
      arrived.rx += p.size;
      const isDest = this.hasIface(arrived, p.dstIp);
      if (isDest) {
        const fw = this.checkFirewall(arrived, p);
        if (fw) {
          p.state = "rejected";
          p.reason = fw;
        } else {
          p.state = "delivered";
          p.reason = `${p.protocol} accepted by ${arrived.hostname}`;
        }
        this.logPacket(p);
        continue;
      }
      const next = this.nextHop(arrived, p.dstIp, previous);
      if (!next) {
        p.state = "dropped";
        p.reason = `no route to ${p.dstIp} from ${arrived.hostname}`;
        this.logPacket(p);
        continue;
      }
      const target = this.devices.get(next);
      if (!target) {
        p.state = "dropped";
        p.reason = "next hop unreachable";
        this.logPacket(p);
        continue;
      }
      p.to = target.id;
      p.path.push(target.id);
      keep.push(p);
    }
    this.packets = keep;
    // background chatter so the wire is never dead
    if (this.rng.f() < 0.12) this.backgroundTraffic();
    this.updateDeviceStats(dt);
  }

  private hasIface(d: NetDevice, ip: string): boolean {
    return d.ifaces.some((i) => i.ip === ip && i.up);
  }

  /**
   * Pick the neighbour that makes real forward progress toward the destination.
   * Uses the routing table to break ties, then falls back to a breadth-first
   * search over the live graph so packets never dead-end at a routing gap.
   */
  private nextHop(device: NetDevice, dstIp: string, fromId: string): string | null {
    const neighbours = this.neighbors(device.id);
    if (!neighbours.length) return null;

    // 1. the destination sits on a directly connected interface
    for (const nb of neighbours) {
      const n = this.devices.get(nb);
      if (n && this.hasIface(n, dstIp)) return nb;
    }

    // 2. an on-link route: prefer a neighbour in the destination subnet
    const route = this.route(device, dstIp);
    if (route && !route.via) {
      for (const nb of neighbours) {
        const n = this.devices.get(nb);
        if (!n) continue;
        for (const i of n.ifaces) {
          if (inSubnet(dstIp, i.ip, i.netmask)) return nb;
        }
      }
    }

    // 3. a route with an explicit next hop
    if (route?.via) {
      for (const nb of neighbours) {
        const n = this.devices.get(nb);
        if (n && this.hasIface(n, route.via!)) return nb;
      }
      for (const nb of neighbours) {
        const n = this.devices.get(nb);
        if (n && (n.type === "router" || n.type === "firewall")) return nb;
      }
    }

    // 4. forwarding: the neighbour with the shortest remaining path, never
    //    sending the packet straight back where it came from
    let best: string | null = null;
    let bestLen = Infinity;
    for (const nb of neighbours) {
      if (nb === fromId) continue;
      const rest = this.hopCountTo(nb, dstIp, device.id);
      if (rest !== null && rest < bestLen) {
        bestLen = rest;
        best = nb;
      }
    }
    if (best) return best;

    // 5. last resort: any neighbour that can still route, else any neighbour
    for (const nb of neighbours) {
      const n = this.devices.get(nb);
      if (n && this.route(n, dstIp)) return nb;
    }
    return neighbours.find((nb) => nb !== fromId) ?? null;
  }

  /** Minimum hops from a device to the device owning dstIp, avoiding `blocked`. */
  private hopCountTo(startId: string, dstIp: string, blocked: string): number | null {
    const goal = [...this.devices.values()].find((d) => this.hasIface(d, dstIp));
    if (!goal) return null;
    if (goal.id === startId) return 0;
    const seen = new Set([startId, blocked]);
    let frontier = [startId];
    let depth = 0;
    while (frontier.length && depth < 24) {
      depth++;
      const next: string[] = [];
      for (const id of frontier) {
        for (const nb of this.neighbors(id)) {
          if (seen.has(nb)) continue;
          if (nb === goal.id) return depth;
          seen.add(nb);
          next.push(nb);
        }
      }
      frontier = next;
    }
    return null;
  }

  private findLink(a: string, b: string): NetLink | undefined {
    for (const l of this.links.values()) {
      if ((l.a === a && l.b === b) || (l.a === b && l.b === a)) return l;
    }
    return undefined;
  }

  /** Generate plausible background traffic between random live devices. */
  private backgroundTraffic(): void {
    const ids = Array.from(this.devices.values()).filter((d) => d.up && d.ifaces.length);
    if (ids.length < 2) return;
    const a = this.rng.pick(ids);
    const b = this.rng.pick(ids);
    if (a.id === b.id) return;
    const proto = this.rng.pick(["TCP", "UDP", "DNS", "HTTP", "ICMP"] as Protocol[]);
    const p = this.send({
      srcIp: a.ifaces[0].ip,
      dstIp: b.ifaces[0].ip,
      protocol: proto,
      dstPort: proto === "HTTP" ? 80 : proto === "DNS" ? 53 : proto === "TCP" ? 443 : 0,
    });
    // background packets shouldn't fill the inspector log
    this.log.pop();
    void p;
  }

  private updateDeviceStats(dt: number): void {
    for (const d of this.devices.values()) {
      const base = d.type === "router" || d.type === "firewall" ? 6 : d.type === "switch" ? 2 : 4;
      d.cpu = clamp(base + this.rng.f() * 8, 0, 100);
      d.rx = Math.max(0, d.rx - d.rx * 0.5 * dt);
      d.tx = Math.max(0, d.tx - d.tx * 0.5 * dt);
    }
  }

  // ------------------------------------------------------------------ tools

  ping(srcIp: string, dstIp: string, count = 4): ToolResult {
    const lines: string[] = [];
    let ok = 0;
    let total = 0;
    for (let i = 0; i < count; i++) {
      const p = this.send({
        srcIp,
        dstIp,
        protocol: "ICMP",
        size: 64,
        payload: `echo request ${i + 1}`,
      });
      total += p.ttl;
      if (p.state === "delivered") ok++;
      const host = this.reverseDns(dstIp);
      const seq = i + 1;
      if (p.state === "delivered") {
        lines.push(`64 bytes from ${host} (${dstIp}): icmp_seq=${seq} ttl=${p.ttl} time=1.8 ms`);
      } else {
        lines.push(`From ${host} icmp_seq=${seq} ${p.reason || "timeout"}`);
      }
    }
    const loss = Math.round(((total - ok) / total) * 100);
    lines.push(`--- ${dstIp} ping statistics ---`);
    lines.push(`${total} packets transmitted, ${ok} received, ${loss}% packet loss`);
    return { lines, ok: ok > 0 };
  }

  traceroute(srcIp: string, dstIp: string): ToolResult {
    const lines: string[] = [];
    const path = this.pathBetween(srcIp, dstIp);
    if (!path) {
      lines.push(`traceroute to ${dstIp}, no route to host`);
      return { lines, ok: false };
    }
    lines.push(`traceroute to ${this.reverseDns(dstIp)} (${dstIp}), 30 hops max`);
    for (let i = 0; i < path.length; i++) {
      const d = this.devices.get(path[i])!;
      const rtt = (1.2 + i * 2.4 + this.rng.f() * 3).toFixed(1);
      lines.push(
        `${String(i + 1).padStart(2)}  ${d.ifaces[0]?.ip ?? "*"}  (${d.hostname})  ${rtt} ms`,
      );
    }
    return { lines, ok: true };
  }

  nslookup(host: string): ToolResult {
    const ip = this.resolveDns(host);
    if (!ip) {
      return {
        lines: [`Server:  nova-resolver`, `** server can't find ${host}: NXDOMAIN`],
        ok: false,
      };
    }
    const dev = this.byIp(ip);
    return {
      lines: [
        "Server:  nova-resolver",
        "Address:  10.0.0.53#53",
        "",
        `Name:    ${host}`,
        `Address: ${ip}`,
        ...(dev ? [`Device: ${dev.name} [${dev.type}]`] : ["Device: built-in NOVA edge service"]),
      ],
      ok: true,
    };
  }

  netstat(): ToolResult {
    const lines: string[] = ["Proto  Local Address        Foreign Address       State"];
    const states = ["ESTABLISHED", "LISTEN", "TIME_WAIT", "SYN_SENT"];
    for (const d of this.devices.values()) {
      for (const i of d.ifaces) {
        if (d.http) {
          lines.push(`tcp    ${i.ip}:${d.http.port}         0.0.0.0:0               LISTEN`);
        }
        if (d.isDns) lines.push(`udp    ${i.ip}:53            0.0.0.0:0               LISTEN`);
        if (d.isDb) lines.push(`tcp    ${i.ip}:5432          0.0.0.0:0               LISTEN`);
        if (this.rng.f() < 0.5) {
          lines.push(
            `tcp    ${i.ip}:${this.rng.int(40000, 60000)}    ${this.rng.int(10, 200)}.${this.rng.int(0, 255)}.${this.rng.int(0, 255)}.${this.rng.int(1, 254)}:443       ${this.rng.pick(states)}`,
          );
        }
      }
    }
    return { lines, ok: true };
  }

  ipconfig(): ToolResult {
    const lines: string[] = [];
    for (const d of this.devices.values()) {
      lines.push(`${d.name} — ${d.type}`);
      for (const i of d.ifaces) {
        lines.push(`   ${i.name}  IP ${i.ip}  MASK ${i.netmask}  MAC ${i.mac}  ${i.up ? "up" : "down"}`);
      }
      for (const r of d.routes) {
        lines.push(`   route  ${r.net} via ${r.via ?? "on-link"} dev ${r.iface} metric ${r.metric}`);
      }
      lines.push("");
    }
    return { lines, ok: true };
  }

  serialize(): unknown {
    return {
      devices: Array.from(this.devices.values()),
      links: Array.from(this.links.values()),
      netCounter: this.netCounter,
      macCounter: this.macCounter,
    };
  }

  load(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const d = data as {
      devices?: NetDevice[];
      links?: NetLink[];
      netCounter?: number;
      macCounter?: number;
    };
    if (Array.isArray(d.devices)) {
      this.devices.clear();
      for (const dev of d.devices) {
        if (dev && typeof dev.id === "string") this.devices.set(dev.id, dev);
      }
    }
    if (Array.isArray(d.links)) {
      this.links.clear();
      for (const l of d.links) if (l && typeof l.id === "string") this.links.set(l.id, l);
    }
    if (typeof d.netCounter === "number") this.netCounter = d.netCounter;
    if (typeof d.macCounter === "number") this.macCounter = d.macCounter;
  }
}

// ------------------------------------------------------------------ helpers

export function inSubnet(ip: string, net: string, mask: string): boolean {
  const a = toInt(ip);
  const n = toInt(net);
  const m = toInt(mask);
  if (a === null || n === null || m === null) return false;
  return (a & m) === (n & m);
}

function toInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    out = (out << 8) | v;
  }
  return out >>> 0;
}

function ipIn(spec: string, ip: string): boolean {
  if (spec === "*" || spec === "0.0.0.0/0") return true;
  if (spec.includes("/")) {
    const [net, bits] = spec.split("/");
    const m = prefixMask(Number(bits));
    return inSubnet(ip, net, m);
  }
  if (spec.endsWith(".*")) return ip.startsWith(spec.slice(0, -1));
  return spec === ip;
}

export function prefixMask(bits: number): string {
  const b = Math.max(0, Math.min(32, Math.round(bits)));
  const m = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0;
  return [24, 16, 8, 0].map((sh) => (m >>> sh) & 255).join(".");
}

function prefixLen(mask: string): number {
  const m = toInt(mask);
  if (m === null) return 0;
  let bits = 0;
  for (let i = 31; i >= 0; i--) {
    if ((m >>> i) & 1) bits++;
    else break;
  }
  return bits;
}

function defaultPort(proto: Protocol): number {
  switch (proto) {
    case "HTTP":
      return 80;
    case "DNS":
      return 53;
    case "TCP":
      return 443;
    default:
      return 0;
  }
}

export const BUILTIN_HOSTS: Record<string, string> = {
  "nova.social": "198.51.100.10",
  "novasearch.net": "198.51.100.11",
  "novanews.org": "198.51.100.12",
  "novamail.io": "198.51.100.13",
  "novadrive.cloud": "198.51.100.14",
  "novatube.tv": "198.51.100.15",
  "novadocs.dev": "198.51.100.16",
  "novadev.io": "198.51.100.17",
  "novashop.com": "198.51.100.18",
  "novaforum.net": "198.51.100.19",
  "aurora-city.gov": "198.51.100.20",
  "novacity.town": "198.51.100.20",
  "helios-forum.net": "198.51.100.19",
};
