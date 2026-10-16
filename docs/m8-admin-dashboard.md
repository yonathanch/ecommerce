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

1. ~~**Tiga lubang di menu Produk**~~ — ditutup di [Tahap 1 (§9)](#9-tahap-1--produk-lengkap-dan-pelanggan-diperkaya).
2. **E-Commerce**: masih demo; butuh endpoint deret waktu dari `Order`/`OrderItem`. Panel
   conversion funnel hanya bisa jujur kalau diganti funnel status pesanan.
3. **Pengiriman & Ulasan**: masih demo; keduanya menunggu keputusan skema/lingkup.
4. **TanStack Query** belum dipakai — halaman admin masih `useEffect` + `apiClient`.

---

## 9. Tahap 1 — Produk lengkap dan Pelanggan diperkaya

Status: **selesai diimplementasikan & terverifikasi** (belum di-commit). Tanpa migrasi baru:
ketiga lubang menu Produk ditutup, dan Pelanggan mendapat panel detail.
Langkah pertama Tahap 1 (Kategori & Diskon) sudah selesai lebih dulu — lihat §8.

### 9.1 Prinsip yang dipakai

Sama seperti ronde sebelumnya: setiap perubahan harus terbukti di **dua sisi**. Karena itu
setiap cek baru di suite menguji *payload publik yang dibaca toko*, bukan hanya respons
`/admin/*`: brand diuji lewat `GET /products?brand=<slug>` (query yang dipakai halaman
`/brands/<slug>`), dan varian diuji lewat `GET /products/:id` (payload yang dirender halaman
detail produk).

### 9.2 Brand pada produk

`CreateProductDto` dan `UpdateProductDto` menerima `brand` (nama atau slug). Resolusinya
**find-or-fail** lewat `slugify`, sama seperti kategori: label yang tidak dikenal ditolak `400`.
`undefined` berarti "jangan diubah", `null`/kosong berarti "hapus label".

Alasan menolak, bukan membuat: brand adalah kartu di bagian *Top Fashion Brands* dan halaman
`/brands/<slug>`. Kalau aplikasi boleh mengarang label, salah ketik di form produk langsung
menerbitkan halaman brand kosong di toko.

`PRODUCT_INCLUDE` sekarang ikut membawa `brand` (id/nama/slug), sehingga form edit bisa
menampilkan label yang sedang dipakai tanpa panggilan tambahan.

### 9.3 Galeri gambar bisa diubah

`UpdateProductDto` menerima `imageUrls`. Semantiknya **daftar yang dikirim adalah galeri akhir**:
kalau field dikirim, baris `ProductImage` lama dihapus dan diganti sesuai urutan kiriman; array
kosong berarti menghapus gambar. Di UI, field URL gambar kini aktif saat mengubah produk dan
terisi gambar yang ada, jadi mengosongkannya memang berarti "tanpa gambar" — bukan diam-diam
diabaikan.

### 9.4 Varian bisa dikelola dari UI

Form produk punya editor varian (`UpdateProductDto.variants`), dengan aturan yang disengaja:

1. **Daftar yang dikirim adalah himpunan akhir, dicocokkan per SKU.** SKU yang hilang dihapus,
   SKU baru dibuat, SKU lama diperbarui. Menghapus SKU tidak menghapus riwayat stok: baris
   ledger menyimpan SKU sebagai teks, bukan foreign key.
2. **Stok SKU lama tidak bisa diubah dari sini.** `stock` pada payload hanya dihormati untuk SKU
   yang belum ada (saldo awal). Input stok di editor dinonaktifkan untuk SKU lama, dan suite
   menguji bahwa angka `99` yang dikirim untuk SKU lama diabaikan (stok tetap `3`). Alasannya
   prinsip yang sudah dipegang sejak M7: setiap pergerakan stok harus lewat `InventoryService`
   supaya punya alasan di ledger.
3. **SKU duplikat di dalam satu payload ditolak `400`**, sama seperti SKU milik produk lain
   (`P2002` diterjemahkan `toKnownError` — kini `update()` juga memakai jalur itu).
4. **Gambar, varian, dan baris produk ditulis dalam satu `$transaction`**, supaya tidak ada
   katalog yang setengah terbentuk kalau salah satu bagian gagal.

Format opsi di UI adalah satu baris `Nama: Nilai` dipisah koma (`Warna: Hitam, Ukuran: 42`),
kemudian diurai menjadi `{ "Warna": "Hitam", "Ukuran": "42" }` — kunci inilah yang muncul
sebagai sumbu pilihan di halaman produk.

### 9.5 Pelanggan diperkaya

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/admin/customers/:id` | profil + `summary` (jumlah pesanan, dibayar, dibatalkan, direfund, total belanja, pesanan terakhir) + 20 pesanan terbaru dengan `itemCount` |

Keputusan penting: **baris daftar dan panel detail tidak boleh berbeda angka.** Karena itu
`summary` dihitung dari `groupBy` dengan himpunan `COLLECTED` yang sama seperti daftar, dan
suite membandingkan panel dengan baris hasil pencarian pelanggan yang sama. `role: 'CUSTOMER'`
diikutkan pada pencarian, sehingga akun admin mengembalikan `404` — bukan profil yang salah.

Di UI, tombol **Detail** membuka panel yang memuat riwayat pesanan, dan tiap ID pesanan
menautkan ke `/admin/orders?focus=<id>` yang sudah ada, sehingga insiden bisa ditelusuri dari
pelanggan ke pesanannya.

### 9.6 File yang dibuat / diubah

Backend:

- `src/products/dto/product.dto.ts` — `brand`, `imageUrls`, `variants` pada update; kelas dasar
  `VariantInputDto` (dipakai `CreateVariantDto` dan `UpdateVariantDto`).
- `src/products/products.service.ts` — `resolveBrand()`, `syncVariants()`, `update()` menjadi satu
  transaksi, `brand` ikut di `PRODUCT_INCLUDE`.
- `src/admin/admin.service.ts` — `getCustomer()`.
- `src/admin/admin.controller.ts` — rute `GET /admin/customers/:id`.
- `scripts/m8-e2e.mjs` — +43 cek (113 → **156**).

Frontend:

- `src/app/admin/products/page.tsx` — pilihan brand, gambar bisa diubah, editor varian
  (tambah/ubah/hapus), kolom brand di tabel.
- `src/app/admin/customers/page.tsx` — kolom Detail + panel detail dengan kartu ringkasan dan
  riwayat pesanan yang menautkan ke halaman Pesanan.

`src/lib/admin-mock.ts` tidak disentuh: sisa pemakainya masih E-Commerce, Pengiriman, Ulasan
(Tahap 2/3).

### 9.7 Verifikasi

| Suite | Hasil |
|---|---|
| `scripts/m8-e2e.mjs` | **PASS — 156 passed, 0 failed** (naik dari 113; +25 produk, +14 pelanggan, +2 header) |
| `scripts/m4-e2e.mjs` | **PASS — 46 passed, 0 failed** |
| `scripts/m5-e2e.mjs` | **PASS — 49 passed, 0 failed** |
| `scripts/m6-m7-e2e.mjs` | **PASS — 75 passed, 0 failed** |

Typecheck bersih: `cd backend && npx tsc --noEmit` dan `cd frontend && npx tsc --noEmit` (exit 0).

Cek baru yang menegakkan dua sisi:

- **Brand**: produk dibuat dengan `brand:verse` → `GET /products?brand=verse` memuatnya; setelah
  diubah ke `district`, ia muncul di halaman `district` dan **hilang** dari halaman `verse`.
- **Gambar**: `PUT` dengan galeri baru → `images` panjang 1 berisi URL baru (diganti, bukan
  ditambah); `imageUrls: []` → galeri kosong.
- **Varian**: SKU dihapus hilang, SKU baru muncul dengan saldo awal `7`, opsi & harga SKU lama
  berubah, dan stok SKU lama **tidak** ikut berubah walau payload mengirim `99`.
- **Pelanggan**: `summary` panel sama dengan baris daftar (jumlah pesanan, dibayar, total belanja),
  akun admin → `404`, tanpa hash password di payload, riwayat dibatasi 20 baris.

Verifikasi lewat antarmuka (browser, admin login, frontend di `:3000`):

1. `/admin/products` → **Tambah produk** menampilkan pilihan **Brand (opsional)** berisi 5 brand
   nyata (DISTRICT, FOUND, MOTION, THREAD, VERSE) dan editor varian.
2. Produk uji dibuat dari form (`brand: VERSE`, 1 gambar, 1 varian `Warna: Hitam, Ukuran: 40`,
   harga 155000, stok 4) → `POST /products` `201`.
3. Bukti di toko: `/products/<id>` menampilkan sumbu **Warna** (Hitam) dan **Ukuran** (40) beserta
   gambar dan harga varian, dan `/brands/verse` **memuat produk itu**.
4. **Ubah** produk uji: form terisi otomatis (brand `verse`, gambar terisi, SKU/opsi/harga varian
   terisi) dan **input stok varian lama nonaktif** (`disabled=true`).
5. Mengubah brand ke `district`, mengganti gambar, menambah varian `Warna: Putih, Ukuran: 40`
   (stok 9) lalu simpan → `PUT /products/:id` `200`; API menunjukkan stok SKU lama tetap `4`,
   galeri hanya berisi gambar baru, dan `/brands/district` kini memuatnya sementara
   `/brands/verse` tidak lagi.
6. Halaman produk toko menampilkan tombol pilihan **Hitam / Putih / 40** — varian yang dikelola
   admin langsung bisa dipilih pembeli.
7. `/admin/customers` → tombol **Detail** membuka panel: kartu (Total pesanan 2, Pesanan dibayar 0,
   Dibatalkan 1, Direfund 1) cocok dengan baris `2 | 0 | Rp 0`, dan riwayat menampilkan dua pesanan
   (`Dibatalkan` Rp 500.000, `Direfund` Rp 250.000).
8. Klik ID pesanan di riwayat → berpindah ke `/admin/orders?focus=<id>` dengan panel detail pesanan
   terbuka (tautan silang pelanggan → pesanan bekerja).

Catatan saat verifikasi: menghapus produk lewat UI tetap memakai `window.confirm` yang memblokir
automation, jadi fixture verifikasi dibersihkan lewat API; katalog dikembalikan ke 28 produk dan
hitungan brand persis seperti hasil seed (thread 6, verse 6, district 6, motion 5, found 5).

### 9.8 Yang belum dikerjakan (sisa Tahap 1 ke atas)

1. ~~**Belum ada CRUD brand di back-office**~~ — ditutup di [§10.4](#104-brand-punya-pemilik).
2. **Pelanggan masih baca saja** — belum ada aksi (blokir, catatan, reset) dan belum ada detail
   alamat di panel.
3. **Upload file gambar belum ada** — masih URL.
4. **Stok level varian belum ikut di-reserve/di-deduct di jalur penjualan** (utang teknis M7).
   Editor varian justru menegaskannya: stok varian tidak bisa diubah dari form produk.
5. ~~E-Commerce & Pengiriman menunggu Tahap 2/3~~ — dikerjakan di [§10](#10-tahap-2--pengiriman-e-commerce-dan-brand).
   Yang benar-benar tersisa sekarang: **Ulasan**, bell notifikasi admin, pencarian Ctrl+K, dan
   migrasi TanStack Query.

---

## 10. Tahap 2 & 3 — Pengiriman, E-Commerce, dan Brand

Status: **selesai diimplementasikan & terverifikasi** (belum di-commit). Dua keputusan Pemilik
Produk yang dibutuhkan sudah diambil: **Pengiriman pakai tiga kolom di `Order`**, dan **Ulasan
boleh ditulis pembeli** (dibatasi produk yang pernah dibelinya) — Ulasan menyusul di ronde
berikutnya.

### 10.1 Prinsip yang tetap dipakai

Setiap angka dan setiap kolom harus bisa dibuktikan di dua sisi, dan **tidak ada data yang
dikarang**. Dua tempat di mana template OrbynAdmin meminta data yang tidak ada, dan apa yang
dilakukan sebagai gantinya:

| Template meminta | Kenapa tidak bisa | Yang dipakai |
|---|---|---|
| seri **Laba** | katalog tidak menyimpan harga pokok | seri **Refund** (uang yang benar-benar kembali) |
| **conversion funnel** kunjungan & product view | tidak ada yang mencatat kunjungan | **funnel status pesanan** (dibuat → dibayar → dikirim → diterima) |

### 10.2 Pengiriman: tiga kolom di `Order`

| Kolom | Isi |
|---|---|
| `courier` | nama kurir, mis. `JNE Reguler` |
| `trackingNumber` | nomor resi |
| `shippedAt` | waktu paket benar-benar keluar gudang |

Migrasi `20261013120000_add_order_shipping` juga **mengisi `shippedAt` mundur** untuk pesanan yang
sudah `SHIPPED`/`DELIVERED` (`= updatedAt`, waktu status terakhir bergerak). Tanpa backfill itu,
funnel akan non-monotonik (diterima lebih banyak daripada dikirim) dan riwayat pengiriman lama
hilang.

| Method | Endpoint | Fungsi |
|---|---|---|
| `PATCH` | `/admin/orders/:id/status` | kini juga menerima `courier` + `trackingNumber` saat transisi ke `SHIPPED`; `shippedAt` dicap otomatis |
| `GET` | `/admin/shipments` | daftar pengiriman + `summary` (`missingTracking`, `inTransit`, `delivered`), filter `search` (resi/kurir/pesanan/pelanggan), `status`, `missingTracking` |
| `PATCH` | `/admin/orders/:id/shipment` | isi/koreksi resi setelah dikirim |

Keputusan penting:

1. **Daftar pengiriman didefinisikan oleh `shippedAt`, bukan status.** Refund bisa memindahkan
   status pesanan jauh setelah paketnya dikirim; kalau daftar ini membaca status, pengiriman yang
   nyata akan hilang dari layar.
2. **Resi opsional saat transisi.** Kurir kadang baru memberi nomor resi beberapa jam kemudian,
   jadi memaksanya akan menghalangi admin mencatat pengiriman. Karena itu ada endpoint koreksi
   terpisah — lengkap dengan kemampuan memperbaiki resi yang salah ketik.
3. **`PATCH shipment` hanya untuk pesanan yang sudah dikirim** (`SHIPPED`/`DELIVERED`). Pesanan
   yang belum dikirim tidak punya pengiriman untuk dikoreksi, dan itulah alasan `400`.
4. **Notifikasi `ORDER_SHIPPED` membawa resinya**, karena itu satu-satunya hal yang bisa
   ditindaklanjuti pelanggan.
5. **Pelanggan membaca resi yang sama** di halaman `/orders` miliknya (`GET /orders/:id`), termasuk
   kalimat jujur bila nomor resi belum ada.

### 10.3 E-Commerce: analitik nyata

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/admin/analytics` | KPI 30 hari + pembanding 30 hari sebelumnya, deret bulanan 12 bulan, produk terlaris, penjualan per kategori, funnel status pesanan |

Keputusan penting:

1. **Matematika uang dijalankan di SQL dengan cast eksplisit** (`::float8`, `::int`). `SUM(numeric)`
   dari Postgres datang sebagai `Decimal` dan `COUNT(*)` sebagai `BigInt`; keduanya tidak selamat
   melewati serialisasi JSON.
2. **Refund jadi seri sendiri, bukan dikurangkan dari pendapatan.** Pesanan yang direfund sudah
   keluar dari deret pendapatan (yang hanya menghitung `PAID`/`SHIPPED`/`DELIVERED`); kalau refund
   dikurangkan lagi, uang yang sama terhitung dua kali. Ini ditemukan oleh suite, bukan oleh
   pembacaan kode: cek pertama gagal karena `net = pendapatan − refund` tidak kembali ke nilai
   awal setelah refund.
3. **Funnel dihitung dari fakta, bukan dari status semata:** `paid` memakai `paidAt` (sehingga
   pesanan yang kemudian direfund tetap tercatat pernah dibayar) dan `shipped` memakai `shippedAt`.
   Konsekuensinya dinyatakan terang-terangan di UI: pesanan yang direfund *setelah* diterima keluar
   dari tahap "Diterima" — itulah sebabnya angkanya tidak berjumlah 100%.
4. **`leak` (dibatalkan/direfund) dilaporkan terpisah**, tidak dipaksakan ikut menjumlah.
5. **Produk terlaris memakai harga saat transaksi** (`oi.price * oi.quantity`), bukan harga katalog
   sekarang, supaya perubahan harga tidak menulis ulang sejarah. Item dari produk yang sudah
   dihapus tetap muncul di daftar terlaris (memakai `productName` snapshot) tetapi **tidak** ikut
   agregasi per kategori, karena produknya tidak punya kategori lagi — perbedaan ini disengaja dan
   diberi komentar di kode.
6. **KPI punya pembanding**: kartu menampilkan delta terhadap 30 hari sebelumnya, dan **tidak
   menampilkan apa pun** kalau baseline-nya nol (bukan `+100%` palsu).

### 10.4 Brand punya pemilik

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/admin/brands` | daftar + `productCount` + filter `search` |
| `POST` | `/admin/brands` | buat (slug diturunkan server) |
| `PATCH` | `/admin/brands/:id` | ganti nama (slug ikut berubah) |
| `DELETE` | `/admin/brands/:id` | hapus, ditolak selama masih dipakai produk |

Ini menutup lubang yang §9.8 catat: sebelumnya form produk memilih dari 5 label hasil seed yang
**tidak punya pemilik di back-office** — melanggar prinsip "setiap layar admin harus punya
produsennya".

Keputusan penting:

1. **Hapus ditolak, tidak dibiarkan `SetNull`.** `Product.brandId` memakai `onDelete: SetNull`,
   jadi menghapus brand terpakai akan **diam-diam melepas label dari semua produknya** dan produk
   itu lenyap dari halaman brand tanpa ada yang diberi tahu. Pemeriksaan awal mengembalikan `409`
   beserta jumlah produknya.
2. **Nama dan slug sama-sama unik**, dan pesan `409` menyebut nama yang bentrok, bukan `P2002`.
3. **`slugify` bersama kategori** (`requireSlug` sekarang menerima label) supaya dua modul tidak
   menghasilkan slug berbeda untuk nama yang sama.
4. **Halaman Brand menautkan halaman tokonya** (`/brands/<slug>`) di tiap baris, sehingga admin bisa
   memeriksa hasilnya sendiri — bukan sekadar percaya.

### 10.5 File yang dibuat / diubah

Backend:

- `prisma/schema.prisma` — `Order.courier/trackingNumber/shippedAt` + index.
- `prisma/migrations/20261013120000_add_order_shipping/` — kolom + backfill + index.
- `src/admin/admin.service.ts` — `analytics()`, `orderFunnel()`, `revenueWindow()`, `listShipments()`,
  `updateShipment()`, `updateOrderStatus()` menerima kurir/resi, CRUD brand.
- `src/admin/admin.controller.ts` — `/admin/analytics`, `/admin/shipments`,
  `PATCH /admin/orders/:id/shipment`, CRUD `/admin/brands`.
- `src/admin/dto/admin.dto.ts` — `UpdateShipmentDto`, `ListShipmentsDto`, `BrandNameDto`, field
  kurir/resi pada `UpdateOrderStatusDto`.
- `scripts/m8-e2e.mjs` — +70 cek (156 → **226**).

Frontend:

- `src/app/admin/ecommerce/page.tsx` — ditulis ulang: KPI nyata, grafik Pendapatan & Refund, funnel
  status, kategori, produk teratas, pesanan terbaru (dari `/admin/orders`, sehingga tidak mungkin
  berbeda dengan layar Pesanan).
- `src/app/admin/shipping/page.tsx` — ditulis ulang: daftar pengiriman nyata, filter "hanya yang
  belum ada resi", dan form isi/koreksi resi.
- `src/app/admin/brands/page.tsx` — **baru**, pola yang sama dengan Kategori.
- `src/app/admin/orders/page.tsx` — input kurir + resi saat menandai dikirim, dan blok Pengiriman di
  panel detail.
- `src/app/orders/page.tsx` (toko) — baris pengiriman + resi untuk pelanggan, dan warna status
  `SHIPPED`/`DELIVERED`/`REFUNDED` yang sebelumnya tidak ada.
- `src/app/admin/layout.tsx` — menu **Brand**.
- `src/app/admin/products/page.tsx` — petunjuk brand menaut ke menu Brand.

### 10.6 Verifikasi

| Suite | Hasil |
|---|---|
| `scripts/m8-e2e.mjs` | **PASS — 226 passed, 0 failed** (naik dari 156; +42 pengiriman & analitik, +20 brand) |
| `scripts/m4-e2e.mjs` | **PASS — 46 passed, 0 failed** |
| `scripts/m5-e2e.mjs` | **PASS — 49 passed, 0 failed** |
| `scripts/m6-m7-e2e.mjs` | **PASS — 75 passed, 0 failed** |

Typecheck bersih: `cd backend && npx tsc --noEmit` dan `cd frontend && npx tsc --noEmit` (exit 0).

Cek yang menegakkan dua sisi dan uang yang benar-benar bergerak:

- **Pengiriman**: transisi `SHIPPED` menyimpan kurir + resi dan mencap `shippedAt`; `GET /admin/orders/:id`
  dan `GET /orders/:id` (token pembeli) mengembalikan resi yang sama; notifikasi `ORDER_SHIPPED`
  memuat resinya; resi bisa dikoreksi dan **koreksi itu juga terbaca pelanggan**; pesanan `PENDING`
  → `400`, body kosong → `400`, pesanan tidak ada → `404`; `missingTracking=true` hanya berisi baris
  tanpa resi dan **pesanan yang sudah dikirim tidak lagi dihitung "belum ada resi"**.
- **Analitik**: bentuk deret (12 label, panjang seri sama), KPI berupa angka biasa, funnel monoton
  (`dibuat ≥ dibayar ≥ dikirim ≥ diterima`), produk terlaris terurut menurun.
- **Uang**: pesanan yang dibayar di tengah suite **menaikkan pendapatan bulan berjalan sebesar
  totalnya**, menaikkan KPI 30 hari, menambah hitungan pesanan dan tahap `dibayar` — tetapi
  **tidak** menambah tahap `dikirim` sampai paketnya benar-benar dikirim. Setelah direfund:
  uangnya keluar dari deret pendapatan, masuk ke seri refund, dan KPI 30 hari kembali ke angka semula.
- **Brand**: `GET /products/brands` (daftar yang dirender toko) diperiksa setelah buat, ubah nama,
  dan hapus; produk yang memakai brand baru muncul di query `?brand=<slug>`; hapus saat masih dipakai
  → `409`; memakai slug brand yang sudah dihapus → `400`.

Verifikasi lewat antarmuka (browser, frontend `:3000`, backend `:3002`):

1. `/admin/ecommerce` — KPI nyata (Penjualan bruto **Rp 10.367.600** dari **39** pesanan dibayar,
   AOV Rp 265.836, Refund Rp 4.250.000 — semuanya 30 hari terakhir), grafik **Pendapatan & Refund**,
   funnel empat tahap dengan catatan kejujurannya, kategori, dan produk teratas. Tidak ada lagi
   angka demo (`Rp 52.420.000`, `ORD-24081`).
2. `/admin/shipping` — 9 pengiriman nyata dengan resi, tombol **Isi resi**/**Ubah resi**, kolom
   tujuan dari snapshot alamat, dan tanpa baris demo (`SHP-1084`, `AnterAja`).
3. **Alur resi end-to-end**: pada pesanan `Dibayar`, admin menandai dikirim sambil mengisi kurir +
   resi → baris muncul di `/admin/shipping`; resi diperbaiki (`…-FIX`) → tampil di panel detail
   pesanan.
4. **Sisi pelanggan**: login sebagai pembeli, `/orders` menampilkan `Pengiriman: JNE Reguler · resi
   JNE-M8-…-FIX` (resi hasil koreksi), `SiCepat · resi M8-ANALYTICS-…`, dan untuk pesanan yang
   dikirim tanpa resi kalimat jujur `kurir belum diisi · nomor resi belum tersedia`.
5. `/admin/brands` — 5 brand nyata dengan jumlah produk (DISTRICT 6, THREAD 6, VERSE 6, FOUND 5,
   MOTION 5), tautan halaman toko per baris, dan form tambah/ubah/hapus.

Catatan keterbatasan saat verifikasi: seluruh data transaksi demo terkumpul di bulan yang sama
(Oktober), jadi deret 12 bulan tampil datar di 11 bulan pertama — itu memang keadaan datanya, bukan
bug grafik. Data itu sendiri berasal dari suite uji; katalog tetap 28 produk seperti hasil seed.

### 10.7 Yang belum dikerjakan setelah ronde ini

1. ~~**Ulasan**~~ — selesai (model `Review`, moderasi admin, rating di halaman produk).
2. ~~**Bell notifikasi admin** dan **pencarian Ctrl+K** masih tampilan saja~~ — keduanya nyata di
   [§11](#11-bell-notifikasi-admin-dan-pencarian-ctrlk).
3. **TanStack Query** belum dipakai; halaman admin masih `useEffect` + `apiClient`.
4. ~~**`src/lib/admin-mock.ts` tinggal dipakai halaman Ulasan**~~ — file sudah terhapus setelah
   Ulasan menjadi nyata.
5. Utang lama yang belum tersentuh: upload file gambar, ~~stok level varian di jalur penjualan~~
   (selesai), format mata uang storefront yang masih campur, dan audit log aksi admin.

---

## 11. Bell notifikasi admin dan pencarian Ctrl+K

Status: **selesai diimplementasikan & terverifikasi** (belum di-commit). Ronde ini menutup dua sisa
terakhir di shell admin yang sampai sekarang hanya hiasan: titik merah di lonceng tidak pernah
berubah, dan kotak `Search… Ctrl+K` tidak membuka apa pun.

### 11.1 Lonceng membaca feed yang sudah ada, bukan membuat yang baru

Feed notifikasi per pengguna sudah ada sejak M9 (`GET /notifications`, `unread-count`, `:id/read`,
`read-all`), dan `notifyAdmins()` sudah menulis satu baris untuk **setiap** akun admin. Jadi
lonceng tidak butuh endpoint baru — ia membaca `/notifications` dengan token admin sendiri,
yang berarti tiap admin hanya melihat barisnya sendiri.

Yang memang kurang adalah **isinya**: sampai ronde ini admin hanya menerima `LOW_STOCK` dan
`REVIEW_SUBMITTED`, sehingga lonceng yang jujur akan hampir selalu kosong. Dua peristiwa
ditambahkan karena keduanya satu-satunya hal yang benar-benar bisa ditindaklanjuti admin:

| Peristiwa | Kenapa admin perlu tahu |
|---|---|
| `ORDER_CREATED` | ada uang yang menunggu masuk dan stok yang ditahan; pembeli punya barisnya sendiri, admin dapat baris terpisah |
| `PAYMENT_FAILED` | pesanan tetap `PENDING` sementara hold-nya terus berjalan — admin mungkin perlu menghubungi pembeli |

Baris pesanan admin membawa `meta.orderId`, jadi klik pada notifikasi bisa membuka pesanan itu
langsung. Notifikasi tanpa tautan yang jelas **tidak** dijadikan tombol — barisnya tetap teks,
bukan tautan ke halaman yang tidak bisa menampilkannya.

### 11.2 Ctrl+K: satu query melayani seluruh palette

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/admin/search?q=&limit=` | mencari sekaligus di produk (nama/SKU), pesanan (id, email/nama pelanggan) dan pelanggan; tiap grup dibatasi `limit` (maks 10, default 5) |

Keputusan penting:

1. **Tidak ada total yang diklaim.** Karena setiap grup dipotong `limit`, jawaban tidak boleh
   mengatakan "12 hasil" kalau yang dikirim 5. Respons hanya memuat `query` dan `limit` — angka
   yang benar-benar diketahui.
2. **`matchedSkus` hanya diisi kalau teks benar-benar mengenai SKU.** Kalau admin mengetik nama
   produk, tidak ada SKU palsu yang ikut ditampilkan sebagai "yang cocok".
3. **`q` minimal 2 huruf (`400` di bawah itu)** — pencarian satu huruf akan memindai seluruh
   katalog dan melakukannya pada setiap ketikan.
4. **Field diratakan ke bentuk yang bisa dicetak.** `category` dikirim sebagai **nama**, bukan
   relasi. Ini bukan kerapian belaka: versi pertama mengirim objek relasi dan palette
   menampilkannya sebagai `[object Object]` — ditemukan saat verifikasi browser, bukan oleh suite.
   Suite-nya sekarang menegakkannya (lihat §11.6).
5. **Kotak kosong menampilkan pintasan halaman**, bukan contoh hasil. Dengan kata lain: navigasi
   yang benar-benar bekerja, bukan data karangan.

### 11.3 `?focus=<id>` diperluas ke Produk dan Pelanggan

Konvensi `?focus=<id>` sudah dipakai halaman Pesanan (§9.7). Ronde ini memakainya di dua tempat
lain, supaya baris hasil pencarian dan notifikasi benar-benar mendarat di entitasnya:

| Halaman | Efek |
|---|---|
| `/admin/products?focus=<id>` | form **Ubah produk** terbuka berisi produk itu |
| `/admin/customers?focus=<id>` | panel detail pelanggan terbuka; `openDetail` sekarang menerima id saja, jadi pelanggan yang tidak ada di halaman daftar saat itu tetap bisa dibuka |

### 11.4 Tiga kesalahan yang dibuat dan diperbaiki di ronde ini

1. **Fixture uji dengan sumbu varian sendiri.** Fixture `/admin/search` awalnya memakai opsi
   `{ Ukuran: '42' }`. Suite M6–M7 memeriksa "produk pertama yang punya varian" harus punya sumbu
   `color`; fixture itu menabraknya. Fixture sekarang memakai `color`/`size` seperti katalog.
   Sisa fixtur juga sempat tertinggal di database ketika suite berhenti di tengah karena crash,
   dan katalog dikembalikan ke 28 produk seed setelah dibersihkan.
2. **Assertion yang bisa lolos secara hampa.** `check('...', adminRow?.meta?.orderId === order.id)`
   lolos ketika barisnya tidak ada, karena `undefined === undefined`. Sekarang dijaga
   (`Boolean(adminRow) && ...`), dan pembacaan baris memakai `adminRow ? … : { status: 0 }` supaya
   kegagalan dilaporkan sebagai FAIL, bukan sebagai crash yang menghentikan suite.
3. **Dua jalan masuk yang tidak seragam.** `Ctrl+K` mengosongkan kotak, sementara tombol
   `Cari… Ctrl+K` di header hanya membuka palette — jadi setelah `Esc`, membukanya lagi
   menampilkan hasil untuk teks yang sudah tidak diketik siapa pun. Sekarang efek `open` yang
   mengosongkan query, sehingga kedua jalan masuk berperilaku sama.

### 11.5 File yang dibuat / diubah

Backend:

- `src/admin/admin.service.ts` — `search()`.
- `src/admin/admin.controller.ts` — rute `GET /admin/search`.
- `src/admin/dto/admin.dto.ts` — `AdminSearchQueryDto`.
- `src/orders/orders.service.ts` — `notifyAdmins(ORDER_CREATED)` saat checkout.
- `src/payments/payments.service.ts` — `notifyAdmins(PAYMENT_FAILED)` saat gateway menolak.
- `scripts/m8-e2e.mjs` — +44 cek (277 → **321**).

Frontend:

- `src/components/admin/NotificationBell.tsx` — **baru**: hitungan belum dibaca (dipoll tiap 60
   detik dan saat tab kembali fokus), daftar, tandai satu/semua dibaca, dan peta `meta` → layar
   tujuan.
- `src/components/admin/CommandPalette.tsx` — **baru**: Ctrl+K/⌘K, debounce 200 ms, navigasi
   panah/Enter/Esc, pintasan halaman saat kotak kosong.
- `src/app/admin/layout.tsx` — lonceng dan kotak cari disambungkan ke keduanya (tombolnya membuka
   palette yang sama).
- `src/app/admin/products/page.tsx`, `src/app/admin/customers/page.tsx` — dukungan `?focus=<id>`.

### 11.6 Verifikasi

| Suite | Hasil |
|---|---|
| `scripts/m8-e2e.mjs` | **PASS — 321 passed, 0 failed** (naik dari 277 setelah ronde Ulasan; §10.6 masih mencatat 226 sebelum ronde itu) |
| `scripts/m4-e2e.mjs` | **PASS — 56 passed, 0 failed** |
| `scripts/m5-e2e.mjs` | **PASS — 49 passed, 0 failed** |
| `scripts/m6-m7-e2e.mjs` | **PASS — 80 passed, 0 failed** |

Typecheck bersih: `cd backend && npx tsc --noEmit` dan `cd frontend && npx tsc --noEmit` (exit 0).

Cek yang menegakkan dua sisi:

- **Pencarian**: `q` kosong/1 huruf → `400`; `limit=100` → `400`; sebagai pembeli → `403`. Produk
  ditemukan lewat nama **dan** lewat SKU, dan baris yang dikembalikan dibandingkan dengan
  `GET /products/:id` — nama dan kategorinya harus sama dengan yang dibaca halaman Produk.
- **Tidak ada objek di tempat teks**: semua baris produk harus punya `name`/`category` bertipe
  string, dan setiap baris pesanan/pelanggan hanya memuat field yang bisa dicetak.
- **Lonceng**: satu order baru menaikkan hitungan belum dibaca admin; barisnya bertipe
  `ORDER_CREATED`, masih belum dibaca, dan membawa `meta.orderId`; baris itu **tidak** muncul di
  feed pembeli, sementara pembeli punya barisnya sendiri untuk order yang sama; pengguna lain
  tidak bisa menandai baris itu dibaca (`404`); `read-all` mengosongkan hitungan.
- **Pembayaran gagal**: webhook `payment.failed` yang ditandatangani memunculkan baris
  `PAYMENT_FAILED` di feed admin untuk order itu, dan pesanannya **tetap `PENDING`** — bukan
  dibatalkan diam-diam, karena pembeli masih boleh mencoba metode lain selama hold-nya hidup.

Verifikasi lewat antarmuka (browser, frontend `:3000`, backend `:3002`):

1. Login sebagai admin → lonceng menampilkan **1** belum dibaca untuk order yang baru dibuat.
2. Buka lonceng → daftar berisi `Pesanan baru`, `Ulasan menunggu`, `Stok menipis` dengan waktu,
   isi, dan penanda belum dibaca.
3. Klik baris pesanan → pindah ke `/admin/orders?focus=<id>`, panel detail terbuka, dan hitungan
   belum dibaca kembali ke 0.
4. `Ctrl+K` → palette terbuka; kotak kosong menampilkan pintasan halaman. Ketik `sandal` → grup
   **Produk** menampilkan `Sandal Anak Karakter · Stok 78 · Rp 99.000 · Sepatu Anak`. `Enter` →
   `/admin/products?focus=cmuyapkwj0…` dengan form **Ubah produk** terisi produk itu.
5. Ketik `user@example.com` → grup **Pesanan** (5 baris, dibatasi limit) dan **Pelanggan**;
   `ArrowDown` memindahkan baris aktif; `Esc` menutup palette tanpa berpindah halaman.
6. Tombol `Cari… Ctrl+K` di header membuka palette yang sama, langsung fokus ke kotak, dan
   **mulai dari kosong** — termasuk saat dibuka lagi setelah `Esc`, sehingga tidak ada hasil untuk
   teks yang sudah tidak diketik.
7. `/admin/customers?focus=<id>` → panel detail terbuka (Total pesanan 5, dibayar 3, dibatalkan 1,
   total belanja terkumpul Rp 297.000) dengan riwayat pesanannya.

Catatan: langkah 4 awalnya menampilkan `[object Object]` — itu yang menemukan bug §11.2 poin 4.

### 11.7 Yang belum dikerjakan setelah ronde ini

1. **TanStack Query** belum dipakai; halaman admin masih `useEffect` + `apiClient`, termasuk
   komponen baru di ronde ini.
2. **Ulasan belum punya tautan per baris**: feed membawa `meta.reviewId`, tetapi layar Ulasan
   belum punya `?focus=<id>`, jadi barisnya baru menuju antrean moderasi.
3. **Lonceng belum punya penanda "sudah dibaca" per jenis** (mis. bisukan `LOW_STOCK`) dan belum
   ada halaman daftar penuh — panel menampilkan maksimal 100 baris terbaru.
4. **`LOW_STOCK` masih level produk, bukan level SKU.** Ditemukan saat menguji jalur lonceng →
   halaman Produk: menurunkan `SA-003-BIR-30` sampai sisa **1** unit tidak memunculkan alert apa
   pun, karena `lowStock()` menyaring `Product.stock`, dan sejak M10 angka itu adalah jumlah
   seluruh SKU. Selama totalnya sehat, satu SKU yang hampir habis tidak terlihat di panel
   *Stok menipis* maupun di lonceng. Ini utang nyata dari M10 yang belum ditutup: memperbaikinya
   mengubah bentuk `lowStock()` beserta tiga pembacanya (`/inventory/low-stock`,
   `/admin/inventory?lowOnly`, KPI ringkasan) dan cek di suite M6–M7/M8.
5. Utang lama yang belum tersentuh: upload file gambar, format mata uang storefront yang masih
   campur, dan audit log aksi admin.
