# Bankly Installation Guide

## Overview

Bankly is a pocket money bank simulator for Raspberry Pi that educates children about financial management. This guide covers installation for both development and production environments.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- Git

## Development Setup

### Using Docker (Recommended)

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd bankly
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
   cd bankly/backend
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
   - `DATABASE_FILE`: Path to SQLite database file (e.g., `./data/bankly.db`)

5. Run database migrations (if any):
   ```bash
   npm run migrate
   ```

6. Start development server:
   ```bash
   npm run dev
   ```

   **Note:** The `dev` script is configured to use a separate local database file to avoid contaminating your main data. By default `npm run dev` sets `DATABASE_FILE=./data/bankly-test.db` (see `backend/package.json`). To use a different DB, set the `DATABASE_FILE` environment variable before running:

   - PowerShell (Windows):
     ```powershell
     $env:DATABASE_FILE = './data/bankly.db'
     npm run dev
     ```

   - POSIX (macOS / Linux):
     ```bash
     DATABASE_FILE=./data/bankly.db npm run dev
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
   cd bankly
   ```

3. Build and run:
   ```bash
   docker-compose up -d --build
   ```

4. The application will be available at `http://raspberry-pi-ip:3000`

### Manual Deployment

#### One-line installer (recommended for Raspberry Pi)
Run the installer script directly from your Raspberry Pi (replace the URL with the raw URL for this repo):

```bash
# Example: replace <raw-url> with actual raw GitHub URL to this script
# curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/install/install.sh | sudo bash -s -- --with-gui
```

Options:
- `--with-gui` : install graphical kiosk (Chromium) and configure autostart
- `--no-gui` : skip GUI and kiosk setup
- `--admin-user <username>` and `--admin-pass <password>` : set admin credentials non-interactively

Note: If your repository is public, no deploy key is required—the on-device update script will pull `origin/main` directly. If you need more controlled releases, consider CI/CD with GitHub Actions to push tagged releases and trigger a deploy workflow.
#### Manual Node.js + PM2 (alternative)
If you prefer manual setup:

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

Bankly uses environment variables to configure both server and client behavior. Copy the provided `.env.example` to `.env` and edit values as needed. Values are read from the project root `.env` by the backend on startup.

| Variable | Type | Default | Description |
|---|---:|---|---|
| `PORT` | number | `3000` | HTTP port the backend listens on. |
| `NODE_ENV` | string | `development` | Node environment (`development`, `production`, `test`). Some services (scheduler, extra validation) are disabled in `test` mode. |
| `JWT_SECRET` | string | **required** | Secret used to sign JWT tokens. Use a long, unpredictable value in production. |
| `DATABASE_FILE` | path | `./data/bankly.db` | File path to the SQLite database used by the backend. |
| `DEFAULT_LANGUAGE` | string | `en` | Default UI language (`en` or `fr`). |
| `DEFAULT_CURRENCY` | string | `€` | Currency symbol or name used in UI. Can be a short symbol (`$`,`€`) or a word (`token`). |
| `DEFAULT_CURRENCY_PATTERN` | string | (none) | Optional formatting pattern for currency. Use `%c` for currency and `%v` for numeric value (e.g., `%v %c` or `%c%v`). If unset, frontend uses a reasonable default. |
| `CLIENT_IDLE_TIMEOUT_MS` | number (ms) | `60000` | Idle logout timeout for user dashboards in milliseconds. Set to `0` to disable client-side idle logout. |
| `CLIENT_IDLE_WARN_MS` | number (ms) | `10000` | Warning period before logout (milliseconds). This should be less than `CLIENT_IDLE_TIMEOUT_MS`. The frontend shows a toast warning for this duration before redirecting to the login page. |
| `RATE_LIMIT_WINDOW_MINUTES` | number | `15` | Time window in minutes used by the API rate limiter. |
| `RATE_LIMIT_MAX` | number | `600` | Maximum number of requests allowed in the rate limiter window. |
| `TASK_COOLDOWN_SECONDS` | number | `0` | Global default cooldown (in seconds) applied to task submissions. `0` disables the cooldown. Individual tasks can override frequency. |
| `ALLOW_NEGATIVE_BALANCE` | boolean | `false` | Whether user balances are allowed to go below zero. Set to `true` to allow negative balances. |
| `ADMIN_USERNAME` | string | `admin` | Username used by `scripts/seed-admin.js` when creating a default admin user. |
| `ADMIN_PASSWORD` | string | `admin123` | Password used by `scripts/seed-admin.js` when creating the default admin user. Change after first boot. |
| `SENTRY_DSN` | string | (none) | Optional Sentry DSN. If present, Sentry error reporting is enabled. |
| `LOG_LEVEL` | string | `info` | Logging level (`debug`, `info`, `warn`, `error`). |
| `TEST_VALIDATION` | boolean | (none) | Used by some test helpers to enable stricter validation paths during tests. Only set in test environments.

Notes & Examples

- Copy and edit the example file:
  ```bash
  cp .env.example .env
  ```
- Set environment variables when running locally:
  - PowerShell (Windows):
    ```powershell
    $env:DATABASE_FILE = './data/bankly.db'
    $env:JWT_SECRET = 'a-long-random-secret'
    npm run dev
    ```
  - POSIX (macOS / Linux):
    ```bash
    DATABASE_FILE=./data/bankly.db JWT_SECRET='a-long-random-secret' npm run dev
    ```
- When using Docker / docker-compose, add variables to your `docker-compose.yml` or an `.env` file consumed by Docker Compose.

Security & Best Practices

- Always set a secure `JWT_SECRET` in production.
- Do not commit secrets to git. Use a secret manager or environment-specific provisioning for production deployments.
- For production deployments, set `NODE_ENV=production` and ensure `SENTRY_DSN` and `LOG_LEVEL` are configured as needed.

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