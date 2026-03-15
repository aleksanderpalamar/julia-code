#!/usr/bin/env bash
set -euo pipefail

# Julia Code (juju) — Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/aleksanderpalamar/julia-code/main/install.sh | bash

REPO="https://github.com/aleksanderpalamar/julia-code.git"
INSTALL_DIR="$HOME/.juliacode"
BIN_NAME="juju"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC} $1"; }
ok()    { echo -e "${GREEN}[ok]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
fail()  { echo -e "${RED}[error]${NC} $1"; exit 1; }

echo -e "${BOLD}"
echo "     ╦╦ ╦╦  ╦╔═╗"
echo "     ║║ ║║  ║╠═╣"
echo "    ╚╝╚═╝╩═╝╩╩ ╩"
echo -e "    Julia Code Installer${NC}"
echo ""

# ── Check dependencies ──────────────────────────────────────────────

info "Checking dependencies..."

# Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install it first: https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js >= 18 is required (found v$(node -v))"
fi
ok "Node.js $(node -v)"

# npm
if ! command -v npm &>/dev/null; then
  fail "npm is not installed."
fi
ok "npm $(npm -v)"

# Ollama
if ! command -v ollama &>/dev/null; then
  warn "Ollama is not installed. Julia needs Ollama to run LLM models."
  warn "Install it from: https://ollama.com"
  echo ""
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  ok "Ollama $(ollama -v 2>/dev/null | head -1 || echo 'installed')"

  # Check if at least one model is available
  MODEL_COUNT=$(ollama list 2>/dev/null | tail -n +2 | wc -l || echo "0")
  if [ "$MODEL_COUNT" -eq 0 ]; then
    warn "No Ollama models found. You'll need at least one model."
    warn "Example: ollama pull qwen3:8b"
  else
    ok "$MODEL_COUNT Ollama model(s) available"
  fi
fi

# ── Install ─────────────────────────────────────────────────────────

echo ""
info "Installing Julia Code to $INSTALL_DIR ..."

# Clone or update
if [ -d "$INSTALL_DIR/app" ]; then
  info "Updating existing installation..."
  cd "$INSTALL_DIR/app"
  git pull --quiet
else
  mkdir -p "$INSTALL_DIR"
  git clone --quiet --depth 1 "$REPO" "$INSTALL_DIR/app"
  cd "$INSTALL_DIR/app"
fi

ok "Source code ready"

# Install dependencies
info "Installing dependencies..."
npm install --production --silent 2>/dev/null || npm install --omit=dev --silent
ok "Dependencies installed"

# Install tsx globally if not present
if ! command -v tsx &>/dev/null; then
  info "Installing tsx (TypeScript executor)..."
  npm install -g tsx --silent
  ok "tsx installed"
else
  ok "tsx already available"
fi

# ── Create settings.json ────────────────────────────────────────────

SETTINGS_FILE="$INSTALL_DIR/settings.json"

if [ ! -f "$SETTINGS_FILE" ]; then
  info "Creating default settings..."

  # Detect first available Ollama model
  DEFAULT_MODEL="qwen3:8b"
  if command -v ollama &>/dev/null; then
    FIRST_MODEL=$(ollama list 2>/dev/null | tail -n +2 | head -1 | awk '{print $1}')
    if [ -n "$FIRST_MODEL" ]; then
      DEFAULT_MODEL="$FIRST_MODEL"
    fi
  fi

  cat > "$SETTINGS_FILE" << EOF
{
  "meta": {
    "version": "0.1.0"
  },
  "models": {
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "default": "$DEFAULT_MODEL",
    "available": []
  },
  "agent": {
    "maxToolIterations": 10
  },
  "session": {
    "compactionThreshold": 6000,
    "compactionKeepRecent": 6
  },
  "storage": {
    "dbPath": "$INSTALL_DIR/data/julia.db"
  },
  "workspace": "$INSTALL_DIR/workspace"
}
EOF
  ok "Settings created at $SETTINGS_FILE"
else
  ok "Settings already exist, keeping current configuration"
fi

# Create workspace directory
mkdir -p "$INSTALL_DIR/workspace"
mkdir -p "$INSTALL_DIR/data"

# ── Create launcher script ──────────────────────────────────────────

info "Creating launcher..."

# Find a writable bin directory in PATH
BIN_DIR=""
for dir in "$HOME/.local/bin" "$HOME/bin" "/usr/local/bin"; do
  if [ -d "$dir" ] && echo "$PATH" | grep -q "$dir"; then
    BIN_DIR="$dir"
    break
  fi
done

if [ -z "$BIN_DIR" ]; then
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
  warn "$BIN_DIR is not in your PATH. Add it:"
  warn "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
fi

cat > "$BIN_DIR/$BIN_NAME" << 'LAUNCHER'
#!/usr/bin/env bash
exec tsx "$HOME/.juliacode/app/juju.ts" "$@"
LAUNCHER

chmod +x "$BIN_DIR/$BIN_NAME"
ok "Launcher created at $BIN_DIR/$BIN_NAME"

# ── Done ────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}Julia Code installed successfully!${NC}"
echo ""
echo -e "  ${BOLD}Run:${NC}        ${CYAN}juju${NC}"
echo -e "  ${BOLD}Settings:${NC}   ${CYAN}$SETTINGS_FILE${NC}"
echo -e "  ${BOLD}Data:${NC}       ${CYAN}$INSTALL_DIR/data/julia.db${NC}"
echo ""
echo -e "  ${BOLD}Edit settings:${NC}  nano $SETTINGS_FILE"
echo -e "  ${BOLD}Update:${NC}         curl -fsSL <install-url> | bash"
echo -e "  ${BOLD}Uninstall:${NC}      rm -rf $INSTALL_DIR && rm $BIN_DIR/$BIN_NAME"
echo ""

if ! echo "$PATH" | grep -q "$BIN_DIR"; then
  echo -e "${YELLOW}Note: restart your terminal or run:${NC}"
  echo -e "  export PATH=\"$BIN_DIR:\$PATH\""
  echo ""
fi
