// Renders the real NOVA Cloud PC inside jsdom and drives it end to end:
// boot -> login -> desktop -> every app mounts without throwing.
// Run with: bun scripts/render.ts
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html class="dark"><head></head><body><div id="root"></div></body></html>`, {
  pretendToBeVisual: false,
  url: "http://localhost/",
});

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLCanvasElement = dom.window.HTMLCanvasElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.MouseEvent = dom.window.MouseEvent;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.requestAnimationFrame = (cb: (t: number) => void) =>
  dom.window.setTimeout(() => cb(performance.now()), 24) as unknown as number;
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = false;
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
g.localStorage = dom.window.localStorage;
const proto = dom.window.HTMLElement.prototype as unknown as Record<string, () => void>;
proto.scrollTo = () => {};
proto.setPointerCapture = () => {};
proto.releasePointerCapture = () => {};
proto.animate = () => ({});

// jsdom has no canvas backend. Provide a recording 2D context so the drawing
// code in the city, robot lab, network lab and video player actually executes.
const canvasOps: string[] = [];
const ctx2d = new Proxy(
  {
    canvas: null as unknown,
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  } as Record<string, unknown>,
  {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return (...args: unknown[]) => {
        canvasOps.push(String(prop));
        void args;
      };
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  },
);
(dom.window.HTMLCanvasElement.prototype as unknown as { getContext: (t: string) => unknown }).getContext =
  function getContext(this: unknown) {
    ctx2d.canvas = this;
    return ctx2d;
  };

let pass = 0;
let fail = 0;
const errors: string[] = [];

const realError = console.error;
const realWarn = console.warn;
console.error = (...args: unknown[]) => {
  const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
  if (!/Warning:|not wrapped in act|ReactDOMTestUtils|deprecated|Not implemented/i.test(msg)) {
    errors.push(msg);
  }
  if (/Not implemented/i.test(msg)) return;
  realError(...(args as []));
};
console.warn = (...args: unknown[]) => {
  const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
  if (!/Warning:|deprecated|act\(/i.test(msg)) errors.push(`warn: ${msg}`);
  realWarn(...(args as []));
};
dom.window.addEventListener("error", (e: ErrorEvent) => errors.push(`window: ${e.message}`));
process.on("uncaughtException", (e) => errors.push(`uncaught: ${e.message}`));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  OK  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    realError(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { NovaProvider } = await import("../src/os/wm");
const { Boot } = await import("../src/os/Boot");
const { Desktop } = await import("../src/os/Desktop");
const { APPS } = await import("../src/os/registry");
const { nova } = await import("../src/core/nova");

const h = React.createElement;
const rootEl = dom.window.document.getElementById("root")!;
const root = createRoot(rootEl);
const body = () => dom.window.document.body.textContent ?? "";
const btns = () => Array.from(dom.window.document.querySelectorAll("button")) as HTMLButtonElement[];
const findBtn = (label: string) =>
  btns().find((b) => (b.textContent ?? "").trim().toLowerCase().includes(label.toLowerCase()));

const user = { name: "user", role: "user" as const, home: "/home/user", shell: "/bin/nova-shell", uid: "1000" };

console.log("\nBOOT");
function Shell() {
  const [phase, setPhase] = React.useState("bios");
  return h(NovaProvider, null, phase === "desktop" ? h(Desktop, { user }) : h(Boot, { onDesktop: () => setPhase("desktop") }));
}
root.render(h(Shell));
await sleep(120);
check("app mounts", rootEl.childElementCount > 0, `${rootEl.childElementCount} nodes`);
check("BIOS screen renders", body().includes("NOVA BIOS") || body().includes("NOVA Cloud PC"));

// sample the screen through the whole boot so each stage is actually observed
const stages = [
  ["bios", "NOVA BIOS"],
  ["bootloader", "nova-bootloader"],
  ["kernel", "nova-kernel"],
  ["login", "Sign in"],
] as const;
const seenStage = new Set<string>();
const order: string[] = [];
for (let i = 0; i < 140; i++) {
  await sleep(120);
  const t = body();
  for (const [id, marker] of stages) {
    if (t.includes(marker) && !seenStage.has(id)) {
      seenStage.add(id);
      order.push(id);
    }
  }
  if (seenStage.has("login")) break;
}
for (const [id, marker] of stages) {
  check(`boot stage: ${id}`, seenStage.has(id), marker);
}
check("boot stages run in order", order.join(">") === stages.map((s) => s[0]).join(">"), order.join(" → "));
check("boot reaches login", body().includes("Sign in"));
check("login lists accounts", btns().some((b) => b.textContent?.includes("admin")));

console.log("\nLOGIN");
const signIn = findBtn("sign in as");
check("sign-in button present", !!signIn);
if (signIn) signIn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
for (let i = 0; i < 10; i++) {
  await sleep(200);
  if (dom.window.document.querySelector(".nova-wallpaper")) break;
}
check("desktop reached", !!dom.window.document.querySelector(".nova-wallpaper"));
check("wallpaper present", !!dom.window.document.querySelector(".nova-wallpaper"));
check(
  "desktop icons rendered",
  dom.window.document.querySelectorAll(".desktop-icon").length >= 7,
  `${dom.window.document.querySelectorAll(".desktop-icon").length} icons`,
);
check("taskbar present", !!dom.window.document.querySelector(".taskbar"));

console.log("\nWINDOWS");
const n = nova();
const apps = [
  "files", "terminal", "editor", "calculator", "browser", "settings",
  "taskmgr", "sysmon", "netmgr", "netlab", "appstore", "cloud",
  "drive", "robots", "city",
] as const;

/** Launch an app the way a user would: open the start menu, click its tile. */
async function openViaStartMenu(appId: keyof typeof APPS): Promise<boolean> {
  const click = (el: Element | null | undefined) => {
    el?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  };
  click(dom.window.document.querySelector('[aria-label="Start menu"]'));
  await sleep(60);
  const name = APPS[appId].name;
  const tile = Array.from(dom.window.document.querySelectorAll(".panel button")).find((b) =>
    (b.textContent ?? "").trim().endsWith(name),
  );
  if (!tile) return false;
  click(tile);
  await sleep(60);
  return true;
}

for (const app of apps) {
  const before = errors.length;
  const launched = await openViaStartMenu(app);
  await sleep(200);
  const frames = Array.from(dom.window.document.querySelectorAll('[role="dialog"]'));
  const text = frames.map((f) => f.textContent ?? "").join(" ");
  const ok = launched && text.length > 200 && errors.length === before;
  check(`${app} mounts`, ok, ok ? `${text.length} chars` : !launched ? "no start-menu tile" : errors.slice(before).join(" | ") || "empty");
}

check("processes registered", n.proc.list().length >= 15, `${n.proc.list().length} processes`);
check("windows opened", dom.window.document.querySelectorAll('[role="dialog"]').length >= apps.length,
  `${dom.window.document.querySelectorAll('[role="dialog"]').length} windows`);

console.log("\nKEY APPS");
const frames = () =>
  Array.from(dom.window.document.querySelectorAll('[role="dialog"]')) as HTMLElement[];
const frameByTitle = (t: string) => frames().find((f) => f.getAttribute("aria-label") === t);

/** Close every window so the next app is observed on a clean desktop. */
async function closeAll() {
  for (const f of frames()) {
    const close = f.querySelector('[aria-label="Close"]');
    close?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await sleep(30);
  }
}

// File Manager: lists the real shared filesystem
await closeAll();
let errs = errors.length;
check("file manager opens", await openViaStartMenu("files"), "via start menu");
await sleep(400);
{
  const f = frameByTitle("File Manager");
  const text = f?.textContent ?? "";
  check("file manager lists shared filesystem",
    !!f && ["home", "documents", "robots", "city", "network", "websites", "cloud", "system"]
      .some((d) => text.includes(d)),
    f
      ? `${text.length} chars, cwd: /${Array.from(f.querySelectorAll(".nowrap-scroll button"))
          .map((b) => b.textContent?.trim())
          .join("/")}`
      : "window missing");
  check("file manager renders rows", (f?.querySelectorAll("[data-row], .row").length ?? 0) > 0,
    `${f?.querySelectorAll("[data-row], .row").length ?? 0} rows`);
  check("file manager error-free", errors.length === errs, errors.slice(errs).join(" | "));
}

// Terminal: real command output from the live machine
await closeAll();
errs = errors.length;
check("terminal opens", await openViaStartMenu("terminal"), "via start menu");
await sleep(400);
{
  const f = frameByTitle("nova-shell — 80×24");
  check("terminal window present", !!f);
  const input = f?.querySelector("input") as HTMLInputElement | null;
  check("terminal accepts input", !!input);
  if (input) {
    const setValue = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    const run = async (cmd: string) => {
      setValue.call(input, cmd);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      await sleep(20);
      input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await sleep(60);
    };
    await run("ls /");
    await run("city stats");
    await run("netdevices");
    await run("robots list");
    const out = f?.textContent ?? "";
    check("terminal ls shows shared dirs", out.includes("documents") && out.includes("robots"));
    check("terminal city stats live", out.includes("CITY TELEMETRY"));
    check("terminal netdevices live", out.includes("HOSTNAME"));
    check("terminal robots list live", out.includes("SAVED CONFIGURATIONS"));
  }
  check("terminal error-free", errors.length === errs, errors.slice(errs).join(" | "));
}

// Browser: renders a simulated website from the shared database
await closeAll();
errs = errors.length;
check("browser opens", await openViaStartMenu("browser"), "via start menu");
await sleep(900);
{
  const f = frameByTitle("NOVA Browser");
  const text = f?.textContent ?? "";
  check("browser window present", !!f);
  check("browser renders a site", text.includes("NovaSearch") || text.includes("Trending"),
    f ? `${text.length} chars` : "window missing");
  check("browser error-free", errors.length === errs, errors.slice(errs).join(" | "));
}

console.log("\nLIVE SIMULATION");
const beforeErr = errors.length;
const clock0 = n.city.minutes;
for (let i = 0; i < 24; i++) await sleep(55);
check("no errors while simulating", errors.length === beforeErr);
check("kernel ticking", n.rev > 20, `rev=${n.rev}`);
check("city clock advances", n.city.minutes !== clock0, `t=${n.city.minutes.toFixed(0)}min`);
check("city agents alive", n.city.npcs.length >= 200, `${n.city.npcs.length} agents`);
check("city builds buildings", n.city.buildings.length > 200, `${n.city.buildings.length}`);
check("robot world ready", n.robots.obstacles.length > 20, `${n.robots.obstacles.length} obstacles`);
check("network fabric alive", n.net.devices.size >= 9, `${n.net.devices.size} devices`);
check("filesystem seeded", n.fs.count().files > 0, `${n.fs.count().files} files`);
check("database seeded", n.db.tableNames().length > 0, `${n.db.tableNames().length} tables`);
check("cloud accounts", n.cloud.accounts.length >= 3, `${n.cloud.accounts.length}`);

console.log("\nPERSISTENCE");
n.persist();
check("machine saved to localStorage", dom.window.localStorage.getItem("nova-cloud-pc:v1") !== null);

console.log("\nTEARDOWN");
nova().stop();
root.unmount();
await sleep(60);
check("canvas draw code ran", canvasOps.includes("fillRect") || canvasOps.includes("arc"), `${canvasOps.length} canvas ops`);
check("no uncaught errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
