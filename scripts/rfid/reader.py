#!/usr/bin/env python3
"""
Bankly RFID Reader Script for Raspberry Pi
Handles RFID card reading, PIN input via MPR121 touch sensor, and LCD display.
Communicates with Bankly API for authentication.
"""

import json
import time
import subprocess
import board
import busio
import digitalio
from mfrc522 import SimpleMFRC522
from adafruit_mpr121 import MPR121
from RPLCD.i2c import CharLCD
import requests

# Load configuration
with open('config.json', 'r') as f:
    config = json.load(f)

# Initialize I2C bus
i2c = busio.I2C(board.SCL, board.SDA)

# Initialize RFID reader
rfid = SimpleMFRC522()

# Initialize MPR121 touch sensor
mpr121 = MPR121(i2c)

# Initialize LCD
lcd = CharLCD(
    i2c_expander='PCF8574',
    address=int(config['lcd']['address'], 16),
    port=config['lcd']['port'],
    cols=config['lcd']['cols'],
    rows=config['lcd']['rows']
)

# API configuration
API_BASE = config['api']['base_url']
RFID_LOGIN_URL = API_BASE + config['api']['rfid_login_endpoint']

# Key mapping for MPR121 (assuming 12 electrodes: 0-9, *, #)
KEY_MAP = {
    0: '0', 1: '1', 2: '2', 3: '3', 4: '4',
    5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: '*', 11: '#'
}

def display_message(message, line=0, clear=True):
    """Display message on LCD"""
    if clear:
        lcd.clear()
    lcd.cursor_pos = (line, 0)
    lcd.write_string(message[:16])  # Limit to 16 chars

def read_pin():
    """Read PIN input from MPR121 touch sensor"""
    pin = ""
    display_message("Entrez PIN:")
    display_message("", 1)

    while True:
        for i in range(12):
            if mpr121[i].value:
                key = KEY_MAP.get(i, '')
                if key.isdigit() and len(pin) < 4:
                    pin += key
                    display_message(f"PIN: {'*' * len(pin)}", 1)
                    time.sleep(0.3)  # Debounce
                elif key == '*' and pin:
                    pin = pin[:-1]
                    display_message(f"PIN: {'*' * len(pin)}", 1)
                    time.sleep(0.3)
                elif key == '#' and len(pin) == 4:
                    return pin
                break
        time.sleep(0.1)

def authenticate_rfid(card_uid, pin):
    """Send authentication request to API"""
    try:
        response = requests.post(RFID_LOGIN_URL, json={
            "card_uid": str(card_uid),
            "pin": pin
        }, timeout=10)
        return response.json()
    except requests.RequestException as e:
        return {"success": False, "error": f"Network error: {str(e)}"}

def main():
    """Main loop"""
    display_message("Bankly RFID Reader")
    display_message("Presentez carte", 1)

    while True:
        try:
            # Wait for RFID card
            card_id, text = rfid.read()
            card_uid = card_id

            display_message("Carte detectee")
            display_message(f"UID: {card_uid}", 1)
            time.sleep(1)

            # Read PIN
            pin = read_pin()

            # Authenticate
            display_message("Authentification...")
            result = authenticate_rfid(card_uid, pin)

            if result.get('success'):
                display_message("Acces autorise")
                display_message("Bienvenue!", 1)
                # Open browser with token
                token = result['data']['token']
                try:
                    subprocess.run(['chromium-browser', '--kiosk', f'http://localhost:3000/auth/rfid-redirect?token={token}'], check=False)
                except FileNotFoundError:
                    # Fallback to xdg-open if chromium not available
                    subprocess.run(['xdg-open', f'http://localhost:3000/auth/rfid-redirect?token={token}'], check=False)
            else:
                display_message("Acces refuse")
                display_message(result.get('error', 'Erreur'), 1)

            time.sleep(3)
            display_message("Bankly RFID Reader")
            display_message("Presentez carte", 1)

        except KeyboardInterrupt:
            display_message("Arret du programme")
            break
        except Exception as e:
            display_message("Erreur:")
            display_message(str(e)[:16], 1)
            time.sleep(2)
            display_message("Bankly RFID Reader")
            display_message("Presentez carte", 1)

if __name__ == "__main__":
    main()