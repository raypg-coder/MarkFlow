/**
 * Lightly sanitize markdown content before handing it to Crepe.
 *
 * Crepe (Milkdown) is stricter than MWeb / VSCode / GitHub:
 *   • chokes on standalone void HTML tags ("Invalid array passed to renderSpec")
 *   • mishandles escaped pipes (`\|`) inside table cells in some versions
 *   • doesn't render HTML comments — we strip them defensively
 *
 * Transformations preserve visual intent for typical documents.
 */

const VOID_TAGS = [
  "br",
  "hr",
  "img",
  "input",
  "meta",
  "link",
  "area",
  "base",
  "col",
  "embed",
  "source",
  "track",
  "wbr",
];
const VOID_INLINE_RE = new RegExp(
  `<\\s*(${VOID_TAGS.join("|")})\\b[^>]*\\/?\\s*>`,
  "gi",
);
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

export function sanitizeForCrepe(md: string): string {
  // 1. Strip HTML comments globally (they can span lines)
  md = md.replace(HTML_COMMENT_RE, "");

  const lines = md.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceMarker = "";

  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(```+|~~~+)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[2];
      } else if (fenceMatch[2].startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    let cleaned = line;

    // 2. Strip inline void HTML tags wherever they appear
    cleaned = cleaned.replace(VOID_INLINE_RE, "");

    // 3. Table-row defense: escaped pipes inside cells trip up some renderers
    //    Replace `\|` with U+2502 (visually identical light vertical) so the
    //    text content stays readable but the markdown parser sees no escape.
    if (/^\s*\|/.test(cleaned) && cleaned.includes("\\|")) {
      cleaned = cleaned.replace(/\\\|/g, "│");
    }

    // 4. Currency-dollar defense: Crepe's Latex feature greedily reads `$...$`
    //    as inline math. Plain prose like `$30k-$80k` makes the parser hand a
    //    malformed math node to renderSpec → "Invalid array".
    //    Escape any un-escaped `$` immediately followed by a digit.
    cleaned = cleaned.replace(
      /(^|[^\\$])\$(\d)/g,
      (_m, pre, digit) => pre + "\\$" + digit,
    );

    // 5. If a non-empty source line collapsed entirely to whitespace after
    //    stripping void tags, output a blank line (was a bare <br/>-only line)
    if (line.trim() !== "" && cleaned.trim() === "") {
      out.push("");
      continue;
    }
    out.push(cleaned);
  }

  return out.join("\n");
}
