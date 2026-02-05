# Bankly Backend

Minimal backend scaffold for Bankly project.

## Development

- Run dev: `npm run dev`
- Start: `npm start`
- Tests: `npm test`

Configuration: copy `.env.example` to `.env` and set `JWT_SECRET` and `DATABASE_FILE`.

## Docker Development

For development, use Docker Compose to build and run the backend:

```bash
docker-compose build
docker-compose up
```

This will start the backend on port 3000 with data persistence in `./backend/data/`.

## Production Deployment

For production deployment on Raspberry Pi:

1. Build the Docker image: `docker-compose build`
2. Run in production: `docker-compose up -d`
3. Data is persisted in `./backend/data/` volume

## Installation Guide

See the full installation guide in `docs/INSTALLATION.md` for detailed setup instructions for both development and production environments.
