import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, SERVER_INFO } from "./server.js";
import { API_KEY_HEADER_NAMES, authenticate, isAuthEnforced } from "./auth.js";

/** Express middleware enforcing API key authentication (see auth.ts). */
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS") return next();
  const url = new URL(req.originalUrl, "http://localhost");
  const auth = authenticate((name) => {
    const v = req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  }, url.searchParams);
  if (auth.ok) return next();
  res
    .status(auth.status ?? 401)
    .set("WWW-Authenticate", 'Bearer realm="mcp", error="invalid_token"')
    .json({ jsonrpc: "2.0", error: { code: -32001, message: auth.reason ?? "Unauthorized" }, id: null });
}

/** Streamable HTTP server (stateless), used for containers and local runs. */
async function startStreamableHTTPServer(): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const app = createMcpExpressApp({ host: "0.0.0.0" });

  app.use(cors({
    origin: "*",
    allowedHeaders: ["Content-Type", "Accept", "Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-ID", ...API_KEY_HEADER_NAMES],
    exposedHeaders: ["Mcp-Session-Id", "Mcp-Protocol-Version", "WWW-Authenticate"],
  }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", ...SERVER_INFO, auth: isAuthEnforced() ? "api-key" : "disabled" });
  });

  app.all("/mcp", requireApiKey, async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      transport.close().catch(() => { });
      server.close().catch(() => { });
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  app.listen(port, () => {
    console.log(`${SERVER_INFO.name} listening on http://localhost:${port}/mcp (auth: ${isAuthEnforced() ? "api-key" : "disabled"})`);
  });
}

/** Stdio transport for local clients (spawned by the client, so no API key). */
async function startStdioServer(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

async function main() {
  if (process.argv.includes("--stdio")) await startStdioServer();
  else await startStreamableHTTPServer();
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
