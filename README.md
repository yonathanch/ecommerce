# Ecommerce

Modern single-vendor e-commerce platform with AI shopping assistant.

**Stack:** Next.js (App Router) · NestJS · PostgreSQL · Prisma · Redis · Docker

## Structure

```
├── backend/     NestJS REST API (port 3002, prefix /api)
├── frontend/    Next.js app (port 3000)
└── docker-compose.yml   PostgreSQL 16 + Redis 7
```

Architecture: `Next.js → TanStack Query / Zustand → NestJS (Controller → Service → Prisma) → PostgreSQL`, with Redis for cache/BullMQ.

## Prerequisites

- Node.js 20+
- Docker + Docker Compose

## Environment setup

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Then fill in real secrets in `backend/.env` (JWT_SECRET, DATABASE_URL). Never commit `.env` files.

## Database setup

```bash
docker compose up -d          # start PostgreSQL + Redis
cd backend
npm install
npx prisma migrate dev        # apply migrations
npm run prisma:seed           # optional: seed sample data
```

## Running in development

```bash
# terminal 1 — backend (http://localhost:3002/api)
cd backend && npm run dev

# terminal 2 — frontend (http://localhost:3000)
cd frontend && npm run dev
```

## Commands

| Command | Description |
|---|---|
| `docker compose up -d` | Start PostgreSQL + Redis |
| `cd backend && npm run dev` | Start backend API |
| `cd frontend && npm run dev` | Start frontend |
| `cd backend && npx prisma migrate dev` | Apply DB migrations |
| `cd backend && npx tsc --noEmit` | Backend typecheck |
| `cd frontend && npx tsc --noEmit` | Frontend typecheck |

## API

- `POST /api/auth/signup` · `POST /api/auth/login`
- `GET /api/products` · `GET /api/products/:id` · `POST /api/products` (auth)
- `GET /api/orders` · `POST /api/orders` (auth)

Global `ValidationPipe` validates all request DTOs (`whitelist` + `forbidNonWhitelisted`).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck for backend & frontend plus `prisma validate` on push/PR to `main` and `development`.

## Git workflow

Git Flow: `main` (release) · `development` (integration) · `feature/*` branches. Never develop directly on `main`.
