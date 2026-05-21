import { convertFileSrc } from "@tauri-apps/api/core";
import mermaid from "mermaid";

let mermaidInitialized = false;
let mermaidSeq = 0;

function initMermaid(dark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? "dark" : "neutral",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    securityLevel: "loose",
    flowchart: { htmlLabels: true, curve: "basis" },
  });
  mermaidInitialized = true;
}

function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(0, i) : ".";
}

function resolvePath(baseFile: string, ref: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(ref) || ref.startsWith("/")) return ref;
  const dir = dirname(baseFile);
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  const combined = (dir + sep + ref).replace(/\\/g, "/");
  const parts = combined.split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") {
      if (stack.length === 0) stack.push("");
      continue;
    }
    if (p === "..") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    stack.push(p);
  }
  return stack.join("/");
}

function getCodeBlockLang(block: Element): string {
  // Try in order of reliability:
  //   1. data-language attribute on the custom element itself
  //   2. data-language on any inner element
  //   3. .language-button / .language-picker / .language-button-text text content
  //   4. Any "language-xxx" class anywhere inside
  const candidates: (string | null | undefined)[] = [
    block.getAttribute("data-language"),
    (block as HTMLElement).dataset?.language,
    block.querySelector("[data-language]")?.getAttribute("data-language"),
    block.querySelector(".language-button, .language-picker, .language-button-text, .lang")
      ?.textContent,
  ];
  for (const c of candidates) {
    const val = (c || "").trim().toLowerCase();
    if (val && val !== "auto" && val !== "plain") return val;
  }
  // Fallback: parse class-name pattern
  const cmContent = block.querySelector(".cm-content");
  if (cmContent) {
    const cls = Array.from((cmContent as HTMLElement).classList || []);
    for (const c of cls) {
      const m = c.match(/^language-(.+)$/);
      if (m) return m[1].toLowerCase();
    }
  }
  return "";
}

function getCodeBlockText(block: Element): string {
  // Crepe wraps the code in a CodeMirror editor inside the custom element
  const cm = block.querySelector(".cm-content");
  if (cm) {
    return Array.from(cm.querySelectorAll(".cm-line"))
      .map((l) => l.textContent || "")
      .join("\n");
  }
  const code = block.querySelector("code");
  if (code) return code.textContent ?? "";
  return block.textContent?.trim() ?? "";
}

// Mermaid block-type starting keywords (first non-empty line)
const MERMAID_KEYWORDS = [
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "gitGraph",
  "mindmap",
  "timeline",
  "requirementDiagram",
  "flowchart",
  "graph",
  "quadrantChart",
  "xychart-beta",
  "block-beta",
  "packet-beta",
  "architecture-beta",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
  "%%{init",
];

function sniffMermaidByContent(code: string): boolean {
  const first = code
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return false;
  return MERMAID_KEYWORDS.some((kw) => first.startsWith(kw));
}

function findCodeBlocks(root: HTMLElement): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const result: HTMLElement[] = [];
  const push = (el: Element | null) => {
    if (!el) return;
    const h = el as HTMLElement;
    if (seen.has(h)) return;
    seen.add(h);
    result.push(h);
  };
  // Crepe wraps each code block as <div class="milkdown-code-block">
  root.querySelectorAll(".milkdown-code-block").forEach(push);
  // Any element whose class matches code-block / codeblock outside our container
  root.querySelectorAll("[class*='code-block'], [class*='codeblock']").forEach((el) => {
    if (!el.closest(".milkdown-code-block")) push(el);
  });
  // CodeMirror wrappers not inside a known code-block container — defensive fallback
  root.querySelectorAll(".cm-editor").forEach((cm) => {
    if (cm.closest(".milkdown-code-block")) return;
    const wrapper = cm.parentElement;
    if (wrapper && !seen.has(wrapper)) push(wrapper);
  });
  return result;
}

export function renderEmbeds(root: HTMLElement, filePath: string, theme: "light" | "dark") {
  if (!mermaidInitialized) initMermaid(theme === "dark");

  // ─── 1. Rewrite local image src ──────────────────────────────
  root.querySelectorAll("img").forEach((img) => {
    if (img.dataset.mfRewrittenFor === filePath) return;
    const src = img.getAttribute("src");
    if (!src) return;
    if (/^(data:|asset:|tauri:|https?:|blob:)/i.test(src)) {
      img.dataset.mfRewrittenFor = filePath;
      return;
    }
    let abs = src;
    if (src.startsWith("file://")) {
      abs = src.replace(/^file:\/\//, "");
    } else if (!/^[a-zA-Z]:[\\/]/.test(src) && !src.startsWith("/")) {
      abs = resolvePath(filePath, src);
    }
    try {
      img.src = convertFileSrc(abs);
      img.dataset.mfRewrittenFor = filePath;
    } catch (e) {
      console.warn("img rewrite failed", e);
    }
  });

  // ─── 2. Mermaid + SVG code blocks ────────────────────────────
  findCodeBlocks(root).forEach((block) => {
    let lang = getCodeBlockLang(block);
    const code = getCodeBlockText(block);
    if (!code.trim()) return;

    // Content-sniff fallback: detect mermaid by first-line keyword when
    // language metadata isn't reliably exposed by Crepe.
    if (!lang || (lang !== "mermaid" && lang !== "svg")) {
      if (sniffMermaidByContent(code)) lang = "mermaid";
    }

    if (lang !== "mermaid" && lang !== "svg") {
      const stale = block.querySelector(":scope > .mf-embed");
      if (stale) stale.remove();
      return;
    }

    let preview = block.querySelector(":scope > .mf-embed") as HTMLDivElement | null;
    if (!preview) {
      preview = document.createElement("div");
      preview.className = "mf-embed";
      preview.setAttribute("contenteditable", "false");
      preview.setAttribute("data-mf-skip", "true");
      block.appendChild(preview);
    }
    if (preview.dataset.code === code && preview.dataset.lang === lang) return;
    preview.dataset.code = code;
    preview.dataset.lang = lang;

    if (lang === "svg") {
      preview.innerHTML = code;
    } else {
      const id = `mf-mm-${++mermaidSeq}`;
      mermaid
        .render(id, code)
        .then(({ svg }) => {
          if (preview!.dataset.code === code) preview!.innerHTML = svg;
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
          preview!.innerHTML = `<div class="mf-embed-error">Mermaid 错误：${msg}</div>`;
        });
    }
  });
}

export function reinitMermaidTheme(theme: "light" | "dark") {
  initMermaid(theme === "dark");
}

/**
 * Render mermaid/svg code blocks inside read-only HTML (marked output).
 * The structure is <pre><code class="language-mermaid">...</code></pre>.
 */
export async function renderFallbackEmbeds(
  root: HTMLElement,
  theme: "light" | "dark",
): Promise<void> {
  if (!mermaidInitialized) initMermaid(theme === "dark");

  const blocks = Array.from(root.querySelectorAll("pre > code"));
  for (const code of blocks) {
    if ((code as HTMLElement).dataset?.mfFallbackHandled === "1") continue;
    const cls = Array.from(code.classList);
    const langClass = cls.find((c) => c.startsWith("language-"));
    let lang = langClass ? langClass.slice("language-".length).toLowerCase() : "";
    const source = (code.textContent || "").trim();
    if (!source) continue;
    // Content sniff: if language is missing/plain, detect mermaid by keyword
    if (lang !== "mermaid" && lang !== "svg" && sniffMermaidByContent(source)) {
      lang = "mermaid";
    }
    if (lang !== "mermaid" && lang !== "svg") continue;
    (code as HTMLElement).dataset.mfFallbackHandled = "1";
    const pre = code.parentElement as HTMLElement;

    if (lang === "svg") {
      const wrapper = document.createElement("div");
      wrapper.className = "mf-embed-fallback";
      wrapper.innerHTML = source;
      pre.replaceWith(wrapper);
      continue;
    }

    // mermaid
    const id = `mf-fb-mm-${++mermaidSeq}`;
    try {
      const { svg } = await mermaid.render(id, source);
      const wrapper = document.createElement("div");
      wrapper.className = "mf-embed-fallback";
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch (e: unknown) {
      const errEl = document.createElement("div");
      errEl.className = "mf-embed-error";
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      errEl.textContent = `Mermaid 错误：${msg}`;
      pre.replaceWith(errEl);
    }
  }
}
