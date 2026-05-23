export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[] | null;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  kind: FileKind;
}

export type FileKind =
  | "markdown"
  | "python"
  | "go"
  | "env"
  | "text"
  | "json"
  | "yaml"
  | "toml"
  | "sql"
  | "javascript"
  | "typescript"
  | "code"
  | "unknown";

export interface Workspace {
  id: string;
  name: string;
  roots: string[];
  createdAt: number;
}

export interface SearchHit {
  path: string;
  line: number;
  preview: string;
}

export interface Backlink {
  source: string;
  line: number;
  preview: string;
  kind: "wiki" | "md";
}

export interface GraphNode {
  id: string;
  name: string;
  folder: string;
  tags: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface LinkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type RightSidebarView = "outline" | "backlinks" | "graph" | "smartlookup" | "ai";

export type GitFileStatus = "new" | "mod" | "del";

export type MissionPriority = "low" | "mid" | "high" | "critical";

export interface Mission {
  id: string;
  title: string;
  priority: MissionPriority;
  deadline: number | null; // ms epoch
  completed: boolean;
  completedAt: number | null;
  createdAt: number;
}
