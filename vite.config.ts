import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Freebuff requires HMR to remain disabled.
//
// Vite rejects requests whose Host header it does not recognise (a DNS-rebinding
// guard). The managed preview is reached on an ephemeral `<port>-<id>.e2b.app`
// host, which is not in Vite's default allow-list. A leading dot allows a domain
// and all of its subdomains, so this survives the workspace host changing
// instead of pinning one hostname. Set PREVIEW_HOST to add another host.
const allowedHosts = [".e2b.app"];
const extra = process.env.PREVIEW_HOST?.trim();
if (extra) allowedHosts.push(extra);

export default defineConfig({
  plugins: [react()],
  server: { hmr: false, host: "0.0.0.0", allowedHosts },
});
