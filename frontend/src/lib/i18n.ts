'use client'

/**
 * Static i18n layer for the storefront.
 *
 * Right now this covers only Indonesian and English. The intent is to keep the
 * first pass small and deployable now: one place that owns every UI string we
 * localize, a tiny context that holds the active locale, and a persisted
 * preference in localStorage. Later, if we want real i18n (per-locale pages,
 * server components, SEO hreflang), this map can be turned into proper locale
 * files without replacing the UI code that already consumes it.
 */

export type Locale = 'id' | 'en'

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'en', label: 'English' },
]

export const DEFAULT_LOCALE: Locale = 'id'

export const STORAGE_KEY = 'megaMart.locale'

let cachedLocale: Locale | null = null

function currentBrowserLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE

  const nav = window.navigator
  const raw = nav.language || ''
  const primary = raw.split('-')[0].toLowerCase()

  if (primary === 'id') return 'id'
  if (primary === 'en') return 'en'

  return DEFAULT_LOCALE
}

export function loadLocale(): Locale {
  if (cachedLocale) return cachedLocale

  if (typeof window === 'undefined') {
    cachedLocale = DEFAULT_LOCALE
    return cachedLocale
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'id' || stored === 'en') {
      cachedLocale = stored
      return cachedLocale
    }
  } catch {
    // localStorage may be blocked in rare embedding situations.
  }

  cachedLocale = currentBrowserLocale()
  return cachedLocale
}

export function saveLocale(locale: Locale): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // ignore
  }
}

export function setLocale(locale: Locale): void {
  saveLocale(locale)
  cachedLocale = locale
  listeners.forEach((listener) => listener(locale))
}

const listeners = new Set<(locale: Locale) => void>()

export const localeStore = {
  subscribe(listener: (locale: Locale) => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

/** Centralized static label map. Add new UI strings here, never inline them. */
export const I18N = {
  topbar: {
    welcome: { id: 'Selamat datang di OUTFITX', en: 'Welcome to OUTFITX' },
    allOffers: { id: 'Semua Promo', en: 'All Offers' },
    language: { id: 'Ganti bahasa', en: 'Switch language' },
  },
  header: {
    searchPlaceholder: { id: 'Cari baju, sepatu, aksesoris…', en: 'Search clothes, shoes, accessories…' },
    signIn: { id: 'Masuk / Daftar', en: 'Sign in / Sign up' },
    orders: { id: 'Pesanan', en: 'Orders' },
    signOut: { id: 'Keluar', en: 'Sign out' },
    admin: { id: 'Admin', en: 'Admin' },
    menuOpen: { id: 'Buka menu', en: 'Open menu' },
    menuClose: { id: 'Tutup menu', en: 'Close menu' },
    allProductsDrawer: { id: 'Semua Produk', en: 'All Products' },
    myOrdersDrawer: { id: 'Pesanan Saya', en: 'My Orders' },
    adminDashboardDrawer: { id: 'Dashboard Admin', en: 'Admin Dashboard' },
  },
  categories: {
    allProducts: { id: 'Semua Produk', en: 'All Products' },
    viewAll: { id: 'Lihat Semua', en: 'View All' },
  },
  bestSellers: {
    title: { id: 'Produk Terlaris', en: 'Best Sellers' },
  },
  cart: {
    cart: { id: 'Keranjang', en: 'Cart' },
    cartCount: { id: '{count} barang', en: '{count} items' },
  },
  orders: {
    myOrders: { id: 'Pesanan Saya', en: 'My Orders' },
    orderPlaced: { id: 'Pesanan berhasil dibuat!', en: 'Order placed!' },
    status: { id: 'Status', en: 'Status' },
    subtotal: { id: 'Subtotal', en: 'Subtotal' },
    discount: { id: 'Diskon', en: 'Discount' },
    total: { id: 'Total', en: 'Total' },
    payNow: { id: 'Bayar sekarang', en: 'Pay now' },
    viewOrders: { id: 'Lihat pesanan saya', en: 'View my orders' },
    keepShopping: { id: 'Lanjut belanja', en: 'Keep shopping' },
    placeOrder: { id: 'Buat Pesanan', en: 'Place Order' },
    placingOrder: { id: 'Membuat pesanan…', en: 'Placing order…' },
    shippingAddress: { id: 'Alamat Pengiriman', en: 'Shipping Address' },
    newAddress: { id: '+ Alamat baru', en: '+ New address' },
    orderSummary: { id: 'Ringkasan Pesanan', en: 'Order Summary' },
    applyCoupon: { id: 'Terapkan', en: 'Apply' },
    removeCoupon: { id: 'Hapus', en: 'Remove' },
    cancelAddressForm: { id: 'Batal', en: 'Cancel' },
    noSavedAddress: { id: 'Belum ada alamat tersimpan — tambah satu untuk melanjutkan.', en: 'No saved address yet — add one to continue.' },
    orderItems: { id: 'Items:', en: 'Items:' },
    shipping: { id: 'Pengiriman:', en: 'Shipping:' },
    paidBefore: { id: 'Bayar sebelum', en: 'Pay before' },
    stockHeld: { id: 'Stok ditahan hingga batas waktu berakhir.', en: 'Stock held until expiry.' },
    batalPesanan: { id: 'Batalkan pesanan', en: 'Cancel order' },
    gagalMembatalkan: { id: 'Gagal membatalkan pesanan', en: 'Failed to cancel order' },
    berhasilBayar: { id: 'Pembayaran berhasil dikonfirmasi. Mengalihkan…', en: 'Payment confirmed. Redirecting…' },
    gagalBayar: { id: 'Pembayaran gagal. Coba lagi.', en: 'Payment failed. Try again.' },
    redirectToOrders: { id: 'Mengalihkan ke pesanan…', en: 'Redirecting to orders…' },
    editingPayment: { id: 'Memproses…', en: 'Processing…' },
  },
  product: {
    available: { id: 'Tersedia', en: 'Available' },
    soldOut: { id: 'Stok habis', en: 'Sold out' },
    category: { id: 'Kategori', en: 'Category' },
    heldForPending: { id: '{held} unit ditahan untuk pesanan yang belum dibayar', en: '{held} units held for unpaid orders' },
    productNotFound: { id: 'Produk tidak ditemukan', en: 'Product not found' },
    loading: { id: 'Memuat…', en: 'Loading…' },
    addToCart: { id: 'Tambah ke Keranjang', en: 'Add to cart' },
    wishlisted: { id: 'Wishlisted', en: 'Wishlisted' },
    wishlist: { id: 'Wishlist', en: 'Wishlist' },
    goToCheckout: { id: 'Lanjut ke checkout', en: 'Go to checkout' },
    quantity: { id: 'Jumlah', en: 'Quantity' },
    addedToCart: { id: 'Added {qty} × {name} ke keranjang', en: 'Added {qty} × {name} to cart' },
    couldNotAddToCart: { id: 'Tidak bisa menambah ke keranjang', en: 'Could not add to cart' },
    pleaseSignInToAddToCart: { id: 'Harap masuk untuk menambah item ke keranjang.', en: 'Please sign in to add items to your cart.' },
    pleaseSignInToUseWishlist: { id: 'Harap masuk untuk menggunakan wishlist Anda.', en: 'Please sign in to use your wishlist.' },
  },
  checkout: {
    checkout: { id: 'Checkout', en: 'Checkout' },
    couldNotLoadCart: { id: 'Tidak bisa memuat keranjang Anda', en: 'Could not load your cart' },
    couldNotPlaceOrder: { id: 'Gagal membuat pesanan', en: 'Checkout failed' },
    couldNotSaveAddress: { id: 'Tidak bisa menyimpan alamat', en: 'Could not save the address' },
    couldNotStartPayment: { id: 'Tidak bisa memulai pembayaran', en: 'Tidak bisa memulai pembayaran' },
    cartChangedCoupon: { id: 'Keranjang berubah — terapkan kupon lagi.', en: 'Cart changed — please apply the coupon again.' },
    couponApplied: (coupon: string, discount: number) => ({
      id: `${coupon} diterapkan — Anda menghemat ${discount}`,
      en: `${coupon} applied — you save ${discount}`,
    }),
    invalidCoupon: { id: 'Kupon tidak valid', en: 'Invalid coupon' },
    subtotalLabel: { id: 'Subtotal ({count} barang)', en: 'Subtotal ({count} items)' },
    discountLabel: (code: string) => ({
      id: `Diskon${code ? ` (${code})` : ''}: -{value}`,
      en: `Discount${code ? ` (${code})` : ''}: -{value}`,
    }),
    totalLabel: { id: 'Total', en: 'Total' },
    recipient: { id: 'Nama penerima', en: 'Recipient name' },
    phone: { id: 'Telepon', en: 'Phone' },
    street: { id: 'Alamat', en: 'Street address' },
    city: { id: 'Kota', en: 'City' },
    postalCode: { id: 'Kode pos', en: 'Postal code' },
    saveAddress: { id: 'Simpan alamat', en: 'Save address' },
    noAddressYet: { id: 'Belum ada alamat tersimpan — tambahkan untuk melanjutkan.', en: 'No saved address yet — add one to continue.' },
    defaultAddress: { id: 'default', en: 'default' },
    bannerPaymentTitle: { id: 'Pesanan berhasil dibuat!', en: 'Order placed!' },
    orderIdLine: (id: string) => ({ id: `Order ID: ${id}`, en: `Order ID: ${id}` }),
    statusLine: { id: 'Status: {status}', en: 'Status: {status}' },
    payBeforeExpires: { id: 'Stok sudah ditahan untuk pesanan ini. Selesaikan pembayaran sebelum {when}.', en: 'Stock is held for this order. Complete payment before {when}.' },
  },
  footer: {
    contactUs: { id: 'Hubungi Kami', en: 'Contact Us' },
    downloadApp: { id: 'Unduh Aplikasi', en: 'Download App' },
    popularCategories: { id: 'Kategori Paling Populer', en: 'Most Popular Categories' },
    customerServices: { id: 'Layanan Pelanggan', en: 'Customer Services' },
  },
  admin: {
    dashboard: { id: 'Dashboard Admin', en: 'Admin Dashboard' },
  },
} as const

export type I18nRow = { id: string; en: string }

export function t(
  section: keyof typeof I18N,
  key?: string,
  locale?: Locale,
): string {
  const resolvedLocale = locale ?? loadLocale()
  const sectionRow = I18N[section]

  if (key) {
    const row = (sectionRow as Record<string, unknown>)[key]
    if (isI18nRow(row)) {
      return row[resolvedLocale]
    }
  } else if (isI18nRow(sectionRow)) {
    return sectionRow[resolvedLocale]
  }

  console.warn(`i18n missing key: ${String(section)}${key ? `.${key}` : ''}`)
  return ''
}

function isI18nRow(value: unknown): value is I18nRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'en' in value &&
    typeof (value as I18nRow).id === 'string' &&
    typeof (value as I18nRow).en === 'string'
  )
}

/** Replace named placeholders like {count}, {value}, {when} with a safe fallback. */
export function formatI18n(message: string, vars: Record<string, string | number | undefined>): string {
  return message.replace(/\{(\w+)\}/g, (_, name) => {
    const value = vars[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : `{$ {name}}`
  })
}
