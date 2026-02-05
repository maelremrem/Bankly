# Bankly Installation Guide for Raspberry Pi

This guide provides step-by-step instructions for installing and setting up Bankly on a Raspberry Pi for production use.

## Prerequisites

- Raspberry Pi 3B+ or higher with Raspberry Pi OS (64-bit recommended)
- MicroSD card with at least 16GB
- Internet connection
- RFID hardware (MFRC522 reader, MPR121 touch sensor, I2C LCD) - optional but recommended for full functionality

## Quick Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/bankly.git
   cd bankly
   ```

2. Run the installation script:
   ```bash
   sudo ./scripts/install/install.sh
   ```

3. Reboot the system:
   ```bash
   sudo reboot
   ```

## Installation Scripts Overview

The installation process creates several scripts and systemd services for automated management:

### Scripts Created

1. **`install.sh`** - Main installation script that:
   - Updates the Raspberry Pi system
   - Installs Node.js 18, Python 3 and GPIO dependencies
   - Configures SPI/I2C for RFID hardware
   - Installs Chromium for kiosk mode
   - Sets up directories and permissions
   - Installs npm and Python dependencies
   - Configures environment variables (.env)
   - Initializes SQLite database and seeds admin user
   - Creates and enables systemd services
   - Configures display settings to disable screen blanking

2. **`start-server.sh`** - Launches the Node.js backend server

3. **`start-kiosk.sh`** - Launches Chromium in kiosk mode pointing to `http://localhost:3000`

4. **`start-rfid.sh`** - Launches the Python RFID reader script

### Systemd Services Created

- `bankly-server.service` - Automatically starts the backend
- `bankly-kiosk.service` - Automatically starts the browser in kiosk mode
- `bankly-rfid.service` - Automatically starts the RFID reader

### Usage

```bash
# Full installation
sudo ./scripts/install/install.sh

# Then reboot
sudo reboot
```

Services will start automatically on boot. To manage them:
```bash
sudo systemctl status bankly-server
sudo systemctl restart bankly-kiosk
# etc.
```

The script uses existing dependencies in `requirements.txt` for RFID and configures everything for production use on Raspberry Pi.

## Manual Installation Steps

If you prefer to install manually or troubleshoot issues:

### 1. System Update
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Install Python and Dependencies
```bash
sudo apt install python3 python3-pip python3-dev -y
sudo pip3 install -r scripts/rfid/requirements.txt
```

### 4. Install System Dependencies
```bash
sudo apt install chromium-browser unclutter x11-xserver-utils -y
```

### 5. Configure GPIO (if using RFID)
Enable SPI and I2C:
```bash
sudo raspi-config nonint do_spi 0
sudo raspi-config nonint do_i2c 0
```

### 6. Install Project Dependencies
```bash
cd backend
npm install
```

### 7. Seed Admin User
```bash
npm run seed:admin
```

## Starting Services

### Start Backend Server
```bash
sudo ./scripts/install/start-server.sh
```

### Start Kiosk Mode (Frontend)
```bash
sudo ./scripts/install/start-kiosk.sh
```

### Start RFID Reader (if hardware connected)
```bash
sudo ./scripts/install/start-rfid.sh
```

## Systemd Services

The installation script creates systemd services for automatic startup:

- `bankly-server.service`: Starts the Node.js backend
- `bankly-kiosk.service`: Starts Chromium in kiosk mode
- `bankly-rfid.service`: Starts the RFID reader script

To manage services:
```bash
sudo systemctl status bankly-server
sudo systemctl restart bankly-server
sudo systemctl stop bankly-server
```

## Configuration

### Environment Variables
Create `/etc/bankly/.env` with:
```
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secret-key
DATABASE_PATH=/var/lib/bankly/database.sqlite
```

### RFID Configuration
Edit `scripts/rfid/config.json` for GPIO pin mappings if needed.

## Troubleshooting

### Common Issues

1. **GPIO not working**: Ensure SPI/I2C are enabled in raspi-config
2. **Display issues**: Check HDMI connection and resolution settings
3. **Services not starting**: Check logs with `journalctl -u bankly-server`
4. **Database errors**: Ensure write permissions on database directory

### Logs
- Backend logs: `journalctl -u bankly-server`
- RFID logs: `journalctl -u bankly-rfid`
- System logs: `journalctl -u bankly-kiosk`

## Security Notes

- Change default admin password after first login
- Use strong JWT secrets
- Keep system updated
- Consider firewall configuration for production use

## Updating

To update Bankly:
```bash
cd bankly
git pull
sudo ./scripts/install/install.sh --update
sudo systemctl restart bankly-server bankly-kiosk bankly-rfid
```