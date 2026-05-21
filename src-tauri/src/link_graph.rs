use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

#[derive(Serialize, Clone, Debug)]
pub struct Backlink {
    pub source: String,
    pub line: usize,
    pub preview: String,
    pub kind: String, // "wiki" | "md"
}

#[derive(Serialize, Clone, Debug)]
pub struct GraphNode {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub tags: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct LinkGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Serialize, Clone, Debug)]
pub struct MdFileMeta {
    pub path: String,
    pub mtime: u64, // millis since epoch (0 if unavailable)
    pub size: u64,
}

fn is_markdown_ext(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md") | Some("markdown")
    )
}

fn collect_md(root: &Path, out: &mut Vec<PathBuf>, depth: usize) {
    if depth > 12 {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            if matches!(
                name.as_str(),
                "node_modules" | "target" | "dist" | ".git" | ".next"
            ) {
                continue;
            }
            collect_md(&path, out, depth + 1);
        } else if is_markdown_ext(&path) {
            out.push(path);
        }
    }
}

fn canonical(p: &Path) -> String {
    p.canonicalize()
        .map(|c| c.to_string_lossy().to_string())
        .unwrap_or_else(|_| p.to_string_lossy().to_string())
}

// Iterate wikilinks [[name]] / [[name|alias]] in a line.
// Returns a vector of inner-name strings (left of the | if present).
fn extract_wikilinks(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut s = line;
    while let Some(start) = s.find("[[") {
        let after = &s[start + 2..];
        if let Some(end) = after.find("]]") {
            let inner = &after[..end];
            let name = inner
                .split('|')
                .next()
                .unwrap_or("")
                .trim()
                .trim_end_matches(".md")
                .to_string();
            if !name.is_empty() {
                out.push(name);
            }
            s = &after[end + 2..];
        } else {
            break;
        }
    }
    out
}

// Extract inline #tags from a line.
// Matches #word (alphanum + underscore + - + /), preceded by whitespace or BOL,
// rejects markdown headings (# is followed by space), URL fragments (preceded by chars).
fn extract_tags(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'#' {
            // Check preceding char: must be BOL or whitespace
            let preceded_by_word = i > 0 && {
                let prev = bytes[i - 1];
                prev.is_ascii_alphanumeric() || prev == b'_' || prev == b'/' || prev == b'#'
            };
            // Skip headings (## something) — i.e., space after hashes
            // and skip URL fragments (preceded by word char)
            if !preceded_by_word {
                // Skip multiple consecutive #'s (treat as heading-prefix, not tag)
                let mut hash_count = 1usize;
                while i + hash_count < bytes.len() && bytes[i + hash_count] == b'#' {
                    hash_count += 1;
                }
                let after = &line[i + hash_count..];
                if hash_count == 1 {
                    let mut end = 0;
                    let chars: Vec<(usize, char)> = after.char_indices().collect();
                    for (idx, ch) in &chars {
                        if ch.is_alphanumeric() || *ch == '_' || *ch == '-' || *ch == '/' {
                            end = *idx + ch.len_utf8();
                        } else {
                            break;
                        }
                    }
                    if end > 0 {
                        let tag = &after[..end];
                        // Reject pure-numeric tags (#123 is usually an issue ref)
                        if !tag.chars().all(|c| c.is_ascii_digit()) {
                            out.push(tag.to_string());
                        }
                        i += 1 + end;
                        continue;
                    }
                }
                i += hash_count;
                continue;
            }
        }
        i += 1;
    }
    out
}

// Iterate markdown links [text](path) in a line.
// Returns a vector of cleaned path strings, skipping http(s)/mailto.
fn extract_md_link_paths(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut s = line;
    while let Some(open_bracket) = s.find('[') {
        let rest = &s[open_bracket..];
        let Some(close_text) = rest.find("](") else { break };
        let after_paren = &rest[close_text + 2..];
        let Some(close_paren) = after_paren.find(')') else { break };
        let raw_path = &after_paren[..close_paren];
        let clean = raw_path
            .split('#')
            .next()
            .unwrap_or("")
            .split_whitespace()
            .next()
            .unwrap_or("");
        if !clean.is_empty()
            && !clean.starts_with("http://")
            && !clean.starts_with("https://")
            && !clean.starts_with("mailto:")
        {
            out.push(clean.to_string());
        }
        s = &after_paren[close_paren + 1..];
    }
    out
}

#[tauri::command]
pub fn get_backlinks(roots: Vec<String>, target: String) -> Vec<Backlink> {
    let target_canonical = canonical(Path::new(&target));
    let target_path = Path::new(&target_canonical);
    let target_stem = target_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    if target_stem.is_empty() {
        return Vec::new();
    }

    let mut all_files: Vec<PathBuf> = Vec::new();
    for root in &roots {
        collect_md(Path::new(root), &mut all_files, 0);
    }

    let mut out = Vec::new();
    for f in &all_files {
        let source_canonical = canonical(f);
        if source_canonical == target_canonical {
            continue;
        }
        let Ok(content) = fs::read_to_string(f) else { continue };
        let source_dir = f.parent().unwrap_or(Path::new(""));

        let mut in_fence = false;
        for (line_idx, line) in content.lines().enumerate() {
            if line.trim_start().starts_with("```") {
                in_fence = !in_fence;
                continue;
            }
            if in_fence {
                continue;
            }

            let mut hit_kind: Option<&str> = None;

            // wikilink check
            for name in extract_wikilinks(line) {
                if name == target_stem {
                    hit_kind = Some("wiki");
                    break;
                }
            }

            // md link check
            if hit_kind.is_none() {
                for raw in extract_md_link_paths(line) {
                    let resolved = source_dir.join(&raw);
                    if canonical(&resolved) == target_canonical {
                        hit_kind = Some("md");
                        break;
                    }
                }
            }

            if let Some(kind) = hit_kind {
                out.push(Backlink {
                    source: source_canonical.clone(),
                    line: line_idx + 1,
                    preview: line.trim().chars().take(200).collect(),
                    kind: kind.to_string(),
                });
            }
        }
    }
    out
}

#[tauri::command]
pub fn list_md_files_meta(roots: Vec<String>) -> Vec<MdFileMeta> {
    let mut all_files: Vec<PathBuf> = Vec::new();
    for root in &roots {
        collect_md(Path::new(root), &mut all_files, 0);
    }
    all_files
        .into_iter()
        .map(|p| {
            let path = canonical(&p);
            let (mtime, size) = match fs::metadata(&p) {
                Ok(md) => {
                    let mt = md
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    (mt, md.len())
                }
                Err(_) => (0, 0),
            };
            MdFileMeta { path, mtime, size }
        })
        .collect()
}

#[tauri::command]
pub fn get_link_graph(roots: Vec<String>) -> LinkGraph {
    let mut all_files: Vec<PathBuf> = Vec::new();
    for root in &roots {
        collect_md(Path::new(root), &mut all_files, 0);
    }

    let canonical_paths: Vec<String> = all_files.iter().map(|p| canonical(p)).collect();

    // basename (stem) → first canonical path
    let mut basename_index: HashMap<String, String> = HashMap::new();
    for (i, f) in all_files.iter().enumerate() {
        if let Some(stem) = f.file_stem().and_then(|s| s.to_str()) {
            basename_index
                .entry(stem.to_string())
                .or_insert_with(|| canonical_paths[i].clone());
        }
    }

    // Per-file: edges + tags
    let valid_targets: std::collections::HashSet<&String> = canonical_paths.iter().collect();
    let mut edges: Vec<GraphEdge> = Vec::new();
    let mut tags_per_file: Vec<Vec<String>> = vec![Vec::new(); all_files.len()];

    for (i, f) in all_files.iter().enumerate() {
        let source_canonical = &canonical_paths[i];
        let Ok(content) = fs::read_to_string(f) else { continue };
        let source_dir = f.parent().unwrap_or(Path::new(""));

        let mut seen_tags: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
        let mut in_fence = false;
        for line in content.lines() {
            if line.trim_start().starts_with("```") {
                in_fence = !in_fence;
                continue;
            }
            if in_fence {
                continue;
            }

            for name in extract_wikilinks(line) {
                if let Some(target) = basename_index.get(&name) {
                    if target != source_canonical {
                        edges.push(GraphEdge {
                            source: source_canonical.clone(),
                            target: target.clone(),
                        });
                    }
                }
            }

            for raw in extract_md_link_paths(line) {
                let resolved = source_dir.join(&raw);
                let target = canonical(&resolved);
                if valid_targets.contains(&target) && &target != source_canonical {
                    edges.push(GraphEdge {
                        source: source_canonical.clone(),
                        target,
                    });
                }
            }

            for t in extract_tags(line) {
                seen_tags.insert(t);
            }
        }
        tags_per_file[i] = seen_tags.into_iter().collect();
    }

    let nodes: Vec<GraphNode> = all_files
        .iter()
        .enumerate()
        .map(|(i, f)| GraphNode {
            id: canonical_paths[i].clone(),
            name: f
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string(),
            folder: f
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string(),
            tags: tags_per_file[i].clone(),
        })
        .collect();

    // de-dup edges
    edges.sort_by(|a, b| (a.source.as_str(), a.target.as_str()).cmp(&(&b.source, &b.target)));
    edges.dedup_by(|a, b| a.source == b.source && a.target == b.target);

    LinkGraph { nodes, edges }
}

/// Query `git status --porcelain` for each workspace root and return a
/// map of canonical absolute path -> short status code:
///   "new" — untracked
///   "mod" — modified or added
///   "del" — deleted
/// Returns an empty map (silently) for roots that aren't git repos.
#[tauri::command]
pub fn git_status(roots: Vec<String>) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    for root in &roots {
        let output = Command::new("git")
            .arg("-C")
            .arg(root)
            .arg("status")
            .arg("--porcelain")
            .arg("-uall")
            .arg("--ignored=no")
            .output();
        let Ok(output) = output else { continue };
        if !output.status.success() { continue }
        let s = String::from_utf8_lossy(&output.stdout);
        for line in s.lines() {
            if line.len() < 4 { continue; }
            let code = &line[..2];
            // Path portion may include rename arrow "old -> new"; take last token
            let rest = &line[3..];
            let path_part = rest.split(" -> ").last().unwrap_or(rest).trim();
            // Strip optional surrounding quotes (Git quotes paths with special chars)
            let path_clean = path_part.trim_matches('"');
            let status = if code.starts_with("??") {
                "new"
            } else if code.contains('M') || code.contains('A') || code.contains('R') {
                "mod"
            } else if code.contains('D') {
                "del"
            } else {
                continue;
            };
            let abs = Path::new(root).join(path_clean);
            let canon = abs
                .canonicalize()
                .map(|c| c.to_string_lossy().to_string())
                .unwrap_or_else(|_| abs.to_string_lossy().to_string());
            out.insert(canon, status.to_string());
        }
    }
    out
}
