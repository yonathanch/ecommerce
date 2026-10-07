import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Users
  const adminPassword = await bcrypt.hash('admin123', 10)
  const userPassword = await bcrypt.hash('user123', 10)

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: adminPassword,
      name: 'Admin User',
      role: 'ADMIN',
    },
  })

  await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password: userPassword,
      name: 'John Doe',
      role: 'CUSTOMER',
    },
  })

  // Categories
  const categoryNames = [
    'Electronics',
    'Appliances',
    'Sports',
    'Home',
    'Accessories',
    'Furniture',
  ]
  const categories: Record<string, string> = {}
  for (const name of categoryNames) {
    const slug = name.toLowerCase()
    const cat = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, slug },
    })
    categories[name] = cat.id
  }

  // Products
  const products = [
    { name: 'Wireless Headphones', description: 'Noise-cancelling over-ear headphones', price: 199.99, stock: 50, category: 'Electronics' },
    { name: 'Mechanical Keyboard', description: 'RGB mechanical keyboard with blue switches', price: 129.99, stock: 30, category: 'Electronics' },
    { name: 'Coffee Maker', description: 'Programmable coffee machine', price: 89.99, stock: 40, category: 'Appliances' },
    { name: 'Smart Watch', description: 'Fitness tracking smartwatch', price: 249.99, stock: 25, category: 'Electronics' },
    { name: 'Running Shoes', description: 'Lightweight athletic running shoes', price: 79.99, stock: 100, category: 'Sports' },
    { name: 'Yoga Mat', description: 'Non-slip premium yoga mat', price: 29.99, stock: 80, category: 'Sports' },
    { name: 'Desk Lamp', description: 'LED desk lamp with adjustable brightness', price: 39.99, stock: 60, category: 'Home' },
    { name: 'Backpack', description: 'Water-resistant laptop backpack', price: 49.99, stock: 70, category: 'Accessories' },
    { name: 'Bluetooth Speaker', description: 'Portable waterproof speaker', price: 59.99, stock: 45, category: 'Electronics' },
    { name: 'Water Bottle', description: 'Insulated stainless steel water bottle', price: 19.99, stock: 120, category: 'Sports' },
    { name: 'Office Chair', description: 'Ergonomic mesh office chair', price: 299.99, stock: 15, category: 'Furniture' },
    { name: 'Standing Desk', description: 'Adjustable height standing desk', price: 449.99, stock: 10, category: 'Furniture' },
  ]

  for (const product of products) {
    const { category, ...data } = product
    const exists = await prisma.product.findFirst({ where: { name: data.name } })
    if (exists) continue
    await prisma.product.create({
      data: { ...data, categoryId: categories[category] },
    })
  }

  console.log('✅ Seeded users and products')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })