#!/usr/bin/env bash
# ─── MarkFlow · 签名 + 公证 .dmg 一键构建 ──────────────────────────
# 复用 claudio (知音) 同一套 Apple Developer ID + minisign updater 密钥
#
# 步骤:
#   1. 加载 .env.signing 凭据
#   2. 校验钥匙串里有 Developer ID 证书
#   3. npx tauri build (自动 codesign + 公证 + staple .app + 打 .dmg)
#   4. 给 .dmg 信封单独 notarize + staple
#   5. 生成 latest.json manifest 准备发 GitHub release
#
# 用法:  bash scripts/build-signed-dmg.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ─── 1. 加载凭据 ──────────────────────────────────────────────
if [[ ! -f .env.signing ]]; then
  echo "✗ 缺少 .env.signing"
  echo "  cp .env.signing.example .env.signing  然后填上真实凭据"
  exit 1
fi
# shellcheck disable=SC1091
set -a; source .env.signing; set +a

# ─── 2. 校验环境 ──────────────────────────────────────────────
require() { [[ -n "${!1:-}" ]] || { echo "✗ 环境变量 $1 未设置 (.env.signing)"; exit 1; }; }
require APPLE_SIGNING_IDENTITY
require APPLE_ID
require APPLE_PASSWORD
require APPLE_TEAM_ID
require TAURI_SIGNING_PRIVATE_KEY

if ! security find-identity -v -p codesigning | grep -q "$APPLE_SIGNING_IDENTITY"; then
  echo "✗ 钥匙串找不到 identity: $APPLE_SIGNING_IDENTITY"
  echo "  import .p12:"
  echo "    security import \"$APPLE_P12_PATH\" -P \"\$APPLE_P12_PASSWORD\" -k ~/Library/Keychains/login.keychain-db -T /usr/bin/codesign"
  exit 1
fi
echo "✓ 找到证书: $APPLE_SIGNING_IDENTITY"

if [[ ! -f "$TAURI_SIGNING_PRIVATE_KEY" ]]; then
  echo "✗ updater 私钥不存在: $TAURI_SIGNING_PRIVATE_KEY"
  exit 1
fi
echo "✓ 找到 updater 私钥"

# ─── 3. tauri build ──────────────────────────────────────────
echo "→ tauri build (首次 5-15 分钟, 含 .app 公证)"
npx tauri build

# ─── 4. 给 dmg 信封单独 notarize + staple ────────────────────
DMG=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" -print -quit 2>/dev/null || true)
if [[ -z "$DMG" || ! -f "$DMG" ]]; then
  echo "✗ 找不到产出 .dmg"
  exit 1
fi
echo "✓ 产出: $DMG"

echo "→ 给 dmg 信封申请公证 (1-3 分钟)"
NOTARY_OUT=$(xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait 2>&1)
echo "$NOTARY_OUT" | tail -8
if ! echo "$NOTARY_OUT" | grep -q "status: Accepted"; then
  echo "✗ dmg 公证未通过. 查 log:"
  SUB_ID=$(echo "$NOTARY_OUT" | grep -oE 'id: [a-f0-9-]+' | head -1 | awk '{print $2}')
  [[ -n "$SUB_ID" ]] && xcrun notarytool log "$SUB_ID" \
    --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID"
  exit 1
fi

echo "→ Staple 票据到 dmg"
xcrun stapler staple "$DMG"

echo "→ 验证签名"
codesign --verify --deep --strict --verbose=2 "$DMG"
echo "→ 验证公证 (stapled)"
xcrun stapler validate "$DMG"
echo "→ Gatekeeper assess (模拟用户首次打开)"
spctl --assess --type open --context context:primary-signature -vv "$DMG" || {
  echo "⚠ Gatekeeper 未通过"
  exit 1
}

echo ""
echo "════════════════════════════════════════════════"
echo " ✅ 完成: $DMG"
echo "════════════════════════════════════════════════"

# ─── 5. updater 产物 → latest.json ────────────────────────────
TARGZ=$(find src-tauri/target/release/bundle/macos -name "*.app.tar.gz" -print -quit 2>/dev/null || true)
SIG_FILE=$(find src-tauri/target/release/bundle/macos -name "*.app.tar.gz.sig" -print -quit 2>/dev/null || true)
if [[ -n "$TARGZ" && -f "$TARGZ" && -n "$SIG_FILE" && -f "$SIG_FILE" ]]; then
  VERSION=$(grep -E '^version' src-tauri/Cargo.toml | head -1 | awk -F '"' '{print $2}')
  TAG="v${VERSION}"
  PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  ARCH=$(uname -m)
  if [[ "$ARCH" == "arm64" ]]; then PLATFORM="darwin-aarch64"; else PLATFORM="darwin-x86_64"; fi

  # 复制为 ASCII 文件名 (GitHub 上传时会 strip CJK)
  TARGZ_ASCII="src-tauri/target/release/bundle/macos/app.tar.gz"
  SIG_ASCII="src-tauri/target/release/bundle/macos/app.tar.gz.sig"
  cp "$TARGZ" "$TARGZ_ASCII"
  cp "$SIG_FILE" "$SIG_ASCII"
  TARGZ="$TARGZ_ASCII"
  SIG_FILE="$SIG_ASCII"

  RELEASE_URL="https://github.com/raypg-coder/MarkFlow/releases/download/${TAG}/app.tar.gz"
  SIGNATURE=$(cat "$SIG_FILE")
  NOTES=""

  LATEST_JSON="src-tauri/target/release/bundle/latest.json"
  cat > "$LATEST_JSON" <<JSON
{
  "version": "${VERSION}",
  "notes": "${NOTES}",
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "${PLATFORM}": {
      "signature": "${SIGNATURE}",
      "url": "${RELEASE_URL}"
    }
  }
}
JSON

  echo ""
  echo "────────────────────────────────────────────────"
  echo " 🔄 Updater artifacts (上传到 GitHub release ${TAG}):"
  echo "    1. $DMG          (用户手动下载用)"
  echo "    2. $TARGZ        (auto-update 用)"
  echo "    3. $SIG_FILE     (auto-update 验签用)"
  echo "    4. $LATEST_JSON  (manifest, 客户端从此处拉)"
  echo ""
  echo " 一键传:"
  echo "   gh release create $TAG \"$DMG\" \"$TARGZ\" \"$SIG_FILE\" \"$LATEST_JSON\" \\"
  echo "     --repo raypg-coder/MarkFlow --title \"MarkFlow $TAG\" --notes \"...\""
  echo "────────────────────────────────────────────────"
else
  echo ""
  echo "⚠ 没找到 .app.tar.gz / .sig"
  echo "  检查 tauri.conf.json#bundle.createUpdaterArtifacts + TAURI_SIGNING_PRIVATE_KEY"
fi
