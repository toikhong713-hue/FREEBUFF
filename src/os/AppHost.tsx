import { memo } from "react";
import type { WinState } from "./types";
import { useNovaContext } from "./wm";
import { FilesApp } from "../apps/Files";
import { TerminalApp } from "../apps/Terminal";
import { EditorApp } from "../apps/Editor";
import { CalculatorApp } from "../apps/Calculator";
import { BrowserApp } from "../apps/Browser";
import { SettingsApp } from "../apps/Settings";
import { TaskManagerApp } from "../apps/TaskManager";
import { SystemMonitorApp } from "../apps/SystemMonitor";
import { NetworkManagerApp } from "../apps/NetworkManager";
import { NetLabApp } from "../apps/NetLab";
import { AppStoreApp } from "../apps/AppStore";
import { CloudApp } from "../apps/Cloud";
import { CloudDriveApp } from "../apps/CloudDrive";
import { RobotLabApp } from "../apps/RobotLab";
import { CityApp } from "../apps/City";

export const AppHost = memo(function AppHost({ win }: { win: WinState }) {
  const { argsFor } = useNovaContext();
  const args = argsFor(win.id);
  switch (win.appId) {
    case "files": return <FilesApp args={args} />;
    case "terminal":
    case "terminalFull": return <TerminalApp args={args} />;
    case "editor": return <EditorApp args={args} />;
    case "calculator": return <CalculatorApp args={args} />;
    case "browser": return <BrowserApp args={args} />;
    case "settings": return <SettingsApp args={args} />;
    case "taskmgr": return <TaskManagerApp args={args} />;
    case "sysmon": return <SystemMonitorApp args={args} />;
    case "netmgr": return <NetworkManagerApp args={args} />;
    case "netlab": return <NetLabApp args={args} />;
    case "appstore": return <AppStoreApp args={args} />;
    case "cloud": return <CloudApp args={args} />;
    case "drive": return <CloudDriveApp args={args} />;
    case "robots": return <RobotLabApp args={args} />;
    case "city": return <CityApp args={args} />;
    default: return null;
  }
});

export type AppArgs = Record<string, unknown>;
