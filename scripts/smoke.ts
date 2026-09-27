// Headless smoke test for the NOVA simulation core. Run with: bun scripts/smoke.ts
import { FileSystem } from "../src/core/fs";
import { Database, TABLES } from "../src/core/db";
import { Network } from "../src/core/net";
import { seedWorld } from "../src/core/world";
import { City } from "../src/core/city";
import { RobotLab, configDerived, defaultConfig } from "../src/core/robots";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nFILESYSTEM");
const fs = new FileSystem();
check("root exists", fs.resolve("/") !== null);
check("default dirs seeded", fs.list("/").length >= 9, `${fs.list("/").length} top-level entries`);
fs.mkdirp("/projects/demo/src", { origin: "user" });
fs.write("/projects/demo/src/main.ts", "console.log('hi')", { origin: "user" });
check("write + read round trip", fs.read("/projects/demo/src/main.ts") === "console.log('hi')");
check("stat size", (fs.stat("/projects/demo/src/main.ts")?.size ?? 0) === 17);
fs.cp("/projects/demo", "/downloads/demo");
check("recursive copy", fs.exists("/downloads/demo/src/main.ts"));
fs.mv("/downloads/demo", "/documents/demo");
check("move", fs.exists("/documents/demo/src/main.ts") && !fs.exists("/downloads/demo"));
check("find by name", fs.find("main.ts").length === 2, `${fs.find("main.ts").length} matches`);
check("rm -r", fs.rm("/documents/demo", { recursive: true }) && !fs.exists("/documents/demo"));
check("find after delete", fs.find("main.ts").length === 1);
check("protected dir survives", fs.rm("/system", { recursive: true, force: true }) === false || fs.exists("/system"));
check("normalise ..", fs.normalize("/a/b/../c") === "/a/c");
const walked = (() => { let c = 0; fs.walk("/", () => c++); return c; })();
check("walk visits nodes", walked >= 17, `${walked} nodes`);

console.log("\nDATABASE");
const db = new Database();
db.create(TABLES.users, [{ id: "u1", name: "Ada", handle: "ada" }]);
db.insert(TABLES.posts, { author: "ada", body: "packet loss on 203.0.113", likes: 3, ts: Date.now() });
check("insert + all", db.all(TABLES.posts).length === 1);
check("update", db.update(TABLES.posts, db.all(TABLES.posts)[0].id, { likes: 9 })?.likes === 9);
check("search", db.search(TABLES.posts, "packet", ["body"], 5).length === 1);
check("search misses", db.search(TABLES.posts, "zzz", ["body"], 5).length === 0);
check("removeWhere", db.removeWhere(TABLES.posts, () => true) === 1);

console.log("\nNETWORK");
const net = new Network();
seedWorld(db, net);
check("default topology built", net.devices.size === 9, `${net.devices.size} devices`);
check("links built", net.links.size >= 9, `${net.links.size} links`);
check("dns resolves builtin host", net.resolveDns("nova.social") === "198.51.100.10");
check("reverse dns", net.reverseDns("198.51.100.10") === "nova.social");
const pc = [...net.devices.values()].find((d) => d.type === "pc")!;
const cloud = [...net.devices.values()].find((d) => d.type === "cloud")!;
const path = net.pathBetween(pc.ifaces[0].ip, cloud.ifaces[0].ip);
check("path found", !!path && path.length >= 3, path ? `${path.length} hops` : "none");
const route = net.route(pc, cloud.ifaces[0].ip);
check("longest-prefix route", !!route, route ? `${route.net} via ${route.via ?? "on-link"}` : "no route");
const fw = [...net.devices.values()].find((d) => d.type === "firewall")!;
const blocked = net.checkFirewall(fw, { srcIp: "203.0.113.5", dstIp: "10.0.0.9", protocol: "TCP", dstPort: 443 });
check("firewall blocks external subnet", blocked !== null, blocked ?? "not blocked");
const allowed = net.checkFirewall(fw, { srcIp: "10.0.0.1", dstIp: "10.0.0.9", protocol: "TCP", dstPort: 443 });
check("firewall allows LAN", allowed === null);
const tracer = net.traceroute(pc.ifaces[0].ip, cloud.ifaces[0].ip);
check("traceroute output", tracer.lines.length >= 4 && tracer.ok);
const ns = net.nslookup("novasearch.net");
check("nslookup ok", ns.ok);
check("netstat lines", net.netstat().lines.length > 0);

// drive packets until delivery or drop
let delivered = 0;
for (let i = 0; i < 6; i++) {
  const p = net.send({ srcIp: pc.ifaces[0].ip, dstIp: cloud.ifaces[0].ip, protocol: "HTTP", dstPort: 80 });
  for (let s = 0; s < 400 && p.state === "flying"; s++) net.step(0.05);
  if (p.state === "delivered") delivered++;
}
check("packets reach the destination", delivered > 0, `${delivered}/6 delivered`);
check("packet log captured", net.log.length > 0, `${net.log.length} entries`);

console.log("\nCITY");
const t0 = performance.now();
const city = new City(db);
const genMs = performance.now() - t0;
check("city generated", city.buildings.length > 100, `${city.buildings.length} buildings in ${genMs.toFixed(0)}ms`);
check("npcs spawned", city.npcs.length === 260, `${city.npcs.length} agents`);
check("vehicles spawned", city.vehicles.length > 20, `${city.vehicles.length} vehicles`);
check("traffic lights", city.lights.length > 10, `${city.lights.length}`);
const route2 = city.findPath({ x: 100, y: 100 }, { x: 3200, y: 2400 });
check("A* path found", !!route2 && route2.length > 2, route2 ? `${route2.length} nodes` : "no path");
const navStart = performance.now();
for (let i = 0; i < 200; i++) city.findPath({ x: Math.random() * 3000, y: Math.random() * 2000 }, { x: 100, y: 100 });
const navMs = performance.now() - navStart;
check("pathfinding is fast", navMs < 250, `200 paths in ${navMs.toFixed(0)}ms`);

const before = city.npcs.map((a) => ({ x: a.x, y: a.y }));
const stepStart = performance.now();
for (let i = 0; i < 60; i++) city.step(1 / 30, 60);
const stepMs = performance.now() - stepStart;
const moved = city.npcs.filter((a, i) => Math.hypot(a.x - before[i].x, a.y - before[i].y) > 1).length;
check("npcs move", moved > 200, `${moved} of ${city.npcs.length} moved`);
check("simulation is fast", stepMs < 400, `60 steps in ${stepMs.toFixed(0)}ms`);
const stats = city.stats();
check("stats populated", stats.population > 0 && stats.businesses > 0, JSON.stringify({ pop: stats.population, biz: stats.businesses, clock: stats.clock }));
check("clock advances", stats.clock !== "06:00");
city.applyWeather("storm");
check("weather applied", city.weather.kind === "storm");
const newsBefore = db.count(TABLES.news);
city.publishNews("Smoke test bulletin", "body");
check("city publishes to the internet", db.count(TABLES.news) === newsBefore + 1);
check("city news table", db.count(TABLES.cityNews) > 0);
city.deployRobot({ id: "bot_x", config: { name: "TestBot", behaviour: "explore" } }, "TestBot");
check("robot deploys into city", city.deployedRobots.length === 1);

console.log("\nROBOTS");
const lab = new RobotLab(db, fs);
lab.saveConfig(defaultConfig("Smoke-01"));
check("config saved", lab.listConfigs().length === 1);
const cfg = defaultConfig("Runner");
const d = configDerived(cfg);
check("derived compute", d.compute > 0 && d.enduranceH > 0, `compute=${d.compute} endurance=${d.enduranceH.toFixed(1)}h draw=${d.drawW}W`);
check("cost reflects parts", d.cost > 0, `${d.cost} cr`);
const bot = lab.spawn(cfg);
check("robot spawned", lab.robots.length === 1);
for (let i = 0; i < 200; i++) lab.step(1 / 30);
check("robot moves", bot.distance > 5, `${bot.distance.toFixed(1)}m travelled, status=${bot.status}`);
check("battery drains", bot.battery < 100, `${bot.battery.toFixed(1)}%`);
check("hardware metrics live", bot.metrics.cpu > 0, `cpu=${bot.metrics.cpu.toFixed(1)}% temp=${bot.metrics.temp.toFixed(1)}C`);
const logPath = lab.writeTelemetry(bot);
check("telemetry written to fs", !!logPath && !!fs.read(logPath!) && fs.read(logPath!)!.includes("Runner"), logPath ?? "");
check("telemetry dir navigable", !!logPath && fs.list(logPath!.slice(0, logPath!.lastIndexOf("/"))).length === 1);
check("full log readable", nfs(fs, bot).includes("=== Runner"));
const bench = lab.benchmark(bot.id);
check("benchmark produces numbers", !!bench && bench.score > 0, bench ? `score=${bench.score} nav=${bench.navigationMs}ms` : "");
check("spatial hash query", lab.obstaclesNear(700, 400, 200).length > 0);
check("collision test", typeof lab.isBlocked(10, 10) === "boolean");

console.log("\nWORLD SEED");
const db2 = new Database();
const net2 = new Network();
const result = seedWorld(db2, net2);
check("users seeded", result.users >= 40, `${result.users}`);
check("posts seeded", result.posts >= 100, `${result.posts}`);
check("news seeded", result.articles >= 20, `${result.articles}`);
check("products seeded", result.products >= 20, `${result.products}`);
check("mail seeded", db2.count(TABLES.mail) > 10, `${db2.count(TABLES.mail)}`);
check("threads seeded", db2.count(TABLES.threads) >= 10, `${db2.count(TABLES.threads)}`);
check("follows seeded", db2.count(TABLES.follows) > 50, `${db2.count(TABLES.follows)}`);
check("site search finds content", db2.search(TABLES.news, "transit", ["title", "body"], 5).length > 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

function nfs(f: FileSystem, b: ReturnType<RobotLab["spawn"]>): string {
  return lab.fullLog(b);
}
