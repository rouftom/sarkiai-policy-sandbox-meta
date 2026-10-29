import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat, PageNumber, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TabStopPosition, TabStopType, TextRun, VerticalAlign, WidthType,
} from "docx";
import { z } from "zod";

/** Usable width of an A4 page with 1.5 cm margins, in twips (1/1440 inch). */
const PAGE_WIDTH = 9506;
const MARGIN = { top: 1100, bottom: 1100, left: 1200, right: 1200 };
const DEFAULT_ACCENT = "1F3A5F";
const TEXT_COLOR = "444444";
const BORDER = "B9C4CF";
const ZEBRA = "EFF3F7";
const RACI_COLORS: Record<string, string> = { R: "2E5395", A: "C00000", C: "B7791F", I: "6C757D" };

const color = z.string().regex(/^#?[0-9a-fA-F]{6}$/, "hex colour, e.g. 1F3A5F").transform((c) => c.replace("#", ""));
const align = z.enum(["left", "center", "right", "justify"]).optional();

const cellSchema = z.union([
  z.string(),
  z.number(),
  z.object({
    text: z.union([z.string(), z.number()]),
    fill: color.optional(),
    bold: z.boolean().optional(),
    color: color.optional(),
    align,
  }),
]);

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().min(1).max(300), level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }),
  z.object({ type: z.literal("paragraph"), text: z.string().max(5000), bold: z.boolean().optional(), italic: z.boolean().optional(), align, size: z.number().min(8).max(28).optional(), color: color.optional() }),
  z.object({ type: z.literal("bullets"), items: z.array(z.string().max(1000)).min(1).max(200) }),
  z.object({ type: z.literal("numbered"), items: z.array(z.string().max(1000)).min(1).max(200) }),
  z.object({ type: z.literal("checklist"), items: z.array(z.string().max(1000)).min(1).max(200) }),
  z.object({
    type: z.literal("table"),
    columns: z.array(z.string().max(200)).min(1).max(12),
    rows: z.array(z.array(cellSchema).max(12)).max(300),
    widths: z.array(z.number().positive()).optional().describe("Relative column widths, e.g. [3,1,1]"),
    zebra: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("raci"),
    activities: z.array(z.string().max(300)).min(1).max(200),
    roles: z.array(z.string().max(60)).min(1).max(10),
    matrix: z.array(z.array(z.enum(["R", "A", "C", "I", ""]))).describe("One row per activity, one entry per role"),
  }),
  z.object({ type: z.literal("callout"), text: z.string().max(2000), tone: z.enum(["info", "warning", "success"]).optional() }),
  z.object({ type: z.literal("page_break") }),
  z.object({ type: z.literal("spacer"), height: z.number().min(0).max(200).optional() }),
  z.object({
    type: z.literal("image"),
    data: z
      .string()
      .transform((value) => value.replace(/^data:image\/[a-z+]+;base64,/, ""))
      .pipe(z.string().min(16).max(2_800_000))
      .describe("Base64 of a PNG or JPEG file, at most about 2 MB once decoded"),
    caption: z.string().max(300).optional(),
    width: z.number().int().min(60).max(620).optional().describe("Width in pixels, at most 620 (the text width of an A4 page)"),
  }),
]);

export type Block = z.infer<typeof blockSchema>;

export const documentSchema = z.object({
  title: z.string().max(200).optional().describe("Large title on the first page"),
  subtitle: z.string().max(300).optional(),
  accentColor: color.optional().describe("Brand colour for headings and table headers (default 1F3A5F)"),
  fontFamily: z.string().max(60).optional().describe("Default Calibri"),
  headerText: z.string().max(200).optional(),
  footerText: z.string().max(200).optional(),
  pageNumbers: z.boolean().optional().describe("Show 'page X / Y' in the footer (default true)"),
  blocks: z.array(blockSchema).min(1).max(500),
});

export type DocumentSpec = z.infer<typeof documentSchema>;

type CellInput = z.infer<typeof cellSchema>;

const run = (text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number; font: string }) =>
  new TextRun({ text, bold: opts.bold, italics: opts.italics, color: opts.color ?? TEXT_COLOR, size: (opts.size ?? 10.5) * 2, font: opts.font });

function para(text: string, o: { font: string; bold?: boolean; italics?: boolean; align?: string; size?: number; color?: string; after?: number; before?: number }) {
  const map: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
    left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED,
  };
  return new Paragraph({
    alignment: o.align ? map[o.align] : undefined,
    spacing: { after: o.after ?? 160, before: o.before ?? 0 },
    children: [run(text, o)],
  });
}

function heading(text: string, level: 1 | 2 | 3, accent: string, font: string): Paragraph {
  const levels = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 } as const;
  const sizes = { 1: 27, 2: 23, 3: 21 } as const;
  return new Paragraph({
    heading: levels[level],
    spacing: { before: level === 1 ? 380 : 260, after: level === 1 ? 180 : 120 },
    border: level === 1 ? { bottom: { color: accent, space: 4, style: BorderStyle.SINGLE, size: 8 } } : undefined,
    children: [new TextRun({ text, bold: true, color: level === 1 ? accent : "16283F", size: sizes[level], font })],
  });
}

function cellParagraph(text: string, o: { font: string; bold?: boolean; color?: string; align?: string }) {
  const map: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
    left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED,
  };
  return new Paragraph({ alignment: o.align ? map[o.align] : undefined, spacing: { after: 0 }, children: [run(text, { ...o, size: 9 })] });
}

function normalizeCell(c: CellInput): { text: string; fill?: string; bold?: boolean; color?: string; align?: string } {
  return typeof c === "object" ? { ...c, text: String(c.text) } : { text: String(c) };
}

function tableBuilder(columns: string[], rows: CellInput[][], accent: string, font: string, opts: { widths?: number[]; zebra?: boolean } = {}): Table {
  const n = columns.length;
  const rel = opts.widths && opts.widths.length === n ? opts.widths : Array(n).fill(1);
  const total = rel.reduce((a, b) => a + b, 0);
  const widths = rel.map((w) => Math.floor((w / total) * PAGE_WIDTH));
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
    left: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
    right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  };
  const header = new TableRow({
    tableHeader: true,
    children: columns.map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: accent },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 90, bottom: 90, left: 110, right: 110 },
      children: [cellParagraph(c, { font, bold: true, color: "FFFFFF" })],
    })),
  });
  const body = rows.map((row, r) => new TableRow({
    children: columns.map((_, i) => {
      const cell = normalizeCell(row[i] ?? "");
      const zebraFill = opts.zebra && r % 2 === 1 ? ZEBRA : undefined;
      return new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        shading: cell.fill ? { type: ShadingType.CLEAR, fill: cell.fill } : zebraFill ? { type: ShadingType.CLEAR, fill: zebraFill } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 110, right: 110 },
        children: [cellParagraph(cell.text, { font, bold: cell.bold, color: cell.color, align: cell.align })],
      });
    }),
  }));
  return new Table({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, borders, rows: [header, ...body] });
}

function raciTable(block: Extract<Block, { type: "raci" }>, accent: string, font: string): (Paragraph | Table)[] {
  block.matrix.forEach((row, i) => {
    if (row.length !== block.roles.length) throw new Error(`raci.matrix row ${i} has ${row.length} entries, expected ${block.roles.length}`);
  });
  if (block.matrix.length !== block.activities.length) throw new Error(`raci.matrix has ${block.matrix.length} rows, expected ${block.activities.length}`);
  const rows: CellInput[][] = block.activities.map((activity, i) => [
    activity,
    ...block.matrix[i].map((letter) => ({
      text: letter || "",
      fill: letter ? RACI_COLORS[letter] : undefined,
      bold: true,
      color: letter ? "FFFFFF" : TEXT_COLOR,
      align: "center" as const,
    })),
  ]);
  const widths = [3.4, ...block.roles.map(() => 1)];
  const legend = para("R responsable de l'exécution · A décideur final · C consulté · I informé", { font, size: 9, before: 120, after: 200, color: TEXT_COLOR });
  return [tableBuilder(["Activité", ...block.roles], rows, accent, font, { widths }), legend];
}

function callout(text: string, tone: "info" | "warning" | "success", font: string): Table {
  const palette = { info: ["EFF3F7", "2E5395"], warning: ["FDF3E1", "B7791F"], success: ["E8F3EC", "2E7D4F"] }[tone];
  return new Table({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: [PAGE_WIDTH],
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.SINGLE, size: 24, color: palette[1] },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: PAGE_WIDTH, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: palette[0] },
      margins: { top: 140, bottom: 140, left: 200, right: 200 },
      children: [para(text, { font, color: TEXT_COLOR, after: 0 })],
    })] })],
  });
}

/** Width and kind of a PNG or JPEG file, read from its header (no decoding). */
export function imageInfo(buffer: Buffer): { type: "png" | "jpg"; width: number; height: number } | null {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.toString("ascii", 12, 16) === "IHDR") {
    return { type: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: "jpg", height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  return null;
}

/** An image scaled to the text width (aspect kept), centred, with an optional caption. */
function imageBlock(b: { data: string; caption?: string; width?: number }, font: string): Paragraph[] {
  const buffer = Buffer.from(b.data, "base64");
  const info = imageInfo(buffer);
  if (!info) throw new Error("Image block: data must be a PNG or JPEG file.");
  const width = Math.min(b.width ?? 620, 620);
  const height = Math.round((width * info.height) / info.width);
  const alt = b.caption ?? "image";
  const out = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: Boolean(b.caption),
      spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: info.type, data: buffer, transformation: { width, height }, altText: { name: alt, title: alt, description: alt } })],
    }),
  ];
  if (b.caption) out.push(para(b.caption, { font, italics: true, size: 9, align: "center", after: 200 }));
  return out;
}

/** Converts validated blocks into docx children. */
function renderBlocks(blocks: Block[], accent: string, font: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        out.push(heading(b.text, b.level ?? 1, accent, font));
        break;
      case "paragraph":
        out.push(para(b.text, { font, bold: b.bold, italics: b.italic, align: b.align, size: b.size, color: b.color }));
        break;
      case "bullets":
        for (const item of b.items) out.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 90 }, children: [run(item, { font })] }));
        break;
      case "numbered":
        for (const item of b.items) out.push(new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 90 }, children: [run(item, { font })] }));
        break;
      case "checklist":
        for (const item of b.items) out.push(new Paragraph({
          indent: { left: 360 },
          spacing: { after: 90 },
          children: [run("☐  ", { font, bold: true, color: accent }), run(item, { font })],
        }));
        break;
      case "table":
        out.push(tableBuilder(b.columns, b.rows, accent, font, { widths: b.widths, zebra: b.zebra }));
        out.push(para("", { font, after: 120 }));
        break;
      case "raci":
        out.push(...raciTable(b, accent, font));
        break;
      case "callout":
        out.push(callout(b.text, b.tone ?? "info", font));
        out.push(para("", { font, after: 120 }));
        break;
      case "page_break":
        out.push(new Paragraph({ children: [], pageBreakBefore: true }));
        break;
      case "spacer":
        out.push(new Paragraph({ spacing: { after: b.height ?? 120 }, children: [] }));
        break;
      case "image":
        out.push(...imageBlock(b, font));
        break;
    }
  }
  return out;
}

export interface BuiltDocument { buffer: Buffer; blockCount: number }

/** Builds a .docx buffer from a validated document spec. */
export async function buildDocx(spec: DocumentSpec): Promise<BuiltDocument> {
  const accent = spec.accentColor ?? DEFAULT_ACCENT;
  const font = spec.fontFamily ?? "Calibri";
  const cover: (Paragraph | Table)[] = [];
  if (spec.title) cover.push(para(spec.title, { font, bold: true, size: 24, color: "16283F", before: 200, after: 120 }));
  if (spec.subtitle) cover.push(para(spec.subtitle, { font, italics: true, size: 12, color: TEXT_COLOR, after: 360 }));

  const headerChildren = spec.headerText ? [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    border: { bottom: { color: BORDER, space: 4, style: BorderStyle.SINGLE, size: 4 } },
    children: [new TextRun({ text: spec.headerText, size: 16, color: "8A97A3", font })],
  })] : [new Paragraph({ children: [] })];

  const showPages = spec.pageNumbers !== false;
  const footerChildren = [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      ...(spec.footerText ? [new TextRun({ text: `${spec.footerText}${showPages ? "  ·  " : ""}`, size: 16, color: "8A97A3", font })] : []),
      ...(showPages ? [
        new TextRun({ text: "Page ", size: 16, color: "8A97A3", font }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A97A3", font }),
        new TextRun({ text: " / ", size: 16, color: "8A97A3", font }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "8A97A3", font }),
      ] : []),
    ],
  })];

  const body = renderBlocks(spec.blocks, accent, font);
  const doc = new Document({
    creator: "sea-mcp-docx",
    title: spec.title ?? "Document",
    styles: { default: { document: { run: { font, size: 21, color: TEXT_COLOR } } } },
    numbering: {
      config: [
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 260 } } } }] },
        { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 300 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: MARGIN } },
      headers: { default: new Header({ children: headerChildren }) },
      footers: { default: new Footer({ children: footerChildren }) },
      children: [...cover, ...body],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  return { buffer: Buffer.from(buffer), blockCount: spec.blocks.length };
}

/** Human-readable reference returned by the docx_describe_blocks tool. */
export const BLOCK_REFERENCE = `# Blocs disponibles (champ "blocks")

- heading: { type, text, level?: 1|2|3 }
- paragraph: { type, text, bold?, italic?, align?: left|center|right|justify, size? (8-28 pt), color? }
- bullets / numbered / checklist: { type, items: string[] }
- table: { type, columns: string[], rows: (string | {text, fill?, bold?, color?, align?})[][], widths?: number[], zebra? }
- raci: { type, activities: string[], roles: string[], matrix: ("R"|"A"|"C"|"I"|"")[][] }  (one row per activity)
- callout: { type, text, tone?: info|warning|success }
- page_break: { type }
- spacer: { type, height? (pt) }
- image: { type, data: base64 PNG or JPEG (max ~2 MB), caption?, width? (px, max 620, default 620) }. Scaled to the text width, aspect kept.

Document: { title?, subtitle?, accentColor? (hex), fontFamily? (default Calibri), headerText?, footerText?, pageNumbers? (default true), blocks }.
Colours: hex without # (e.g. "1F3A5F"). A4, 1.5 cm margins.`;
