/**
 * Demo data for the OrbynAdmin-style e-commerce admin screens.
 *
 * This file exists purely so the ported UI looks complete while the layout is
 * being brought over. Nothing here is wired to the API yet — when the
 * functionality round happens, replace these constants with the real
 * `/admin/*` endpoints and delete this file.
 */

export interface Kpi {
  label: string
  value: string
  delta: number
  caption: string
}

export const ecommerceKpis: Kpi[] = [
  { label: 'Penjualan Bruto', value: 'Rp 52.420.000', delta: 14.2, caption: 'bulan ini' },
  { label: 'Pesanan', value: '612', delta: 9.7, caption: 'bulan ini' },
  { label: 'Rata-rata Nilai Pesanan', value: 'Rp 85.650', delta: 2.3, caption: 'bulan ini' },
  { label: 'Refund', value: 'Rp 1.240.000', delta: -1.1, caption: 'bulan ini' },
]

export const revenueMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** Two series so the chart matches the template's "Revenue & Profit" panel. */
export const revenueSeries = [
  {
    name: 'Pendapatan',
    color: '#2563eb',
    values: [18200000, 19600000, 18800000, 23400000, 29600000, 31200000, 27400000, 34100000, 37800000, 36200000, 41900000, 46800000],
  },
  {
    name: 'Laba',
    color: '#10b981',
    values: [5600000, 6100000, 5900000, 7200000, 9100000, 9800000, 8600000, 10400000, 11800000, 11200000, 13100000, 14600000],
  },
]

export const salesByCategory = [
  { name: 'Baju Wanita', value: 46800 },
  { name: 'Sepatu Pria', value: 38200 },
  { name: 'Baju Pria', value: 32100 },
  { name: 'Sepatu Wanita', value: 24900 },
  { name: 'Aksesoris', value: 15400 },
]

export const recentOrders = [
  { id: 'ORD-24081', customer: 'Rani Kusuma', date: '09 Okt 2026, 09:24', items: 3, total: 748000, status: 'PAID' },
  { id: 'ORD-24080', customer: 'Bagus Prasetyo', date: '09 Okt 2026, 08:11', items: 1, total: 229000, status: 'PENDING' },
  { id: 'ORD-24079', customer: 'Siti Nurhaliza', date: '08 Okt 2026, 21:47', items: 2, total: 518000, status: 'SHIPPED' },
  { id: 'ORD-24078', customer: 'Andi Wijaya', date: '08 Okt 2026, 18:02', items: 5, total: 1240000, status: 'DELIVERED' },
  { id: 'ORD-24077', customer: 'Melati Anggraini', date: '08 Okt 2026, 15:36', items: 2, total: 398000, status: 'CANCELLED' },
]

export const topProducts = [
  { name: 'Sepatu Sekolah Anak', sold: 184, revenue: 42136000 },
  { name: 'Sneakers Pria Low Top', sold: 151, revenue: 69309000 },
  { name: 'Blouse Linen Wanita', sold: 138, revenue: 26082000 },
  { name: 'Hoodie Fleece', sold: 122, revenue: 35258000 },
  { name: 'Sandal Anak Karakter', sold: 97, revenue: 9603000 },
]

export const adminShipments = [
  { id: 'SHP-1084', order: 'ORD-24081', courier: 'JNE Reguler', destination: 'Bandung', eta: '11 Okt 2026', status: 'Dalam perjalanan' },
  { id: 'SHP-1083', order: 'ORD-24079', courier: 'SiCepat Halu', destination: 'Surabaya', eta: '10 Okt 2026', status: 'Dikirim' },
  { id: 'SHP-1082', order: 'ORD-24078', courier: 'AnterAja', destination: 'Jakarta', eta: '08 Okt 2026', status: 'Terkirim' },
  { id: 'SHP-1081', order: 'ORD-24076', courier: 'JNE YES', destination: 'Denpasar', eta: '12 Okt 2026', status: 'Menunggu pickup' },
]

export type AdminReviewStatus = 'Terbit' | 'Menunggu' | 'Dilaporkan'

export interface AdminReview {
  id: string
  author: string
  product: string
  rating: number
  title: string
  body: string
  date: string
  status: AdminReviewStatus
  reply?: string
}

export const adminReviews: AdminReview[] = [
  {
    id: 'REV-5001',
    author: 'Rani Kusuma',
    product: 'Sandal Anak Karakter',
    rating: 5,
    title: 'Anak saya suka sekali',
    body: 'Bahannya adem dan jahitannya rapi. Ukuran pas di kaki anak saya, tidak melepuh walaupun dipakai seharian di sekolah.',
    date: '09 Okt 2026',
    status: 'Terbit',
    reply: 'Terima kasih banyak, Bu Rani! Senang sandalnya cocok.',
  },
  {
    id: 'REV-5002',
    author: 'Bagus Prasetyo',
    product: 'Sepatu Sekolah Anak',
    rating: 4,
    title: 'Bagus, tapi agak kaku',
    body: 'Kualitas sol tebal dan tidak licin. Baru dipakai dua minggu masih terasa kaku, semoga makin lentur.',
    date: '08 Okt 2026',
    status: 'Terbit',
  },
  {
    id: 'REV-5003',
    author: 'Siti Nurhaliza',
    product: 'Heels Wanita 5cm',
    rating: 5,
    title: 'Nyaman dipakai seharian',
    body: 'Tingginya pas untuk kerja kantor, tidak bikin pegal. Warnanya persis seperti di foto.',
    date: '08 Okt 2026',
    status: 'Terbit',
  },
  {
    id: 'REV-5004',
    author: 'Andi Wijaya',
    product: 'Flat Shoes Wanita',
    rating: 2,
    title: 'Ukurannya kekecilan',
    body: 'Saya pesan sesuai tabel ukuran tapi mepet. Untung proses tukar ukurannya cepat, tapi repot juga.',
    date: '07 Okt 2026',
    status: 'Menunggu',
  },
  {
    id: 'REV-5005',
    author: 'Melati Anggraini',
    product: 'Sneakers Wanita Chunky',
    rating: 5,
    title: 'Langganan banget',
    body: 'Sudah ketiga kali beli di sini. Packing aman, barang original, dan sampai lebih cepat dari estimasi.',
    date: '07 Okt 2026',
    status: 'Terbit',
    reply: 'Makasih kembali, Kak Melati! Sampai jumpa di pesanan berikutnya.',
  },
  {
    id: 'REV-5006',
    author: 'Dimas Saputra',
    product: 'Sepatu Sneakers Anak',
    rating: 1,
    title: 'Sepatu robek di jahitan',
    body: 'Baru dipakai sehari jahitan samping sudah terbuka. Kecewa sekali, mohon ditindaklanjuti.',
    date: '06 Okt 2026',
    status: 'Dilaporkan',
  },
  {
    id: 'REV-5007',
    author: 'Nadia Putri',
    product: 'Sandal Anak Karakter',
    rating: 4,
    title: 'Lucu dan ringan',
    body: 'Motifnya lucu-lucu, anak saya pilih sendiri. Kurang lebih setengah nomor, sebaiknya tambah setengah ukuran.',
    date: '05 Okt 2026',
    status: 'Terbit',
  },
  {
    id: 'REV-5008',
    author: 'Fajar Ramadhan',
    product: 'Sepatu Sekolah Anak',
    rating: 3,
    title: 'Lumayan untuk harga segitu',
    body: 'Sebanding dengan harganya, tapi warna putihnya cepat kotor. Mudah dibersihkan sih.',
    date: '04 Okt 2026',
    status: 'Menunggu',
  },
]
