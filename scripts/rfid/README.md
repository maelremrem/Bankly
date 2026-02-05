# Bankly RFID + PIN Authentication (Solution 1 - Direct GPIO on Raspberry Pi)

## Overview

This documentation describes the implementation of RFID + PIN authentication in Bankly. This approach uses the Raspberry Pi's GPIO pins directly to connect an RFID reader (MFRC522), a capacitive touch sensor (MPR121 for PIN input via a touch keypad), and an I2C LCD screen for user interface. The existing Python script (`scripts/rfid/reader.py`) is extended to handle the full authentication flow, communicating with the Node.js backend via a REST API.

This solution is ideal for a standalone device (without web browser), allowing users to authenticate physically on the Raspberry Pi.

## Architecture

### Hardware Components
- **Raspberry Pi 3B+ or higher**: Core of the system, runs the Node.js backend and RFID script.
- **MFRC522 RFID Reader**: Connected to SPI GPIO pins to read RFID cards (UID).
- **MPR121 Capacitive Touch Sensor**: Connected via I2C, used as a capacitive keypad (12 electrodes: digits 0-9, *, #).
- **I2C LCD Screen (16x2)**: Displays user messages (instructions, authentication feedback).
- **Power Supply**: USB for RPi, with separate power if needed for peripherals.

### GPIO Connections
Based on `scripts/rfid/config.json`:
- **MFRC522 (SPI)**:
  - SDA: GPIO 8
  - SCK: GPIO 11
  - MOSI: GPIO 10
  - MISO: GPIO 9
  - RST: GPIO 25
- **MPR121 (I2C)**:
  - SDA: GPIO 2
  - SCL: GPIO 3
  - IRQ: GPIO 4
- **LCD I2C**:
  - Address: 0x27 (configurable)
  - I2C Port: 1

### Software Architecture
```
[Hardware: RFID + MPR121 + LCD] <--> [Python Script: reader.py]
                                      |
                                      v
[Node.js Backend: /auth/rfid-login & /auth/rfid-redirect] <--> [SQLite Database: users.rfid_card_id, pin_hash]
                                      |
                                      v
[Web Browser: Dashboard access with JWT cookie]
```

- **Python Script (`reader.py`)**: Handles RFID reading, PIN input, LCD display, and API calls.
- **Node.js Backend**: `/auth/rfid-login` endpoint validates card UID and PIN hash (bcrypt), returns a JWT.
- **Database**: `users` table with `rfid_card_id` (card UID) and `pin_hash` (hashed PIN).

## Step-by-Step Operation

1. **Initialization**:
   - Script starts on RPi, initializes devices (RFID, MPR121, LCD).
   - Displays "Bankly RFID Reader" and "Present card" on LCD.

2. **RFID Card Detection**:
   - User presents RFID card near MFRC522 reader.
   - Script reads card UID (e.g., `1234567890`).
   - Displays "Card detected" and UID on screen.

3. **PIN Input**:
   - Screen prompts "Enter PIN:".
   - User touches MPR121 electrodes to enter a 4-digit PIN.
   - Script masks digits with '*' and allows correction with '*'.
   - Validate with '#' once PIN is complete.

4. **Authentication**:
   - Script sends POST request to `http://localhost:3000/auth/rfid-login` with `{"card_uid": "1234567890", "pin": "1234"}`.
   - Backend:
     - Looks up user by `rfid_card_id`.
     - Compares PIN with `pin_hash` (bcrypt).
     - If valid, generates JWT and returns it.
   - Script displays "Access granted" or "Access denied" with error message.

5. **User Session**:
   - On success, JWT is stored in a cookie via browser redirect.
   - Script opens the web browser in kiosk mode to `http://localhost:3000/auth/rfid-redirect?token=<jwt>`, which sets the cookie and redirects to the appropriate dashboard (admin or user).
   - User can then interact with the web interface for their user stories.

6. **Error Handling**:
   - Network: Timeout or connection error → Displays "Network error".
   - Unknown card: "Access denied" + "Card not recognized".
   - Wrong PIN: "Access denied" + "Invalid PIN".
   - Script returns to initial state after 3 seconds.

## Integration with Bankly

- **Backend**: The `/auth/rfid-login` endpoint is already implemented in `routes/auth.js`. Ensure users have `rfid_card_id` and `pin_hash` in the DB (via admin or seeding).
- **Frontend**: Optional for kiosk mode; otherwise, redirect to dashboard after authentication.
- **Docker**: Script can run in a separate container or host mode to access GPIO.
- **Security**: PIN hashed with bcrypt (10 rounds). Local communication (localhost), but consider HTTPS in production.

## Deployment and Configuration

1. **Hardware Setup**:
   - Connect components to GPIO as per the diagram above.
   - Test with `python3 reader.py` (as root for GPIO access).

2. **Software Installation**:
   - Install dependencies: `pip install -r requirements.txt`.
   - Ensure Blinka is configured for CircuitPython on RPi.

3. **Configuration**:
   - Edit `config.json` for LCD address or API URL if needed.
   - Start backend: `npm start` in `backend/`.
   - Run script: `sudo python3 scripts/rfid/reader.py`.

4. **Testing**:
   - Use tested RFID cards.
   - Check backend logs for API calls.

## Advantages and Limitations

- **Advantages**: Simple, integrated, low cost (~$15), uses existing code.
- **Limitations**: Dependent on RPi (limited performance), no native Wi-Fi for remote access.
- **Future Enhancements**: Add a touchscreen to replace MPR121, or integrate with systemd for auto-start.