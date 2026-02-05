#!/bin/bash

# Bankly RFID Reader Startup Script

# Set working directory
cd /opt/bankly

# Start the RFID reader
exec python3 scripts/rfid/reader.py