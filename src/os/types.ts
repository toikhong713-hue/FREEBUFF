export type AppId =
  | "files"
  | "terminal"
  | "editor"
  | "calculator"
  | "browser"
  | "settings"
  | "taskmgr"
  | "sysmon"
  | "netmgr"
  | "netlab"
  | "appstore"
  | "cloud"
  | "drive"
  | "robots"
  | "city"
  | "terminalFull";

export interface WinState {
  id: string;
  appId: AppId;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  maximized: boolean;
  z: number;
  /** pre-maximize geometry so restore is exact */
  restore?: { x: number; y: number; w: number; h: number };
}

export interface NovaUser {
  name: string;
  role: "admin" | "user" | "guest";
  home: string;
  shell: string;
  uid: string;
}

export interface Session {
  phase: "bios" | "bootloader" | "kernel" | "login" | "desktop";
  user: NovaUser | null;
  logs: BootLine[];
}

export interface BootLine {
  t: number;
  text: string;
  kind: "info" | "ok" | "warn" | "err";
}

export interface DesktopSettings {
  theme: "dark" | "light";
  wallpaper: string;
  accent: string;
  clock24: boolean;
  reduceMotion: boolean;
  showCpu: boolean;
  citySpeed: number;
  username: string;
  autoStartApps: string[];
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  theme: "dark",
  wallpaper: "aurora",
  accent: "#38bdf8",
  clock24: true,
  reduceMotion: false,
  showCpu: true,
  citySpeed: 60,
  username: "user",
  autoStartApps: [],
};
