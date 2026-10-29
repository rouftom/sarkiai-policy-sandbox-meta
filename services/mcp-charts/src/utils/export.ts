import type { App } from "@modelcontextprotocol/ext-apps";

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart";

export const fileName = (title: string | undefined, ext: string) => `${slug(title || "chart")}.${ext}`;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Downloads a file using the host `ui/download-file` capability when available
 * (sandboxed iframes usually block <a download>), with a local fallback.
 */
export async function downloadBlob(app: App | null, blob: Blob, name: string): Promise<boolean> {
  if (app?.getHostCapabilities()?.downloadFile) {
    try {
      const isText = /^(text\/|image\/svg|application\/json)/.test(blob.type);
      const resource = isText
        ? { uri: `file:///${name}`, mimeType: blob.type, text: await blob.text() }
        : { uri: `file:///${name}`, mimeType: blob.type, blob: await blobToBase64(blob) };
      const res = await app.downloadFile({ contents: [{ type: "resource", resource }] });
      if (!res?.isError) return true;
    } catch (e) {
      console.warn("[charts] host download failed, falling back", e);
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((h) => h !== "children");
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

/** Serializes the main Recharts SVG of a container, inlining computed text styles. */
export function serializeChartSvg(container: HTMLElement, background: string): { svg: string; width: number; height: number } | null {
  const source = container.querySelector<SVGSVGElement>(".recharts-wrapper > svg.recharts-surface") ?? container.querySelector<SVGSVGElement>("svg");
  if (!source) return null;
  const { width, height } = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  // Inline computed styles for text & strokes driven by CSS variables
  const srcNodes = source.querySelectorAll<SVGElement>("text, tspan, line, path");
  const dstNodes = clone.querySelectorAll<SVGElement>("text, tspan, line, path");
  srcNodes.forEach((node, i) => {
    const cs = getComputedStyle(node);
    const dst = dstNodes[i];
    if (!dst) return;
    if (node.tagName === "text" || node.tagName === "tspan") {
      dst.setAttribute("fill", cs.fill);
      dst.setAttribute("font-size", cs.fontSize);
      dst.setAttribute("font-family", cs.fontFamily);
      dst.setAttribute("font-weight", cs.fontWeight);
    } else if (cs.stroke && cs.stroke !== "none" && !dst.getAttribute("stroke")) {
      dst.setAttribute("stroke", cs.stroke);
    }
  });

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", background);
  clone.insertBefore(bg, clone.firstChild);

  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}

export function svgToPngBlob(svg: string, width: number, height: number, scale = 2): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => resolve(b), "image/png");
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
