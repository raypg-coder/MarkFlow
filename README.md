# MarkFlow

赛博朋克风的本地优先 Markdown 编辑器，内置知识图谱与本地 LLM 集成。

基于 Tauri 2 + React + TypeScript，跨平台原生桌面应用（macOS / Windows / Linux）。

## 特性概览

- **Markdown 编辑器** — WYSIWYG（Milkdown / Crepe）+ CodeMirror 兜底处理非 md 文件
- **本地优先** — 你的文件就在你硬盘上，不需要任何云账号
- **知识图谱** — 自动解析 `[[wikilink]]` 与标准 markdown 链接，可视化文档之间的关系（`react-force-graph-2d`）
- **反链面板** — 每个笔记都知道是谁引用了自己
- **语义检索** — 无需 sqlite，纯内存向量索引；调你本地 LLM 拿 embedding，cosine top-K 全在前端跑
- **AI 助手** — 流式对话面板，对接任何 OpenAI 兼容端点（vLLM / Ollama / sglang / LM Studio…）；选区右键菜单（解释 / 总结 / 改写 / 翻译）；一键插入光标位置
- **任务面板（Mission Control）** — 八角形 hacker checkbox、优先级、毁灭倒计时、"ALL OBJECTIVES CLEARED" glitch 闪现
- **环境音** — 内建程序化合成的环境声（雨夜 / 机房 / 赛博风 / 磁带底噪），零音频文件依赖
- **专注模式** — 自动 fade chrome（打字时侧栏隐去）+ 手动 Matrix Zen（⌘⇧Z，CRT 绿字效果）
- **Wikilink Cmd+Click 跳转** — 在编辑器里直接点击 `[[X]]` 切换文档
- **Git 状态指示** — 文件树里新文件 `[+]` 青色、已修改 `[M]` 品红闪烁，保存时一道青光从左到右扫过文件行
- **自动更新** — Tauri updater + minisign 签名 + GitHub Releases manifest

## 架构

```
前端    React + TypeScript + Tailwind / Milkdown (Crepe) / CodeMirror / Zustand
桥层    Tauri 2 (Rust) — 文件 IO、链接索引、关键字搜索、Git 状态、mtime
LLM     OpenAI 兼容 HTTP — 完全可插拔，在 Settings 里配
存储    localStorage（偏好 / 任务清单）+ appLocalData（向量索引文件）
```

## 开发

需要 Rust + Node 20+。

```bash
npm install
npm run tauri dev
```

## 打 macOS 签名 DMG

你需要：

1. 钥匙串里有一张 **Apple Developer ID Application** 证书
2. 一把 Tauri updater minisign 私钥 — 没有的话生成一把：
   ```bash
   npx tauri signer generate -w ~/.tauri/markflow-updater.key
   ```
   把对应的 `.pub` 公钥内容贴到 `src-tauri/tauri.conf.json#plugins.updater.pubkey`
3. 把 `.env.signing.example` 复制成 `.env.signing`，填上你的真实凭据

然后：

```bash
bash scripts/build-signed-dmg.sh
```

脚本会完成 codesign → 公证 → staple，产物：

- `MarkFlow_<version>_aarch64.dmg` — 用户下载安装的安装包
- `app.tar.gz` + `app.tar.gz.sig` — 自动更新增量包 + 签名
- `latest.json` — updater manifest

## LLM 端点配置

应用通过 OpenAI 兼容 HTTP 协议跟本地 LLM 对话。已验证可用：

- **vLLM**（启动时加 `--allowed-origins='*'` 放开 CORS）
- **Ollama**（localhost 默认放开 CORS）
- **sglang**
- **LM Studio**

进入 `Settings` → `[ llm endpoint ]`，填 base URL（如 `http://localhost:8000/v1`），点击「测试连接 / 加载模型」，然后给各角色绑模型（对话 / 推理 / 嵌入 / 生图）。

## 许可

MIT
