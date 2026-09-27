import type { AppId } from "./types";

export interface AppDef {
  id: AppId;
  name: string;
  windowTitle: string;
  icon: string;
  accent: string;
  w: number;
  h: number;
  minW: number;
  minH: number;
  /** app that this one belongs to, for grouping in the start menu */
  group: "system" | "internet" | "lab" | "cloud";
  desc: string;
  singleton: boolean;
  defaultX?: number;
  defaultY?: number;
}

export const APPS: Record<AppId, AppDef> = {
  files: {
    id: "files", name: "File Manager", windowTitle: "File Manager", icon: "🗂", accent: "#60a5fa",
    w: 880, h: 560, minW: 520, minH: 340, group: "system",
    desc: "Browse the one filesystem every subsystem shares", singleton: false, defaultX: 90, defaultY: 60,
  },
  terminal: {
    id: "terminal", name: "Terminal", windowTitle: "nova-shell — 80×24", icon: "❯", accent: "#34d399",
    w: 820, h: 480, minW: 460, minH: 260, group: "system",
    desc: "Full command set wired into the live machine", singleton: false, defaultX: 150, defaultY: 90,
  },
  editor: {
    id: "editor", name: "Text Editor", windowTitle: "Untitled — Editor", icon: "📝", accent: "#fbbf24",
    w: 760, h: 520, minW: 440, minH: 300, group: "system",
    desc: "Edit anything on disk and watch other apps react", singleton: false, defaultX: 210, defaultY: 120,
  },
  calculator: {
    id: "calculator", name: "Calculator", windowTitle: "Calculator", icon: "🧮", accent: "#a78bfa",
    w: 340, h: 470, minW: 300, minH: 430, group: "system",
    desc: "Standard and scientific operations", singleton: true, defaultX: 320, defaultY: 110,
  },
  browser: {
    id: "browser", name: "NOVA Browser", windowTitle: "NOVA Browser", icon: "🌐", accent: "#38bdf8",
    w: 1080, h: 680, minW: 560, minH: 380, group: "internet",
    desc: "Browse the simulated internet and sites you host yourself", singleton: false, defaultX: 60, defaultY: 40,
  },
  settings: {
    id: "settings", name: "Settings", windowTitle: "Settings", icon: "⚙️", accent: "#94a3b8",
    w: 820, h: 560, minW: 520, minH: 360, group: "system",
    desc: "Theme, wallpaper, session and machine preferences", singleton: true, defaultX: 260, defaultY: 80,
  },
  taskmgr: {
    id: "taskmgr", name: "Task Manager", windowTitle: "Task Manager", icon: "📊", accent: "#f87171",
    w: 880, h: 540, minW: 560, minH: 340, group: "system",
    desc: "Live processes, CPU, memory and disk", singleton: true, defaultX: 180, defaultY: 70,
  },
  sysmon: {
    id: "sysmon", name: "System Monitor", windowTitle: "System Monitor", icon: "📈", accent: "#f472b6",
    w: 800, h: 520, minW: 480, minH: 340, group: "system",
    desc: "Per-core load, network throughput and temperature", singleton: true, defaultX: 220, defaultY: 90,
  },
  netmgr: {
    id: "netmgr", name: "Network Manager", windowTitle: "Network Manager", icon: "🛰️", accent: "#2dd4bf",
    w: 900, h: 580, minW: 560, minH: 380, group: "lab",
    desc: "Interfaces, routes, firewall and the live wire", singleton: true, defaultX: 140, defaultY: 60,
  },
  netlab: {
    id: "netlab", name: "Mini Internet Lab", windowTitle: "Mini Internet Lab", icon: "🔗", accent: "#22d3ee",
    w: 1180, h: 720, minW: 720, minH: 460, group: "lab",
    desc: "Build a topology, send packets, watch them route", singleton: true, defaultX: 40, defaultY: 30,
  },
  appstore: {
    id: "appstore", name: "NOVA Store", windowTitle: "NOVA Store", icon: "🛍", accent: "#f472b6",
    w: 900, h: 600, minW: 520, minH: 380, group: "system",
    desc: "Install and launch apps onto the desktop", singleton: true, defaultX: 190, defaultY: 70,
  },
  cloud: {
    id: "cloud", name: "NOVA Cloud", windowTitle: "NOVA Cloud Console", icon: "☁️", accent: "#60a5fa",
    w: 1100, h: 680, minW: 640, minH: 420, group: "cloud",
    desc: "Region health, storage, servers, database, accounts", singleton: true, defaultX: 50, defaultY: 30,
  },
  drive: {
    id: "drive", name: "Cloud Drive", windowTitle: "Cloud Drive", icon: "💾", accent: "#34d399",
    w: 900, h: 560, minW: 540, minH: 340, group: "cloud",
    desc: "Sync local paths into the cloud bucket", singleton: false, defaultX: 130, defaultY: 70,
  },
  robots: {
    id: "robots", name: "AI Robot Lab", windowTitle: "AI Robot Lab", icon: "🤖", accent: "#fbbf24",
    w: 1200, h: 740, minW: 760, minH: 480, group: "lab",
    desc: "Build, simulate, benchmark and deploy robots", singleton: true, defaultX: 30, defaultY: 20,
  },
  city: {
    id: "city", name: "Virtual City", windowTitle: "Aurora — Virtual City", icon: "🏙️", accent: "#f59e0b",
    w: 1200, h: 740, minW: 720, minH: 460, group: "lab",
    desc: "210k people, live traffic, weather and an economy", singleton: true, defaultX: 30, defaultY: 20,
  },
  terminalFull: {
    id: "terminalFull", name: "Terminal", windowTitle: "nova-shell", icon: "❯", accent: "#34d399",
    w: 820, h: 480, minW: 460, minH: 260, group: "system",
    desc: "Full command set", singleton: false, defaultX: 150, defaultY: 90,
  },
};

export const APP_LIST: AppDef[] = Object.values(APPS).filter((a) => a.id !== "terminalFull");

export const GROUPS: { id: AppDef["group"]; label: string }[] = [
  { id: "system", label: "NOVAOS" },
  { id: "internet", label: "Internet" },
  { id: "lab", label: "Labs" },
  { id: "cloud", label: "Cloud" },
];
