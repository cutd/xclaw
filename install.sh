#!/usr/bin/env bash
set -euo pipefail

echo "🦞 xclaw installer"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is required but not installed."
  echo "   Install Node.js 22+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "❌ Node.js 22+ required, found $(node -v)"
  exit 1
fi

# Check pnpm
if ! command -v pnpm &>/dev/null; then
  echo "📦 Installing pnpm..."
  npm install -g pnpm
fi

INSTALL_DIR="${XCLAW_INSTALL_DIR:-$HOME/.xclaw/install}"

echo "📥 Cloning xclaw..."
if [ -d "$INSTALL_DIR" ]; then
  cd "$INSTALL_DIR" && git pull
else
  git clone https://github.com/cutd/xclaw.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🔨 Building..."
pnpm build

# Create symlink
LINK_DIR="/usr/local/bin"
if [ -w "$LINK_DIR" ]; then
  ln -sf "$INSTALL_DIR/packages/cli/dist/index.js" "$LINK_DIR/xclaw"
else
  echo "⚠️  Cannot write to $LINK_DIR. Run with sudo or add $INSTALL_DIR/packages/cli/dist/ to PATH."
fi

echo ""
echo "✅ xclaw installed! Run 'xclaw init' to get started."
