# MarkFlow

A cyberpunk-flavored, local-first Markdown editor with built-in knowledge graph and local LLM integration.

Built on Tauri 2 + React + TypeScript. Runs as a native desktop app on macOS / Windows / Linux.

## Highlights

- **Markdown editor** — WYSIWYG (Milkdown / Crepe) + code mirror fallback for non-md files
- **Local-first** — your files stay on disk; no cloud account required
- **Knowledge graph** — wikilinks `[[X]]` + standard md links resolved into a navigable graph (powered by `react-force-graph-2d`)
- **Backlinks** — every note knows who references it
- **Semantic search** — sqlite-free vector index; embeddings via your local LLM endpoint, top-K via cosine in JS
- **AI assistant** — chat panel that streams from any OpenAI-compatible endpoint (vLLM, Ollama, sglang…); insert into cursor; selection-action menu (explain / summarize / rewrite / translate)
- **Mission Control** — task list with octagonal hacker checkbox, priority levels, countdown timer, and an "ALL OBJECTIVES CLEARED" glitch flash
- **Cyber acoustic** — built-in procedurally-synthesized ambient soundscapes (rain / server room / cyber wind / tape hiss), no audio files bundled
- **Focus modes** — auto-fade chrome when typing; manual Matrix Zen mode (⌘⇧Z) with CRT-tinted text
- **Cmd+click wikilink navigation** in editor
- **Git status indicators** — `[+]` cyan for new, `[M]` flashing magenta for modified, with a save-beam animation when you press ⌘S
- **Auto-update** — Tauri updater, signed with minisign, manifest from GitHub releases

## Architecture

```
Frontend  React + TypeScript + Tailwind, Milkdown (Crepe), CodeMirror, Zustand
Bridge    Tauri 2 (Rust) — file IO, link graph, search, git status, mtime
LLM       OpenAI-compatible HTTP — pluggable, configured in Settings
Storage   localStorage for prefs / mission list; appLocalData for vector index
```

## Develop

Requires Rust + Node 20+.

```bash
npm install
npm run tauri dev
```

## Build a signed DMG (macOS)

You'll need:

1. An Apple Developer ID Application certificate in your Keychain
2. A Tauri updater signing key — generate one:
   ```bash
   npx tauri signer generate -w ~/.tauri/markflow-updater.key
   ```
   Then paste the public key into `src-tauri/tauri.conf.json#plugins.updater.pubkey`
3. Copy `.env.signing.example` → `.env.signing` and fill in your credentials

Then:

```bash
bash scripts/build-signed-dmg.sh
```

This will codesign, notarize, staple, and produce:

- `MarkFlow_<version>_aarch64.dmg` — what end users download
- `app.tar.gz` + `app.tar.gz.sig` — auto-update payload
- `latest.json` — updater manifest

## LLM endpoint

The app talks to an OpenAI-compatible endpoint. Tested with:

- vLLM (`--allowed-origins='*'` for CORS)
- Ollama (works on `localhost` by default)
- sglang
- LM Studio

Open `Settings` → `[ llm endpoint ]`, type your base URL (e.g. `http://localhost:8000/v1`), click **测试连接 / 加载模型**, then bind models to roles (chat / reasoning / embedding / image).

## License

MIT
