mod link_graph;

use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

/// True for env-style files: .env, .env.local, .env-prod, .envrc, .flaskenv.
/// These dotfiles are NOT hidden by the tree builder.
fn is_env_file(name: &str) -> bool {
    name == ".env"
        || name == ".envrc"
        || name == ".flaskenv"
        || name.starts_with(".env.")
        || name.starts_with(".env-")
}

fn build_tree(path: &Path, depth: usize) -> Option<FileNode> {
    let name = path.file_name()?.to_string_lossy().to_string();
    if name.starts_with('.') && !is_env_file(&name) {
        return None;
    }
    let path_str = path.to_string_lossy().to_string();
    let is_dir = path.is_dir();
    let children = if is_dir && depth < 8 {
        let mut entries: Vec<FileNode> = fs::read_dir(path)
            .ok()?
            .filter_map(|e| e.ok())
            .filter_map(|e| build_tree(&e.path(), depth + 1))
            .collect();
        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });
        Some(entries)
    } else {
        None
    };
    Some(FileNode {
        name,
        path: path_str,
        is_dir,
        children,
    })
}

#[tauri::command]
fn read_dir_tree(path: String) -> Result<FileNode, String> {
    let p = Path::new(&path);
    build_tree(p, 0).ok_or_else(|| "Failed to read directory".to_string())
}

#[derive(Serialize)]
struct SearchHit {
    path: String,
    line: usize,
    preview: String,
}

fn search_in_dir(
    dir: &Path,
    needle: &str,
    hits: &mut Vec<SearchHit>,
    depth: usize,
) {
    if depth > 8 || hits.len() > 500 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && !is_env_file(&name) {
            continue;
        }
        if path.is_dir() {
            if name == "node_modules" || name == "target" || name == "dist" || name == ".git" {
                continue;
            }
            search_in_dir(&path, needle, hits, depth + 1);
        } else {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let is_env = is_env_file(&name);
            let editable = matches!(ext, "md" | "markdown" | "txt" | "py" | "go" | "env" | "json" | "yml" | "yaml" | "toml" | "ini" | "cfg" | "log" | "css" | "html" | "js" | "ts" | "tsx" | "jsx" | "mjs" | "cjs" | "sql" | "rs" | "sh") || is_env;
            if !editable {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else { continue };
            for (i, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&needle.to_lowercase()) {
                    hits.push(SearchHit {
                        path: path.to_string_lossy().to_string(),
                        line: i + 1,
                        preview: line.trim().chars().take(160).collect(),
                    });
                    if hits.len() > 500 {
                        return;
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn search_text(root: String, query: String) -> Vec<SearchHit> {
    let mut hits = Vec::new();
    if query.trim().is_empty() {
        return hits;
    }
    search_in_dir(Path::new(&root), &query, &mut hits, 0);
    hits
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            read_dir_tree,
            search_text,
            link_graph::get_backlinks,
            link_graph::get_link_graph,
            link_graph::list_md_files_meta,
            link_graph::git_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
