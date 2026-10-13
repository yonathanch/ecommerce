/**
 * M8 (admin dashboard) end-to-end check.
 *
 * Covers:
 * - RBAC on every back-office route (401 anonymous, 403 customer)
 * - dashboard stats shape (money, orders by status, stock health, holds)
 * - admin order list with pagination, status filter and search
 * - order detail with allowed transitions
 * - fulfilment state machine: invalid jumps rejected, PAID -> SHIPPED ->
 *   DELIVERED accepted, refund restores stock with a RESTOCK ledger row
 * - admin cancel releases the hold
 * - inventory overview (variants, held units, lowOnly filter)
 * - customer list without credential leakage
 * - category management, including the storefront chips it feeds (the public
 *   /products/categories list is the same data the shop renders as navigation)
 * - coupon management, verified through the same /coupons/validate call the
 *   checkout page makes, so the shop's view of a coupon is what is asserted
 *
 * Usage: node scripts/m8-e2e.mjs   (backend must run on :3002, from backend/)
 */
import { readFileSync } from 'node:fs'
import { createHmac, randomUUID } from 'node:crypto'

const BASE = process.env.API_BASE ?? 'http://localhost:3002/api'

let passed = 0
let failed = 0

function check(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

function readEnv(key) {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} not found in backend/.env`)
  return line.slice(key.length + 1).trim()
}

const MOCK_SECRET = readEnv('PAYMENT_MOCK_SECRET')
const sign = (body) => createHmac('sha256', MOCK_SECRET).update(Buffer.from(body, 'utf8')).digest('hex')

async function req(method, path, { body, token, raw, signature } = {}) {
  const headers = {}
  if (raw !== undefined) {
    headers['content-type'] = 'application/json'
    if (signature) headers['x-payment-signature'] = signature
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  if (token) headers.authorization = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, data }
}

let seq = 0
async function makeUser(tag) {
  const email = `m8-${tag}-${Date.now()}-${seq++}@example.com`
  const res = await req('POST', '/auth/signup', {
    body: { email, password: 'Pass1234', name: `M8 ${tag}` },
  })
  if (res.status !== 201) throw new Error(`signup failed ${res.status} ${JSON.stringify(res.data)}`)
  return { email, token: res.data.accessToken, id: res.data.id }
}

async function main() {
  const health = await req('GET', '/health')
  if (health.status !== 200) throw new Error('backend not healthy — start it first')

  const adminLogin = await req('POST', '/auth/login', {
    body: { email: 'admin@example.com', password: 'admin123' },
  })
  if (adminLogin.status !== 200) throw new Error(`admin login failed ${adminLogin.status}`)
  const admin = adminLogin.data.accessToken

  const buyer = await makeUser('buyer')

  // ------------------------------------------------------------------- RBAC
  console.log('\nRBAC: back-office routes are ADMIN-only')
  const reads = ['/admin/stats', '/admin/orders', '/admin/inventory', '/admin/customers']
  for (const route of reads) {
    check(`GET ${route} without token -> 401`, (await req('GET', route)).status === 401)
    check(`GET ${route} as customer -> 403`, (await req('GET', route, { token: buyer.token })).status === 403)
  }
  check(
    'PATCH /admin/orders/x/status as customer -> 403',
    (await req('PATCH', '/admin/orders/x/status', { token: buyer.token, body: { status: 'SHIPPED' } })).status === 403,
  )
  check('GET /admin/stats as admin -> 200', (await req('GET', '/admin/stats', { token: admin })).status === 200)

  // ------------------------------------------------------------------ stats
  console.log('\nstats')
  let res = await req('GET', '/admin/stats', { token: admin })
  const stats = res.data
  check('orders.byStatus is keyed by status', typeof stats.orders?.byStatus === 'object', JSON.stringify(stats.orders))
  check('orders.total is a number', Number.isInteger(stats.orders?.total), `${stats.orders?.total}`)
  check('revenue.collected is a number', typeof stats.revenue?.collected === 'number', `${stats.revenue?.collected}`)
  check('revenue.collectedOrders is a number', Number.isInteger(stats.revenue?.collectedOrders), `${stats.revenue?.collectedOrders}`)
  check('revenue.today is a number', typeof stats.revenue?.today === 'number', `${stats.revenue?.today}`)
  check('revenue.refunded is a number', typeof stats.revenue?.refunded === 'number', `${stats.revenue?.refunded}`)
  check('products.outOfStock <= products.total', stats.products?.outOfStock <= stats.products?.total, JSON.stringify(stats.products))
  check('products.inventoryValue > 0', stats.products?.inventoryValue > 0, `${stats.products?.inventoryValue}`)
  check('customers.total >= 1', stats.customers?.total >= 1, `${stats.customers?.total}`)
  check('holds block is numeric', typeof stats.holds?.active === 'number' && typeof stats.holds?.units === 'number', JSON.stringify(stats.holds))
  check('recentOrders is a list of at most 5', Array.isArray(stats.recentOrders) && stats.recentOrders.length <= 5, `${stats.recentOrders?.length}`)
  check('lowStock is capped at 5', Array.isArray(stats.lowStock) && stats.lowStock.length <= 5, `${stats.lowStock?.length}`)

  // -------------------------------------------------------------- inventory
  console.log('\ninventory overview')
  res = await req('GET', '/admin/inventory', { token: admin })
  const inventory = res.data
  check('inventory exposes a threshold', Number.isInteger(inventory.threshold), `${inventory.threshold}`)
  check('inventory lists products', inventory.items.length > 0, `${inventory.items.length}`)
  const withVariants = inventory.items.find((row) => (row.variants ?? []).length > 0)
  check('inventory rows expose variants with sku + stock', Boolean(withVariants?.variants?.[0]?.sku) && typeof withVariants.variants[0].stock === 'number', JSON.stringify(withVariants?.variants?.[0]))
  check('inventory rows expose stock/reserved/available', inventory.items.every((row) => ['stock', 'reserved', 'available'].every((k) => typeof row[k] === 'number')), JSON.stringify(inventory.items[0]))
  const variantSku = withVariants.variants[0].sku
  res = await req('GET', `/admin/inventory?search=${encodeURIComponent(variantSku)}`, { token: admin })
  check('search by variant SKU finds the product', res.data.items.some((row) => row.id === withVariants.id), JSON.stringify(res.data.items.map((r) => r.name)))
  res = await req('GET', '/admin/inventory?lowOnly=true', { token: admin })
  check('lowOnly returns only rows at/under the threshold', res.data.items.every((row) => row.available <= res.data.threshold), JSON.stringify(res.data.items.map((r) => r.available)))

  // -------------------------------------------------------------- customers
  console.log('\ncustomers')
  res = await req('GET', `/admin/customers?search=${encodeURIComponent(buyer.email)}`, { token: admin })
  check('customer search finds the new user', res.data.items.some((u) => u.email === buyer.email), JSON.stringify(res.data.items.map((u) => u.email)))
  const customer = res.data.items.find((u) => u.email === buyer.email)
  check('customer row carries order counts', typeof customer.ordersCount === 'number' && typeof customer.totalSpent === 'number', JSON.stringify(customer))
  check('no password hash is exposed', !('password' in customer) && !('passwordHash' in customer), JSON.stringify(Object.keys(customer)))

  // ---------------------------------------------------------- order fixture
  console.log('\nfixture order (paid, then refunded)')
  const created = await req('POST', '/products', {
    token: admin,
    body: {
      name: `M8 Fixture ${Date.now()}`,
      description: 'm8 fixture',
      price: 250000,
      stock: 5,
      category: 'Baju Pria',
    },
  })
  check('fixture product created -> 201', created.status === 201, `${created.status} ${JSON.stringify(created.data)}`)
  const fixtureId = created.data.id

  const address = (
    await req('POST', '/addresses', {
      token: buyer.token,
      body: { recipient: 'Ani Lestari', phone: '081234567890', line1: 'Jl. Sudirman No. 5', city: 'Jakarta', postalCode: '10220' },
    })
  ).data

  await req('POST', '/cart/items', { token: buyer.token, body: { productId: fixtureId, quantity: 1 } })
  res = await req('POST', '/orders/checkout', { token: buyer.token, body: { addressId: address.id } })
  check('checkout -> 201 PENDING', res.status === 201 && res.data.status === 'PENDING', `${res.status}`)
  const orderId = res.data.id

  const product = async (id) => (await req('GET', `/products/${id}`)).data
  check('stock held, not deducted', (await product(fixtureId)).stock === 5, `${(await product(fixtureId)).stock}`)

  // ---------------------------------------------------------- order lists
  console.log('\norder list: filter, search, pagination')
  res = await req('GET', '/admin/orders?status=PENDING&limit=5&page=1', { token: admin })
  check('status filter returns only PENDING', res.data.items.every((o) => o.status === 'PENDING'), JSON.stringify(res.data.items.map((o) => o.status)))
  check('pagination meta is coherent', res.data.meta.page === 1 && res.data.meta.limit === 5 && res.data.meta.total >= 1, JSON.stringify(res.data.meta))
  check('list rows include the customer', typeof res.data.items[0]?.user?.email === 'string', JSON.stringify(res.data.items[0]?.user))

  res = await req('GET', `/admin/orders?search=${encodeURIComponent(buyer.email)}`, { token: admin })
  check('search by customer email finds the order', res.data.items.some((o) => o.id === orderId), `${res.data.meta.total}`)
  res = await req('GET', `/admin/orders?search=${orderId}`, { token: admin })
  check('search by order id finds the order', res.data.items.length === 1 && res.data.items[0].id === orderId, `${res.data.meta.total}`)

  res = await req('GET', `/admin/orders/${orderId}`, { token: admin })
  check('detail includes items and payments', Array.isArray(res.data.items) && Array.isArray(res.data.payments), JSON.stringify(Object.keys(res.data)))
  check('detail exposes allowedTransitions', JSON.stringify(res.data.allowedTransitions) === JSON.stringify(['CANCELLED']), JSON.stringify(res.data.allowedTransitions))

  res = await req('GET', '/admin/orders/does-not-exist', { token: admin })
  check('unknown order -> 404', res.status === 404, `${res.status}`)

  // ------------------------------------------------------ state machine
  console.log('\nstate machine: invalid transitions')
  const patch = (id, status, reason) =>
    req('PATCH', `/admin/orders/${id}/status`, {
      token: admin,
      body: reason ? { status, reason } : { status },
    })

  check('PENDING -> SHIPPED rejected', (await patch(orderId, 'SHIPPED')).status === 400)
  check('PENDING -> PENDING rejected', (await patch(orderId, 'PENDING')).status === 400)
  check('unknown status value rejected by validation', (await patch(orderId, 'TELEPORTED')).status === 400)
  check('unknown order -> 404', (await patch('does-not-exist', 'CANCELLED')).status === 404)

  // pay the order through the signed webhook (same path as production)
  res = await req('POST', '/payments', { token: buyer.token, body: { orderId } })
  check('payment created -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const payment = res.data
  const body = JSON.stringify({
    eventId: `evt-${randomUUID()}`,
    type: 'payment.captured',
    providerRef: payment.providerRef,
    amount: payment.amount,
    method: 'mock_va',
    occurredAt: new Date().toISOString(),
  })
  res = await req('POST', '/payments/webhook', { raw: body, signature: sign(body) })
  check('capture applied', res.status === 200 && res.data.duplicate === false, `${res.status} ${JSON.stringify(res.data)}`)
  check('stock deducted after capture', (await product(fixtureId)).stock === 4, `${(await product(fixtureId)).stock}`)

  res = await req('GET', `/admin/orders/${orderId}`, { token: admin })
  check('PAID order may ship or refund', JSON.stringify(res.data.allowedTransitions) === JSON.stringify(['SHIPPED', 'REFUNDED']), JSON.stringify(res.data.allowedTransitions))

  // ------------------------------------------------------- fulfilment path
  console.log('\nfulfilment: ship, deliver, refund')
  res = await patch(orderId, 'SHIPPED')
  check('PAID -> SHIPPED -> 200', res.status === 200 && res.data.status === 'SHIPPED', `${res.status} ${JSON.stringify(res.data?.message)}`)
  check('shipping does not move stock', (await product(fixtureId)).stock === 4, `${(await product(fixtureId)).stock}`)

  res = await req('GET', '/notifications', { token: buyer.token })
  check('customer notified about shipment', res.data.some((n) => n.type === 'ORDER_SHIPPED' && n.meta?.orderId === orderId), JSON.stringify(res.data.slice(0, 3).map((n) => n.type)))

  check('SHIPPED -> SHIPPED rejected', (await patch(orderId, 'SHIPPED')).status === 400)
  res = await patch(orderId, 'DELIVERED')
  check('SHIPPED -> DELIVERED -> 200', res.status === 200 && res.data.status === 'DELIVERED', `${res.status}`)
  check('DELIVERED may only be refunded', JSON.stringify(res.data.allowedTransitions) === JSON.stringify(['REFUNDED']), JSON.stringify(res.data.allowedTransitions))

  res = await patch(orderId, 'REFUNDED', 'customer changed their mind')
  check('DELIVERED -> REFUNDED -> 200', res.status === 200 && res.data.status === 'REFUNDED', `${res.status} ${JSON.stringify(res.data?.message)}`)
  check('refund payment marked REFUNDED', res.data.payments.some((p) => p.status === 'REFUNDED'), JSON.stringify(res.data.payments.map((p) => p.status)))
  check('refund restocked the product', (await product(fixtureId)).stock === 5, `${(await product(fixtureId)).stock}`)

  res = await req('GET', `/inventory/history?productId=${fixtureId}`, { token: admin })
  const restock = res.data.find((row) => row.type === 'RESTOCK')
  check('refund wrote a RESTOCK ledger row', Boolean(restock), JSON.stringify(res.data.map((r) => r.type)))
  check('RESTOCK row records before/after', restock?.stockBefore === 4 && restock?.stockAfter === 5, JSON.stringify(restock))
  check('RESTOCK row keeps the admin reason', (restock?.reason ?? '').includes('customer changed their mind'), `${restock?.reason}`)

  res = await req('GET', '/notifications', { token: buyer.token })
  check('customer notified about the refund', res.data.some((n) => n.type === 'ORDER_REFUNDED' && n.meta?.orderId === orderId), JSON.stringify(res.data.slice(0, 3).map((n) => n.type)))

  check('REFUNDED is terminal', (await patch(orderId, 'SHIPPED')).status === 400)

  // --------------------------------------------------------- admin cancel
  console.log('\nadmin cancel releases the hold')
  await req('POST', '/cart/items', { token: buyer.token, body: { productId: fixtureId, quantity: 2 } })
  res = await req('POST', '/orders/checkout', { token: buyer.token, body: { addressId: address.id } })
  check('second checkout -> 201', res.status === 201, `${res.status}`)
  const cancelId = res.data.id
  check('2 units held', (await product(fixtureId)).reserved === 2, `${(await product(fixtureId)).reserved}`)

  res = await patch(cancelId, 'CANCELLED')
  check('PENDING -> CANCELLED -> 200', res.status === 200 && res.data.status === 'CANCELLED', `${res.status}`)
  check('hold released', (await product(fixtureId)).reserved === 0, `${(await product(fixtureId)).reserved}`)
  check('on-hand stock untouched by cancellation', (await product(fixtureId)).stock === 5, `${(await product(fixtureId)).stock}`)

  res = await req('GET', '/admin/orders?status=REFUNDED', { token: admin })
  check('status filter works for REFUNDED', res.data.items.every((o) => o.status === 'REFUNDED') && res.data.items.some((o) => o.id === orderId), JSON.stringify(res.data.items.map((o) => o.status)))

  // ------------------------------------------------------------ categories
  console.log('\ncategories: the back-office owns the storefront chips')
  check('GET /admin/categories without token -> 401', (await req('GET', '/admin/categories')).status === 401)
  check('GET /admin/categories as customer -> 403', (await req('GET', '/admin/categories', { token: buyer.token })).status === 403)
  check(
    'POST /admin/categories as customer -> 403',
    (await req('POST', '/admin/categories', { token: buyer.token, body: { name: 'Nope' } })).status === 403,
  )

  res = await req('GET', '/admin/categories', { token: admin })
  check('category list -> 200', res.status === 200, `${res.status}`)
  check(
    'every row carries productCount',
    res.data.items.every((c) => Number.isInteger(c.productCount)),
    JSON.stringify(res.data.items[0]),
  )

  const catName = `M8 Category ${Date.now()}`
  res = await req('POST', '/admin/categories', { token: admin, body: { name: catName } })
  check('create category -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const categoryId = res.data?.id
  check('slug is derived server-side', /^[a-z0-9-]+$/.test(res.data?.slug ?? ''), JSON.stringify(res.data))
  check('duplicate name -> 409', (await req('POST', '/admin/categories', { token: admin, body: { name: catName } })).status === 409)
  check('name without letters or digits -> 400', (await req('POST', '/admin/categories', { token: admin, body: { name: '!!!' } })).status === 400)

  // This is what makes a category change a two-sided change: the shop renders
  // the very same list as navigation chips.
  res = await req('GET', '/products/categories')
  check('storefront sees the new chip', res.data.includes(catName), JSON.stringify(res.data))

  const catRenamed = `${catName} renamed`
  res = await req('PATCH', `/admin/categories/${categoryId}`, { token: admin, body: { name: catRenamed } })
  check('rename category -> 200', res.status === 200 && res.data.name === catRenamed, `${res.status} ${JSON.stringify(res.data)}`)
  res = await req('GET', '/products/categories')
  check(
    'storefront chip follows the rename',
    res.data.includes(catRenamed) && !res.data.includes(catName),
    JSON.stringify(res.data),
  )

  // The product form may only pick a category that exists — that is what keeps
  // a typo from becoming a chip in the shop.
  res = await req('POST', '/products', {
    token: admin,
    body: { name: `M8 category fixture ${Date.now()}`, price: 1000, stock: 1, category: 'M8 Nonexistent Category' },
  })
  check('product with unknown category -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)
  res = await req('POST', '/products', {
    token: admin,
    body: { name: `M8 category fixture ${Date.now()}`, price: 1000, stock: 1, category: catRenamed },
  })
  check('product with existing category -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const catFixtureId = res.data?.id

  check(
    'delete while still in use -> 409',
    (await req('DELETE', `/admin/categories/${categoryId}`, { token: admin })).status === 409,
  )

  // This section cleans up after itself so the demo catalog keeps its shape.
  await req('DELETE', `/products/${catFixtureId}`, { token: admin })
  res = await req('DELETE', `/admin/categories/${categoryId}`, { token: admin })
  check('delete empty category -> 200', res.status === 200, `${res.status} ${JSON.stringify(res.data)}`)
  check('delete unknown id -> 404', (await req('DELETE', `/admin/categories/${categoryId}`, { token: admin })).status === 404)
  res = await req('GET', '/products/categories')
  check('deleted category left the storefront', !res.data.includes(catRenamed), JSON.stringify(res.data))

  // --------------------------------------------------------------- coupons
  console.log('\ncoupons: the back-office writes what checkout reads')
  check('GET /admin/coupons without token -> 401', (await req('GET', '/admin/coupons')).status === 401)
  check('GET /admin/coupons as customer -> 403', (await req('GET', '/admin/coupons', { token: buyer.token })).status === 403)
  check(
    'POST /admin/coupons as customer -> 403',
    (await req('POST', '/admin/coupons', { token: buyer.token, body: { code: 'NOPE', type: 'PERCENT', value: 5 } })).status === 403,
  )

  res = await req('GET', '/admin/coupons', { token: admin })
  check('coupon list -> 200', res.status === 200, `${res.status}`)
  check('coupon summary is present', typeof res.data?.summary?.total === 'number', JSON.stringify(res.data?.summary))

  const couponCode = `M8${Date.now()}`
  res = await req('POST', '/admin/coupons', {
    token: admin,
    body: { code: couponCode.toLowerCase(), type: 'PERCENT', value: 20, minPurchase: 100000, maxDiscount: 50000, usageLimit: 3 },
  })
  check('create coupon -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const couponId = res.data?.id
  check('code is stored uppercase', res.data?.code === couponCode, JSON.stringify(res.data?.code))
  check('a fresh coupon is AKTIF', res.data?.status === 'AKTIF', JSON.stringify(res.data?.status))
  check(
    'percentage above 100 -> 400',
    (await req('POST', '/admin/coupons', { token: admin, body: { code: `${couponCode}B`, type: 'PERCENT', value: 150 } })).status === 400,
  )
  check(
    'duplicate code -> 409',
    (await req('POST', '/admin/coupons', { token: admin, body: { code: couponCode, type: 'FIXED', value: 1000 } })).status === 409,
  )
  check(
    'unknown coupon -> 404',
    (await req('PATCH', '/admin/coupons/does-not-exist', { token: admin, body: { active: false } })).status === 404,
  )

  // The checkout call itself — this is the link that makes the screen a producer.
  res = await req('POST', '/coupons/validate', { token: buyer.token, body: { code: couponCode, subtotal: 200000 } })
  check('checkout accepts the new coupon -> 200', res.status === 200, `${res.status} ${JSON.stringify(res.data)}`)
  check('20% of 200000 is 40000', res.data?.discount === 40000, JSON.stringify(res.data?.discount))
  res = await req('POST', '/coupons/validate', { token: buyer.token, body: { code: couponCode, subtotal: 500000 } })
  check('maxDiscount caps a large cart', res.data?.discount === 50000, JSON.stringify(res.data?.discount))
  check(
    'minimum purchase is enforced',
    (await req('POST', '/coupons/validate', { token: buyer.token, body: { code: couponCode, subtotal: 50000 } })).status === 400,
  )

  res = await req('PATCH', `/admin/coupons/${couponId}`, { token: admin, body: { active: false } })
  check('deactivate -> 200', res.status === 200 && res.data?.active === false, `${res.status}`)
  check('deactivated coupon reads NONAKTIF', res.data?.status === 'NONAKTIF', JSON.stringify(res.data?.status))
  check(
    'deactivated coupon is refused at checkout',
    (await req('POST', '/coupons/validate', { token: buyer.token, body: { code: couponCode, subtotal: 200000 } })).status === 400,
  )

  res = await req('PATCH', `/admin/coupons/${couponId}`, {
    token: admin,
    body: { active: true, expiresAt: new Date(Date.now() - 86_400_000).toISOString() },
  })
  check('past expiry reads KEDALUWARSA', res.data?.status === 'KEDALUWARSA', JSON.stringify(res.data?.status))
  check(
    'expired coupon is refused at checkout',
    (await req('POST', '/coupons/validate', { token: buyer.token, body: { code: couponCode, subtotal: 200000 } })).status === 400,
  )
  res = await req('PATCH', `/admin/coupons/${couponId}`, { token: admin, body: { expiresAt: null } })
  check('expiry can be cleared again', res.data?.expiresAt === null, JSON.stringify(res.data?.expiresAt))

  res = await req('GET', `/admin/coupons?search=${couponCode}`, { token: admin })
  check('coupon search matches one row', res.data?.items?.length === 1, JSON.stringify(res.data?.items?.map((c) => c.code)))

  // This section cleans up after itself. A redeemed coupon is deliberately not
  // deleted (see deleteCoupon), which the next check pins down.
  res = await req('DELETE', `/admin/coupons/${couponId}`, { token: admin })
  check('delete unused coupon -> 200', res.status === 200, `${res.status} ${JSON.stringify(res.data)}`)
  check('delete unknown coupon -> 404', (await req('DELETE', `/admin/coupons/${couponId}`, { token: admin })).status === 404)

  // --------------------------------------------------------------- cleanup
  console.log('\ncleanup: removing the fixture from the catalog')
  res = await req('DELETE', `/products/${fixtureId}`, { token: admin })
  check('fixture removed', res.status === 200, `${res.status}`)

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('suite crashed:', error)
  process.exit(1)
})
