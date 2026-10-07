const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const all = await prisma.product.findMany({ orderBy: { createdAt: 'asc' } })
  const seen = new Set()
  const toDelete = []
  for (const p of all) {
    if (seen.has(p.name)) toDelete.push(p.id)
    else seen.add(p.name)
  }
  if (toDelete.length) {
    await prisma.product.deleteMany({ where: { id: { in: toDelete } } })
  }
  const remaining = await prisma.product.count()
  console.log(`Deleted ${toDelete.length} duplicates. Remaining: ${remaining}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
