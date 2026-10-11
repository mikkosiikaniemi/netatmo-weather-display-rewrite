#!/usr/bin/env bash
set -euo pipefail

BRIDGE_DIR=/opt/netatmo-matter-bridge
VENV_DIR="$BRIDGE_DIR/venv"
STORAGE_DIR=/var/lib/matter-server
CREDS_DIR="$STORAGE_DIR/credentials"
SERVICE_VERSION=8.1.2
PACKAGE="python-matter-server[server]==$SERVICE_VERSION"

info() { printf '\033[1;34m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo (sudo bash matter-bridge/setup.sh)" >&2
  exit 1
fi

info "Checking platform"
case "$(uname -m)" in
  aarch64|arm64) ;;
  *)
    echo "ERROR: only 64-bit ARM (Raspberry Pi OS 64-bit) is supported, found $(uname -m)" >&2
    exit 1
    ;;
esac

find_system_python() {
  for candidate in python3 python3.13 python3.12; do
    if command -v "$candidate" >/dev/null 2>&1 && \
       "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)' >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

info "Locating Python >= 3.12"
mkdir -p "$BRIDGE_DIR"
if PY_BIN="$(find_system_python)"; then
  info "Using system $PY_BIN"
  "$PY_BIN" -m venv "$VENV_DIR"
elif ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: no Python >= 3.12 and no curl to install uv. Install python3.12 (e.g. 'apt install python3.12' from bookworm-backports) and re-run." >&2
  exit 1
else
  UV_BIN="$(command -v uv 2>/dev/null || true)"
  if [ -z "$UV_BIN" ]; then
    info "Installing uv to fetch a standalone Python 3.12"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    UV_BIN="$(command -v uv)"
  fi
  info "Creating venv with Python 3.12 via $UV_BIN"
  "$UV_BIN" venv --python 3.12 "$VENV_DIR"
fi

VENV_BIN="$VENV_DIR/bin"

info "Installing $PACKAGE"
if [ -x "$VENV_BIN/pip" ]; then
  "$VENV_BIN/pip" install --quiet --upgrade pip
  "$VENV_BIN/pip" install --quiet "$PACKAGE"
elif command -v uv >/dev/null 2>&1; then
  info "Using uv pip (venv has no pip binary)"
  uv pip install --python "$VENV_BIN/python" "$PACKAGE"
else
  echo "ERROR: $VENV_BIN/pip is missing and uv is not available to install packages." >&2
  exit 1
fi

info "Installing bridge scripts"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
install -m 755 "$SCRIPT_DIR/collector.py" "$BRIDGE_DIR/collector.py"
install -m 755 "$SCRIPT_DIR/commission.py" "$BRIDGE_DIR/commission.py"
install -m 755 "$SCRIPT_DIR/node_info.py" "$BRIDGE_DIR/node_info.py"
install -m 755 "$SCRIPT_DIR/matter_common.py" "$BRIDGE_DIR/matter_common.py"

if [ ! -f "$BRIDGE_DIR/.env" ]; then
  install -m 600 "$SCRIPT_DIR/.env.example" "$BRIDGE_DIR/.env"
  info "Created $BRIDGE_DIR/.env - edit INGEST_URL and INGEST_TOKEN before enabling the collector"
fi

info "Creating Matter server storage"
mkdir -p /data
chmod 700 /data
mkdir -p "$STORAGE_DIR" "$CREDS_DIR"

info "Tuning IPv6 / multicast sysctls"
cat > /etc/sysctl.d/99-matter-server.conf <<'EOF'
net.ipv4.igmp_max_memberships=1024
net.ipv6.conf.all.accept_ra=1
net.ipv6.conf.all.accept_ra_rt_info_max_plen=64
net.ipv6.conf.default.accept_ra=1
net.ipv6.conf.default.accept_ra_rt_info_max_plen=64
net.ipv6.conf.all.forwarding=0
EOF
sysctl --system >/dev/null

info "Installing systemd units"
install -m 644 "$SCRIPT_DIR/matter-server.service" /etc/systemd/system/matter-server.service
install -m 644 "$SCRIPT_DIR/matter-bridge.service" /etc/systemd/system/matter-bridge.service
systemctl daemon-reload
systemctl enable --now matter-server.service
systemctl enable --now matter-bridge.service

info "Done."
echo
echo "Next steps:"
echo "  1. Edit $BRIDGE_DIR/.env (INGEST_URL, INGEST_TOKEN, DEVICE_NAME)."
echo "  2. In Apple Home, open the sensor > Settings > Turn on Pairing Mode, then run:"
echo "     sudo $BRIDGE_DIR/venv/bin/python $BRIDGE_DIR/commission.py --code <manual-pairing-code>"
echo "  3. Set NODE_ID from the commission output in $BRIDGE_DIR/.env and:"
echo "     sudo systemctl restart matter-bridge"
echo "  4. Watch logs: journalctl -u matter-bridge -f"
echo
echo "Check the server came up with: systemctl status matter-server"