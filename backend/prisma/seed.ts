import { PrismaClient, Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

/**
 * Single-vendor fashion catalog.
 *
 * Variants are generated from color × size so every purchasable combination
 * gets its own unique SKU (e.g. BW-BLS-001-HIT-M) as required by the catalog
 * spec. Images are deterministic placeholders — swap the url values for real
 * product photography before launch.
 */
interface ProductSeed {
  name: string
  description: string
  price: number
  colors: string[]
  sizes: string[]
  /** Stock per generated variant; keep a few low so low-stock alerts are testable. */
  stock: number
  weight: number
  /** Optional price override for specific sizes (e.g. XL costs more). */
  sizePriceDelta?: Record<string, number>
}

interface CategorySeed {
  name: string
  slug: string
  skuPrefix: string
  products: ProductSeed[]
}

const CATALOG: CategorySeed[] = [
  {
    name: 'Baju Wanita',
    slug: 'baju-wanita',
    skuPrefix: 'BW',
    products: [
      {
        name: 'Blouse Linen Wanita',
        description: 'Blouse linen lengan panjang, bahan adem dan jatuh, cocok untuk kerja maupun kasual.',
        price: 189000,
        colors: ['Hitam', 'Dusty Rose', 'Putih'],
        sizes: ['S', 'M', 'L', 'XL'],
        stock: 8,
        weight: 300,
        sizePriceDelta: { XL: 20000 },
      },
      {
        name: 'Dress Midi Rayon Wanita',
        description: 'Dress midi potongan A-line dengan kancing depan, motif polos dan mudah dipadupadankan.',
        price: 329000,
        colors: ['Navy', 'Maroon'],
        sizes: ['S', 'M', 'L'],
        stock: 6,
        weight: 400,
      },
      {
        name: 'Kemeja Oversize Wanita',
        description: 'Kemeja oversize lengan panjang dengan kerah klasik, siluet longgar yang nyaman.',
        price: 219000,
        colors: ['Putih', 'Biru Muda'],
        sizes: ['S', 'M', 'L', 'XL'],
        stock: 3,
        weight: 320,
      },
      {
        name: 'Kaos Basic Cotton Wanita',
        description: 'Kaos katun combed 30s, potongan regular fit untuk pemakaian sehari-hari.',
        price: 99000,
        colors: ['Hitam', 'Putih', 'Abu'],
        sizes: ['S', 'M', 'L'],
        stock: 20,
        weight: 180,
      },
    ],
  },
  {
    name: 'Baju Pria',
    slug: 'baju-pria',
    skuPrefix: 'BP',
    products: [
      {
        name: 'Kemeja Formal Pria',
        description: 'Kemeja formal lengan panjang bahan katun poplin, cocok untuk kantor dan acara resmi.',
        price: 249000,
        colors: ['Putih', 'Biru', 'Hitam'],
        sizes: ['M', 'L', 'XL', 'XXL'],
        stock: 10,
        weight: 350,
        sizePriceDelta: { XXL: 30000 },
      },
      {
        name: 'Kaos Polo Pria',
        description: 'Polo shirt lacoste cotton dengan kerah rajut, adem dan tidak mudah kusut.',
        price: 179000,
        colors: ['Navy', 'Hijau Army'],
        sizes: ['M', 'L', 'XL'],
        stock: 12,
        weight: 280,
      },
      {
        name: 'Kaos Oversize Pria',
        description: 'Kaos oversize katun heavyweight 24s dengan jahitan rantai di bagian bawah.',
        price: 119000,
        colors: ['Hitam', 'Abu Muda', 'Cream'],
        sizes: ['M', 'L', 'XL'],
        stock: 15,
        weight: 240,
      },
      {
        name: 'Celana Chino Pria',
        description: 'Celana chino slim fit bahan stretch, nyaman dipakai seharian.',
        price: 279000,
        colors: ['Khaki', 'Hitam'],
        sizes: ['30', '32', '34', '36'],
        stock: 9,
        weight: 450,
      },
    ],
  },
  {
    name: 'Baju Anak',
    slug: 'baju-anak',
    skuPrefix: 'BA',
    products: [
      {
        name: 'Kaos Anak Karakter',
        description: 'Kaos anak katun lembut dengan sablon ramah kulit, tersedia untuk balita dan anak.',
        price: 79000,
        colors: ['Biru', 'Merah', 'Kuning'],
        sizes: ['2-3Y', '4-5Y', '6-7Y'],
        stock: 18,
        weight: 120,
      },
      {
        name: 'Dress Anak Perempuan',
        description: 'Dress anak perempuan dengan rok span dan pita pinggang, bahan katun nyaman.',
        price: 149000,
        colors: ['Pink', 'Lavender'],
        sizes: ['2-3Y', '4-5Y', '6-7Y'],
        stock: 7,
        weight: 200,
      },
      {
        name: 'Setelan Piyama Anak',
        description: 'Setelan piyama dua potong bahan katun rayon, dingin dipakai saat tidur.',
        price: 129000,
        colors: ['Biru Muda', 'Pink'],
        sizes: ['2-3Y', '4-5Y'],
        stock: 5,
        weight: 220,
      },
    ],
  },
  {
    name: 'Aksesoris',
    slug: 'aksesoris',
    skuPrefix: 'AK',
    products: [
      {
        name: 'Topi Baseball Kanvas',
        description: 'Topi baseball kanvas dengan strap adjustable, satu ukuran untuk semua.',
        price: 89000,
        colors: ['Hitam', 'Cream', 'Navy'],
        sizes: ['ALLSIZE'],
        stock: 25,
        weight: 150,
      },
      {
        name: 'Tas Tote Kanvas',
        description: 'Tote bag kanvas tebal dengan kantong dalam, muat laptop 14 inci.',
        price: 149000,
        colors: ['Natural', 'Hitam'],
        sizes: ['ALLSIZE'],
        stock: 14,
        weight: 400,
      },
      {
        name: 'Ikat Pinggang Kulit Sintetis',
        description: 'Ikat pinggang kulit sintetis dengan buckle metal, cocok untuk formal maupun kasual.',
        price: 99000,
        colors: ['Hitam', 'Coklat'],
        sizes: ['M', 'L'],
        stock: 4,
        weight: 250,
      },
      {
        name: 'Syal Rajut',
        description: 'Syal rajut lembut, hangat untuk cuaca dingin dan mudah dipadukan.',
        price: 119000,
        colors: ['Maroon', 'Abu', 'Hijau'],
        sizes: ['ALLSIZE'],
        stock: 11,
        weight: 220,
      },
    ],
  },
  {
    name: 'Sweater & Jacket',
    slug: 'sweater-jacket',
    skuPrefix: 'SW',
    products: [
      {
        name: 'Sweater Rajut Crewneck',
        description: 'Sweater rajut crewneck bahan acrylic-wool blend, hangat tanpa gerah.',
        price: 259000,
        colors: ['Abu', 'Navy', 'Cream'],
        sizes: ['M', 'L', 'XL'],
        stock: 8,
        weight: 500,
      },
      {
        name: 'Hoodie Fleece',
        description: 'Hoodie fleece tebal dengan kantong kanguru dan tali hoodie, unisex.',
        price: 289000,
        colors: ['Hitam', 'Abu Melange'],
        sizes: ['M', 'L', 'XL', 'XXL'],
        stock: 10,
        weight: 650,
      },
      {
        name: 'Jacket Bomber Pria',
        description: 'Jacket bomber dengan lining satin, rib di pergelangan dan pinggang.',
        price: 419000,
        colors: ['Hitam', 'Hijau Army'],
        sizes: ['M', 'L', 'XL'],
        stock: 2,
        weight: 700,
      },
      {
        name: 'Cardigan Rajut Wanita',
        description: 'Cardigan rajut panjang dengan saku depan, cocok untuk layering.',
        price: 239000,
        colors: ['Cream', 'Dusty Rose'],
        sizes: ['S', 'M', 'L'],
        stock: 9,
        weight: 420,
      },
    ],
  },
  {
    name: 'Sepatu Pria',
    slug: 'sepatu-pria',
    skuPrefix: 'SP',
    products: [
      {
        name: 'Sneakers Pria Low Top',
        description: 'Sneakers low top dengan sol karet anti-slip, ringan untuk pemakaian harian.',
        price: 459000,
        colors: ['Hitam', 'Putih'],
        sizes: ['40', '41', '42', '43'],
        stock: 6,
        weight: 800,
      },
      {
        name: 'Sepatu Formal Pria Kulit',
        description: 'Sepatu formal pria bahan kulit sintetis premium dengan sol tipis.',
        price: 579000,
        colors: ['Hitam', 'Coklat Tua'],
        sizes: ['40', '41', '42', '43', '44'],
        stock: 5,
        weight: 900,
      },
      {
        name: 'Sepatu Running Pria',
        description: 'Sepatu running dengan midsole EVA, breathable mesh upper.',
        price: 649000,
        colors: ['Hitam Merah', 'Biru'],
        sizes: ['40', '41', '42', '43'],
        stock: 8,
        weight: 700,
      },
    ],
  },
  {
    name: 'Sepatu Wanita',
    slug: 'sepatu-wanita',
    skuPrefix: 'SWN',
    products: [
      {
        name: 'Sneakers Wanita Chunky',
        description: 'Sneakers chunky sole dengan aksen putih, menambah tinggi dan trendy.',
        price: 429000,
        colors: ['Putih', 'Cream'],
        sizes: ['36', '37', '38', '39'],
        stock: 7,
        weight: 720,
      },
      {
        name: 'Flat Shoes Wanita',
        description: 'Flat shoes dengan strap samping dan sol empuk, nyaman untuk kerja.',
        price: 329000,
        colors: ['Hitam', 'Nude'],
        sizes: ['36', '37', '38', '39'],
        stock: 3,
        weight: 500,
      },
      {
        name: 'Heels Wanita 5cm',
        description: 'Heels dengan tinggi 5 cm, bagian dalam dilapisi kulit sintetis lembut.',
        price: 379000,
        colors: ['Hitam', 'Maroon'],
        sizes: ['36', '37', '38'],
        stock: 4,
        weight: 550,
      },
    ],
  },
  {
    name: 'Sepatu Anak',
    slug: 'sepatu-anak',
    skuPrefix: 'SA',
    products: [
      {
        name: 'Sepatu Sneakers Anak',
        description: 'Sneakers anak dengan tali karet dan perekat, mudah dipakai sendiri.',
        price: 259000,
        colors: ['Biru', 'Pink'],
        sizes: ['26', '28', '30', '32'],
        stock: 9,
        weight: 400,
      },
      {
        name: 'Sepatu Sekolah Anak',
        description: 'Sepatu sekolah anak warna hitam, sol karet kuat untuk aktivitas harian.',
        price: 229000,
        colors: ['Hitam'],
        sizes: ['28', '30', '32', '34'],
        stock: 12,
        weight: 450,
      },
      {
        name: 'Sandal Anak Karakter',
        description: 'Sandal anak ringan dengan alas anti-slip dan desain karakter.',
        price: 99000,
        colors: ['Biru', 'Merah'],
        sizes: ['26', '28', '30'],
        stock: 16,
        weight: 250,
      },
    ],
  },
]

/** Fashion labels shown in the "Top Fashion Brands" section — each slug gets
 * its own page (/brands/<slug>) listing that label's products. */
const BRANDS = [
  { name: 'THREAD', slug: 'thread' },
  { name: 'VERSE', slug: 'verse' },
  { name: 'DISTRICT', slug: 'district' },
  { name: 'MOTION', slug: 'motion' },
  { name: 'FOUND', slug: 'found' },
]

/** "Dusty Rose" -> "DUS-ROS" keeps SKUs short but still readable. */
function colorCode(color: string): string {
  return color
    .split(/\s+/)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('-')
}

function buildVariants(category: CategorySeed, product: ProductSeed, index: number) {
  const variants: {
    sku: string
    options: Record<string, string>
    price: number
    stock: number
    weight: number
    imageUrl: string
  }[] = []

  product.colors.forEach((color) => {
    product.sizes.forEach((size) => {
      const sku = `${category.skuPrefix}-${String(index + 1).padStart(3, '0')}-${colorCode(color)}-${size}`
      const delta = product.sizePriceDelta?.[size] ?? 0
      variants.push({
        sku,
        options: { color, size },
        price: product.price + delta,
        // Vary stock a little so the catalog shows more than one availability level.
        stock: Math.max(1, product.stock - ((size.charCodeAt(0) + color.length) % 4)),
        weight: product.weight,
        imageUrl: `https://picsum.photos/seed/${sku.toLowerCase()}/800/800`,
      })
    })
  })

  return variants
}

async function main() {
  // ---------------------------------------------------------------- users
  const adminPassword = await bcrypt.hash('admin123', 10)
  const userPassword = await bcrypt.hash('user123', 10)

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: adminPassword,
      name: 'Admin',
      role: 'ADMIN',
    },
  })

  await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password: userPassword,
      name: 'Customer',
      role: 'CUSTOMER',
    },
  })

  // ----------------------------------------------------------- categories
  const categoryIds = new Map<string, string>()
  for (const category of CATALOG) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: { name: category.name, slug: category.slug },
    })
    categoryIds.set(category.slug, row.id)
  }

  // ------------------------------------------------------------- brands
  const brandIds = new Map<string, string>()
  for (const brand of BRANDS) {
    const row = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: { name: brand.name },
      create: brand,
    })
    brandIds.set(brand.slug, row.id)
  }

  // ------------------------------------------------------------- products
  const seededProductNames: string[] = []
  let variantCount = 0
  // Deterministic round-robin so every brand page has products and re-seeding
  // keeps the same label on the same product.
  let brandCursor = 0

  for (const category of CATALOG) {
    const categoryId = categoryIds.get(category.slug)!

    for (const [index, product] of category.products.entries()) {
      seededProductNames.push(product.name)

      const variants = buildVariants(category, product, index)
      const totalStock = variants.reduce((sum, v) => sum + v.stock, 0)
      const imageUrls = variants.slice(0, 3).map((v) => v.imageUrl)
      const brandId = brandIds.get(BRANDS[brandCursor % BRANDS.length].slug)!
      brandCursor++

      // Products have no natural unique key, so match on name to stay idempotent.
      const existing = await prisma.product.findFirst({ where: { name: product.name } })
      const productId =
        existing?.id ??
        (
          await prisma.product.create({
            data: {
              name: product.name,
              description: product.description,
              price: product.price,
              stock: totalStock,
              categoryId,
              brandId,
              images: {
                create: imageUrls.map((url, position) => ({
                  url,
                  alt: product.name,
                  position,
                })),
              },
            },
          })
        ).id

      if (existing) {
        await prisma.product.update({
          where: { id: productId },
          data: {
            description: product.description,
            price: product.price,
            stock: totalStock,
            categoryId,
            brandId,
          },
        })
      }

      for (const variant of variants) {
        await prisma.productVariant.upsert({
          where: { sku: variant.sku },
          update: {
            price: variant.price,
            stock: variant.stock,
            weight: variant.weight,
            options: variant.options as Prisma.InputJsonValue,
            imageUrl: variant.imageUrl,
          },
          create: {
            productId,
            sku: variant.sku,
            options: variant.options as Prisma.InputJsonValue,
            price: variant.price,
            stock: variant.stock,
            weight: variant.weight,
            imageUrl: variant.imageUrl,
          },
        })
        variantCount++
      }
    }
  }

  // Retire anything that is not part of the fashion catalog. Order history is
  // unaffected: OrderItem keeps its own name/price snapshot.
  const removed = await prisma.product.deleteMany({
    where: { name: { notIn: seededProductNames } },
  })
  const removedCategories = await prisma.category.deleteMany({
    where: { slug: { notIn: CATALOG.map((c) => c.slug) } },
  })

  // -------------------------------------------------------------- coupons
  const coupons = [
    {
      code: 'SUMMER20',
      type: 'PERCENT',
      value: 20,
      minPurchase: 200000,
      maxDiscount: 100000,
      usageLimit: 100,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
    {
      code: 'WELCOME50',
      type: 'FIXED',
      value: 50000,
      minPurchase: 300000,
      usageLimit: 50,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
    },
    {
      code: 'EXPIRED10',
      type: 'PERCENT',
      value: 10,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    },
  ]

  for (const coupon of coupons) {
    const { code, ...config } = coupon
    // Update on conflict: coupon rules are configuration, so re-seeding must
    // apply changes instead of silently keeping stale values.
    await prisma.coupon.upsert({
      where: { code },
      update: config,
      create: coupon,
    })
  }

  console.log(
    `✅ Seeded ${CATALOG.length} fashion categories, ${seededProductNames.length} products, ${variantCount} variants, ${BRANDS.length} brands, ${coupons.length} coupons (removed ${removed.count} legacy products, ${removedCategories.count} legacy categories)`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
