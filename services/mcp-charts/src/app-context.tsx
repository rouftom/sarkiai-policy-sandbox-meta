import { createContext, useContext } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";

export interface McpAppContextValue {
  app: App | null;
  theme: "light" | "dark";
  displayMode: "inline" | "fullscreen" | "pip";
  canFullscreen: boolean;
  toggleFullscreen: () => void;
}

export const McpAppContext = createContext<McpAppContextValue>({
  app: null,
  theme: "light",
  displayMode: "inline",
  canFullscreen: false,
  toggleFullscreen: () => { },
});

export const useMcpApp = () => useContext(McpAppContext);
