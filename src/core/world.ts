// Seeds the shared database with the fictional NOVA internet: people, posts,
// news, products, forums, mail, trends — and builds the default Mini Internet
// Lab topology that everything else routes through.
import { Database, TABLES } from "./db";
import { Network } from "./net";
import { Rng } from "./rng";

export const FIRST = [
  "Ada", "Kai", "Mira", "Jonas", "Yuki", "Sasha", "Lior", "Nadia", "Tomas", "Rhea",
  "Emil", "Zara", "Felix", "Ines", "Dmitri", "Ola", "Cato", "Nour", "Sven", "Amara",
  "Bo", "Leni", "Hugo", "Priya", "Otto", "Wren", "Ivo", "Sol", "Ada", "Pia",
];

export const LAST = [
  "Lindqvist", "Okafor", "Moreau", "Halvorsen", "Tanaka", "Petrov", "Nakamura",
  "Abara", "Costa", "Bergman", "Novak", "Ferrari", "Kowalski", "Reyes", "Sorensen",
  "Ahmadi", "Whitfield", "Duarte", "Larsen", "Marchetti", "Kaur", "Bishop",
];

export const OCCUPATIONS = [
  "Nurse", "Baker", "Engineer", "Teacher", "Barista", "Analyst", "Mechanic",
  "Designer", "Paramedic", "Grocer", "Dispatcher", "Librarian", "Tailor",
  "Electrician", "Sommelier", "Archivist", "Pilot", "Botanist", "Chemist", "Jeweller",
];

export const CITY_DISTRICTS = [
  "Northgate", "Aurora Heights", "Old Harbour", "Cobalt Row", "Lakeside",
  "Ironworks", "Verdant Park", "Sunmarket", "Halcyon Bay", "Stonebridge",
];

const HANDLE_SUFFIX = ["nova", "core", "flux", "byte", "hex", "byte", "lumen", "orbit", "spark", "grid"];

export interface SeedResult {
  users: number;
  posts: number;
  articles: number;
  products: number;
}

export function seedWorld(db: Database, net: Network, seed = 20260927): SeedResult {
  const rng = new Rng(seed);
  const now = Date.now();
  const HOUR = 3600_000;
  const DAY = 24 * HOUR;

  // ------------------------------------------------------------- people
  const handles: string[] = [];
  for (let i = 0; i < 46; i++) {
    const first = rng.pick(FIRST);
    const last = rng.pick(LAST);
    const handle = `${first.toLowerCase()}.${rng.pick(HANDLE_SUFFIX)}${rng.int(1, 99)}`;
    if (handles.includes(handle)) continue;
    handles.push(handle);
    const district = rng.pick(CITY_DISTRICTS);
    db.insert(TABLES.users, {
      handle,
      name: `${first} ${last}`,
      age: rng.int(19, 74),
      occupation: rng.pick(OCCUPATIONS),
      district,
      bio: `${rng.pick(["Systems thinker", "Baker of very good bread", "Night-shift radio operator", "Urban cartographer", "Tinkerer of small aircraft", "Marine biologist", "Retired signalman", "Amateur radio + chess", "Glassblower", "Trained pastry chef"])}. Based in ${district}.`,
      followers: rng.int(40, 9800),
      following: rng.int(20, 900),
      verified: rng.bool(0.18),
      online: rng.bool(0.45),
      joined: now - rng.int(30, 1400) * DAY,
    });
  }
  // the signed-in user
  db.insert(TABLES.users, {
    id: "u_me",
    handle: "you",
    name: "Nova User",
    age: 29,
    occupation: "Cloud Operator",
    district: "Cobalt Row",
    bio: "Operating NOVA CLOUD PC.",
    followers: 128,
    following: 64,
    verified: true,
    online: true,
    joined: now - 400 * DAY,
  });

  // ------------------------------------------------------------- posts
  const topics = [
    "NOVA cloud uptime", "Aurora transit expansion", "helios-9 launch", "packet loss on 203.0.113",
    "robotics lab grads", "the Ironworks festival", "novasearch ranking drama", "harbour cleanup",
    "helios forums outage", "Cobalt Row housing", "Lakeside footpath", "quant vs. classical debate",
  ];
  let postCount = 0;
  for (let i = 0; i < 160; i++) {
    const author = rng.pick(handles);
    const topic = rng.pick(topics);
    const body = rng.pick([
      `${topic} — anyone else seeing this? Been a strange 24h.`,
      `Hot take: ${topic} is quietly the most interesting thing happening in Aurora right now.`,
      `Update: ${topic}. Details at the civic hall if anyone wants to come ask questions.`,
      `I spent four hours on ${topic} today and I have regrets.`,
      `${topic}: the fix was, predictably, one cable.`,
      `Genuinely impressed by how far ${topic} has come this year.`,
      `Reminder that ${topic} discussion thread is still open in the forum.`,
      `If you are near the harbour tonight: ${topic}. Bring a coat.`,
    ]);
    const likes = rng.int(0, 640);
    const post = db.insert(TABLES.posts, {
      author,
      body,
      topic,
      ts: now - rng.int(1, 200) * HOUR,
      likes,
      reposts: Math.floor(likes / 7),
      comments: 0,
    });
    postCount++;
    const nComments = rng.int(0, 4);
    for (let c = 0; c < nComments; c++) {
      db.insert(TABLES.comments, {
        postId: post.id,
        author: rng.pick(handles),
        body: rng.pick([
          "Strong agree.", "Source?", "This matches what I saw from Lakeside.",
          "Can you post the logs?", "Adding this to the wiki.", "Wild.",
        ]),
        ts: post.ts + rng.int(1, 40) * 60_000,
        likes: rng.int(0, 34),
      });
      db.update(TABLES.posts, post.id, { comments: nComments });
    }
  }

  // ------------------------------------------------------------- follows
  for (const h of handles) {
    const n = rng.int(3, 16);
    const picked = rng.shuffle([...handles]).slice(0, n);
    for (const f of picked) if (f !== h) db.insert(TABLES.follows, { from: h, to: f });
  }

  // ------------------------------------------------------------- news
  db.insertMany(TABLES.sources, [
    { name: "Aurora Herald", hue: 210, kind: "daily" },
    { name: "Helios Wire", hue: 8, kind: "breaking" },
    { name: "The Lakeside Review", hue: 145, kind: "weekly" },
    { name: "Cobalt Tech", hue: 268, kind: "tech" },
    { name: "Old Harbour Gazette", hue: 40, kind: "local" },
  ]);
  const headlines = [
    "Transit authority approves night bus service through Northgate",
    "Packet degradation traced to a single flooded junction in Ironworks",
    "Robotics lab graduates 40 autonomous surveyors",
    "Harbour water quality hits a five-year high",
    "Nova Cloud reports record uptime across Aurora region",
    "Housing co-op converts old customs house into 88 apartments",
    "Storm front expected to stall the festival",
    "City council debates robot delivery permits",
    "Lakeside footpath restoration enters final phase",
    "Novasearch publishes its transparency report",
    "Grid operator warns of peak load during cold snap",
    "Forum outage traced to a runaway thread",
    "Aurora population passes 210,000",
    "New research wing opens at the city university",
    "Farmers market expands to three new districts",
    "City energy mix reaches 62% renewable",
  ];
  for (let i = 0; i < 28; i++) {
    const title = headlines[i % headlines.length];
    const source = rng.pick(db.all(TABLES.sources));
    db.insert(TABLES.news, {
      title,
      source: source.name,
      hue: source.hue,
      category: rng.pick(["City", "Tech", "Transport", "Weather", "Culture", "Business"]),
      ts: now - rng.int(10, 4000) * 60_000,
      breaking: rng.bool(0.16),
      views: rng.int(320, 90000),
      body:
        `AURORA — ${title}.\n\n` +
        `Officials confirmed the development this morning, saying the project had been months in the works. ` +
        `Local residents have largely welcomed the move, with several noting it "closes a gap that has been obvious for years".\n\n` +
        `Construction is expected to begin next quarter, with completion targeted for the following winter. ` +
        `A spokesperson declined to comment on the projected cost, citing "the usual procurement timetable".\n\n` +
        `— Reported by the ${source.name}`,
    });
  }

  // ------------------------------------------------------------- products
  const productNames = [
    "Field Notebook, 3-pack", "Cast Iron Pan", "Aurora Wool Scarf", "Ceramic Pour-Over",
    "Mechanical Keyboard", "USB-C Hub 8-in-1", "Rain Shell", "Field Recorder Mk II",
    "Espresso Beans 1kg", "Bike Repair Stand", "Solar Lantern", "Loom Monitor 27\"",
    "Trail Shoes", "Analog Multimeter", "Cold Brew Steepers", "Canvas Tote",
  ];
  for (let i = 0; i < 30; i++) {
    const name = productNames[i % productNames.length];
    db.insert(TABLES.products, {
      name: `${name} #${rng.int(100, 999)}`,
      category: rng.pick(["Tools", "Home", "Outdoors", "Electronics", "Apparel", "Kitchen"]),
      price: Number((rng.range(8, 460)).toFixed(2)),
      stock: rng.int(0, 240),
      rating: Number(rng.range(3.1, 5).toFixed(1)),
      reviews: rng.int(4, 1800),
      seller: rng.pick(handles),
      ships: `1-${rng.int(1, 6)} days`,
    });
  }

  // ------------------------------------------------------------- forum
  const threadTitles = [
    "PSA: Ironworks junction is down for maintenance",
    "Show us your terminal setup",
    "Best place to learn packet analysis?",
    "City robot delivery permit — what actually got approved",
    "Recommend a mechanical keyboard for long sessions",
    "Anyone else running NOVA on a low-end machine?",
    "Lakeside night bus times are wrong on the city site",
    "Building a home lab: where to start",
  ];
  for (let i = 0; i < 14; i++) {
    const thread = db.insert(TABLES.threads, {
      title: threadTitles[i % threadTitles.length],
      author: rng.pick(handles),
      board: rng.pick(["networking", "nova", "city", "hardware", "off-topic"]),
      ts: now - rng.int(20, 3000) * 60_000,
      pinned: i === 0,
      views: rng.int(40, 5200),
    });
    for (let r = 0; r < rng.int(2, 9); r++) {
      db.insert(TABLES.comments, {
        postId: thread.id,
        threadId: thread.id,
        author: rng.pick(handles),
        body: rng.pick([
          "Great write-up, bookmarked.", "This matches my experience exactly.",
          "OP: check the TTL on that traceroute, that's the whole story.",
          "Adding a note from Ironworks — same problem here.",
          "Sorted, thanks!", "Would love a follow-up post.",
        ]),
        ts: thread.ts + rng.int(5, 600) * 60_000,
        likes: rng.int(0, 88),
      });
    }
  }

  // ------------------------------------------------------------- mail
  const mailSubjects = [
    "Your NOVA Cloud invoice for this cycle",
    "Welcome to Aurora — your resident pass",
    "Action needed: rotate your simulation keys",
    "Cobalt Tech: your build finished",
    "Night bus route consultation closes Friday",
    "Receipt from Novashop #88214",
    "Robotics Lab: telemetry export ready",
    "Storage almost full — 92% used",
  ];
  for (let i = 0; i < 18; i++) {
    const read = rng.bool(0.55);
    const flagged = rng.bool(0.15);
    db.insert(TABLES.mail, {
      folder: rng.pick(["inbox", "inbox", "inbox", "sent", "drafts", "spam", "archive"]),
      from: rng.pick(handles) + "@novanet.io",
      to: "you@nova.cloud",
      subject: mailSubjects[i % mailSubjects.length],
      ts: now - rng.int(5, 20000) * 60_000,
      read,
      flagged,
      starred: rng.bool(0.2),
      hasAttachment: rng.bool(0.3),
      attachment: rng.bool(0.3) ? `${rng.pick(["invoice", "telemetry", "pass", "build", "receipt"])}.${rng.pick(["pdf", "log", "csv", "png"])}` : null,
      body:
        `Hi,\n\n${mailSubjects[i % mailSubjects.length]}.\n\n` +
        `This message was generated inside the NOVA CLOUD PC simulation. ` +
        `Nothing left your machine — the whole internet is one process away.\n\n— NOVA Services`,
    });
  }

  // ------------------------------------------------------------- trends
  for (const t of topics) {
    db.insert(TABLES.trends, { term: t, volume: rng.int(1200, 480000) });
  }

  // ------------------------------------------------------------- topology
  buildDefaultTopology(net);

  return {
    users: db.count(TABLES.users),
    posts: postCount,
    articles: db.count(TABLES.news),
    products: db.count(TABLES.products),
  };
}

/** The reference LAN every user starts with: PC -> switch -> router -> firewall -> cloud. */
export function buildDefaultTopology(net: Network): void {
  net.devices.clear();
  net.links.clear();
  const pc = net.createDevice({ type: "pc", name: "workstation-01", hostname: "pc", x: 90, y: 190 });
  const laptop = net.createDevice({ type: "pc", name: "laptop-02", hostname: "laptop", x: 90, y: 320 });
  const sw = net.createDevice({ type: "switch", name: "core-switch", hostname: "sw1", x: 300, y: 250 });
  const router = net.createDevice({ type: "router", name: "edge-router", hostname: "rtr1", x: 500, y: 250 });
  const fw = net.createDevice({ type: "firewall", name: "perimeter-fw", hostname: "fw1", x: 690, y: 250 });
  const dns = net.createDevice({ type: "dns", name: "nova-dns", hostname: "dns1", x: 690, y: 110, isDns: true });
  const web = net.createDevice({ type: "web", name: "edge-web", hostname: "web1", x: 880, y: 180 });
  const db = net.createDevice({ type: "server", name: "data-server", hostname: "db1", x: 880, y: 330, isDb: true });
  const cloud = net.createDevice({ type: "cloud", name: "nova-cloud", hostname: "cloud1", x: 1070, y: 250 });
  cloud.ifaces[0].ip = "198.51.100.2";
  cloud.routes = [{ net: "10.0.0.0", mask: "255.255.0.0", via: null, iface: "eth0", metric: 0 }];

  web.http = { host: "my-site.nova", title: "My Site", kind: "custom", body: "hello", port: 80 };
  dns.notes = "Authoritative for *.nova";

  net.connect(pc.id, sw.id, { latency: 0.4, loss: 0 });
  net.connect(laptop.id, sw.id, { latency: 0.7, loss: 0.001 });
  net.connect(sw.id, router.id, { latency: 0.5, loss: 0 });
  net.connect(router.id, fw.id, { latency: 1.2, loss: 0.002 });
  net.connect(router.id, dns.id, { latency: 1.1, loss: 0.001 });
  net.connect(fw.id, web.id, { latency: 2.4, loss: 0.004 });
  net.connect(fw.id, db.id, { latency: 2.1, loss: 0.003 });
  net.connect(fw.id, cloud.id, { latency: 3.0, loss: 0.006 });
  net.connect(web.id, cloud.id, { latency: 1.6, loss: 0.002 });
  net.connect(db.id, cloud.id, { latency: 1.4, loss: 0.002 });

  fw.firewall.push(
    { id: "fwr1", action: "allow", srcIp: "10.0.0.0/24", dstIp: "*", protocol: "any", dstPort: null, priority: 10, enabled: true, hits: 0 },
    { id: "fwr2", action: "block", srcIp: "*", dstIp: "*", protocol: "TCP", dstPort: 23, priority: 20, enabled: true, hits: 0 },
    { id: "fwr3", action: "block", srcIp: "203.0.113.0/24", dstIp: "10.0.0.0/24", protocol: "any", dstPort: null, priority: 30, enabled: true, hits: 0 },
  );
}
