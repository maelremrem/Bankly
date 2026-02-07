#!/bin/bash

# Bankly Installation Script for Raspberry Pi
# This script installs and configures Bankly for production use

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
INSTALL_DIR="/opt/bankly"
DATA_DIR="/var/lib/bankly"
CONFIG_DIR="/etc/bankly"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (sudo)"
        exit 1
    fi
}

install_system_deps() {
    log_info "Updating system packages..."
    apt update && apt upgrade -y

    log_info "Installing system dependencies..."
    apt install -y curl wget git build-essential ca-certificates

    # Node.js (LTS 18)
    log_info "Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs

    # Python
    log_info "Installing Python and GPIO libraries..."
    apt install -y python3 python3-pip python3-dev

    # Optionally install GUI and Chromium (kiosk)
    if [[ "$INSTALL_GUI" == "yes" ]]; then
        log_info "Installing Chromium and display tools (GUI mode)..."
        apt install -y --no-install-recommends chromium-browser unclutter x11-xserver-utils lightdm
        # Ensure display manager exists (lightdm) for kiosk autostart
    else
        log_info "Skipping GUI/browser installation (GUI mode disabled)"
    fi

    # Optionally enable SPI and I2C for RFID (ask only if scripts/rfid exists)
    if [[ -d "$PROJECT_DIR/scripts/rfid" ]]; then
        log_info "Enabling SPI and I2C (required for RFID hardware)..."
        if command -v raspi-config >/dev/null 2>&1; then
            raspi-config nonint do_spi 0 || log_warn "raspi-config failed to enable SPI"
            raspi-config nonint do_i2c 0 || log_warn "raspi-config failed to enable I2C"
        else
            log_warn "raspi-config not found; please enable SPI/I2C via raspi-config manually if needed"
        fi
    fi
} 

setup_directories() {
    log_info "Setting up directories..."

    # Create directories
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$DATA_DIR"
    mkdir -p "$CONFIG_DIR"

    # Copy project files
    cp -r "$PROJECT_DIR"/* "$INSTALL_DIR/"

    # Set permissions
    chown -R pi:pi "$INSTALL_DIR"
    chown -R pi:pi "$DATA_DIR"
    chmod -R 755 "$INSTALL_DIR"
    chmod -R 755 "$DATA_DIR"
}

install_dependencies() {
    log_info "Installing Node.js dependencies..."
    cd "$INSTALL_DIR/backend"
    npm install --production

    # Make sure startup scripts are executable
    chmod +x "$INSTALL_DIR/scripts/install"/*.sh || true
    chmod +x "$INSTALL_DIR/scripts/install/start-"*.sh || true

    # Python deps (only if requirements exists)
    if [[ -f "$INSTALL_DIR/scripts/rfid/requirements.txt" ]]; then
        log_info "Installing Python dependencies..."
        pip3 install -r "$INSTALL_DIR/scripts/rfid/requirements.txt"
    fi

    # Ensure RFID reader script is executable
    if [[ -f "$INSTALL_DIR/scripts/rfid/reader.py" ]]; then
        chmod +x "$INSTALL_DIR/scripts/rfid/reader.py" || true
    fi
}

configure_environment() {
    log_info "Configuring environment..."

    # Create .env file with generated secrets and optional admin credentials
    ADMIN_USER=${ADMIN_USER:-admin}
    ADMIN_PASSWORD=${ADMIN_PASSWORD:-$(openssl rand -base64 12 | tr -d '\n' | cut -c1-16)}

    cat > "$CONFIG_DIR/.env" << EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$(openssl rand -hex 32)
DATABASE_PATH=$DATA_DIR/database.sqlite
LOG_LEVEL=info
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF

    # Create symbolic link (idempotent)
    ln -sf "$CONFIG_DIR/.env" "$INSTALL_DIR/backend/.env"

    # Export for current shell so seed script picks it up
    export ADMIN_USERNAME=$ADMIN_USER
    export ADMIN_PASSWORD=$ADMIN_PASSWORD
} 

setup_database() {
    log_info "Setting up database..."

    cd "$INSTALL_DIR/backend"

    # Initialize database if missing
    if [ ! -f "$DATA_DIR/database.sqlite" ]; then
        mkdir -p "$(dirname "$DATA_DIR/database.sqlite")"
        sqlite3 "$DATA_DIR/database.sqlite" < database/schema.sql
        log_info "Database initialized"
    else
        log_warn "Database already exists, skipping initialization"
    fi

    # Seed admin user using environment vars set in /etc/bankly/.env (exported earlier)
    log_info "Seeding admin user (if not present)..."
    if npm run seed:admin; then
        log_info "Seed completed. Admin username: $ADMIN_USER"
        log_info "Admin password: $ADMIN_PASSWORD"
    else
        log_warn "Seed script returned non-zero exit code. Check logs."
    fi

    # Show instructions to change admin password later
    echo ""
    echo -e "${YELLOW}IMPORTANT:${NC} The admin credentials above are temporary. Please change them after first login via the admin UI."
} 

setup_services() {
    log_info "Setting up systemd services..."

    # Server service
    cat > /etc/systemd/system/bankly-server.service << EOF
[Unit]
Description=Bankly Backend Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=/etc/bankly/.env
ExecStart=/bin/bash -lc 'cd $INSTALL_DIR/backend && npm start'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # Kiosk service (only enable if GUI requested)
    if [[ "$INSTALL_GUI" == "yes" ]]; then
        cat > /etc/systemd/system/bankly-kiosk.service << EOF
[Unit]
Description=Bankly Kiosk Mode
After=network.target display-manager.service
Requires=bankly-server.service

[Service]
Type=simple
User=pi
Environment=DISPLAY=:0
ExecStart=$INSTALL_DIR/scripts/install/start-kiosk.sh
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
EOF
        systemctl enable bankly-kiosk || log_warn "Failed to enable kiosk service"
    else
        log_info "Kiosk service will not be enabled (GUI mode disabled)"
    fi

    # RFID service (enable only if scripts/rfid exists)
    if [[ -d "$INSTALL_DIR/scripts/rfid" ]]; then
        cat > /etc/systemd/system/bankly-rfid.service << EOF
[Unit]
Description=Bankly RFID Reader
After=network.target
Requires=bankly-server.service

[Service]
Type=simple
User=pi
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/scripts/install/start-rfid.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
        systemctl enable bankly-rfid || log_warn "Failed to enable RFID service"
    fi

    # Reload systemd and enable server
    systemctl daemon-reload
    systemctl enable bankly-server || log_warn "Failed to enable bankly-server"
} 

configure_display() {
    if [[ "$INSTALL_GUI" != "yes" ]]; then
        log_info "Skipping display configuration (GUI not installed)"
        return
    fi

    log_info "Configuring display settings for kiosk..."

    # Disable screen blanking (lightdm)
    if [[ -f /etc/lightdm/lightdm.conf ]]; then
        grep -q "xserver-command" /etc/lightdm/lightdm.conf || cat >> /etc/lightdm/lightdm.conf << EOF

[SeatDefaults]
xserver-command=X -s 0 -dpms
EOF
    fi

    # Create X session script for user 'pi'
    mkdir -p /home/pi/.config/lxsession/LXDE-pi/
    cat > /home/pi/.config/lxsession/LXDE-pi/autostart << EOF
@unclutter -idle 0
@xset s off
@xset -dpms
@xset s noblank
EOF
    chown -R pi:pi /home/pi/.config/lxsession/LXDE-pi || true
}

main() {
    log_info "Starting Bankly installation..."

    # Parse CLI args (non-interactive options)
    while [[ "$#" -gt 0 ]]; do
        case "$1" in
            --with-gui) INSTALL_GUI="yes"; shift ;;
            --no-gui) INSTALL_GUI="no"; shift ;;
            --admin-user) ADMIN_USER="$2"; shift 2 ;;
            --admin-pass) ADMIN_PASSWORD="$2"; shift 2 ;;
            --help) echo "Usage: install.sh [--with-gui|--no-gui] [--admin-user <user>] [--admin-pass <pass>]"; exit 0 ;;
            *) shift ;;
        esac
    done

    # If not specified, prompt interactively about GUI
    if [[ -z "$INSTALL_GUI" ]]; then
        read -p "Install Graphical Kiosk (Chromium) and display manager? (y/N): " ans
        case "$ans" in
            [Yy]* ) INSTALL_GUI="yes" ;;
            * ) INSTALL_GUI="no" ;;
        esac
    fi

    check_root
    install_system_deps
    setup_directories
    install_dependencies
    configure_environment
    setup_database
    setup_services
    configure_display

    # Start services now (so admin can access immediately)
    log_info "Starting Bankly services..."
    systemctl start bankly-server || log_warn "Failed to start bankly-server; check journalctl -u bankly-server"
    if [[ "$INSTALL_GUI" == "yes" ]]; then
        systemctl start bankly-kiosk || log_warn "Failed to start bankly-kiosk; check journalctl -u bankly-kiosk"
    fi
    if [[ -d "$INSTALL_DIR/scripts/rfid" ]]; then
        systemctl start bankly-rfid || log_warn "Failed to start bankly-rfid; check journalctl -u bankly-rfid"
    fi

    log_info "Installation completed successfully!"

    # Detect primary IP address
    HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [[ -z "$HOST_IP" ]]; then
        HOST_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '/src/ {print $7; exit}')
    fi
    if [[ -z "$HOST_IP" ]]; then
        HOST_IP="<your-device-ip>"
    fi

    # Read PORT from env if present
    PORT=$(grep '^PORT=' "$CONFIG_DIR/.env" 2>/dev/null | cut -d'=' -f2)
    PORT=${PORT:-3000}

    echo ""
    echo -e "${GREEN}Quick start and admin access:${NC}"
    echo "  - Open a browser on any device in your network and visit: http://$HOST_IP:$PORT"
    echo "  - Login with the temporary admin account created by the installer:"
    echo "      username: ${ADMIN_USER:-admin}"
    echo "      password: ${ADMIN_PASSWORD:-<password>}"
    echo ""
    echo -e "${YELLOW}Note:${NC} For security, log in and change the admin password immediately, then create a real admin user for daily use."

    echo ""
    echo -e "${GREEN}If you installed GUI+kiosk, the kiosk will attempt to open the app automatically on the Raspberry Pi display.${NC}"
    echo ""
    echo -e "${GREEN}Reboot is recommended to ensure all services start cleanly:${NC}"
    echo "  sudo reboot"
}


# Handle update flag
if [[ "$1" == "--update" ]]; then
    log_info "Updating Bankly..."
    cd "$PROJECT_DIR"
    git pull
    cp -r "$PROJECT_DIR"/* "$INSTALL_DIR/"
    cd "$INSTALL_DIR/backend"
    npm install --production
    systemctl restart bankly-server bankly-kiosk bankly-rfid
    log_info "Update completed!"
    exit 0
fi

main "$@"