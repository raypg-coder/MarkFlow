#!/usr/bin/env bash
# ─── MarkFlow · 一键发布 GitHub Release ────────────────────────────
# 自动切到正确的 gh 账号 (raypg-coder)，再把构建产物 + notes 发上去。
# 解决：本机 gh 默认 active account 是 QA-Ray，没权限推 raypg-coder/MarkFlow，
#       导致每次 release 首发失败要手动 `gh auth switch`。
#
# 前置：先跑 scripts/build-signed-dmg.sh 产出 dmg / app.tar.gz / sig / latest.json。
#
# 用法:
#   bash scripts/publish-release.sh                       # 版本号读 Cargo.toml，notes 用 /tmp/markflow-<ver>-notes.md
#   bash scripts/publish-release.sh "自定义标题"          # 覆盖标题
#   bash scripts/publish-release.sh "标题" path/notes.md  # 覆盖标题 + notes 文件

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

GH_USER="raypg-coder"
REPO="raypg-coder/MarkFlow"

# ─── 版本号 / 标签 ────────────────────────────────────────────
VERSION=$(grep -E '^version' src-tauri/Cargo.toml | head -1 | awk -F '"' '{print $2}')
[[ -n "$VERSION" ]] || { echo "✗ 无法从 Cargo.toml 读出版本号"; exit 1; }
TAG="v${VERSION}"

TITLE="${1:-MarkFlow ${TAG}}"
NOTES_FILE="${2:-/tmp/markflow-${VERSION}-notes.md}"

# ─── 校验产物 ────────────────────────────────────────────────
DMG="src-tauri/target/release/bundle/dmg/MarkFlow_${VERSION}_aarch64.dmg"
TARGZ="src-tauri/target/release/bundle/macos/app.tar.gz"
SIG="src-tauri/target/release/bundle/macos/app.tar.gz.sig"
JSON="src-tauri/target/release/bundle/latest.json"

for f in "$DMG" "$TARGZ" "$SIG" "$JSON"; do
  [[ -f "$f" ]] || { echo "✗ 缺少产物: $f"; echo "  先跑: bash scripts/build-signed-dmg.sh"; exit 1; }
done

NOTES_ARG=()
if [[ -f "$NOTES_FILE" ]]; then
  NOTES_ARG=(--notes-file "$NOTES_FILE")
  echo "✓ notes: $NOTES_FILE"
else
  NOTES_ARG=(--generate-notes)
  echo "⚠ 找不到 $NOTES_FILE，改用 --generate-notes"
fi

# ─── 切到有权限的账号 ────────────────────────────────────────
echo "→ 切换 gh 账号 → ${GH_USER}"
gh auth switch --user "$GH_USER" >/dev/null 2>&1 || {
  echo "✗ gh auth switch 失败，检查 ${GH_USER} 是否已登录: gh auth status"; exit 1;
}

# ─── 发布 ────────────────────────────────────────────────────
echo "→ 创建 release ${TAG} @ ${REPO}"
gh release create "$TAG" "$DMG" "$TARGZ" "$SIG" "$JSON" \
  --repo "$REPO" \
  --title "$TITLE" \
  "${NOTES_ARG[@]}"

echo ""
echo "✅ 已发布: https://github.com/${REPO}/releases/tag/${TAG}"
