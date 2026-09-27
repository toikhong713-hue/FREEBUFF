// Fetches the running preview's module graph over HTTP and asserts that every
// module the app imports transforms and serves cleanly (Vite returns 5xx on a
// transform error, so this catches a broken source file before the browser does).
// Run with: bun scripts/serve-check.ts [origin]
const origin = process.argv[2] ?? "http://localhost:5173";

const seen = new Set<string>();
const bad: string[] = [];
let count = 0;

const resolveUrl = (spec: string, base: string) => {
  try {
    return new URL(spec, base).toString();
  } catch {
    return null;
  }
};

function importsOf(code: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[\s;{}()])(?:import|export)\s*(?:[\w${}*,\s]*?\bfrom\b)?\s*["']([^"']+)["']/g;
  const dyn = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const side = /\bimport\s*["']([^"']+)["']/g;
  for (const r of [re, dyn, side]) {
    let m: RegExpExecArray | null;
    while ((m = r.exec(code))) out.push(m[1]);
  }
  return out;
}

async function walk(url: string, depth = 0): Promise<void> {
  if (seen.has(url) || depth > 40) return;
  seen.add(url);
  count++;

  // Vendor bundles contain import-looking text inside warning strings, so we
  // only extract real specifiers from application source.
  const isVendor = url.includes("/node_modules/");

  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    bad.push(`${url} — fetch failed: ${(e as Error).message}`);
    return;
  }
  if (!res.ok) {
    bad.push(`${url} — HTTP ${res.status}`);
    return;
  }
  const type = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (body.includes("Internal server error") || body.includes("Transform failed")) {
    bad.push(`${url} — transform error in response body`);
    return;
  }
  if (isVendor || !/javascript|typescript/.test(type)) return;

  for (const spec of importsOf(body)) {
    if (/^(https?:|data:|node:)/.test(spec)) continue;
    const next = resolveUrl(spec, url);
    if (next) await walk(next, depth + 1);
  }
}

const entry = resolveUrl("/src/main.tsx", origin);
if (!entry) throw new Error("bad origin");

const html = await (await fetch(origin + "/")).text();
const hasRoot = /id="root"/.test(html);
const scriptTag = /<script[^>]+src="([^"]+)"[^>]*>/.exec(html)?.[1] ?? "";
const hasStyles = /<link[^>]+rel="stylesheet"/.test(html) || /<style/.test(html);

await walk(entry);
// also verify the stylesheet the entry pulls in
const cssHref = (await (await fetch(entry)).text()).match(/import\s*["']([^"']+\.css)["']/)?.[1];
if (cssHref) {
  const cssUrl = resolveUrl(cssHref, entry)!;
  const cssRes = await fetch(cssUrl);
  const cssBody = await cssRes.text();
  if (!cssRes.ok || cssBody.length < 200) bad.push(`${cssUrl} — stylesheet not served (${cssRes.status})`);
}

console.log(`origin        ${origin}`);
console.log(`html served   200, #root=${hasRoot}, entry=${scriptTag || "(inline)"}, styles=${hasStyles}`);
console.log(`modules walked ${count} over http`);
if (bad.length) {
  console.log(`\nFAILURES (${bad.length}):`);
  for (const b of bad) console.log(`  x ${b}`);
  console.log("");
  process.exit(1);
}
console.log(`\nOK  every module in the served graph transforms and returns 200`);
