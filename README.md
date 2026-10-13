# Ecommerce

Modern single-vendor e-commerce platform with AI shopping assistant.

**Stack:** Next.js (App Router) · NestJS · PostgreSQL · Prisma · Redis · Docker

## Structure

```
├── backend/     NestJS REST API (port 3002, prefix /api)
├── frontend/    Next.js app (port 3000)
└── docker-compose.yml   PostgreSQL 16 + Redis 7
```

Architecture: `Next.js → REST (fetch/axios) → NestJS (Controller → Service → Prisma) → PostgreSQL`, with Redis reserved for cache/BullMQ.

Implemented milestones: M1 foundation · M2 auth (JWT + refresh rotation + roles) · M3 catalog · M4 cart/wishlist/coupons ·
M5 addresses/checkout · **M6 payments (signed webhooks, idempotency)** · **M7 inventory (reserve → deduct, ledger, low-stock alerts)** ·
**M8 admin dashboard (`/admin`: stats, orders + fulfilment state machine, products, inventory, customers)**.
Still open: Redis usage, BullMQ jobs, Socket.IO, TanStack Query migration, Swagger, helmet/rate limiting, reviews, automated tests in CI,
per-variant stock in the sales path and product image upload — see the limitation sections of the
[M6/M7 report](docs/m6-m7-payment-inventory.md#8-potensi-masalah--keterbatasan) and the
[M8 report](docs/m8-admin-dashboard.md#6-potensi-masalah--keterbatasan).

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
npx prisma migrate deploy     # apply migrations (use `migrate dev` while authoring one)
npx prisma generate
npm run prisma:seed           # fashion catalog: 8 categories, 28 products, 196 variants, 3 coupons
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
| `cd backend && npx prisma migrate deploy` | Apply committed DB migrations |
| `cd backend && npx tsc --noEmit` | Backend typecheck |
| `cd frontend && npx tsc --noEmit` | Frontend typecheck |

## API

All routes are prefixed with `/api`. Authenticated routes need `Authorization: Bearer <accessToken>` from `/api/auth/login`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/signup` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` |
| Catalog | `GET /products` · `GET /products/categories` · `GET /products/:id` · `POST|PUT|DELETE /products/:id` (ADMIN) |
| Cart | `GET /cart` · `POST /cart/items` · `PUT|DELETE /cart/items/:productId` · `POST /cart/clear` |
| Wishlist | `GET /wishlist` · `POST|DELETE /wishlist/items/:productId` · `POST /wishlist/items/:productId/toggle` |
| Addresses | `GET /addresses` · `POST /addresses` · `PUT /addresses/:id` · `DELETE /addresses/:id` · `POST /addresses/:id/default` |
| Coupons | `POST /coupons/validate` |
| Orders | `POST /orders/checkout` · `POST /orders` · `GET /orders` · `GET /orders/:id` · `POST /orders/:id/cancel` · `GET /orders/inventory` · `POST /orders/maintenance/expire` (ADMIN) |
| Payments (M6) | `POST /payments` · `GET /payments/order/:orderId` · `POST /payments/webhook` (signature-only) · `POST /payments/simulate/:providerRef/:outcome` (dev, mock) |
| Payment providers | `PAYMENT_PROVIDER=mock` (local sandbox gateway at `/pay/[ref]`) or `midtrans` (Snap; sandbox by default) |
| Inventory (M7) | `GET /inventory/availability/:productId` · `GET /inventory/low-stock` · `GET /inventory/history` · `POST /inventory/adjust` (last three ADMIN) |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `POST /notifications/read-all` |
| Admin (M8, ADMIN only) | `GET /admin/stats` · `GET /admin/orders` · `GET /admin/orders/:id` · `PATCH /admin/orders/:id/status` · `GET /admin/inventory` · `GET /admin/customers` |
| Health | `GET /health` |

Global `ValidationPipe` validates all request DTOs (`whitelist` + `forbidNonWhitelisted`), and every error
uses one envelope: `{ statusCode, error, message, path, timestamp }` (no stack traces leaked).

### Checkout → payment flow

Checkout creates a `PENDING` order and **holds** stock (`StockReservation`, TTL 30 minutes) without touching
`Product.stock`. On-hand stock is deducted only when a signed payment webhook is verified. Availability shown
to shoppers is `stock − active reservations` (`reserved` / `available` fields on product payloads).
In development, `PAYMENT_PROVIDER=mock` renders a local sandbox gateway at `/pay/[ref]`.

## Environment variables (backend)

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
PAYMENT_PROVIDER=mock              # mock | midtrans — anything else fails fast at boot
PAYMENT_MOCK_SECRET=<64 hex chars> # used when PAYMENT_PROVIDER=mock
PAYMENT_TTL_MINUTES=30
STOCK_RESERVATION_TTL_MINUTES=30
LOW_STOCK_THRESHOLD=5

# Midtrans Snap (free sandbox account: dashboard.sandbox.midtrans.com)
MIDTRANS_SERVER_KEY=SB-Mid-server-...
MIDTRANS_CLIENT_KEY=SB-Mid-client-...
MIDTRANS_IS_PRODUCTION=false
```

### Midtrans integration

With `PAYMENT_PROVIDER=midtrans`, `POST /payments` opens a Snap transaction (sandbox unless
`MIDTRANS_IS_PRODUCTION=true`) and the customer pays on the Midtrans-hosted page. Midtrans then calls
`POST /api/payments/webhook`; the notification's `signature_key` (sha512 of order_id + status_code +
gross_amount + server key) is verified before anything is applied, so the existing capture → deduct
stock → notify pipeline works unchanged. Configure the notification URL in the Midtrans dashboard to
point at `<public base url>/api/payments/webhook`.

## Testing

HTTP end-to-end suites run against a live backend on `:3002` (they create their own users, and the M5
suite removes the catalog fixtures it creates):

```bash
cd backend
node scripts/m4-e2e.mjs      # cart, wishlist, coupons            (46 checks)
node scripts/m5-e2e.mjs      # addresses, checkout, stock holds     (49 checks)
node scripts/m6-m7-e2e.mjs   # payments, webhooks, inventory, RBAC (75 checks)
node scripts/m8-e2e.mjs      # admin API, fulfilment, refund, RBAC (71 checks)
```

## Docs

- [M6 (payment) & M7 (inventory) milestone report](docs/m6-m7-payment-inventory.md)
- [M8 (admin dashboard) milestone report](docs/m8-admin-dashboard.md)

## Admin dashboard

Signed-in staff (`ADMIN` role) manage the shop at `/admin`: overview metrics, order fulfilment
(`PAID → SHIPPED → DELIVERED`, refund restores stock through the inventory ledger), product CRUD,
inventory adjustments with a reason, and the customer list. Seeded admin: `admin@example.com` / `admin123`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck for backend & frontend plus `prisma validate` on push/PR to `main`.

## Git workflow

Single-branch workflow: `main` is the only branch — all work lands there.
