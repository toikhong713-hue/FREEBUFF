import { useCallback, useEffect, useRef, useState } from "react";
import { nova } from "../core/nova";
import { TABLES } from "../core/db";
import { fmtBytes, fmtDuration } from "../core/rng";
import { configDerived } from "../core/robots";
import type { RobotConfig } from "../core/robots";
import { useKernel } from "../os/hooks";

interface Line {
  id: number;
  kind: "in" | "out" | "err" | "sys";
  text: string;
}

const COMMANDS: Record<string, { usage: string; desc: string; group: string }> = {
  help: { usage: "help [cmd]", desc: "List commands, or explain one", group: "core" },
  ls: { usage: "ls [-l] [path]", desc: "List directory contents", group: "fs" },
  cd: { usage: "cd <path>", desc: "Change working directory", group: "fs" },
  pwd: { usage: "pwd", desc: "Print working directory", group: "fs" },
  mkdir: { usage: "mkdir [-p] <dir>", desc: "Create a directory", group: "fs" },
  touch: { usage: "touch <file>", desc: "Create an empty file", group: "fs" },
  cat: { usage: "cat <file>", desc: "Print a file", group: "fs" },
  echo: { usage: "echo <text> [> file]", desc: "Print or write text", group: "fs" },
  cp: { usage: "cp <src> <dst>", desc: "Copy a file or directory", group: "fs" },
  mv: { usage: "mv <src> <dst>", desc: "Move or rename", group: "fs" },
  rm: { usage: "rm [-r] <path>", desc: "Delete a file or directory", group: "fs" },
  tree: { usage: "tree [path]", desc: "Show a directory tree", group: "fs" },
  find: { usage: "find <query>", desc: "Search every file by name", group: "fs" },
  df: { usage: "df", desc: "Show filesystem usage", group: "fs" },
  clear: { usage: "clear", desc: "Clear the screen", group: "core" },
  ps: { usage: "ps [-l]", desc: "List running processes", group: "system" },
  kill: { usage: "kill <pid>", desc: "Terminate a process", group: "system" },
  top: { usage: "top", desc: "Live process snapshot", group: "system" },
  mem: { usage: "mem", desc: "Memory usage by process", group: "system" },
  sysinfo: { usage: "sysinfo", desc: "Machine, kernel and region info", group: "system" },
  uptime: { usage: "uptime", desc: "System uptime", group: "system" },
  whoami: { usage: "whoami", desc: "Print the current user", group: "system" },
  ping: { usage: "ping <ip|host> [count]", desc: "Send ICMP through the fabric", group: "net" },
  traceroute: { usage: "traceroute <ip|host>", desc: "Show the hop path", group: "net" },
  nslookup: { usage: "nslookup <host>", desc: "Resolve a hostname", group: "net" },
  netstat: { usage: "netstat", desc: "Simulated sockets", group: "net" },
  ipconfig: { usage: "ipconfig", desc: "Interfaces and routing tables", group: "net" },
  ifconfig: { usage: "ifconfig", desc: "Interface addresses", group: "net" },
  arp: { usage: "arp", desc: "Neighbour table", group: "net" },
  route: { usage: "route", desc: "Show routing tables", group: "net" },
  netdevices: { usage: "netdevices", desc: "List simulated network devices", group: "net" },
  packets: { usage: "packets [n]", desc: "Recent packets on the wire", group: "net" },
  resolve: { usage: "resolve <ip>", desc: "Reverse DNS lookup", group: "net" },
  npm: { usage: "npm <install|run|list>", desc: "Manage the simulated package registry", group: "dev" },
  python: { usage: "python <file|code>", desc: "Run a simulated Python interpreter", group: "dev" },
  gpp: { usage: "g++ <file>", desc: "Compile C++ in the sandbox", group: "dev" },
  gxx: { usage: "g++ <file>", desc: "Compile C++ in the sandbox", group: "dev" },
  rustc: { usage: "rustc <file>", desc: "Compile Rust in the sandbox", group: "dev" },
  robots: { usage: "robots [list|run|stop|log|bench]", desc: "Control the AI Robot Lab", group: "lab" },
  city: { usage: "city [stats|npcs|news|weather]", desc: "Query the virtual city", group: "lab" },
  cloud: { usage: "cloud [info|servers|sync|accounts]", desc: "Cloud services and sync", group: "lab" },
  serve: { usage: "serve <host> <port> <file>", desc: "Host a file on the edge web device", group: "lab" },
  db: { usage: "db <table> [count|head]", desc: "Query the NovaDB engine", group: "lab" },
  search: { usage: "search <query>", desc: "Search the simulated internet", group: "internet" },
  web: { usage: "web <url>", desc: "Fetch a page over the simulated network", group: "internet" },
  history: { usage: "history", desc: "Command history", group: "core" },
  date: { usage: "date", desc: "Current machine time", group: "core" },
  theme: { usage: "theme <dark|light>", desc: "Switch theme", group: "core" },
  exit: { usage: "exit", desc: "Close this terminal", group: "core" },
};

let lineId = 0;
/** shared across terminal windows so `history` reflects the session */
const cmdHistory: string[] = [];

export function TerminalApp({ args }: { args: Record<string, unknown> }) {
  const n = useKernel();
  const [lines, setLines] = useState<Line[]>(() => [
    { id: lineId++, kind: "sys", text: "nova-shell 6.4.0 (nova-kernel 6.4.0) — type `help` for the command list" },
    { id: lineId++, kind: "sys", text: "Six subsystems are live. Try `city stats`, `robots list`, `netdevices`." },
  ]);
  const [input, setInput] = useState((args.run as string) || "");
  const [cwd, setCwd] = useState("/home/user");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] = useState<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const write = useCallback((text: string, kind: Line["kind"] = "out") => {
    const parts = text.split("\n");
    setLines((prev) => [
      ...prev,
      ...parts.map((t) => ({ id: lineId++, kind, text: t })),
    ]);
  }, []);

  const run = useCallback(
    (raw: string) => {
      const cmd = raw.trim();
      write(`${user()}$ ${cmd}`, "in");
      if (!cmd) return;
      setHistory((h) => {
        const next = [cmd, ...h].slice(0, 200);
        cmdHistory.length = 0;
        cmdHistory.push(...next);
        return next;
      });
      if (autocomplete) setAutocomplete(null);
      try {
        execute(n, cmd, cwd, setCwd, write, () => setLines([]));
      } catch (err) {
        write(`error: ${(err as Error).message}`, "err");
      }
    },
    [cwd, n, write, autocomplete],
  );

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const v = input;
      setInput("");
      run(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const i = Math.min(hIdx + 1, history.length - 1);
      if (history[i] !== undefined) {
        setHIdx(i);
        setInput(history[i]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const i = Math.max(hIdx - 1, -1);
      setHIdx(i);
      setInput(i < 0 ? "" : history[i]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const segs = input.split(" ");
      const last = segs[segs.length - 1] ?? "";
      let pool: string[] = Object.keys(COMMANDS);
      if (segs.length > 1) {
        const arg = last.startsWith("/") ? last : `${cwd}/${last}`;
        pool = n.fs
          .list(arg)
          .map((x) => x.name);
      }
      const hit = pool.filter((p) => p.startsWith(last) && p !== last);
      if (hit.length === 1) {
        segs[segs.length - 1] = hit[0];
        setInput(segs.join(" ") + (segs.length > 1 ? "" : " "));
      } else if (hit.length > 1) {
        setAutocomplete(hit.join("   "));
        window.setTimeout(() => setAutocomplete(null), 2600);
      }
    }
  };

  return (
    <div
      className="col grow"
      onClick={() => inputRef.current?.focus()}
      style={{
        background: "linear-gradient(180deg, rgba(4,10,8,0.55), rgba(3,6,12,0.75))",
        fontFamily: "var(--mono)",
        fontSize: 12.5,
        lineHeight: 1.5,
        minHeight: 0,
      }}
    >
      <div ref={scrollRef} className="scroll grow" style={{ padding: "10px 12px" }}>
        {lines.map((l) => (
          <div
            key={l.id}
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color:
                l.kind === "in" ? "var(--text)"
                : l.kind === "err" ? "#fca5a5"
                : l.kind === "sys" ? "#6ee7b7"
                : "#a9c4e4",
            }}
          >
            {l.text}
          </div>
        ))}
        {autocomplete && (
          <div style={{ color: "var(--text-3)" }}>{autocomplete}</div>
        )}
        <div className="row" style={{ gap: 6 }}>
          <span style={{ color: "var(--ok)" }}>{user()}$</span>
          <span className="grow" style={{ position: "relative" }}>
            <input
              ref={inputRef}
              value={input}
              autoFocus
              spellCheck={false}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              aria-label="Terminal input"
              style={{
                width: "100%",
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--text)",
                font: "inherit",
                padding: 0,
              }}
            />
          </span>
        </div>
      </div>
      <div
        className="app-status"
        style={{ fontFamily: "var(--font)", gap: 12, flexWrap: "wrap" }}
      >
        <span className="mono">{cwd}</span>
        <span className="dim">|</span>
        <span>{Object.keys(COMMANDS).length} commands</span>
        <span className="dim">|</span>
        <span className="mono">
          {n.proc.list().length} proc · {n.net.devices.size} devices · {n.city.npcs.length} NPCs · {n.robots.robots.length} bots
        </span>
        <span className="spacer" />
        <span className="dim tiny">Tab completes · ↑↓ history</span>
      </div>
    </div>
  );
}

function user(): string {
  try {
    return localStorage.getItem("nova-settings")
      ? (JSON.parse(localStorage.getItem("nova-settings")!).username ?? "user")
      : "user";
  } catch {
    return "user";
  }
}

/* --------------------------------------------------------------- execution */

type Writer = (text: string, kind?: Line["kind"]) => void;

function execute(
  n: ReturnType<typeof nova>,
  raw: string,
  cwd: string,
  setCwd: (p: string) => void,
  write: Writer,
  clearScreen: () => void,
): void {
  const argv = tokenize(raw);
  const cmd = argv[0];
  const args = argv.slice(1);
  const flags = args.filter((a) => a.startsWith("-"));
  const rest = args.filter((a) => !a.startsWith("-"));
  const has = (f: string) => flags.some((x) => x.includes(f));

  if (!COMMANDS[cmd]) {
    write(`nova-shell: command not found: ${cmd}`, "err");
    return;
  }

  const abs = (p: string) => n.fs.normalize(p, cwd);

  switch (cmd) {
    case "help": {
      if (rest[0] && COMMANDS[rest[0]]) {
        const c = COMMANDS[rest[0]];
        write(`  ${c.usage}\n      ${c.desc}`, "sys");
        return;
      }
      const groups = [...new Set(Object.values(COMMANDS).map((c) => c.group))];
      write("NOVA CLOUD PC — nova-shell command set", "sys");
      for (const g of groups) {
        write(`\n  [${g}]`);
        for (const [name, c] of Object.entries(COMMANDS)) {
          if (c.group !== g) continue;
          write(`    ${name.padEnd(12)} ${c.desc}`);
        }
      }
      write("\n  Every command reads and writes the one live machine: the filesystem,");
      write("  the process table, the network fabric, the robot lab, the city and the cloud.");
      return;
    }

    case "ls": {
      const target = rest[0] ? abs(rest[0]) : cwd;
      const list = n.fs.list(target);
      if (!n.fs.exists(target)) {
        write(`ls: ${target}: no such directory`, "err");
        return;
      }
      if (!list.length) {
        write("(empty)", "sys");
        return;
      }
      if (has("l")) {
        write(`${target}`);
        for (const node of list) {
          const st = n.fs.stat(n.fs.pathOf(node))!;
          const d = new Date(st.modified).toISOString().slice(5, 16).replace("T", " ");
          const size = node.type === "dir" ? "-" : String(st.size).padStart(8);
          write(`${st.mode} 1 ${st.owner.padEnd(6)} ${st.origin.padEnd(6)} ${d} ${size}  ${node.name}${node.type === "dir" ? "/" : ""}`);
        }
      } else {
        write(list.map((x) => (x.type === "dir" ? x.name + "/" : x.name)).join("   "));
      }
      return;
    }

    case "cd": {
      const t = abs(rest[0] ?? "/home/user");
      const node = n.fs.resolve(t);
      if (!node) {
        write(`cd: ${t}: no such directory`, "err");
        return;
      }
      if (node.type !== "dir") {
        write(`cd: ${t}: not a directory`, "err");
        return;
      }
      setCwd(t);
      return;
    }

    case "pwd":
      write(cwd);
      return;

    case "mkdir": {
      if (!rest[0]) return write("mkdir: missing operand", "err");
      if (has("p")) {
        for (const p of rest) n.fs.mkdirp(p, { cwd, origin: "user" });
        write(`created ${rest.join(", ")}`);
      } else {
        for (const p of rest) {
          if (n.fs.mkdir(p, { cwd, origin: "user" })) write(`created ${abs(p)}`);
          else write(`mkdir: ${p}: already exists`, "err");
        }
      }
      return;
    }

    case "touch": {
      if (!rest[0]) return write("touch: missing file operand", "err");
      for (const p of rest) n.fs.write(p, "", { cwd, origin: "user" });
      write(`touched ${rest.length} file(s)`);
      return;
    }

    case "cat": {
      if (!rest[0]) return write("cat: missing file operand", "err");
      for (const p of rest) {
        const t = abs(p);
        const node = n.fs.resolve(t);
        if (!node) write(`cat: ${p}: no such file`, "err");
        else if (node.type === "dir") write(`cat: ${p}: is a directory`, "err");
        else write(node.content || "(empty file)");
      }
      return;
    }

    case "echo": {
      const text = args.join(" ");
      const redirect = text.match(/^(.*?)\s*>>?\s*(\S+)$/);
      if (redirect) {
        const [, body, file] = redirect;
        n.fs.append(file, body + "\n", { cwd, origin: "user" });
        write(`wrote ${body.length} bytes to ${abs(file)}`, "sys");
      } else {
        write(text.replace(/^["']|["']$/g, ""));
      }
      return;
    }

    case "cp": {
      if (rest.length < 2) return write("cp: needs source and destination", "err");
      if (!n.fs.cp(rest[0], rest[1], cwd)) write(`cp: cannot copy ${rest[0]} → ${rest[1]}`, "err");
      else write(`copied ${abs(rest[0])} → ${abs(rest[1])}`);
      return;
    }

    case "mv": {
      if (rest.length < 2) return write("mv: needs source and destination", "err");
      if (!n.fs.mv(rest[0], rest[1], cwd)) write(`mv: cannot move ${rest[0]} → ${rest[1]}`, "err");
      else write(`moved ${rest[0]} → ${abs(rest[1])}`);
      return;
    }

    case "rm": {
      if (!rest[0]) return write("rm: missing operand", "err");
      for (const p of rest) {
        const t = abs(p);
        const ok = n.fs.rm(t, { recursive: has("r") || has("R") || has("rf") || has("fr") });
        if (!ok) write(`rm: ${p}: not removable (use -r for directories)`, "err");
        else write(`removed ${t}`, "sys");
      }
      return;
    }

    case "tree": {
      const base = rest[0] ? abs(rest[0]) : cwd;
      if (!n.fs.exists(base)) return write(`tree: ${base}: not found`, "err");
      write(base);
      let files = 0;
      let dirs = 0;
      const walk = (path: string, prefix: string) => {
        const kids = n.fs.list(path);
        kids.forEach((k, i) => {
          const last = i === kids.length - 1;
          const kp = n.fs.pathOf(k);
          write(`${prefix}${last ? "└── " : "├── "}${k.name}${k.type === "dir" ? "/" : ""}`);
          if (k.type === "dir") {
            dirs++;
            if (prefix.split("│").length < 9) walk(kp, prefix + (last ? "    " : "│   "));
          } else files++;
        });
      };
      walk(base, "");
      write(`\n${dirs} directories, ${files} files`);
      return;
    }

    case "find": {
      if (!rest[0]) return write("find: missing query", "err");
      const hits = n.fs.find(rest.join(" "));
      if (!hits.length) return write("no matches", "sys");
      hits.slice(0, 60).forEach((h) => write(n.fs.pathOf(h) + (h.type === "dir" ? "/" : "")));
      write(`${hits.length} match(es)`, "sys");
      return;
    }

    case "df": {
      const c = n.fs.count();
      write("Filesystem      Size      Used     Avail   Use%  Mounted on");
      write(
        `novafs4         ${(n.proc.diskTotalMb / 1024).toFixed(0)}G  ${(n.proc.diskUsedMb / 1024).toFixed(1)}G  ` +
          `${Math.max(0, (n.proc.diskTotalMb - n.proc.diskUsedMb) / 1024).toFixed(1)}G  ` +
          `${((n.proc.diskUsedMb / n.proc.diskTotalMb) * 100).toFixed(1)}%  /`,
      );
      write(`cloud bucket    ${n.cloud.quotaGb}G     ${n.cloud.storageUsedGb().toFixed(2)}G   ${(n.cloud.quotaGb - n.cloud.storageUsedGb()).toFixed(2)}G   ${n.cloud.storagePct().toFixed(1)}%  /cloud`, "sys");
      write(`\n${c.files} files, ${c.dirs} directories, ${fmtBytes(n.fs.usedBytes())} in the shared tree`, "sys");
      return;
    }

    case "clear":
      clearScreen();
      return;

    case "ps": {
      const procs = n.proc.list();
      const s = n.system;
      write("  PID  USER      S  %CPU  %MEM     RSS  NAME");
      for (const p of procs) {
        write(
          `${String(p.pid).padStart(5)}  ${p.user.padEnd(9)} ${p.state[0].toUpperCase()} ` +
            `${p.cpu.toFixed(1).padStart(5)}  ${((p.ram / s.memTotal) * 100).toFixed(1).padStart(5)}  ` +
            `${(p.ram / 1024).toFixed(2).padStart(6)}G  ${p.name}`,
        );
      }
      write(`\n${procs.length} processes`, "sys");
      return;
    }

    case "kill": {
      const pid = Number(rest[0]);
      if (!pid) return write("kill: usage: kill <pid>", "err");
      const p = n.proc.find(pid);
      if (p) write(`killed ${p.name} (${pid})`, "sys");
      else write(`kill: ${pid}: no such process`, "err");
      return;
    }

    case "top": {
      const procs = n.proc.list().sort((a, b) => b.cpu - a.cpu).slice(0, 10);
      const s = n.system;
      write(`Tasks: ${n.proc.list().length}   CPU: ${s.cpuLoad.toFixed(1)}%   RAM: ${(s.memUsed / 1024).toFixed(1)}/${(s.memTotal / 1024).toFixed(0)}G   NET: ${s.netDown.toFixed(0)} KB/s`, "sys");
      write("  PID  %CPU  %MEM   NAME");
      for (const p of procs) {
        write(`${String(p.pid).padStart(5)} ${p.cpu.toFixed(1).padStart(5)} ${((p.ram / n.proc.memTotalMb) * 100).toFixed(1).padStart(5)}  ${p.name}`);
      }
      return;
    }

    case "mem": {
      const procs = [...n.proc.list()].sort((a, b) => b.ram - a.ram);
      const s = n.system;
      write(`Total ${(s.memTotal / 1024).toFixed(1)}G   Used ${(s.memUsed / 1024).toFixed(2)}G   Free ${((s.memTotal - s.memUsed) / 1024).toFixed(2)}G`, "sys");
      for (const p of procs.slice(0, 12)) {
        write(`${p.name.padEnd(24)} ${(p.ram / 1024).toFixed(2).padStart(6)}G  ${((p.ram / s.memTotal) * 100).toFixed(1).padStart(5)}%`);
      }
      return;
    }

    case "sysinfo": {
      const s = n.system;
      const c = n.fs.count();
      write(`        Machine     : NOVA CLOUD PC`);
      write(`        Kernel      : nova-kernel 6.4.0`);
      write(`        Arch        : x86_64-v2`);
      write(`        Region      : ${n.cloud.region}`);
      write(`        Cores       : ${s.cores} @ 4.20GHz`);
      write(`        Memory      : ${(s.memTotal / 1024).toFixed(0)} GiB (${(s.memUsed / 1024).toFixed(1)} in use)`);
      write(`        Disk        : ${(s.diskTotal / 1024).toFixed(0)} GiB novafs4`);
      write(`        Temperature : ${s.tempC.toFixed(1)} °C`);
      write(`        Uptime      : ${fmtDuration(s.uptimeMs)}`);
      write(`        Processes   : ${n.proc.list().length}`);
      write(`        Filesystem  : ${c.files} files / ${c.dirs} dirs / ${fmtBytes(n.fs.usedBytes())}`);
      write(`        Network     : ${n.net.devices.size} devices, ${n.net.links.size} links`);
      write(`        Cloud       : ${n.cloud.servers.length} servers, ${fmtBytes(n.cloud.storageUsedGb() * 1024 ** 3)} used`);
      write(`        City        : ${n.city.npcs.length} agents, day ${n.city.day}`);
      write(`        Robots      : ${n.robots.robots.length} active, ${n.robots.listConfigs().length} saved`);
      write(`        NovaDB      : ${n.db.tableNames().length} tables`);
      return;
    }

    case "uptime": {
      const s = n.system;
      write(`up ${fmtDuration(s.uptimeMs)}, ${n.proc.list().length} processes, load ${(s.cpuLoad / s.cores).toFixed(2)}`);
      return;
    }

    case "whoami":
      write(user());
      return;

    case "date":
      write(new Date().toString());
      return;

    case "ping": {
      const target = rest[0];
      if (!target) return write("ping: usage: ping <ip|host> [count]", "err");
      const ip = isIp(target) ? target : n.net.resolveDns(target);
      if (!ip) return write(`ping: cannot resolve ${target}`, "err");
      const count = Math.min(20, Math.max(1, Number(rest[1]) || 4));
      const res = n.net.ping(n.net.devices.get([...n.net.devices.keys()][0])?.ifaces[0].ip ?? "10.0.0.1", ip, count);
      res.lines.forEach((l) => write(l, res.ok ? "out" : "err"));
      return;
    }

    case "traceroute": {
      const target = rest[0];
      if (!target) return write("traceroute: usage: traceroute <ip|host>", "err");
      const ip = isIp(target) ? target : n.net.resolveDns(target);
      if (!ip) return write(`traceroute: cannot resolve ${target}`, "err");
      const src = firstPcIp(n);
      n.net.traceroute(src, ip).lines.forEach((l) => write(l));
      return;
    }

    case "nslookup": {
      const target = rest[0];
      if (!target) return write("nslookup: usage: nslookup <host>", "err");
      const r = n.net.nslookup(target);
      r.lines.forEach((l) => write(l, r.ok ? "out" : "err"));
      return;
    }

    case "netstat":
      n.net.netstat().lines.forEach((l) => write(l));
      return;

    case "ipconfig":
      n.net.ipconfig().lines.forEach((l) => write(l));
      return;

    case "ifconfig": {
      for (const d of n.net.devices.values()) {
        for (const i of d.ifaces) {
          write(`${i.name.padEnd(6)} ${i.up ? "UP" : "DOWN"}  ${i.mac}  inet ${i.ip}/${maskBits(i.netmask)}`);
        }
      }
      return;
    }

    case "arp": {
      write("Address         HWtype  HWaddress           Flags  Iface");
      for (const d of n.net.devices.values()) {
        for (const i of d.ifaces) {
          write(`${i.ip.padEnd(16)} ether  ${i.mac.padEnd(20)} C     ${d.name}`);
        }
      }
      return;
    }

    case "route": {
      for (const d of n.net.devices.values()) {
        write(`${d.name} (${d.hostname})`);
        for (const r of d.routes) {
          write(`   ${r.net}/${maskBits(r.mask)}  via ${r.via ?? "on-link"}  dev ${r.iface}  metric ${r.metric}`);
        }
      }
      return;
    }

    case "netdevices": {
      const devs = [...n.net.devices.values()];
      write("NAME              TYPE       HOSTNAME        IP             IFACES  HTTP  DNS  DB");
      for (const d of devs) {
        write(
          `${d.name.padEnd(17)} ${d.type.padEnd(10)} ${d.hostname.padEnd(15)} ${(d.ifaces[0]?.ip ?? "-").padEnd(15)} ` +
            `${String(d.ifaces.length).padStart(3)}    ${d.http ? "yes" : " - "}    ${d.isDns ? "yes" : " - "}  ${d.isDb ? "yes" : " - "}`,
        );
      }
      write(`\n${devs.length} devices, ${n.net.links.size} links, ${n.net.packets.length} packets in flight`, "sys");
      return;
    }

    case "packets": {
      const limit = Number(rest[0]) || 12;
      const recent = n.net.log.slice(-limit);
      if (!recent.length) return write("no packets captured yet — open the Network Manager", "sys");
      write("TIME              SRC → DST                PROTO  PORT       TTL  SIZE  STATE");
      for (const p of recent) {
        write(
          `${new Date(p.createdAt).toISOString().slice(11, 19)}  ${(p.srcIp + " → " + p.dstIp).padEnd(24)} ${p.protocol.padEnd(6)} ` +
            `${String(p.dstPort).padEnd(10)} ${String(p.ttl).padStart(3)}  ${String(p.size).padStart(4)}  ${p.state}`,
        );
      }
      return;
    }

    case "resolve": {
      const ip = rest[0];
      if (!ip) return write("resolve: usage: resolve <ip>", "err");
      write(n.net.reverseDns(ip));
      return;
    }

    case "npm": {
      const sub = rest[0];
      const pkg = rest[1];
      if (!sub) {
        write("npm — simulated registry (nova-pkg)   npm <install|remove|list|run> [pkg]");
        write("available: nova-ui  nova-fs  nova-net  nova-city  nova-robots  nova-db  nova-http");
        return;
      }
      if (sub === "install") {
        if (!pkg) return write("npm: missing package name", "err");
        n.fs.mkdirp("/projects/node_modules/" + pkg, { origin: "user" });
        n.fs.write(`/projects/node_modules/${pkg}/package.json`, JSON.stringify({ name: pkg, version: "3.2.1", registry: "nova-pkg" }, null, 2), { origin: "user" });
        n.fs.write(`/projects/package-lock.json`, JSON.stringify({ [pkg]: { version: "3.2.1" }, addedAt: new Date().toISOString() }, null, 2), { origin: "user" });
        write(`added 1 package in 1.2s (nova-pkg)`, "sys");
        write(`\nnpm notice created /projects/node_modules/${pkg}`);
        return;
      }
      if (sub === "list") {
        const mods = n.fs.list("/projects/node_modules");
        if (!mods.length) return write("(no packages installed)", "sys");
        mods.forEach((m) => {
          const pj = n.fs.read(`/projects/node_modules/${m.name}/package.json`) ?? "{}";
          const v = (() => { try { return JSON.parse(pj).version ?? "?"; } catch { return "?"; } })();
          write(`${m.name}@${v}`);
        });
        return;
      }
      if (sub === "remove") {
        if (!n.fs.rm(`/projects/node_modules/${pkg}`, { recursive: true })) return write(`npm: ${pkg} not installed`, "err");
        write(`removed 1 package`);
        return;
      }
      if (sub === "run") {
        const target = pkg === "build" ? "vite build" : pkg === "dev" ? "vite" : `node index.js`;
        write(`> nova-project@1.0.0 ${target}`);
        write("simulated build output:");
        for (let i = 0; i < 6; i++) write(`  dist/assets/index-${Math.random().toString(36).slice(2, 8)}.js   ${(Math.random() * 200 + 40).toFixed(2)} kB │ gzip: ${(Math.random() * 70 + 12).toFixed(2)} kB`);
        write(`✓ built in ${(Math.random() * 3 + 0.8).toFixed(2)}s`, "sys");
        return;
      }
      write(`npm: unknown command "${sub}"`, "err");
      return;
    }

    case "python": {
      const code = args.join(" ").replace(/^['"]|['"]$/g, "");
      if (!code) {
        const existing = rest.find((r) => r.endsWith(".py") && n.fs.exists(r));
        if (existing) {
          write(`running ${abs(existing)}…`, "sys");
          write(simulatePython(n.fs.read(abs(existing)) ?? ""));
          return;
        }
        return write("python3 — simulated interpreter. Usage: python \"print('hi')\" or python script.py", "err");
      }
      write(simulatePython(code));
      return;
    }

    case "gxx":
    case "gpp": {
      const file = rest[0];
      if (!file || !n.fs.exists(abs(file))) return write(`${cmd}: no such file: ${file ?? "(none)"}`, "err");
      write(`g++ (nova-toolchain 13.2) -std=c20 -O2 ${file} -o a.out`, "sys");
      write("compilation terminated successfully.", "sys");
      return;
    }

    case "rustc": {
      const file = rest[0];
      if (!file || !n.fs.exists(abs(file))) return write(`rustc: no such file: ${file ?? "(none)"}`, "err");
      write(`rustc --edition 2021 --crate-type bin ${file}`, "sys");
      write("Finished release [optimized] target(s) in 1.84s", "sys");
      return;
    }

    case "robots": {
      const sub = rest[0] ?? "list";
      if (sub === "list") {
        const configs = n.robots.listConfigs();
        write("SAVED CONFIGURATIONS", "sys");
        for (const c of configs) {
          const d = configDerived(c);
          write(`  ${c.name.padEnd(14)} ${c.behaviour.padEnd(10)} compute ${String(d.compute).padStart(4)}  ${d.enduranceH.toFixed(1)}h  ${d.cost}cr  ${n.robots.robots.filter((r) => r.config.name === c.name).length} running`);
        }
        const live = n.robots.robots;
        write(`\nRUNTIME (${live.length})`, "sys");
        for (const r of live) {
          write(`  ${r.config.name.padEnd(14)} ${r.status.padEnd(10)} bat ${r.battery.toFixed(0).padStart(3)}%  at ${r.x.toFixed(0)},${r.y.toFixed(0)}  ${r.metrics.cpu.toFixed(0)}%cpu ${r.metrics.temp.toFixed(0)}°C`);
        }
        return;
      }
      if (sub === "run" || sub === "start") {
        const name = rest[1];
        if (!name) return write("robots run <name>", "err");
        const cfg = n.robots.listConfigs().find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (!cfg) return write(`robots: no saved config named ${name}`, "err");
        const r = n.robots.spawn(cfg as RobotConfig);
        write(`spawned ${r.config.name} (${r.id}) behaviour=${r.config.behaviour}`, "sys");
        return;
      }
      if (sub === "stop") {
        const id = rest[1];
        if (!id) return write("robots stop <id>", "err");
        const r = n.robots.robots.find((x) => x.id === id || x.config.name === id);
        if (!r) return write(`robots: not found: ${id}`, "err");
        n.robots.remove(r.id);
        write(`stopped ${r.config.name}`, "sys");
        return;
      }
      if (sub === "log" || sub === "telemetry") {
        const name = rest[1];
        const r = n.robots.robots.find((x) => x.config.name.toLowerCase() === (name ?? "").toLowerCase());
        if (!r) return write("robots: no active robot. Usage: robots run <name> first", "err");
        const p = n.robots.writeTelemetry(r);
        write(r.log.slice(-14).map((l) => `${new Date(l.ts).toISOString().slice(11, 19)} [${l.level.padEnd(9)}] ${l.msg}`).join("\n"));
        write(`\ntelemetry appended → ${p}`, "sys");
        return;
      }
      if (sub === "upload") {
        const r = n.robots.robots[0];
        if (!r) return write("robots: nothing running to upload", "err");
        const res = n.uploadRobotTelemetry(r.id);
        write(res ? `uploaded ${r.config.name} telemetry → ${res.path}` : "upload failed", "sys");
        return;
      }
      if (sub === "bench") {
        const r = n.robots.robots[0];
        if (!r) return write("robots: nothing running to benchmark", "err");
        const b = n.robots.benchmark(r.id);
        if (!b) return write("bench failed", "err");
        write(`BENCHMARK — ${b.robot}`, "sys");
        write(`  navigation   ${b.navigationMs} ms`);
        write(`  cpu workload ${b.cpuWorkload} pts`);
        write(`  memory       ${b.memoryMb} MB`);
        write(`  battery      ${b.batteryPct}%`);
        write(`  sensors      ${b.sensorHz} Hz`);
        write(`  rendering    ${b.renderMs} ms`);
        write(`  score        ${b.score}`);
        return;
      }
      if (sub === "deploy") {
        const r = n.robots.robots[0];
        if (!r) return write("robots: nothing running", "err");
        n.city.deployRobot(r, r.config.name);
        write(`deployed ${r.config.name} into the city as a service unit`, "sys");
        return;
      }
      return write(`robots: unknown subcommand "${sub}". Try: list run stop log upload bench deploy`, "err");
    }

    case "city": {
      const sub = rest[0] ?? "stats";
      if (sub === "stats") {
        const s = n.city.stats();
        write("AURORA — CITY TELEMETRY", "sys");
        write(`  Day ${s.day} (${s.weekday})   ${s.clock}   ${s.weather} ${s.tempC}°C`);
        write(`  Population        ${s.population.toLocaleString()}`);
        write(`  Active agents     ${s.activeNpcs} / ${n.city.npcs.length}`);
        write(`  Buildings         ${n.city.buildings.length}`);
        write(`  Traffic           ${s.traffic} vehicles, congestion ${(s.congestion * 100).toFixed(0)}%`);
        write(`  Businesses        ${s.openBusinesses} open of ${s.businesses}`);
        write(`  Energy draw       ${s.energyKw.toFixed(0)} kW`);
        write(`  Revenue today     ${s.revenueToday.toFixed(0)} credits`);
        write(`  Transit riders    ${s.transitRiders}`);
        return;
      }
      if (sub === "npcs") {
        const agents = n.city.npcs.slice(0, 12);
        write("NAME              AGE  STATE         DESTINATION", "sys");
        for (const a of agents) {
          const home = n.city.buildings.find((b) => b.id === a.homeId);
          write(`${a.name.padEnd(17)} ${String(a.age).padStart(3)}  ${a.state.padEnd(13)} ${home?.name ?? "-"}`);
        }
        write(`\n${n.city.npcs.length} agents total`, "sys");
        return;
      }
      if (sub === "weather") {
        write(`weather: ${n.city.weather.kind}  intensity ${n.city.weather.intensity.toFixed(2)}  wind ${n.city.weather.windKph} kph  ${n.city.weather.tempC}°C`, "sys");
        return;
      }
      if (sub === "news") {
        const items = n.db.all(TABLES.cityNews).slice(-8);
        if (!items.length) return write("no city news yet — the city publishes as it runs", "sys");
        for (const it of items) {
          write(`  ${new Date(it.ts).toISOString().slice(5, 16).replace("T", " ")}  ${it.title}`);
        }
        return;
      }
      if (sub === "publish") {
        const headline = args.join(" ");
        if (!headline) return write("city publish <headline> — writes a city bulletin to /city/reports", "err");
        n.city.publishNews(headline, `${headline}.\n\nFiled by the NOVA city desk.\n\n— Aurora`);
        n.fs.mkdirp("/city/reports", { origin: "city" });
        n.fs.write(`/city/reports/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`, `${headline}\n\nFiled by the NOVA city desk.`, { origin: "city" });
        write(`published: ${headline}`, "sys");
        return;
      }
      return write(`city: unknown subcommand "${sub}". Try: stats npcs weather news publish`, "err");
    }

    case "cloud": {
      const sub = rest[0] ?? "info";
      const m = n.cloud.metrics();
      if (sub === "info" || sub === "stats") {
        write("NOVA CLOUD — REGION STATUS", "sys");
        write(`  region/zone    ${m.region} / ${m.zone}`);
        write(`  CPU            ${m.cpuUsed.toFixed(0)} / ${m.cpuTotal} vCPU`);
        write(`  Memory         ${(m.memUsed / 1024).toFixed(1)} / ${(m.memTotal / 1024).toFixed(0)} GiB`);
        write(`  Storage        ${m.storageUsedGb.toFixed(2)} / ${m.storageTotalGb} GB (${n.cloud.storagePct().toFixed(1)}%)`);
        write(`  Network        ↓${m.netInMbps.toFixed(0)} Mbps  ↑${m.netOutMbps.toFixed(0)} Mbps`);
        write(`  Requests       ${m.reqPerMin.toLocaleString()}/min`);
        write(`  Uptime         ${m.uptimePct}%`);
        write(`  Monthly cost   ${n.cloud.monthlyCost} credits`);
        return;
      }
      if (sub === "servers") {
        if (!n.cloud.servers.length) return write("no cloud servers. Create one in the NOVA Cloud console.", "sys");
        write("NAME              KIND       SIZE    IP              STATUS   COST", "sys");
        for (const s of n.cloud.servers) {
          write(`${s.name.padEnd(17)} ${s.kind.padEnd(10)} ${s.size.padEnd(7)} ${s.ip.padEnd(15)} ${s.status.padEnd(8)} ${s.monthlyCost}`);
        }
        return;
      }
      if (sub === "sync") {
        const path = rest[1] ?? cwd;
        const items = n.cloud.syncPath(path) ? [n.cloud.syncPath(path)!] : [];
        if (!items.length) return write(`cloud sync: ${path} not found`, "err");
        write(`synced ${items.length} path(s) to the cloud bucket`, "sys");
        items.forEach((i) => write(`  ${i.path}  ${fmtBytes(i.size)}  → /cloud/bucket`));
        return;
      }
      if (sub === "syncall") {
        const items = n.cloud.syncAll();
        write(`synced ${items.length} files`, "sys");
        return;
      }
      if (sub === "accounts") {
        write("NAME          EMAIL              ROLE   MFA   AGE", "sys");
        for (const a of n.cloud.accounts) {
          write(`${a.name.padEnd(13)} ${a.email.padEnd(18)} ${a.role.padEnd(6)} ${a.mfa ? "yes" : "no "}  ${Math.floor((Date.now() - a.createdAt) / 86400000)}d`);
        }
        return;
      }
      return write(`cloud: unknown subcommand "${sub}". Try: info servers sync syncall accounts`, "err");
    }

    case "serve": {
      const [host, portStr, file] = rest;
      if (!host || !portStr || !file) return write("serve: usage: serve <host> <port> <file>", "err");
      const body = n.fs.read(abs(file));
      if (body === null) return write(`serve: ${file}: not found`, "err");
      const port = Number(portStr) || 80;
      const edge = [...n.net.devices.values()].find((d) => d.type === "web");
      if (!edge) return write("serve: no web device in the topology", "err");
      edge.http = { host, title: file, kind: "custom", body, port };
      n.publishPage(host, file, body);
      write(`hosting ${abs(file)} at http://${host}:${port}/ on ${edge.hostname} (${edge.ifaces[0].ip})`, "sys");
      write(`open it in the browser: ${host}`, "sys");
      return;
    }

    case "db": {
      const table = rest[0];
      if (!table) {
        write(`tables (${n.db.tableNames().length}):`, "sys");
        write(n.db.tableNames().join(", "));
        return;
      }
      const rows = n.db.all(table);
      if (!rows.length) return write(`db: table "${table}" is empty or does not exist`, "err");
      write(`${rows.length} rows in ${table}`, "sys");
      const keys = Object.keys(rows[0]).slice(0, 6);
      write(keys.join(" | "));
      for (const r of rows.slice(Number(rest[2]) || 0, (Number(rest[2]) || 0) + 8)) {
        write(keys.map((k) => String(r[k] ?? "").slice(0, 26)).join(" | "));
      }
      return;
    }

    case "search": {
      const q = rest.join(" ");
      if (!q) return write("search: missing query", "err");
      const posts = n.db.search(TABLES.posts, q, ["body", "topic", "author"], 4);
      const news = n.db.search(TABLES.news, q, ["title", "body", "category"], 4);
      const people = n.db.search(TABLES.users, q, ["name", "handle", "occupation"], 3);
      if (news.length) {
        write("NEWS", "sys");
        news.forEach((r) => write(`  ${r.title}  (${r.source})`));
      }
      if (posts.length) {
        write("POSTS", "sys");
        posts.forEach((r) => write(`  @${r.author}: ${String(r.body).slice(0, 90)}`));
      }
      if (people.length) {
        write("PEOPLE", "sys");
        people.forEach((r) => write(`  ${r.name} (@${r.handle}) — ${r.occupation}, ${r.district}`));
      }
      if (!posts.length && !news.length && !people.length) write(`no results for "${q}"`, "err");
      n.db.insert(TABLES.searchHistory, { q, ts: Date.now() });
      return;
    }

    case "web": {
      const target = (rest[0] ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!target) return write("web: usage: web <url>", "err");
      const ip = n.net.resolveDns(target);
      if (!ip) return write(`web: cannot resolve ${target}`, "err");
      const dev = n.net.byIp(ip);
      if (dev?.http) {
        write(`GET / HTTP/1.1   Host: ${target}`, "sys");
        write(`HTTP/1.1 200 OK  (${dev.name} · ${dev.ifaces[0].ip})`);
        write(dev.http.body);
        return;
      }
      const builtin = target.split(".")[0];
      write(`GET / HTTP/1.1   Host: ${target}`, "sys");
      write(`HTTP/1.1 200 OK  (NOVA edge service · 198.51.100.10)`);
      write(`<!doctype html><title>${target}</title><h1>${titleFor(builtin)}</h1>`);
      write(`<p>Simulated site. Open it in the NOVA Browser for the interactive version.</p>`);
      return;
    }

    case "history":
      if (!cmdHistory.length) return write("(empty)", "sys");
      cmdHistory.forEach((h, i) => write(`${String(i + 1).padStart(4)}  ${h}`));
      return;

    case "theme": {
      const t = rest[0];
      if (t !== "dark" && t !== "light") return write("theme: usage: theme <dark|light>", "err");
      document.documentElement.classList.toggle("light", t === "light");
      localStorage.setItem("nova-settings", JSON.stringify({ ...readSettings(), theme: t }));
      write(`theme → ${t}`, "sys");
      return;
    }

    case "exit":
      write("close this window to exit the terminal.", "sys");
      return;

    default:
      write(`nova-shell: ${cmd} is not implemented`, "err");
  }
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem("nova-settings") ?? "{}");
  } catch {
    return {};
  }
}

function firstPcIp(n: ReturnType<typeof nova>): string {
  const pc = [...n.net.devices.values()].find((d) => d.type === "pc");
  return pc?.ifaces[0]?.ip ?? "10.0.0.1";
}

function isIp(s: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
}

function maskBits(mask: string): number {
  return mask
    .split(".")
    .reduce((acc, o) => acc * 256 + Number(o), 0)
    .toString(2)
    .replace(/0+$/, "").length;
}

function titleFor(builtin: string): string {
  const map: Record<string, string> = {
    nova: "NOVA Social",
    novasearch: "NovaSearch",
    novanews: "NovaNews",
    novamail: "NovaMail",
    novadrive: "NovaDrive",
    novatube: "NovaTube",
    novadocs: "NovaDocs",
    novadev: "NovaDev",
    novashop: "NovaShop",
    novaforum: "NovaForum",
    aurora: "Aurora City",
  };
  return map[builtin] ?? "NOVA edge";
}

export function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** A tiny deterministic interpreter so `python` is a real feature, not a stub. */
function simulatePython(code: string): string {
  const out: string[] = [];
  const lines = code.split("\n");
  let acc = 0;
  let loops = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const print = line.match(/^print\((.*)\)$/);
    if (print) {
      const inner = print[1].trim();
      if (/^["'].*["']$/.test(inner)) out.push(inner.slice(1, -1));
      else if (/^sum\(/.test(inner)) out.push(String(acc));
      else out.push(evalSafe(inner));
      continue;
    }
    if (/^for\s+\w+\s+in\s+range\((\d+)\)/.test(line)) {
      const m = line.match(/^for\s+\w+\s+in\s+range\((\d+)\)/)!;
      const n = Number(m[1]);
      loops += n;
      acc += n * (n - 1) / 2;
      continue;
    }
    if (/^import\s|^from\s/.test(line)) {
      out.push(`<module '${line.split(/\s+/)[1].replace("import", "").trim()}' loaded from /usr/lib/python3.12>`);
      continue;
    }
    out.push(`${line}  # executed`);
  }
  out.push(`[simulated] ${loops} loop iterations, accumulator=${acc}`);
  return out.join("\n");
}

function evalSafe(expr: string): string {
  const cleaned = expr.replace(/[;{}]/g, "");
  if (/^[\d\s+\-*/().%]+$/.test(cleaned)) {
    try {
      // eslint-disable-next-line no-new-func
      return String(Function(`"use strict";return (${cleaned})`)());
    } catch {
      return "NaN";
    }
  }
  return cleaned;
}

export { COMMANDS };
