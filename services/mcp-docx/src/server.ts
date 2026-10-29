import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BLOCK_REFERENCE, buildDocx, documentSchema } from "./blocks.js";

export const SERVER_INFO = { name: "sea-mcp-docx", version: "1.0.0" } as const;

/** Upper bound for the embedded file (keeps the tool response under serverless limits). */
const MAX_DOCX_BYTES = 3 * 1024 * 1024;

const toolInput = {
  ...documentSchema.shape,
  filename: z.string().regex(/^[\w\-. ]+$/, "letters, digits, spaces, - _ .").max(100).optional()
    .describe("File name without path, e.g. 'bcp-dr-plan.docx'. Defaults to the title."),
};

function safeFileName(name: string | undefined, title: string | undefined): string {
  const base = (name || title || "document").replace(/\.docx$/i, "").trim().replace(/\s+/g, "-").replace(/[^\w\-.]/g, "") || "document";
  return `${base}.docx`;
}

/** Registers the Word generation tools with the MCP server. */
export function registerTools(server: McpServer): void {
  server.registerTool(
    "docx_create_document",
    {
      title: "Create Word document",
      description: `Generates a .docx (Word) file from a list of structured blocks: headings, paragraphs, bullet/numbered/checklists, styled tables (per-cell colours), RACI matrices, callouts, page breaks, header and footer with page numbers.
Call docx_describe_blocks first for the exact block format. The file is returned as an embedded resource (base64) that the client can save or open.`,
      inputSchema: toolInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args): Promise<CallToolResult> => {
      const { filename, ...rest } = args;
      const parsed = documentSchema.safeParse(rest);
      if (!parsed.success) {
        const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        return { content: [{ type: "text", text: `Invalid document: ${issues}` }], isError: true };
      }

      let built;
      try {
        built = await buildDocx(parsed.data);
      } catch (e) {
        return { content: [{ type: "text", text: `Document generation failed: ${(e as Error).message}` }], isError: true };
      }
      if (built.buffer.length > MAX_DOCX_BYTES) {
        return { content: [{ type: "text", text: `Document too large (${Math.round(built.buffer.length / 1024)} KB). Reduce the content or split it.` }], isError: true };
      }

      const name = safeFileName(filename, parsed.data.title);
      const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const uri = `file:///${name}`;
      return {
        content: [
          { type: "text", text: `Created ${name} (${built.blockCount} blocks, ${Math.round(built.buffer.length / 1024)} KB).` },
          { type: "resource", resource: { uri, mimeType, blob: built.buffer.toString("base64") } },
        ],
        structuredContent: { filename: name, mimeType, sizeBytes: built.buffer.length, blockCount: built.blockCount },
      };
    },
  );

  server.registerTool(
    "docx_describe_blocks",
    {
      title: "Describe Word blocks",
      description: "Returns the block reference for docx_create_document: every block type, its properties, colour and layout options.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (): Promise<CallToolResult> => ({ content: [{ type: "text", text: BLOCK_REFERENCE }] }),
  );

  server.registerResource("docx_blocks_reference", "docs://docx/blocks", { mimeType: "text/markdown" }, async () => ({
    contents: [{ uri: "docs://docx/blocks", mimeType: "text/markdown", text: BLOCK_REFERENCE }],
  }));
}

export function createServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerTools(server);
  return server;
}
