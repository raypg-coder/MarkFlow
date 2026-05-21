import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

// marked + html2pdf are large (~250KB combined) and only used when the user
// explicitly exports. Dynamic import keeps them out of the main bundle.
const getMarked = () => import("marked").then((m) => m.marked);
// @ts-expect-error no types
const getHtml2Pdf = () => import("html2pdf.js").then((m) => m.default);

const exportCss = `
body{font-family:-apple-system,system-ui,sans-serif;max-width:820px;margin:48px auto;padding:0 24px;line-height:1.75;color:#1f1f23;}
h1,h2,h3{font-weight:700;margin:1em 0 .4em;}
h1{font-size:2em;}h2{font-size:1.5em;}h3{font-size:1.25em;}
code{background:#f4f4f5;padding:2px 6px;border-radius:4px;font-family:ui-monospace,Menlo,monospace;}
pre{background:#f4f4f5;padding:14px 16px;border-radius:8px;overflow:auto;}
pre code{background:transparent;padding:0;}
blockquote{border-left:3px solid #e5e5e7;padding:4px 16px;color:#6b7280;margin:.6em 0;}
table{border-collapse:collapse;margin:.8em 0;}
th,td{border:1px solid #e5e5e7;padding:6px 12px;}
a{color:#2563eb;}
img{max-width:100%;border-radius:6px;}
`;

function fullHtml(name: string, body: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${name}</title>
<style>${exportCss}</style></head><body>${body}</body></html>`;
}

export async function exportMarkdownToHtml(name: string, content: string) {
  const path = await save({
    defaultPath: name.replace(/\.(md|markdown)$/i, ".html"),
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!path) return;
  const marked = await getMarked();
  const body = await marked.parse(content);
  await writeTextFile(path, fullHtml(name, body as string));
}

export async function exportMarkdownToPdf(name: string, content: string) {
  const marked = await getMarked();
  const html2pdf = await getHtml2Pdf();
  const body = await marked.parse(content);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:820px;background:#fff;";
  host.innerHTML = `<style>${exportCss}</style><div style="padding:24px;">${body}</div>`;
  document.body.appendChild(host);
  try {
    await html2pdf()
      .set({
        margin: 10,
        filename: name.replace(/\.(md|markdown)$/i, ".pdf"),
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(host)
      .save();
  } finally {
    host.remove();
  }
}
