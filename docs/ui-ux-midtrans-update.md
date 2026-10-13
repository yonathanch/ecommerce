# Laporan Pekerjaan: Mobile-Friendly + Polish Admin + Midtrans

Status: **selesai diimplementasikan & terverifikasi** (belum di-commit).

| Suite | Hasil (dijalankan setelah semua perubahan) |
|---|---|
| `scripts/m4-e2e.mjs` | **PASS — 46 passed, 0 failed** |
| `scripts/m5-e2e.mjs` | **PASS — 49 passed, 0 failed** |
| `scripts/m6-m7-e2e.mjs` | **PASS — 75 passed, 0 failed** |
| `scripts/m8-e2e.mjs` | **PASS — 71 passed, 0 failed** |

---

## 1. Hamburger di desktop dihapus

[Header.tsx](frontend/src/app/components/Header.tsx) — tombol hamburger sekarang `lg:hidden` (hilang di desktop,
ada di tablet/ponsel). Verifikasi di browser: lebar 1440 → `burgerHidden: true`; lebar 390 → terlihat dan
membuka drawer yang berfungsi (backdrop, tombol X, tautan "Semua Produk / Pesanan Saya / Dashboard Admin / Keluar").

## 2. Mobile-friendly storefront

Pencarian viewport 390px menunjukkan dulu masalah nyata: TopBar menumpuk jadi 3 baris teks yang tumpang-tindih,
dan `body` sempat meluber 17px. Yang diperbaiki:

- **[TopBar.tsx](frontend/src/app/components/TopBar.tsx)** — teks "Selamat datang…" disembunyikan di ponsel,
  tiga tautan memakai label pendek (`423651 · Pesanan · Promo`), semuanya satu baris, tidak pernah membungkus.
- **[Header.tsx](frontend/src/app/components/Header.tsx)** — baris pencarian kedua khusus ponsel
  (`placeholder "Cari baju, sepatu, aksesoris…"`, pengganti teks groceries lama); pencarian Enter langsung ke
  `/products?search=…`. Hamburger sekarang membuka drawer sungguhan (sebelumnya tombol mati).
- **[ProductList.tsx](frontend/src/app/products/ProductList.tsx)** — grid produk 2 kolom di ponsel
  (sebelumnya 1 kolom kartu raksasa), chip kategori scroll menyamping (tidak menumpuk 2 baris), teks
  di Indonesia ("Semua Produk", "28 produk tersedia", "Urutkan / Nama / Termurah / Semua").
- **[products/[id]/page.tsx](frontend/src/app/products/[id]/page.tsx)** — foto produk kotak penuh lebar
  di ponsel, harga **Rupiah** (`Rp 259.000`, bukan `$2,590.00`), tombol beli melebar penuh ("Tambah ke
  Keranjang"), label wishlist/dirikan tetap reachable.
- **[ProductCard.tsx](frontend/src/app/products/ProductCard.tsx)** — **diskon palsu dihapus** (dulu persen
  diskon dihitung dari hash nama produk lalu harga "asli" diciptakan dari situ — 56% OFF / Save - ₹66.405
  semuanya karangan). Kartu memakai foto katalog asli per varian; fallback placeholder dikunci per kategori
  agar kartu tidak menampilkan foto gunung/gedung acak yang tidak nyambung. Badge "Stok habis" untuk
  ketersediaan 0, indikator "sisa N" untuk stok menipis.

Verifikasi mobile (viewport 390px): `/products`, detail produk, `/checkout`, dan `/orders` semuanya
`scrollWidth ≤ innerWidth` (tidak ada scroll horizontal); kartu menampilkan harga Rp dan foto katalog.

## 3. UI/UX halaman admin

- **[admin/layout.tsx](frontend/src/app/admin/layout.tsx)** — di ponsel sidebar berubah menjadi tab
  horizontal yang bisa digeser (Ringkasan · Pesanan · Produk · Inventori · Pelanggan); sidebar asli kembali
  dari `md` ke atas. Header ringkas dengan tombol berbingkai. **Akar masalah "halaman admin meluber di
  ponsel" ditemukan dan dibereskan**: tabel lebar menarik `scrollWidth` halaman sampai 697px di viewport
  390px; sekarang `overflow-x-hidden` di shell + tabel di dalam kontainer scroll sendiri, halaman tidak
  pernah bergeser (verifikasi: `bodyOverflow −17`, tabel Inventori tetap bisa digeser ke samping).
- **Tabel admin** (orders, customers, products, inventory + ledger) — masing-masing diberi `min-w` dan
  dibungkus `overflow-x-auto`, jadi di ponsel tabel digeser, bukan memecah layout.
- Halaman tetap memakai pola yang sudah ada (kartu metrik, panel detail, form penyesuaian) — tidak ada
  perubahan fungsional, hanya tata letak dan sentuhan konsistensi.

## 4. Midtrans Snap (sandbox gratis)

- Provider baru [midtrans.provider.ts](backend/src/payments/providers/midtrans.provider.ts) mengikuti
  kontrak `PaymentProvider` yang ada — orders/inventory/webhook pipeline tidak diubah sama sekali.
- `createCharge` memanggil Snap API (`/v1/transactions`, Basic Auth `ServerKey:`, timeout 15 dtk) dan
  mengembalikan `redirect_url` ke halaman pembayaran Midtrans; `providerRef` = Snap token.
- **Webhook**: notifikasi Midtrans diverifikasi dengan `signature_key = sha512(order_id + status_code +
  gross_amount + serverKey)` (constant-time compare), dipetakan ke event normal
  (`settlement/capture → captured`, `deny/cancel → failed`, `expire → expired`, `fraud_status=challenge → failed`),
  lalu masuk ke pipeline idempoten yang sama (potong stok, notifikasi, dsb).
- **Sandbox adalah default** (`MIDTRANS_IS_PRODUCTION=false`) sehingga akun gratis cukup untuk demo;
  `.env.example` berisi contoh kunci, dan `.env` menyiapkan blok komentar untuk diisi.
- Aktifkan dengan mengganti `PAYMENT_PROVIDER=mock` → `midtrans` + mengisi dua kunci sandbox dari
  dashboard.sandbox.midtrans.com, lalu daftarkan Notification URL `<base-url>/api/payments/webhook`
  di dashboard Midtrans. Boot tetap gagal cepat bila provider tidak dikenal.
- Karena kunci sandbox belum tersedia, integrasi ini **belum diuji end-to-end dengan Midtrans sungguhan**;
  yang sudah diverifikasi: build tervaidasi, server boot normal dengan provider `mock`, dan keempat suite
  tetap hijau (46/49/75/71) — artinya pipeline yang dipakai Midtrans tidak regressed. Mock tetap default
  agar demo lokal tetap jalan tanpa kunci.

## 5. File diubah/dibuat

Frontend: `components/Header.tsx`, `components/TopBar.tsx`, `products/ProductCard.tsx`,
`products/ProductList.tsx`, `products/[id]/page.tsx`, `admin/layout.tsx`,
`admin/{orders,products,inventory,customers}/page.tsx` (tabel scroll).

Backend: `payments/providers/midtrans.provider.ts` (baru), `payments/payments.module.ts`,
`.env.example`, `.env` (blok komentar Midtrans).

## 6. Yang belum / langkah lanjut

1. Uji nyata Midtrans sandbox butuh kunci dari Anda (Server + Client key) — tinggal isi `.env`, tanpa ubah kode.
2. Home page masih memuat section template (hero "Smartphones", brand IPHONE/REALME, Daily Essentials
   fruits/vegetables) dan Footer masih kategori lama + `₹` — belum disentuh di ronde ini.
3. Stok level varian masih belum di-reserve/di-deduct di jalur penjualan (utang M7 yang sudah dicatat).
4. M4–M8 + perubahan ronde ini masih belum di-commit.
