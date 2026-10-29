import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Charts } from "./components/Charts";
import { AlertCircle } from "lucide-react";
import "./global.css";
import "./i18n";
import { useTranslation } from "react-i18next";
import { tryParseJSON } from "./utils/utils";
import { McpAppContext } from "./app-context";

const systemTheme = (): "light" | "dark" =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/** Accepts both the single-chart and dashboard payloads (tool args or structured result). */
const isRenderable = (v: any) => v && typeof v === "object" && ((v.type && Array.isArray(v.data)) || Array.isArray(v.charts));

function App() {
  const { t, i18n } = useTranslation();
  const [chartInput, setChartInput] = useState<any>(null);
  const [theme, setTheme] = useState<"light" | "dark">(systemTheme);
  const [displayMode, setDisplayMode] = useState<"inline" | "fullscreen" | "pip">("inline");
  const [availableModes, setAvailableModes] = useState<string[]>([]);

  const applyContext = useCallback((context?: Partial<McpUiHostContext>) => {
    if (!context) return;
    if (context.locale) i18n.changeLanguage(context.locale);
    if (context.theme) { setTheme(context.theme); applyTheme(context.theme); }
    if (context.displayMode) setDisplayMode(context.displayMode);
    if (context.availableDisplayModes) setAvailableModes(context.availableDisplayModes);
  }, [i18n]);

  const { app, error } = useApp({
    appInfo: { name: "sea-mcp-charts", version: "1.2.0" },
    capabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    onAppCreated: (app) => {
      applyTheme(systemTheme());
      app.onhostcontextchanged = (context) => applyContext(context);

      app.ontoolinput = (input) => {
        const args = (input as any)?.arguments ?? input;
        const parsed = typeof args === "string" ? tryParseJSON(args) : args;
        if (parsed?.config?.locale) i18n.changeLanguage(parsed.config.locale);
        if (isRenderable(parsed)) setChartInput(parsed);
      };

      app.ontoolresult = (result: any) => {
        if (result?.isError) return;
        const content = result?.structuredContent ?? tryParseJSON(result?.content?.[0]?.text);
        if (!isRenderable(content)) return;
        if (content?.config?.locale) i18n.changeLanguage(content.config.locale);
        setChartInput(content);
      };

      app.onteardown = async () => ({});
    },
  });

  // Host context is only available once the initialize handshake completed
  useEffect(() => { if (app) applyContext(app.getHostContext()); }, [app, applyContext]);

  const toggleFullscreen = useCallback(async () => {
    if (!app) return;
    try {
      const res = await app.requestDisplayMode({ mode: displayMode === "fullscreen" ? "inline" : "fullscreen" });
      if (res?.mode) setDisplayMode(res.mode);
    } catch (e) {
      console.warn("[charts] display mode change refused", e);
    }
  }, [app, displayMode]);

  const ctx = useMemo(() => ({
    app: app ?? null,
    theme,
    displayMode,
    canFullscreen: availableModes.includes("fullscreen"),
    toggleFullscreen,
  }), [app, theme, displayMode, availableModes, toggleFullscreen]);

  if (error) return (
    <div className="flex flex-col items-center justify-center w-full min-h-[200px] bg-transparent animate-in" style={{ color: 'var(--text-primary)' }}>
      <div className="p-2 rounded-xl flex flex-col items-center gap-2 max-w-xs text-center border border-red-500/20 bg-red-500/5">
        <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
          <AlertCircle size={12} />
        </div>
        <div className="space-y-1">
          <h1 className="text-xs font-black tracking-tight">{t('mcp_error')}</h1>
          <p className="text-zinc-500 font-medium text-[10px] leading-tight">{error.message}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest hover:scale-105 transition-all"
        >
          {t('retry')}
        </button>
      </div>
    </div>
  );

  if (!app) return null;

  return (
    <McpAppContext.Provider value={ctx}>
      <Charts chartInput={chartInput} />
    </McpAppContext.Provider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
