import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { RefreshCw, Crosshair } from "lucide-react";
import { useStore, basename } from "../store";
import type { GraphNode } from "../types";

type Depth = 1 | 2 | "all";
type ColorBy = "folder" | "tag" | "none";

interface Node extends GraphNode {
  x?: number;
  y?: number;
  __isActive?: boolean;
  __isNeighbor?: boolean;
}

interface Link {
  source: string | Node;
  target: string | Node;
}

const PALETTE = ["--md-violet", "--md-amber", "--md-rose", "--md-teal", "--color-accent"];

// Stable key → color mapping (cycle through 5 brand colors)
function paletteColor(key: string): string {
  if (!key) return "var(--color-text-muted)";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return `var(${PALETTE[Math.abs(hash) % PALETTE.length]})`;
}

function nodeColor(n: GraphNode, mode: ColorBy): string {
  switch (mode) {
    case "tag":
      return n.tags.length > 0 ? paletteColor(n.tags[0]) : "var(--color-text-muted)";
    case "none":
      return "var(--color-text-muted)";
    case "folder":
    default:
      return paletteColor(n.folder);
  }
}

function readCssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function resolveColor(maybeVar: string): string {
  // If it's already a hex/rgb, return; if "var(--x)", read it
  const m = /^var\((--[\w-]+)\)$/.exec(maybeVar);
  if (m) return readCssVar(m[1], "#888");
  return maybeVar;
}

// BFS to limit nodes to local neighborhood
function localSubgraph(
  nodes: GraphNode[],
  edges: { source: string; target: string }[],
  rootId: string,
  depth: number,
): { nodes: GraphNode[]; edges: { source: string; target: string }[] } {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }
  const visited = new Map<string, number>();
  visited.set(rootId, 0);
  const queue: string[] = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = visited.get(cur)!;
    if (d >= depth) continue;
    for (const n of adj.get(cur) ?? []) {
      if (!visited.has(n)) {
        visited.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  const keepIds = new Set(visited.keys());
  return {
    nodes: nodes.filter((n) => keepIds.has(n.id)),
    edges: edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target)),
  };
}

export function GraphPanel() {
  const {
    linkGraph,
    linkGraphLoading,
    loadLinkGraph,
    activePath,
    openFile,
    theme,
  } = useStore();
  const [depth, setDepth] = useState<Depth>(1);
  const [colorBy, setColorBy] = useState<ColorBy>("folder");
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Auto-load on mount if absent
  useEffect(() => {
    if (!linkGraph && !linkGraphLoading) loadLinkGraph();
  }, [linkGraph, linkGraphLoading, loadLinkGraph]);

  // Track container size for the canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Build the data to render (limit by depth around activePath if set)
  const data = useMemo(() => {
    if (!linkGraph) return { nodes: [] as Node[], links: [] as Link[] };
    let sub: { nodes: GraphNode[]; edges: { source: string; target: string }[] };
    if (depth !== "all" && activePath && linkGraph.nodes.some((n) => n.id === activePath)) {
      sub = localSubgraph(linkGraph.nodes, linkGraph.edges, activePath, depth);
    } else {
      sub = { nodes: linkGraph.nodes, edges: linkGraph.edges };
    }
    const neighborSet = new Set<string>();
    for (const e of sub.edges) {
      if (e.source === activePath) neighborSet.add(e.target);
      if (e.target === activePath) neighborSet.add(e.source);
    }
    const nodes: Node[] = sub.nodes.map((n) => ({
      ...n,
      __isActive: n.id === activePath,
      __isNeighbor: neighborSet.has(n.id),
    }));
    const links: Link[] = sub.edges.map((e) => ({ source: e.source, target: e.target }));
    return { nodes, links };
  }, [linkGraph, activePath, depth]);

  // Re-read colors when theme changes
  const colors = useMemo(() => {
    return {
      bg: resolveColor("var(--color-bg-soft)"),
      text: resolveColor("var(--color-text-muted)"),
      textActive: resolveColor("var(--color-text)"),
      accent: resolveColor("var(--color-accent)"),
      border: resolveColor("var(--color-border)"),
      borderStrong: resolveColor("var(--color-border-strong)"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const handleNodeClick = useCallback(
    (node: object) => {
      const n = node as Node;
      if (!n.id) return;
      openFile(n.id, basename(n.id));
    },
    [openFile],
  );

  const handleEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(400, 40);
  }, []);

  // Hover dimming logic
  const isDim = (id: string): boolean => {
    if (!hoverNode) return false;
    if (id === hoverNode) return false;
    for (const link of data.links) {
      const s = typeof link.source === "string" ? link.source : String(link.source.id);
      const t = typeof link.target === "string" ? link.target : String(link.target.id);
      if (s === hoverNode && t === id) return false;
      if (t === hoverNode && s === id) return false;
    }
    return true;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <span className="geek-label">graph</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => fgRef.current?.zoomToFit(300, 40)}
            title="重置视图"
            className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
          >
            <Crosshair size={11} strokeWidth={1.75} />
          </button>
          <button
            onClick={loadLinkGraph}
            disabled={linkGraphLoading}
            title="刷新"
            className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] disabled:opacity-40"
          >
            <RefreshCw size={11} strokeWidth={1.75} className={linkGraphLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Depth + color-by selectors */}
      <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[10.5px] text-[var(--color-text-subtle)]">深度</span>
          {(["1", "2", "all"] as const).map((d) => {
            const v: Depth = d === "all" ? "all" : (Number(d) as 1 | 2);
            const label = d === "all" ? "全图" : d;
            return (
              <button
                key={d}
                onClick={() => setDepth(v)}
                className={`text-[11px] px-2 py-0.5 rounded ${
                  depth === v
                    ? "bg-[var(--color-bg)] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-border)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10.5px] text-[var(--color-text-subtle)]">着色</span>
          {(
            [
              { v: "folder", label: "目录" },
              { v: "tag", label: "标签" },
              { v: "none", label: "无" },
            ] as { v: ColorBy; label: string }[]
          ).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setColorBy(v)}
              className={`text-[11px] px-2 py-0.5 rounded ${
                colorBy === v
                  ? "bg-[var(--color-bg)] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-border)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {linkGraphLoading && !linkGraph && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--color-text-subtle)]">
            扫描中…
          </div>
        )}
        {!linkGraphLoading && data.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--color-text-subtle)] px-4 text-center">
            {linkGraph ? "未检测到任何链接\n用 [[name]] 或 [text](file.md) 试试" : ""}
          </div>
        )}
        {size.w > 0 && size.h > 0 && data.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={data}
            backgroundColor={colors.bg}
            nodeRelSize={4}
            linkColor={() => colors.border}
            linkWidth={1}
            cooldownTicks={120}
            onEngineStop={handleEngineStop}
            onNodeClick={(n) => handleNodeClick(n as object)}
            onNodeHover={(n) => setHoverNode(n ? String((n as Node).id ?? "") || null : null)}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as Node;
              const dim = isDim(n.id);
              const isActive = n.__isActive;
              const r = isActive ? 6 : 4;
              const fill = isActive ? colors.accent : resolveColor(nodeColor(n, colorBy));

              ctx.globalAlpha = dim ? 0.25 : 1;

              // node circle
              ctx.beginPath();
              ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
              ctx.fillStyle = fill;
              ctx.fill();

              if (isActive) {
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = colors.textActive;
                ctx.stroke();
              }

              // label
              const fontSize = Math.max(10, 11 / globalScale);
              ctx.font = `${fontSize}px -apple-system, system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = isActive ? colors.textActive : colors.text;
              ctx.fillText(n.name || basename(n.id), n.x ?? 0, (n.y ?? 0) + r + 2);

              ctx.globalAlpha = 1;
            }}
            linkCanvasObjectMode={() => "after"}
            linkCanvasObject={(link, ctx) => {
              const s = link.source as Node;
              const t = link.target as Node;
              const sId = String(s.id ?? "");
              const tId = String(t.id ?? "");
              const dim =
                hoverNode != null &&
                sId !== hoverNode && tId !== hoverNode;
              if (!dim) return;
              // override alpha for dimmed links by re-drawing transparent over
              ctx.globalAlpha = 0.15;
              ctx.beginPath();
              ctx.moveTo(s.x ?? 0, s.y ?? 0);
              ctx.lineTo(t.x ?? 0, t.y ?? 0);
              ctx.strokeStyle = colors.bg;
              ctx.lineWidth = 1.5;
              ctx.stroke();
              ctx.globalAlpha = 1;
            }}
          />
        )}
      </div>

      {/* Footer stats */}
      {linkGraph && (
        <div className="px-3 py-1.5 text-[10.5px] text-[var(--color-text-subtle)] border-t border-[var(--color-border)] flex items-center justify-between font-mono">
          <span>{data.nodes.length} 节点</span>
          <span>{data.links.length} 边</span>
        </div>
      )}
    </div>
  );
}
