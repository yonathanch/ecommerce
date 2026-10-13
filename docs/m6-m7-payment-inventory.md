# Laporan Milestone M6 (Payment) & M7 (Inventory)

Status: **selesai diimplementasikan & terverifikasi** (belum di-commit).
Cakupan tambahan pada ronde ini: **katalog produk diganti menjadi fashion**.

Ringkasan angka:

| Suite | Hasil |
|---|---|
| `scripts/m4-e2e.mjs` | **PASS — 46 passed, 0 failed** |
| `scripts/m5-e2e.mjs` | **PASS — 49 passed, 0 failed** |
| `scripts/m6-m7-e2e.mjs` | **PASS — 72 passed, 0 failed** |
| Browser E2E (checkout → sandbox gateway → capture) | **berhasil**, diverifikasi sampai database |

---

## 1. Perubahan yang dibuat

### 1.1 Katalog diganti menjadi fashion

`prisma/seed.ts` ditulis ulang. Delapan kategori sesuai permintaan:

`Baju Wanita`, `Baju Pria`, `Baju Anak`, `Aksesoris`, `Sweater & Jacket`, `Sepatu Pria`, `Sepatu Wanita`, `Sepatu Anak`.

Hasil seeding: **8 kategori, 28 produk, 196 varian, 3 kupon** (produk & kategori lama dibersihkan otomatis).
Varian dibangkitkan dari kombinasi warna × ukuran secara deterministik dengan SKU ber-prefix per kategori
(`BW-`, `BP-`, `BA-`, `AK-`, `SW-`, `SP-`, `SWN-`, `SA-`) — contoh `SW-002-HIT-M`, `SP-001-HIT-42`, `SPN` → `SWN-002-PUT-37`, `SA-002-HIT-30`.
Harga per varian mengikuti delta ukuran, plus stok, berat, dan gambar.

### 1.2 M6 — Payment

- Model `Payment`, `WebhookEvent`; enum `PaymentStatus`; `OrderStatus` bertambah `REFUNDED`.
- `POST /api/payments` membuat payment attempt; **nominal selalu diambil dari order di database**, bukan dari request body.
- Webhook **publik** `POST /api/payments/webhook` yang autentikasinya murni **HMAC-SHA256 signature** (`x-signature` + `x-event-id`), membaca **raw body** (`NestFactory.create(AppModule, { rawBody: true })`).
- Idempotency: `WebhookEvent` punya unique `(provider, eventId)`; pengiriman ulang mengembalikan `{ duplicate: true }` dan tidak mengubah state.
- State machine: `captured` → payment `PAID`, order `PAID` + `paidAt`, **stock dipotong**, notifikasi `ORDER_PAID`;
  `failed` → payment `FAILED`, order tetap `PENDING` (masih bisa dibayar);
  `expired` → payment `EXPIRED`, hold dilepas, order `CANCELLED`, notifikasi.
- Proteksi **amount tampering**: selisih nominal `> 0.01` → `400`, event tercatat dengan `error`, tanpa efek samping.
- Provider bersifat abstrak (`PaymentProvider`). Implementasi saat ini: **mock sandbox** (`PAYMENT_PROVIDER=mock`) yang benar-benar menandatangani webhook, sehingga jalur verifikasi signature asli ikut teruji secara lokal.
  `PaymentsModule` **melempar error saat boot** bila nama provider tidak dikenal — tidak ada fallback diam-diam.
- Endpoint simulasi `POST /api/payments/simulate/:providerRef/:outcome` hanya hidup di non-production, hanya untuk provider mock, dan hanya oleh pemilik payment.
- Halaman sandbox gateway di frontend: `/pay/[ref]` (tombol "Bayar sekarang" / "Simulasikan gagal").

### 1.3 M7 — Inventory (two-phase: reserve → deduct)

Keputusan penting: **checkout tidak memotong stok**. Yang terjadi saat checkout hanyalah pembuatan hold.

1. **Reserve** (checkout): baris `StockReservation` `ACTIVE` dengan TTL 30 menit. `Product.stock` tidak berubah.
2. **Deduct** (webhook captured): `consumeForOrder` menulis baris ledger `DEDUCT` dan menandai hold `CONSUMED`.

- Availability = `stock − active reservations`, diekspos sebagai `reserved` dan `available` pada response produk.
- Anti-oversell: produk dikunci dengan `SELECT ... FOR UPDATE` di dalam transaksi checkout, dan **produk dikunci dalam urutan terurut** agar dua checkout multi-item tidak saling deadlock. Deduction memakai conditional `UPDATE ... WHERE stock >= qty` dan memeriksa hasilnya.
- Race dua pembeli untuk unit terakhir diuji: tepat satu `201`, satu `400`; stok tidak pernah negatif.
- `POST /api/inventory/adjust` (ADMIN) menerima delta bertanda di level produk atau `variantSku`, menolak hasil negatif dan delta `0`, menulis ledger `ADJUST`, dan memicu alert low-stock.
- Threshold dari `LOW_STOCK_THRESHOLD` (default 5); TTL dari `STOCK_RESERVATION_TTL_MINUTES` (default 30).
- Sweeper order kedaluwarsa: `POST /api/orders/maintenance/expire` (ADMIN) — melepas hold, mengembalikan kupon, membatalkan order.
- Kupon **dikembalikan** (`refundForOrder`) saat order belum dibayar dibatalkan/kedaluwarsa sehingga bisa dipakai lagi.

### 1.4 Penunjang

- `AllExceptionsFilter` global: envelope error konsisten `{ statusCode, error, message, path, timestamp }`,
  memetakan Prisma `P2002 → 409`, `P2025 → 404`, `P2003 → 400`; stack trace hanya masuk log server.
- `NotificationsModule` — feed in-app (`ORDER_CREATED`, `ORDER_PAID`, `PAYMENT_FAILED`, `ORDER_CANCELLED`, `LOW_STOCK`), menerima `Prisma.TransactionClient` agar tulisan ikut transaksi pemanggil.
- `InventoryModule` menjadi **satu-satunya** modul yang boleh menggerakkan stok; cart & products membaca availability dari sana.

### 1.5 Perbaikan kualitas data

Suite E2E M5 sebelumnya meninggalkan fixture produk (`M5 Kemeja …`, `M5 Sold Out …`) di katalog.
Fixture tersebut dihapus dari database dan `scripts/m5-e2e.mjs` sekarang **membersihkan fixture-nya sendiri** di akhir run.
Katalog saat ini bersih: 28 produk fashion.

---

## 2. File yang dibuat

Backend:

- `src/payments/` — `payments.module.ts`, `payments.service.ts`, `payments.controller.ts`, `payments-webhook.controller.ts`,
  `dto/`, `providers/payment-provider.interface.ts`, `providers/mock.provider.ts`
- `src/inventory/` — `inventory.module.ts`, `inventory.service.ts`, `inventory.controller.ts`, `dto/inventory.dto.ts`
- `src/notifications/` — `notifications.module.ts`, `notifications.service.ts`, `notifications.controller.ts`
- `src/common/filters/all-exceptions.filter.ts`
- `src/orders/dto/checkout.dto.ts`
- `prisma/migrations/20261007140000_add_payment_inventory_reservation/migration.sql`
- `scripts/m6-m7-e2e.mjs`

Frontend:

- `src/lib/payments.ts` — `startPayment()`, `paymentErrorMessage()`
- `src/app/pay/[ref]/page.tsx` — halaman sandbox gateway

## 3. File yang diubah

Backend:

- `prisma/schema.prisma` — `StockReservation`, `Payment`, `WebhookEvent`, `Notification`; enum baru; field baru pada `Order` (`subtotal`, `discount`, `couponCode`, `shippingAddress`, `paidAt`, `expiresAt`) dan `OrderItem.variantSku`
- `prisma/seed.ts` — katalog fashion
- `src/app.module.ts` — registrasi modul baru + `APP_FILTER`
- `src/main.ts` — `rawBody: true`
- `src/orders/orders.service.ts` — checkout dengan reservasi, cancel, expire sweeper; `markAsPaid` dan `POST /orders/:id/pay` **dihapus** (pembayaran kini lewat payment + webhook)
- `src/orders/orders.controller.ts`, `src/orders/orders.module.ts`, `src/orders/dto/create-order.dto.ts`
- `src/products/products.service.ts` / `products.module.ts` — expose `reserved` & `available` tanpa N+1
- `src/cart/cart.service.ts` / `cart.module.ts` — validasi stok memakai availability
- `src/coupon/coupon.service.ts` — `refundForOrder`
- `.env`, `.env.example`

Frontend:

- `src/app/checkout/CheckoutForm.tsx` — setelah order dibuat: batas waktu bayar + tombol "Bayar sekarang"
- `src/app/orders/page.tsx` — order `PENDING` menampilkan deadline, tombol bayar & batalkan
- `src/app/products/[id]/page.tsx` — menampilkan "Tersedia: N" dan menonaktifkan pembelian bila habis

---

## 4. Endpoint baru / berubah

Publik & webhook:

| Method | Path | Catatan |
|---|---|---|
| `POST` | `/api/payments/webhook` | signature-only, idempotent |

Terautentikasi (JWT):

| Method | Path | Catatan |
|---|---|---|
| `POST` | `/api/payments` | buat payment attempt untuk sebuah order |
| `GET` | `/api/payments/order/:orderId` | daftar attempt milik order tersebut |
| `POST` | `/api/payments/simulate/:providerRef/:outcome` | hanya non-production + provider mock + pemilik payment |
| `GET` | `/api/inventory/availability/:productId` | `stock`, `reserved`, `available` |
| `GET` | `/api/inventory/low-stock` | ADMIN |
| `GET` | `/api/inventory/history` | ADMIN |
| `POST` | `/api/inventory/adjust` | ADMIN |
| `POST` | `/api/orders/checkout` | order `PENDING` + hold stok |
| `POST` | `/api/orders/maintenance/expire` | ADMIN, sweeper order kedaluwarsa |
| `POST` | `/api/orders/:id/cancel` | melepas hold + mengembalikan kupon |
| `GET` | `/api/notifications`, `/unread-count`, `POST /:id/read`, `POST /read-all` | feed in-app |

## 5. Environment variable baru

```env
PAYMENT_PROVIDER=mock
PAYMENT_MOCK_SECRET=<64 hex acak>     # nilai asli hanya ada di backend/.env
PAYMENT_TTL_MINUTES=30
STOCK_RESERVATION_TTL_MINUTES=30
LOW_STOCK_THRESHOLD=5
```

## 6. Command menjalankan

```bash
# database
cd backend && npx prisma migrate deploy && npx prisma generate && npm run prisma:seed

# services
cd backend && npm run dev          # http://localhost:3002/api
cd frontend && npm run dev         # http://localhost:3000

# verifikasi
cd backend && node scripts/m4-e2e.mjs
cd backend && node scripts/m5-e2e.mjs
cd backend && node scripts/m6-m7-e2e.mjs
```

Catatan operasional (Windows): `npx prisma generate` gagal `EPERM` bila `node dist/main.js` masih berjalan — matikan dulu prosesnya.
Shell non-interaktif tidak bisa `prisma migrate dev`; migrasi dibuat via `prisma migrate diff --script` lalu `prisma migrate deploy`.

## 7. Test yang dilakukan & hasil

Suite HTTP terhadap server hidup (`scripts/*.mjs`):

- **M4 (cart, wishlist, coupon): 46 passed, 0 failed** — ekspektasi kupon disesuaikan ke seed baru (`SUMMER20` min. 200.000 / cap 100.000, `WELCOME50` min. 300.000).
- **M5 (addresses, checkout, hold stok): 49 passed, 0 failed** — kini juga memverifikasi bahwa suite membersihkan fixture katalognya.
- **M6/M7: 72 passed, 0 failed** — meliputi signature palsu → `401`, replay → `duplicate: true`, amount tampering → `400` tanpa efek, capture → order `PAID` + stok terpotong + satu baris ledger `DEDUCT` + hold `CONSUMED` + notifikasi, `failed`/`expired`, akses payment milik orang lain → `404`, refund kupon saat cancel, race oversell, RBAC admin M7 (`403` untuk customer), adjust invalid → `400`, sweeper order kedaluwarsa, kepemilikan notifikasi, dan konsistensi envelope error tanpa kebocoran stack.

Verifikasi lewat antarmuka yang dipakai user (browser, bukan hanya script):

1. `/products` menampilkan 8 kategori fashion; produk `Sepatu Sneakers Anak` menampilkan "Tersedia".
2. Add to cart → `/checkout` (subtotal 259.000, alamat default) → **Place Order** sukses.
3. Tombol **Bayar sekarang** mengarah ke `/pay/MOCK-…-a26b6d9c?amount=259000&order=…` (sandbox gateway).
4. Klik "Bayar sekarang" di sandbox → redirect ke `/orders`, order tampil **PAID**.
5. Dicek di database: `order.status = PAID` (`paidAt` terisi), `Payment = PAID` nominal 259.000,
   `StockReservation = CONSUMED`, `Product.stock` `52 → 51` dengan satu baris `InventoryTransaction DEDUCT` (`before=52`, `after=51`),
   `active holds = 0`, notifikasi `ORDER_PAID`, dan `WebhookEvent payment.captured` dengan `signatureValid = true` & `processedAt` terisi.

Typecheck bersih: `cd backend && npx tsc --noEmit` dan `cd frontend && npx tsc --noEmit` (exit 0).

## 8. Potensi masalah / keterbatasan

1. **Provider pembayaran masih mock.** Struktur `PaymentProvider` sudah siap untuk Midtrans/Xendit, tetapi implementasi nyata belum ada; `PAYMENT_PROVIDER` selain `mock` akan membuat aplikasi gagal boot (by design, bukan bug).
2. **Sweeper order kedaluwarsa masih manual** (`POST /orders/maintenance/expire`). Belum ada scheduler; ini menunggu M9 (Redis + BullMQ) untuk cron/queue.
3. **Redis belum dipakai aplikasi.** `ioredis` ada di dependency tetapi belum ada pemakaian di `src/`.
4. **Frontend belum memakai TanStack Query.** Data fetching masih manual + store cart sendiri; migrasi ini belum dilakukan.
5. **Belum ada** `helmet`/security headers, rate limiting (`@nestjs/throttler`), Swagger/OpenAPI, model `Review`, Socket.IO, dan **test otomatis di CI** (`ci.yml` baru typecheck + `prisma validate`).
6. **Home page & navbar masih desain lama** (link Groceries, Premium Fruits, dst.). Halaman produk sudah fashion, tapi navigasi belum konsisten.
7. **Chat/notification realtime belum ada** — notifikasi baru bisa dibaca lewat polling/refresh.
8. **Docker CLI tidak bisa dipakai di sesi ini** (Docker Desktop engine mati), jadi inspeksi DB dilakukan lewat script Prisma, bukan `docker exec psql`.
9. **M4–M7 masih belum di-commit.** Semua perubahan ada di working tree pada branch `development`.

## 9. Next milestone

**M8 — Admin Dashboard** (kelola produk/varian/stok, daftar order, aksi adjust & low-stock), atau
**M9 — Redis + BullMQ** (cache katalog, job sweeper order kedaluwarsa, antrean email/notifikasi), atau
menutup gap fondasi dulu (TanStack Query di frontend, helmet + rate limiting, Swagger, test di CI).
