# Laporan Milestone M8 (Admin Dashboard)

Status: **selesai diimplementasikan & terverifikasi** (belum di-commit).

| Suite | Hasil |
|---|---|
| `scripts/m4-e2e.mjs` | **PASS — 46 passed, 0 failed** |
| `scripts/m5-e2e.mjs` | **PASS — 49 passed, 0 failed** |
| `scripts/m6-m7-e2e.mjs` | **PASS — 75 passed, 0 failed** |
| `scripts/m8-e2e.mjs` (baru) | **PASS — 71 passed, 0 failed** |
| Verifikasi browser (admin + customer) | **berhasil** |

---

## 1. Perubahan yang dibuat

### 1.1 Backend: modul `admin` (ADMIN-only)

Satu modul baru `src/admin/` sebagai satu-satunya pintu back-office. Guard dipasang **di level controller**
(`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')`), jadi endpoint baru tidak bisa lupa dilindungi.

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/admin/stats` | ringkasan: pendapatan terkumpul & hari ini, pesanan per status, nilai stok, jumlah pelanggan, unit tertahan, 5 pesanan terbaru, 5 stok menipis |
| `GET` | `/admin/orders` | daftar semua pesanan + filter `status`, `search` (ID pesanan / email / nama pelanggan), paginasi |
| `GET` | `/admin/orders/:id` | detail lintas user + `payments`, `reservations`, ledger pesanan, dan `allowedTransitions` |
| `PATCH` | `/admin/orders/:id/status` | transisi status pemenuhan dengan validasi state machine |
| `GET` | `/admin/inventory` | stok per produk + `reserved`/`available` + daftar varian, filter `lowOnly` & `search` (nama/SKU) |
| `GET` | `/admin/customers` | daftar pelanggan + jumlah pesanan & total belanja (hanya pesanan yang benar-benar dibayar) |

Keputusan penting:

1. **State machine eksplisit.** `PENDING → CANCELLED`, `PAID → SHIPPED | REFUNDED`, `SHIPPED → DELIVERED | REFUNDED`,
   `DELIVERED → REFUNDED`, dan `CANCELLED`/`REFUNDED` bersifat final. Transisi lain (mis. `PENDING → SHIPPED`)
   ditolak `400`, dan respons detail selalu menyertakan `allowedTransitions` sehingga UI tidak menebak.
2. **Refund mengembalikan stok lewat ledger.** Method baru `InventoryService.restockForOrder()` menulis baris
   `RESTOCK` dengan `stockBefore`/`stockAfter`, memakai enum `RESTOCK` yang sebelumnya belum terpakai, dan
   payment yang tadinya `PAID` ikut diubah menjadi `REFUNDED`. Karena `REFUNDED` final, restock tidak bisa dobel.
3. **Semua pergerakan stok tetap lewat `InventoryService`.** Modul admin tidak pernah menulis `Product.stock`
   langsung; cancel memakai `releaseForOrder`, refund memakai `restockForOrder`.
4. **Notifikasi status ke pelanggan**: tipe baru `ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_REFUNDED`
   (plus `ORDER_CANCELLED` untuk pembatalan oleh admin).
5. **Refund tidak mengembalikan kupon** (kupon hanya dikembalikan pada pembatalan pesanan yang belum dibayar),
   supaya alur "pakai kupon → bayar → refund → pakai kupon lagi" tidak bisa disalahgunakan.
6. **Sweeper order kedaluwarsa** dipakai ulang dari M7 (`POST /orders/maintenance/expire`) dan tombolnya
   tersedia di halaman Inventori, bukan endpoint baru.

### 1.2 Frontend: back-office di `/admin`

- `StorefrontChrome` (client component) menyembunyikan TopBar/Header/CategoryNavigation di rute `/admin`,
  sehingga dashboard punya layout layar penuh sendiri tanpa header toko yang menumpuk.
- `src/app/admin/layout.tsx`: guard sisi klien (redirect ke `/login` bila belum masuk, ke `/` bila bukan ADMIN),
  header gelap dengan badge "ADMIN", dan sidebar: Ringkasan · Pesanan · Produk · Inventori · Pelanggan.
- **Ringkasan** — 8 kartu metrik + tabel pesanan terbaru + panel stok menipis, semuanya dari satu panggilan `/admin/stats`.
- **Pesanan** — filter status, pencarian, paginasi, panel detail (item, alamat, pembayaran, stok ditahan,
  riwayat), dan tombol aksi sesuai `allowedTransitions`. Refund menyediakan input alasan yang ikut tercatat
  di baris ledger.
- **Produk** — tabel katalog + form tambah/ubah + hapus dengan konfirmasi; kategori memakai `datalist` dari
  `GET /products/categories` dan boleh diketik baru. Field gambar dinonaktifkan saat mengubah karena
  `UpdateProductDto` belum menerima `imageUrls` (UI jujur, bukan diam-diam diabaikan).
- **Inventori** — tabel stok (stok/tertahan/tersedia) + ringkasan varian per produk, form penyesuaian
  (produk atau level SKU varian + alasan wajib), ledger 100 pergerakan terbaru (atau per produk), dan tombol sweeper.
- **Pelanggan** — daftar pelanggan dengan jumlah pesanan, pesanan dibayar, dan total belanja.
- `src/lib/format.ts` — helper tunggal untuk uang (`Rp` + pemisah `id-ID`), tanggal, label/warna status,
  label transisi, dan label jenis ledger.
- `Header` storefront menampilkan tautan **Admin** hanya untuk pengguna dengan `role === 'ADMIN'`,
  supaya tidak perlu mengetik URL manual.

## 2. File yang dibuat

Backend:

- `src/admin/admin.module.ts`, `src/admin/admin.service.ts`, `src/admin/admin.controller.ts`
- `src/admin/dto/admin.dto.ts`
- `scripts/m8-e2e.mjs`

Frontend:

- `src/app/admin/layout.tsx`
- `src/app/admin/page.tsx` (ringkasan)
- `src/app/admin/orders/page.tsx`
- `src/app/admin/products/page.tsx`
- `src/app/admin/inventory/page.tsx`
- `src/app/admin/customers/page.tsx`
- `src/app/components/StorefrontChrome.tsx`
- `src/lib/format.ts`

## 3. File yang diubah

Backend:

- `src/inventory/inventory.service.ts` — tambah `restockForOrder()` dan getter publik `lowStockLimit`
- `src/notifications/notifications.service.ts` — tambah tipe `ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_REFUNDED`
- `src/app.module.ts` — registrasi `AdminModule`
- `scripts/m6-m7-e2e.mjs` — (a) pemilihan produk fixture tidak lagi bisa "membajak" sisa fixture suite lain,
  (b) suite mengembalikan stok katalog seperti semula setelah selesai (race + adjust), agar katalog demo tidak terkikis
- `scripts/m5-e2e.mjs` — (dari ronde sebelumnya) membersihkan fixture-nya sendiri

Frontend:

- `src/app/layout.tsx` — memakai `StorefrontChrome`
- `src/app/components/Header.tsx` — tautan Admin untuk ADMIN

## 4. Command menjalankan

```bash
# backend (wajib untuk semua halaman admin)
cd backend && npm run build && npm run start     # http://localhost:3002/api
cd frontend && npm run dev                       # http://localhost:3000, dashboard di /admin

# suite
cd backend && node scripts/m4-e2e.mjs
cd backend && node scripts/m5-e2e.mjs
cd backend && node scripts/m6-m7-e2e.mjs
cd backend && node scripts/m8-e2e.mjs
```

Login admin: `admin@example.com` / `admin123`.

## 5. Test yang dilakukan & hasil

**Suite HTTP baru `scripts/m8-e2e.mjs` — 71 passed, 0 failed.** Cakupan:

- RBAC: setiap rute back-office tanpa token → `401`, sebagai customer → `403` (termasuk `PATCH` status).
- Bentuk `/admin/stats`: `byStatus`, jumlah pesanan, pendapatan terkumpul/hari ini/refund, nilai stok,
  jumlah pelanggan, blok holds, batas 5 entri untuk pesanan terbaru & stok menipis.
- `/admin/inventory`: threshold, kolom stok/tertahan/tersedia, varian berserta SKU, filter `lowOnly`,
  pencarian lewat SKU varian.
- `/admin/customers`: pencarian per email, jumlah pesanan & total belanja, dan **tidak ada hash password** di payload.
- Daftar pesanan: filter status, pencarian per email dan per ID, meta paginasi, baris memuat data pelanggan.
- Detail pesanan: item + payments + `allowedTransitions`, pesanan tidak dikenal → `404`.
- State machine: `PENDING → SHIPPED` `400`, status sama `400`, status tidak valid `400`, pesanan tidak ada `404`;
  setelah pembayaran tervalidasi webhook: `PAID → SHIPPED` `200` (stok tidak bergerak) → `DELIVERED` `200` →
  `REFUNDED` `200` (stok kembali, satu baris ledger `RESTOCK` dengan before/after + alasan admin, payment menjadi
  `REFUNDED`), lalu `REFUNDED → SHIPPED` `400`.
- Notifikasi pelanggan `ORDER_SHIPPED` dan `ORDER_REFUNDED` benar-benar dibuat.
- Pembatalan oleh admin melepas hold tanpa menyentuh stok on-hand.
- Suite membersihkan produk fixture-nya sendiri di akhir.

**Regresi:** `m4` 46/0, `m5` 49/0, `m6-m7` 75/0 (naik dari 72 karena bertambahnya cek pengembalian stok katalog).
Typecheck bersih: `cd backend && npx tsc --noEmit` dan `cd frontend && npx tsc --noEmit` (exit 0).

**Verifikasi lewat antarmuka yang dipakai user (browser):**

1. Login sebagai pelanggan lalu buka `/admin` → dialihkan ke beranda (guard bekerja; backend tetap `403` untuk API-nya).
2. Login `admin@example.com` → `/admin` menampilkan ringkasan nyata: pendapatan terkumpul **Rp 7.540.600** dari 27
   pesanan dibayar, 103 pesanan, 28 produk, nilai stok **Rp 328.945.000**, 100 pelanggan, 1 stok menipis
   (`Sandal Anak Karakter`), dan chrome toko tidak muncul di rute ini.
3. Halaman **Pesanan**: filter, pencarian, paginasi (11 halaman / 103 pesanan). Membuka detail pesanan `PAID`
   menampilkan hanya aksi **Tandai dikirim** dan **Refund & kembalikan stok**; tombol "Tandai dikirim"
   dijalankan → baris berubah menjadi **Dikirim**, aksi berubah menjadi "Tandai diterima"/"Refund…",
   `PATCH /admin/orders/:id/status` tercatat `200` di log jaringan, dan API mengonfirmasi
   `status = SHIPPED`, `allowedTransitions = ["DELIVERED","REFUNDED"]`, stok produk tetap `5` (pengiriman tidak menggerakkan stok).
   Pelanggan pemilik pesanan menerima notifikasi `ORDER_SHIPPED — Pesanan dikirim`.
4. Halaman **Inventori**: ambang 5 unit, 28 produk dengan kolom varian, form penyesuaian berhasil menaikkan
   `Blouse Linen Wanita` 80 → 81 dengan baris ledger `Penyesuaian · 1 · 80 → 81 · verifikasi UI M8`,
   lalu dikembalikan ke 80 lewat API dengan alasan `restore setelah verifikasi UI M8` (ledger mencatat keduanya).
5. Halaman **Produk** (28 baris, 8 kategori) dan **Pelanggan** (20 baris, 5 halaman, 100 pelanggan,
   tanpa `$2b$` di HTML) tampil normal.
6. Header storefront menampilkan tautan **Admin** untuk akun admin.

## 6. Potensi masalah / keterbatasan

1. **Belum ada manajemen varian dari UI.** Varian hanya bisa dilihat dan disesuaikan stoknya; menambah/mengubah
   SKU masih lewat `POST /products` (payload `variants`) atau seed.
2. **Gambar produk tidak bisa diubah** dari dashboard karena `UpdateProductDto` belum menerima `imageUrls`.
3. **Belum ada upload file** — hanya URL gambar.
4. **Refund bersifat administratif.** Tidak ada pemanggilan API provider untuk mengembalikan dana; status payment
   diubah lokal (mock provider memang tidak punya endpoint refund).
5. **Sweeper masih manual** (`POST /orders/maintenance/expire`); penjadwalan otomatis menunggu M9 (BullMQ).
6. **Stok level varian masih tidak ikut di-reserve/di-deduct** di jalur penjualan (cart & checkout bekerja di level produk).
   Ini utang teknis M7 yang sudah dicatat, dan sekarang terlihat di dashboard sebagai angka varian yang tidak bergerak.
7. **Belum ada audit log aksi admin** selain jejak yang sudah ada di ledger stok dan notifikasi.
8. **Format mata uang storefront masih campur** (`₹` di kartu produk, `$` di detail/orders). Dashboard admin memakai
   `Rp` yang benar; storefront perlu diseragamkan menyusul.
9. **`/admin` hanya dijaga di sisi klien + API.** Datanya tetap aman karena semua endpoint `403`, tetapi shell
   dashboard sempat ter-render singkat sebelum redirect.
10. **M4–M8 masih belum di-commit.**

## 7. Next milestone

**M9 — Redis + BullMQ**: cache katalog, job terjadwal sweeper order kedaluwarsa & pelepasan hold,
antrean email/notifikasi, lalu Socket.IO untuk notifikasi realtime di dashboard.
Alternatif yang juga terbuka: menutup utang teknis (stok varian end-to-end, migrasi TanStack Query,
`helmet` + rate limiting, Swagger, test otomatis di CI).

---

## 8. Ronde lanjutan: Kategori & Diskon terhubung ke data nyata

Status: **selesai & terverifikasi** (belum di-commit). Menutup dua dari lima halaman
admin yang sebelumnya masih memakai demo data.

### 8.1 Prinsip yang dipakai

Setiap layar admin harus punya bukti di **kedua sisi**: admin sebagai produsen data, dan
toko sebagai konsumennya. Kalau sebuah perubahan hanya terlihat di dashboard, loop-nya
belum tertutup.

### 8.2 Kategori — chip navigasi toko kini punya pemilik

Kategori sudah dipakai storefront sejak awal (`GET /products/categories` → chip
`CategoryNavigation` dan filter `?category=`), tetapi tidak ada yang bisa mengelolanya:
`ProductsService.resolveCategory` **membuat kategori baru diam-diam**, sehingga salah ketik
di form produk langsung muncul sebagai chip di toko.

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/admin/categories` | daftar + `productCount` + filter `search` |
| `POST` | `/admin/categories` | buat (slug diturunkan server) |
| `PATCH` | `/admin/categories/:id` | ganti nama (slug ikut berubah) |
| `DELETE` | `/admin/categories/:id` | hapus, ditolak selama masih dipakai produk |

Keputusan penting:

1. **`resolveCategory` berubah dari "find or create" menjadi "find or fail"** (`400`).
   Ini perubahan perilaku API yang disengaja: satu-satunya cara sah menambah kategori
   adalah lewat back-office. Form produk admin kini memakai `<select>`, bukan `datalist`
   yang menjanjikan teks bebas.
2. **Hapus ditolak lebih dulu, bukan dibiarkan jadi `P2003`.** `Product.categoryId` memakai
   `onDelete: Restrict`, jadi menghapus kategori terpakai menghasilkan error Prisma yang
   tidak informatif. Pemeriksaan awal mengembalikan `409` beserta jumlah produknya.
3. **Slug dipakai untuk pencocokan.** Nama dicocokkan lewat slug sehingga `"sepatu pria"`
   dan `"Sepatu Pria"` tidak menjadi dua baris berbeda.
4. **`slugify` diekstrak ke `src/common/slug.ts`.** Sebelumnya hanya ada di `products.service`;
   kalau modul admin punya salinan sendiri, keduanya bisa menghasilkan slug berbeda untuk
   kategori yang sama.

### 8.3 Diskon — kupon yang dibuat admin langsung bisa dipakai di checkout

Halaman Diskon sebelumnya menampilkan tiga kupon karangan, sementara model `Coupon` dan
`CouponService.resolveCoupon` sudah dipakai `POST /coupons/validate` di halaman checkout.

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/admin/coupons` | daftar + `status` + `summary`, filter `search` & `activeOnly` |
| `POST` | `/admin/coupons` | buat kupon (kode dinormalkan ke huruf besar) |
| `PATCH` | `/admin/coupons/:id` | ubah sebagian, termasuk aktif/nonaktif |
| `DELETE` | `/admin/coupons/:id` | hapus, ditolak bila sudah pernah dipakai |

Keputusan penting:

1. **`status` dihitung di server** (`AKTIF` / `NONAKTIF` / `KEDALUWARSA` / `HABIS`) memakai
   urutan pemeriksaan yang sama dengan `resolveCoupon`. Kalau frontend menghitung sendiri,
   dashboard bisa menampilkan kupon "Aktif" yang akan ditolak saat pembayaran.
2. **Kupon yang pernah dipakai tidak bisa dihapus**, hanya dinonaktifkan. `CouponUsage`
   memakai `onDelete: Cascade`, jadi menghapusnya akan menghapus riwayat pemakaian sekaligus
   membuat kode yang sama bisa dipakai lagi oleh pelanggan yang sudah memakainya.
3. **`null` pada field opsional berarti "kosongkan"**, sedangkan key yang tidak dikirim
   berarti "jangan diubah" — inilah yang membuat `PATCH` bisa dipakai sebagai update parsial
   dan tombol aktif/nonaktif cukup mengirim satu field.
4. **Aturan domain ditegakkan:** persen > 100 ditolak, kode duplikat `409`, dan
   `usageLimit` tidak boleh lebih kecil dari jumlah pemakaian yang sudah tercatat.

### 8.4 Frontend

- `src/app/admin/categories/page.tsx` — CRUD penuh: tambah, ubah nama inline, hapus dengan
  konfirmasi, pencarian, kolom jumlah produk. Teks bantunya menyatakan langsung bahwa
  daftar ini adalah chip navigasi di toko.
- `src/app/admin/discounts/page.tsx` — empat kartu ringkasan dari `summary`, tabel kupon
  dengan status server, form buat/ubah, tombol aktif-nonaktif, dan hapus.
- `src/app/admin/products/page.tsx` — field kategori berubah dari `datalist` menjadi
  `<select>` + tautan ke menu Kategori.
- `src/lib/format.ts` — tambah `COUPON_STATUS_LABELS`, `COUPON_STATUS_STYLES`, `formatDate`.
- `src/lib/admin-mock.ts` — `adminCategories` dan `adminDiscounts` dihapus karena sudah
  tidak ada pemakainya. Sisa demo: E-Commerce, Pengiriman, Ulasan.

### 8.5 Verifikasi

| Suite | Hasil |
|---|---|
| `scripts/m8-e2e.mjs` | **PASS — 113 passed, 0 failed** (naik dari 71; +18 kategori, +24 kupon) |
| `scripts/m4-e2e.mjs` | **PASS — 46 passed, 0 failed** |
| `scripts/m5-e2e.mjs` | **PASS — 49 passed, 0 failed** |
| `scripts/m6-m7-e2e.mjs` | **PASS — 75 passed, 0 failed** |

Cek baru di `m8` sengaja menegakkan **kedua sisi**:

- Kategori: `GET /products/categories` diperiksa setelah buat, ubah nama, dan hapus —
  jadi yang diuji adalah daftar yang benar-benar dirender toko, bukan hanya respons admin.
- Kupon: setelah dibuat dari `/admin/coupons`, kupon diuji lewat `POST /coupons/validate`
  dengan token pembeli — panggilan yang persis dipakai halaman checkout.

Verifikasi lewat antarmuka (browser, admin login):

1. `/admin/categories` menampilkan 8 kategori nyata beserta jumlah produk.
2. Menambah "Kategori Uji Coba" dari form admin → chip **muncul di `/products`** (strip
   navigasi dan filter daftar produk).
3. Mengganti nama menjadi "Kategori Uji Ubah" → chip lama hilang, chip baru muncul; slug
   ikut berubah. Diverifikasi lewat `/products/categories`.
4. Hapus kategori terpakai (`Aksesoris`, 4 produk) → `409` dengan pesan yang menyebut
   jumlah produk; kategori uji (0 produk) berhasil dihapus dan chip-nya hilang dari toko.
5. `/admin/discounts` menampilkan 3 kupon dari database (`SUMMER20` terpakai **21/100** —
   angka nyata, bukan `42` dari data demo).

Catatan keterbatasan saat verifikasi: dialog `window.confirm` bawaan browser memblokir
automation Playwright, sehingga alur hapus lewat UI tidak bisa diotomasi; jalur hapus
diverifikasi lewat API pada suite.

### 8.6 Yang belum dikerjakan

1. **Tiga lubang di menu Produk**: field brand belum ada di form maupun DTO tulis, gambar
   belum bisa diubah (`UpdateProductDto` tanpa `imageUrls`), dan varian belum bisa dikelola.
2. **E-Commerce**: masih demo; butuh endpoint deret waktu dari `Order`/`OrderItem`. Panel
   conversion funnel hanya bisa jujur kalau diganti funnel status pesanan.
3. **Pengiriman & Ulasan**: masih demo; keduanya menunggu keputusan skema/lingkup.
4. **TanStack Query** belum dipakai — halaman admin masih `useEffect` + `apiClient`.
