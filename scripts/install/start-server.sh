#!/bin/bash

# Bankly Server Startup Script

# Set working directory
cd /opt/bankly/backend

# Load environment variables
if [ -f /etc/bankly/.env ]; then
    export $(cat /etc/bankly/.env | xargs)
fi

# Start the server
exec npm start