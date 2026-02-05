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
    apt install -y curl wget git build-essential

    # Node.js
    log_info "Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs

    # Python
    log_info "Installing Python and GPIO libraries..."
    apt install -y python3 python3-pip python3-dev python3-rpi.gpio

    # System tools
    log_info "Installing Chromium and display tools..."
    apt install -y chromium-browser unclutter x11-xserver-utils

    # Enable SPI and I2C for RFID
    log_info "Enabling SPI and I2C..."
    raspi-config nonint do_spi 0
    raspi-config nonint do_i2c 0
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

    log_info "Installing Python dependencies..."
    pip3 install -r "$INSTALL_DIR/scripts/rfid/requirements.txt"
}

configure_environment() {
    log_info "Configuring environment..."

    # Create .env file
    cat > "$CONFIG_DIR/.env" << EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$(openssl rand -hex 32)
DATABASE_PATH=$DATA_DIR/database.sqlite
LOG_LEVEL=info
EOF

    # Create symbolic link
    ln -sf "$CONFIG_DIR/.env" "$INSTALL_DIR/backend/.env"
}

setup_database() {
    log_info "Setting up database..."

    cd "$INSTALL_DIR/backend"

    # Initialize database
    if [ ! -f "$DATA_DIR/database.sqlite" ]; then
        sqlite3 "$DATA_DIR/database.sqlite" < database/schema.sql
        log_info "Database initialized"
    else
        log_warn "Database already exists, skipping initialization"
    fi

    # Seed admin user
    npm run seed:admin
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
Environment=NODE_ENV=production
ExecStart=$INSTALL_DIR/scripts/install/start-server.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # Kiosk service
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

    # RFID service (optional)
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

    # Reload systemd
    systemctl daemon-reload

    # Enable services
    systemctl enable bankly-server
    systemctl enable bankly-kiosk
    systemctl enable bankly-rfid
}

configure_display() {
    log_info "Configuring display settings..."

    # Disable screen blanking
    cat >> /etc/lightdm/lightdm.conf << EOF

[SeatDefaults]
xserver-command=X -s 0 -dpms
EOF

    # Create X session script
    mkdir -p /home/pi/.config/lxsession/LXDE-pi/
    cat > /home/pi/.config/lxsession/LXDE-pi/autostart << EOF
@unclutter -idle 0
@xset s off
@xset -dpms
@xset s noblank
EOF
    chown pi:pi /home/pi/.config/lxsession/LXDE-pi/autostart
}

main() {
    log_info "Starting Bankly installation..."

    check_root
    install_system_deps
    setup_directories
    install_dependencies
    configure_environment
    setup_database
    setup_services
    configure_display

    log_info "Installation completed successfully!"
    log_info "Please reboot the system to start services:"
    log_info "sudo reboot"
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