# Monly Installation Guide

## Overview

Monly is a pocket money bank simulator for Raspberry Pi that educates children about financial management. This guide covers installation for both development and production environments.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- Git

## Development Setup

### Using Docker (Recommended)

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd monly
   ```

2. Build and start the services:
   ```bash
   docker-compose build
   docker-compose up
   ```

3. The backend will be available at `http://localhost:3000`

4. For frontend development, serve the static files from `frontend/public/` using any web server.

### Local Development

1. Clone the repository and navigate to backend:
   ```bash
   git clone <repository-url>
   cd monly/backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and set:
   - `JWT_SECRET`: A secure random string
   - `DATABASE_FILE`: Path to SQLite database file (e.g., `./data/monly.db`)

5. Run database migrations (if any):
   ```bash
   npm run migrate
   ```

6. Start development server:
   ```bash
   npm run dev
   ```

7. Run tests:
   ```bash
   npm test
   ```

## Production Deployment on Raspberry Pi

### Docker Deployment

1. Ensure Docker is installed on Raspberry Pi:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

2. Clone the repository:
   ```bash
   git clone <repository-url>
   cd monly
   ```

3. Build and run:
   ```bash
   docker-compose up -d --build
   ```

4. The application will be available at `http://raspberry-pi-ip:3000`

### Manual Deployment

1. Install Node.js on Raspberry Pi:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. Install PM2 for process management:
   ```bash
   sudo npm install -g pm2
   ```

3. Follow local development steps 1-5 above

4. Start with PM2:
   ```bash
   pm2 start ecosystem.config.js
   pm2 startup
   pm2 save
   ```

## Database Initialization

The database is automatically initialized on first run. The schema is in `backend/database/schema.sql`.

For production, ensure the data directory has proper permissions:
```bash
sudo chown -R 1000:1000 ./backend/data
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `JWT_SECRET` | JWT signing secret | (required) |
| `DATABASE_FILE` | SQLite database path | ./data/monly.db |

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the port in docker-compose.yml or .env
2. **Database permission errors**: Ensure data directory is writable
3. **Docker build fails**: Clear Docker cache with `docker system prune`

### Logs

View logs with:
```bash
docker-compose logs -f backend
```

Or for PM2:
```bash
pm2 logs
```

## Security Notes

- Change default JWT_SECRET in production
- Use HTTPS in production (add reverse proxy like nginx)
- Regularly backup the SQLite database
- Keep dependencies updated

## Next Steps

After installation:
1. Create an admin user via API or database
2. Configure allowances and tasks
3. Set up RFID hardware (v3.0+)
4. Deploy frontend static files