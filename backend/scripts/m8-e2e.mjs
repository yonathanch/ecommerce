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
 * - product form ownership: brand (asserted through the public ?brand= query the
 *   brand page uses), gallery replacement, and variant add/edit/remove — with the
 *   proof that an existing SKU's stock cannot be moved from this screen
 * - customer detail, cross-checked against the row the list renders
 * - product reviews: purchase-gated submission, one per product, moderation
 *   (publish/reject/reply/delete) and the rating the product page renders —
 *   verified from both sides, since a review is the rare feature where the
 *   buyer, the storefront and the moderator all read the same row
 * - the Ctrl+K palette's single query (/admin/search) across products, orders
 *   and customers, including the per-group cap and the RBAC on that route; a
 *   product hit is cross-checked against the catalog row it claims to be
 * - the admin notification bell: a new order reaches every admin, the row is
 *   unread and carries the id the bell links with, only its owner can read it,
 *   and read-all empties the badge
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

  // -------------------------------------------------------------- shipping
  console.log('\nshipping: the resi the admin types is what the buyer reads')
  const r2 = (n) => Math.round(n * 100) / 100
  const closeTo = (a, b) => Math.abs(a - b) < 0.01

  /** Checkout + capture a payment on the fixture, the way the shop does it. */
  const payFixtureOrder = async (quantity = 1) => {
    await req('POST', '/cart/clear', { token: buyer.token })
    await req('POST', '/cart/items', { token: buyer.token, body: { productId: fixtureId, quantity } })
    const order = (await req('POST', '/orders/checkout', { token: buyer.token, body: { addressId: address.id } })).data
    const payment = (await req('POST', '/payments', { token: buyer.token, body: { orderId: order.id } })).data
    const body = JSON.stringify({
      eventId: `evt-${randomUUID()}`,
      type: 'payment.captured',
      providerRef: payment.providerRef,
      amount: payment.amount,
      method: 'mock_va',
      occurredAt: new Date().toISOString(),
    })
    await req('POST', '/payments/webhook', { raw: body, signature: sign(body) })
    return order
  }

  // Shipping needs a PAID order to dispatch.
  const shipOrder = await payFixtureOrder(1)
  check('shipping fixture paid', shipOrder.totalPrice > 0, `${shipOrder.totalPrice}`)

  check('GET /admin/shipments without token -> 401', (await req('GET', '/admin/shipments')).status === 401)
  check(
    'GET /admin/shipments as customer -> 403',
    (await req('GET', '/admin/shipments', { token: buyer.token })).status === 403,
  )

  const RESI = `JNE-M8-${Date.now()}`
  res = await req('PATCH', `/admin/orders/${shipOrder.id}/status`, {
    token: admin,
    body: { status: 'SHIPPED', courier: 'JNE Reguler', trackingNumber: RESI },
  })
  check('ship with courier and resi -> 200', res.status === 200, `${res.status} ${JSON.stringify(res.data?.message)}`)
  check('response carries the courier', res.data?.courier === 'JNE Reguler', `${res.data?.courier}`)
  check('response carries the resi', res.data?.trackingNumber === RESI, `${res.data?.trackingNumber}`)
  check('shippedAt is stamped on dispatch', Boolean(res.data?.shippedAt), `${res.data?.shippedAt}`)

  const adminView = await req('GET', `/admin/orders/${shipOrder.id}`, { token: admin })
  check('admin detail exposes the shipment', adminView.data?.trackingNumber === RESI, JSON.stringify(adminView.data?.trackingNumber))

  // Two-sided: the buyer reads the very same resi on their own orders screen.
  const buyerView = await req('GET', `/orders/${shipOrder.id}`, { token: buyer.token })
  check('customer sees the courier', buyerView.data?.courier === 'JNE Reguler', JSON.stringify(buyerView.data?.courier))
  check('customer sees the resi', buyerView.data?.trackingNumber === RESI, JSON.stringify(buyerView.data?.trackingNumber))
  check('customer sees when it was dispatched', Boolean(buyerView.data?.shippedAt), `${buyerView.data?.shippedAt}`)

  const shipNotes = await req('GET', '/notifications', { token: buyer.token })
  const shipNote = shipNotes.data.find((n) => n.type === 'ORDER_SHIPPED' && n.meta?.orderId === shipOrder.id)
  check('shipping notification carries the resi', (shipNote?.body ?? '').includes(RESI), `${shipNote?.body}`)

  res = await req('GET', `/admin/shipments?search=${encodeURIComponent(RESI)}`, { token: admin })
  check('shipments can be found by resi', res.data.items.some((s) => s.id === shipOrder.id), JSON.stringify(res.data.items.map((s) => s.id)))
  const shipRow = res.data.items.find((s) => s.id === shipOrder.id)
  check('shipment row carries the order id and item count', shipRow?.itemCount === 1, JSON.stringify(shipRow?.itemCount))
  check(
    'shipment row carries the destination from the address snapshot',
    shipRow?.destination === 'Jakarta',
    JSON.stringify(shipRow?.destination),
  )
  check('shipment row carries the customer', shipRow?.user?.email === buyer.email, JSON.stringify(shipRow?.user?.email))

  res = await req('GET', '/admin/shipments?status=SHIPPED', { token: admin })
  check('shipment status filter works', res.data.items.every((s) => s.status === 'SHIPPED'), JSON.stringify(res.data.items.map((s) => s.status)))
  res = await req('GET', '/admin/shipments?missingTracking=true', { token: admin })
  check(
    'missingTracking returns only rows without a resi',
    res.data.items.every((s) => s.trackingNumber === null),
    JSON.stringify(res.data.items.map((s) => s.trackingNumber)),
  )
  check('shipment summary counts what is missing', Number.isInteger(res.data.summary?.missingTracking), JSON.stringify(res.data.summary))
  check(
    'a dispatched order is no longer counted as missing its resi',
    !res.data.items.some((s) => s.id === shipOrder.id),
    JSON.stringify(res.data.items.map((s) => s.id).includes(shipOrder.id)),
  )

  // ------------------------- correcting a resi after dispatch
  res = await req('PATCH', `/admin/orders/${shipOrder.id}/shipment`, {
    token: admin,
    body: { trackingNumber: `${RESI}-FIX` },
  })
  check('resi can be corrected -> 200', res.status === 200 && res.data?.trackingNumber === `${RESI}-FIX`, `${res.status} ${JSON.stringify(res.data?.trackingNumber)}`)
  check('correcting the resi keeps the courier', res.data?.courier === 'JNE Reguler', JSON.stringify(res.data?.courier))
  const buyerView2 = await req('GET', `/orders/${shipOrder.id}`, { token: buyer.token })
  check('customer sees the corrected resi', buyerView2.data?.trackingNumber === `${RESI}-FIX`, JSON.stringify(buyerView2.data?.trackingNumber))

  check(
    'empty shipment update -> 400',
    (await req('PATCH', `/admin/orders/${shipOrder.id}/shipment`, { token: admin, body: {} })).status === 400,
  )
  check(
    'unknown order shipment -> 404',
    (await req('PATCH', '/admin/orders/does-not-exist/shipment', { token: admin, body: { courier: 'X' } })).status === 404,
  )
  check(
    'a PENDING order has no shipment to correct -> 400',
    (await req('PATCH', `/admin/orders/${cancelId}/shipment`, { token: admin, body: { courier: 'X' } })).status === 400,
  )
  check(
    'PATCH shipment as customer -> 403',
    (await req('PATCH', `/admin/orders/${shipOrder.id}/shipment`, { token: buyer.token, body: { courier: 'X' } })).status === 403,
  )

  // -------------------------------------------------------------- analytics
  console.log('\nanalytics: the dashboard counts money that actually moved')
  const analytics = async () => (await req('GET', '/admin/analytics', { token: admin })).data
  check('GET /admin/analytics without token -> 401', (await req('GET', '/admin/analytics')).status === 401)
  check(
    'GET /admin/analytics as customer -> 403',
    (await req('GET', '/admin/analytics', { token: buyer.token })).status === 403,
  )

  // Captured before any money moves, so the deltas below are meaningful.
  const before = await analytics()
  const months = before.monthly.labels.length
  const last = months - 1
  check('series covers 12 months', months === 12, `${months}`)
  check(
    'every series has one value per label',
    before.monthly.revenue.length === months &&
      before.monthly.refunds.length === months &&
      before.monthly.orders.length === months,
    JSON.stringify({ r: before.monthly.revenue.length, f: before.monthly.refunds.length }),
  )
  check('kpi money values are plain numbers', typeof before.kpis.grossSales === 'number' && typeof before.kpis.averageOrderValue === 'number', JSON.stringify(before.kpis))
  check('kpi order count is an integer', Number.isInteger(before.kpis.orders), `${before.kpis.orders}`)

  const stages = before.funnel.stages
  const stage = (key) => stages.find((s) => s.key === key)?.count
  check(
    'funnel is monotonic (created >= paid >= shipped >= delivered)',
    stage('created') >= stage('paid') && stage('paid') >= stage('shipped') && stage('shipped') >= stage('delivered'),
    JSON.stringify(stages),
  )
  check('funnel reports the leak separately', typeof before.funnel.leak?.cancelled === 'number', JSON.stringify(before.funnel.leak))
  check(
    'top products are ranked by units sold',
    before.topProducts.every((p, i, all) => i === 0 || all[i - 1].unitsSold >= p.unitsSold),
    JSON.stringify(before.topProducts.map((p) => p.unitsSold)),
  )
  check(
    'top products carry revenue',
    before.topProducts.every((p) => typeof p.revenue === 'number' && p.name),
    JSON.stringify(before.topProducts[0]),
  )
  check(
    'category breakdown carries revenue',
    before.salesByCategory.every((c) => typeof c.revenue === 'number'),
    JSON.stringify(before.salesByCategory[0]),
  )

  // A payment made after the snapshot has to show up as new money.
  const moneyOrder = await payFixtureOrder(1)
  const afterPay = await analytics()
  check(
    'a captured payment raises the current month revenue by its total',
    closeTo(afterPay.monthly.revenue[last], r2(before.monthly.revenue[last] + moneyOrder.totalPrice)),
    `${afterPay.monthly.revenue[last]} vs ${before.monthly.revenue[last]} + ${moneyOrder.totalPrice}`,
  )
  check(
    'it also raises the 30-day gross sales',
    closeTo(afterPay.kpis.grossSales, r2(before.kpis.grossSales + moneyOrder.totalPrice)),
    `${afterPay.kpis.grossSales} vs ${before.kpis.grossSales} + ${moneyOrder.totalPrice}`,
  )
  check('and the paid order count', afterPay.kpis.orders === before.kpis.orders + 1, `${afterPay.kpis.orders} vs ${before.kpis.orders}`)
  check(
    'the funnel counts the new payment',
    afterPay.funnel.stages.find((s) => s.key === 'paid').count === before.funnel.stages.find((s) => s.key === 'paid').count + 1,
    JSON.stringify(afterPay.funnel.stages),
  )
  check(
    'a not-yet-dispatched order is not counted as shipped',
    afterPay.funnel.stages.find((s) => s.key === 'shipped').count === before.funnel.stages.find((s) => s.key === 'shipped').count,
    JSON.stringify(afterPay.funnel.stages),
  )

  // Dispatching is what moves the second funnel step, not paying.
  res = await req('PATCH', `/admin/orders/${moneyOrder.id}/status`, {
    token: admin,
    body: { status: 'SHIPPED', courier: 'SiCepat', trackingNumber: `M8-ANALYTICS-${Date.now()}` },
  })
  check('analytics fixture dispatched -> 200', res.status === 200, `${res.status}`)
  const afterShip = await analytics()
  check(
    'the funnel counts the new shipment',
    afterShip.funnel.stages.find((s) => s.key === 'shipped').count === before.funnel.stages.find((s) => s.key === 'shipped').count + 1,
    JSON.stringify(afterShip.funnel.stages),
  )

  // Refund it: the money should leave the gross series and land in the refund
  // bucket, leaving net revenue exactly where it started.
  await patch(moneyOrder.id, 'REFUNDED', 'cleanup after analytics checks')
  const afterRefund = await analytics()
  check(
    'a refund removes the money from gross revenue',
    closeTo(afterRefund.monthly.revenue[last], before.monthly.revenue[last]),
    `${afterRefund.monthly.revenue[last]} vs ${before.monthly.revenue[last]}`,
  )
  check(
    'a refund lands in the refund bucket',
    closeTo(afterRefund.kpis.refunds, r2(before.kpis.refunds + moneyOrder.totalPrice)),
    `${afterRefund.kpis.refunds} vs ${before.kpis.refunds} + ${moneyOrder.totalPrice}`,
  )
  check(
    'a refund also shows up in the refund series for that month',
    closeTo(afterRefund.monthly.refunds[last], r2(before.monthly.refunds[last] + moneyOrder.totalPrice)),
    `${afterRefund.monthly.refunds[last]} vs ${before.monthly.refunds[last]} + ${moneyOrder.totalPrice}`,
  )
  check(
    '30-day gross sales are back where they started',
    closeTo(afterRefund.kpis.grossSales, before.kpis.grossSales),
    `${afterRefund.kpis.grossSales} vs ${before.kpis.grossSales}`,
  )
  check(
    'a refunded order stays counted as shipped',
    afterRefund.funnel.stages.find((s) => s.key === 'shipped').count === afterShip.funnel.stages.find((s) => s.key === 'shipped').count,
    JSON.stringify({ refunded: afterRefund.funnel.stages, shipped: afterShip.funnel.stages }),
  )

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

  // ----------------------------------------------------------------- brands
  console.log('\nbrands: the back-office owns the storefront brand pages')
  check('GET /admin/brands without token -> 401', (await req('GET', '/admin/brands')).status === 401)
  check('GET /admin/brands as customer -> 403', (await req('GET', '/admin/brands', { token: buyer.token })).status === 403)
  check(
    'POST /admin/brands as customer -> 403',
    (await req('POST', '/admin/brands', { token: buyer.token, body: { name: 'Nope' } })).status === 403,
  )

  res = await req('GET', '/admin/brands', { token: admin })
  check('brand list -> 200', res.status === 200, `${res.status}`)
  check(
    'every brand row carries productCount',
    res.data.items.length > 0 && res.data.items.every((b) => Number.isInteger(b.productCount)),
    JSON.stringify(res.data.items[0]),
  )

  const brandName = `M8 Brand ${Date.now()}`
  res = await req('POST', '/admin/brands', { token: admin, body: { name: brandName } })
  check('create brand -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const newBrand = res.data
  check('brand slug is derived server-side', /^[a-z0-9-]+$/.test(newBrand?.slug ?? ''), JSON.stringify(newBrand?.slug))
  check(
    'duplicate brand name -> 409',
    (await req('POST', '/admin/brands', { token: admin, body: { name: brandName } })).status === 409,
  )
  check(
    'brand name without letters or digits -> 400',
    (await req('POST', '/admin/brands', { token: admin, body: { name: '!!!' } })).status === 400,
  )

  // Two-sided: the cards and the /brands/<slug> pages are built from this list.
  res = await req('GET', '/products/brands')
  check('storefront brand list follows the new brand', res.data.some((b) => b.slug === newBrand.slug), JSON.stringify(res.data.map((b) => b.slug)))

  const brandCategory = (await req('GET', '/products/categories')).data[0]
  res = await req('POST', '/products', {
    token: admin,
    body: { name: `M8 brand page fixture ${Date.now()}`, price: 10000, stock: 1, category: brandCategory, brand: newBrand.slug },
  })
  check('product can use the new brand -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data?.message)}`)
  const brandFixtureId = res.data?.id
  res = await req('GET', `/products?brand=${newBrand.slug}&limit=100`)
  check('the brand page lists it', res.data.items.some((p) => p.id === brandFixtureId), JSON.stringify(res.data.items.map((p) => p.id).slice(0, 3)))
  check(
    'brand productCount reflects the assignment',
    (await req('GET', '/admin/brands', { token: admin })).data.items.find((b) => b.id === newBrand.id)?.productCount === 1,
    JSON.stringify(newBrand.slug),
  )

  check(
    'delete while still in use -> 409',
    (await req('DELETE', `/admin/brands/${newBrand.id}`, { token: admin })).status === 409,
  )

  await req('DELETE', `/products/${brandFixtureId}`, { token: admin })

  const renamedBrand = `${brandName} renamed`
  res = await req('PATCH', `/admin/brands/${newBrand.id}`, { token: admin, body: { name: renamedBrand } })
  check('rename brand -> 200', res.status === 200 && res.data?.name === renamedBrand, `${res.status} ${JSON.stringify(res.data?.name)}`)
  res = await req('GET', '/products/brands')
  check(
    'storefront brand list follows the rename',
    res.data.some((b) => b.name === renamedBrand) && !res.data.some((b) => b.name === brandName),
    JSON.stringify(res.data.map((b) => b.name)),
  )

  res = await req('DELETE', `/admin/brands/${newBrand.id}`, { token: admin })
  check('delete an unused brand -> 200', res.status === 200, `${res.status} ${JSON.stringify(res.data)}`)
  check('delete unknown brand -> 404', (await req('DELETE', `/admin/brands/${newBrand.id}`, { token: admin })).status === 404)
  res = await req('GET', '/products/brands')
  check('deleted brand left the storefront', !res.data.some((b) => b.name === renamedBrand), JSON.stringify(res.data.map((b) => b.name)))

  // A hand-typed slug for a brand that no longer exists must not resolve.
  res = await req('POST', '/products', {
    token: admin,
    body: { name: `M8 dead brand ${Date.now()}`, price: 1000, stock: 1, category: brandCategory, brand: newBrand.slug },
  })
  check('product cannot use a deleted brand -> 400', res.status === 400, `${res.status}`)

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

  // ------------------------------- product form: brand, gallery, variants
  console.log('\nproduct form: brand, gallery and variants are back-office owned')
  const catList = await req('GET', '/products/categories')
  const someCategory = catList.data[0]
  const brandList = await req('GET', '/products/brands')
  check('storefront brand list is populated', brandList.data.length >= 2, JSON.stringify(brandList.data))
  const brandA = brandList.data[0]
  const brandB = brandList.data[1]

  check(
    'PUT /products/:id without token -> 401',
    (await req('PUT', '/products/does-not-exist', { body: { price: 1 } })).status === 401,
  )
  check(
    'unknown brand -> 400',
    (
      await req('POST', '/products', {
        token: admin,
        body: { name: `M8 brand fixture ${Date.now()}`, price: 1000, category: someCategory, brand: 'No Such Label' },
      })
    ).status === 400,
  )
  // The form sends `null` when the admin picks "Tanpa brand".
  res = await req('POST', '/products', {
    token: admin,
    body: {
      name: `M8 null brand ${Date.now()}`,
      price: 1000,
      stock: 1,
      category: someCategory,
      brand: null,
      imageUrls: [],
      variants: [],
    },
  })
  check('explicit null brand is accepted', res.status === 201 && res.data?.brand === null, `${res.status} ${JSON.stringify(res.data?.brand)}`)
  const nullBrandId = res.data?.id
  check(
    'product without brand and without variants is valid',
    res.data?.images?.length === 0 && res.data?.variants?.length === 0,
    JSON.stringify({ images: res.data?.images?.length, variants: res.data?.variants?.length }),
  )
  if (nullBrandId) {
    check('null-brand probe removed', (await req('DELETE', `/products/${nullBrandId}`, { token: admin })).status === 200)
  }

  const imageA = 'https://images.example.com/m8-a.jpg'
  const imageB = 'https://images.example.com/m8-b.jpg'
  res = await req('POST', '/products', {
    token: admin,
    body: {
      name: `M8 product form fixture ${Date.now()}`,
      price: 100000,
      stock: 10,
      category: someCategory,
      brand: brandA.slug,
      imageUrls: [imageA],
      variants: [
        { sku: `M8-FORM-A-${Date.now()}`, options: { Warna: 'Hitam', Ukuran: '42' }, price: 105000, stock: 3 },
        { sku: `M8-FORM-C-${Date.now()}`, options: { Warna: 'Putih', Ukuran: '42' }, stock: 1 },
      ],
    },
  })
  check('create with brand, image and variants -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data?.message)}`)
  const formFixture = res.data
  const formId = formFixture?.id
  const skuA = formFixture?.variants?.find((v) => v.options?.Warna === 'Hitam')?.sku
  const skuC = formFixture?.variants?.find((v) => v.options?.Warna === 'Putih')?.sku
  check('response carries the brand', formFixture?.brand?.slug === brandA.slug, JSON.stringify(formFixture?.brand))
  check('response carries the gallery', formFixture?.images?.length === 1 && formFixture.images[0].url === imageA, JSON.stringify(formFixture?.images))
  check('both variants were stored', formFixture?.variants?.length === 2, JSON.stringify(formFixture?.variants?.map((v) => v.sku)))

  // The storefront reads the brand page from ?brand=<slug>, so a label set here
  // is the same data /brands/<slug> renders.
  res = await req('GET', `/products?brand=${brandA.slug}&limit=100`)
  check('brand page query lists the new product', res.data.items.some((p) => p.id === formId), JSON.stringify(res.data.items.map((p) => p.id).slice(0, 3)))

  // Public detail payload — this is exactly what the product page renders.
  res = await req('GET', `/products/${formId}`)
  check(
    'storefront detail shows the variant axes',
    res.data.variants.some((v) => v.options?.Warna === 'Hitam' && v.options?.Ukuran === '42'),
    JSON.stringify(res.data.variants.map((v) => v.options)),
  )
  check('storefront detail shows the image', res.data.images?.[0]?.url === imageA, JSON.stringify(res.data.images))

  // Update: new gallery, different brand, one SKU edited, one added, one removed.
  res = await req('PUT', `/products/${formId}`, {
    token: admin,
    body: {
      imageUrls: [imageB],
      brand: brandB.slug,
      variants: [
        { sku: skuA, options: { Warna: 'Hitam', Ukuran: '43' }, price: 111000, stock: 99 },
        { sku: `M8-FORM-B-${Date.now()}`, options: { Warna: 'Navy', Ukuran: '42' }, stock: 7 },
      ],
    },
  })
  check('update -> 200', res.status === 200, `${res.status} ${JSON.stringify(res.data?.message)}`)
  check('gallery was replaced, not appended', res.data?.images?.length === 1 && res.data.images[0].url === imageB, JSON.stringify(res.data?.images))
  check('brand change is applied', res.data?.brand?.slug === brandB.slug, JSON.stringify(res.data?.brand))

  const skusAfter = (res.data?.variants ?? []).map((v) => v.sku).sort()
  check('removed SKU is gone', !skusAfter.includes(skuC), JSON.stringify(skusAfter))
  check('added SKU is present', skusAfter.some((s) => s.startsWith('M8-FORM-B-')), JSON.stringify(skusAfter))

  const editedA = (res.data?.variants ?? []).find((v) => v.sku === skuA)
  check('existing SKU options updated', editedA?.options?.Ukuran === '43', JSON.stringify(editedA?.options))
  check('existing SKU price updated', editedA?.price === 111000, `${editedA?.price}`)
  check('existing SKU keeps its stock (99 in the payload is ignored)', editedA?.stock === 3, `${editedA?.stock}`)
  const addedB = (res.data?.variants ?? []).find((v) => v.sku?.startsWith('M8-FORM-B-'))
  check('new SKU gets its opening stock', addedB?.stock === 7, `${addedB?.stock}`)

  res = await req('GET', `/products?brand=${brandB.slug}&limit=100`)
  check('storefront follows the brand change', res.data.items.some((p) => p.id === formId), JSON.stringify(res.data.items.map((p) => p.id).slice(0, 3)))
  res = await req('GET', `/products?brand=${brandA.slug}&limit=100`)
  check('old brand page no longer lists it', !res.data.items.some((p) => p.id === formId), `${brandA.slug}`)

  check(
    'duplicate SKU in one payload -> 400',
    (
      await req('PUT', `/products/${formId}`, {
        token: admin,
        body: { variants: [{ sku: 'M8-DUP-1' }, { sku: 'M8-DUP-1' }] },
      })
    ).status === 400,
  )
  check(
    'SKU already used by another product -> 400',
    (
      await req('POST', '/products', {
        token: admin,
        body: {
          name: `M8 sku clash ${Date.now()}`,
          price: 1000,
          category: someCategory,
          variants: [{ sku: skuA }],
        },
      })
    ).status === 400,
  )

  res = await req('PUT', `/products/${formId}`, { token: admin, body: { imageUrls: [] } })
  check('emptying the gallery field removes the image', res.data?.images?.length === 0, JSON.stringify(res.data?.images))
  res = await req('PUT', `/products/${formId}`, { token: admin, body: { brand: null } })
  check('choosing "Tanpa brand" clears the label', res.data?.brand === null, JSON.stringify(res.data?.brand))

  // ---------------------------------------------------------- customer detail
  console.log('\ncustomer detail: the panel and the list agree')
  check('GET /admin/customers/:id without token -> 401', (await req('GET', '/admin/customers/x')).status === 401)
  check(
    'GET /admin/customers/:id as customer -> 403',
    (await req('GET', `/admin/customers/${buyer.id}`, { token: buyer.token })).status === 403,
  )
  check('unknown customer -> 404', (await req('GET', '/admin/customers/does-not-exist', { token: admin })).status === 404)

  const me = await req('GET', '/auth/me', { token: admin })
  check(
    'an admin account is not a customer -> 404',
    (await req('GET', `/admin/customers/${me.data?.id}`, { token: admin })).status === 404,
    JSON.stringify(me.data?.id),
  )

  res = await req('GET', `/admin/customers/${buyer.id}`, { token: admin })
  check('customer detail -> 200', res.status === 200, `${res.status}`)
  check('detail leaks no password hash', !JSON.stringify(res.data).includes('$2b$'), 'hash present')
  check('detail carries the order history', Array.isArray(res.data?.orders), JSON.stringify(res.data?.orders))
  check(
    'every history row reports its item count',
    (res.data?.orders ?? []).every((o) => Number.isInteger(o.itemCount) && typeof o.totalPrice === 'number'),
    JSON.stringify(res.data?.orders?.[0]),
  )
  check(
    'detail names the customer it belongs to',
    res.data?.customer?.email === buyer.email,
    `${res.data?.customer?.email}`,
  )

  // The row and the panel must never disagree about the same customer.
  res = await req('GET', `/admin/customers?search=${encodeURIComponent(buyer.email)}`, { token: admin })
  const listed = res.data.items.find((c) => c.id === buyer.id)
  const panel = await req('GET', `/admin/customers/${buyer.id}`, { token: admin })
  check('search finds the customer row', Boolean(listed), JSON.stringify(res.data.items.map((c) => c.email)))
  check('panel order count matches the row', panel.data?.summary?.ordersCount === listed?.ordersCount, `${panel.data?.summary?.ordersCount} vs ${listed?.ordersCount}`)
  check('panel collected count matches the row', panel.data?.summary?.collectedOrders === listed?.collectedOrders, `${panel.data?.summary?.collectedOrders} vs ${listed?.collectedOrders}`)
  check('panel total spent matches the row', panel.data?.summary?.totalSpent === listed?.totalSpent, `${panel.data?.summary?.totalSpent} vs ${listed?.totalSpent}`)
  check(
    'history is capped at the 20 most recent orders',
    (panel.data?.orders ?? []).length <= 20,
    `${panel.data?.orders?.length}`,
  )

  await req('DELETE', `/products/${formId}`, { token: admin })
  res = await req('GET', `/products/${formId}`)
  check('form fixture removed', res.status === 404, `${res.status}`)

  // --------------------------------------------------------------- reviews
  console.log('\nreviews: only buyers may review, and only admins may publish')
  check('GET /admin/reviews without token -> 401', (await req('GET', '/admin/reviews')).status === 401)
  check(
    'GET /admin/reviews as customer -> 403',
    (await req('GET', '/admin/reviews', { token: buyer.token })).status === 403,
  )
  check(
    'PATCH /admin/reviews/x as customer -> 403',
    (await req('PATCH', '/admin/reviews/x', { token: buyer.token, body: { status: 'PUBLISHED' } })).status === 403,
  )
  check(
    'DELETE /admin/reviews/x as customer -> 403',
    (await req('DELETE', '/admin/reviews/x', { token: buyer.token })).status === 403,
  )

  // Public list of the fixture before any review: honest zeroes, not fake rows.
  res = await req('GET', `/reviews/product/${fixtureId}`)
  check('public review list -> 200', res.status === 200, `${res.status}`)
  check('no reviews yet', res.data.items.length === 0 && res.data.summary.count === 0, JSON.stringify(res.data.summary))
  check('empty summary reads 0.0, not NaN', res.data.summary.average === 0, `${res.data.summary.average}`)

  // A stranger cannot review what they never bought.
  const stranger = await makeUser('stranger')
  res = await req('POST', `/reviews/product/${fixtureId}`, {
    token: stranger.token,
    body: { rating: 5, body: 'Belum pernah beli di sini tapi mau ikut nimbrung.' },
  })
  check('non-purchase review -> 403', res.status === 403, `${res.status} ${JSON.stringify(res.data)}`)

  // The buyer paid for the fixture earlier in this suite, so they are eligible.
  const reviewBody = {
    rating: 4,
    title: 'Muat dan nyaman',
    body: 'Dipakai seharian tidak melepuh, jahitan rapi. Pengiriman juga cepat.',
  }
  res = await req('POST', `/reviews/product/${fixtureId}`, { token: buyer.token, body: reviewBody })
  check('buyer review -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const reviewId = res.data?.id
  check('new review waits for moderation', res.data?.status === 'PENDING', `${res.data?.status}`)
  check('review records the unlocking order', Boolean(res.data?.orderId), `${res.data?.orderId}`)

  check(
    'duplicate review -> 409',
    (await req('POST', `/reviews/product/${fixtureId}`, { token: buyer.token, body: reviewBody })).status === 409,
  )
  check(
    'rating above 5 -> 400',
    (
      await req('POST', `/reviews/product/${fixtureId}`, {
        token: buyer.token,
        body: { rating: 6, body: 'Enam bintang, melebihi skala.' },
      })
    ).status === 400,
  )
  check(
    'rating below 1 -> 400',
    (
      await req('POST', `/reviews/product/${fixtureId}`, {
        token: buyer.token,
        body: { rating: 0, body: 'Nol bintang, di bawah skala.' },
      })
    ).status === 400,
  )
  check(
    'review without body -> 400',
    (await req('POST', `/reviews/product/${fixtureId}`, { token: buyer.token, body: { rating: 5 } })).status === 400,
  )
  check(
    'unknown product review -> 404',
    (
      await req('POST', '/reviews/product/does-not-exist', {
        token: buyer.token,
        body: { rating: 5, body: 'Produk hantu, bukan?' },
      })
    ).status === 404,
  )

  // The author sees their own row (so they know it is waiting), nobody else does.
  res = await req('GET', `/reviews/product/${fixtureId}/state`, { token: buyer.token })
  check('state tells the author to wait', res.data?.canReview === false && res.data?.reason === 'ALREADY_REVIEWED', JSON.stringify(res.data))
  check('state shows the pending review to its author', res.data?.review?.id === reviewId && res.data?.review?.status === 'PENDING', JSON.stringify(res.data?.review))

  res = await req('GET', `/reviews/product/${fixtureId}`)
  check('pending review is not public', res.data.items.length === 0, JSON.stringify(res.data.items))
  check('product rating ignores the pending review', res.data.summary.count === 0 && res.data.summary.average === 0, JSON.stringify(res.data.summary))

  // The product page the shopper renders reads the same summary.
  res = await req('GET', `/products/${fixtureId}`)
  check('product detail carries a zero rating while pending', res.data?.rating?.count === 0 && res.data?.rating?.average === 0, JSON.stringify(res.data?.rating))

  // The moderator's queue.
  res = await req('GET', '/admin/reviews?status=PENDING', { token: admin })
  check('admin queue lists the pending review', res.data.items.some((r) => r.id === reviewId), JSON.stringify(res.data.items.map((r) => r.id)))
  const queued = res.data.items.find((r) => r.id === reviewId)
  check('queue row names the author and product', queued?.author?.email === buyer.email && queued?.product?.name?.startsWith('M8 Fixture'), JSON.stringify(queued?.author))
  check('queue summary counts the pending', res.data.summary.pending >= 1, `${res.data.summary.pending}`)

  res = await req('GET', `/admin/reviews?search=${encodeURIComponent(reviewBody.body.slice(0, 20))}`, { token: admin })
  check('admin search finds the review by body', res.data.items.some((r) => r.id === reviewId), JSON.stringify(res.data.items.map((r) => r.id)))

  check(
    'moderation with nothing to update -> 400',
    (await req('PATCH', `/admin/reviews/${reviewId}`, { token: admin, body: {} })).status === 400,
  )
  check(
    'unknown review moderation -> 404',
    (await req('PATCH', '/admin/reviews/does-not-exist', { token: admin, body: { status: 'PUBLISHED' } })).status === 404,
  )
  check(
    'invalid status value -> 400',
    (await req('PATCH', `/admin/reviews/${reviewId}`, { token: admin, body: { status: 'TELEPORTED' } })).status === 400,
  )

  res = await req('PATCH', `/admin/reviews/${reviewId}`, {
    token: admin,
    body: { status: 'PUBLISHED', reply: 'Terima kasih, sudah 4 bintang dan jujur soal ukurannya!' },
  })
  check('publish with reply -> 200', res.status === 200 && res.data?.status === 'PUBLISHED', `${res.status} ${JSON.stringify(res.data?.status)}`)
  check('reply is stored', (res.data?.reply ?? '').includes('4 bintang'), `${res.data?.reply}`)

  // Two-sided: the storefront now shows it, with the store's reply.
  res = await req('GET', `/reviews/product/${fixtureId}`)
  check('published review is public', res.data.items.some((r) => r.id === reviewId), JSON.stringify(res.data.items))
  const publicReview = res.data.items.find((r) => r.id === reviewId)
  check('public row carries the author name', publicReview?.author === 'M8 buyer', `${publicReview?.author}`)
  check('public row hides the author email', !('email' in (publicReview ?? {})), JSON.stringify(Object.keys(publicReview ?? {})))
  check('public row carries the store reply', (publicReview?.reply ?? '').includes('4 bintang'), `${publicReview?.reply}`)
  check('summary now counts it', res.data.summary.count === 1 && res.data.summary.average === 4, JSON.stringify(res.data.summary))
  check('distribution places it on 4 stars', res.data.summary.distribution['4'] === 1, JSON.stringify(res.data.summary.distribution))

  res = await req('GET', `/products/${fixtureId}`)
  check('product page shows the rating', res.data?.rating?.count === 1 && res.data?.rating?.average === 4, JSON.stringify(res.data?.rating))

  res = await req('GET', '/notifications', { token: buyer.token })
  check('author notified their review went live', res.data.some((n) => n.type === 'REVIEW_PUBLISHED' && n.meta?.reviewId === reviewId), JSON.stringify(res.data.slice(0, 3).map((n) => n.type)))
  const adminNotes = await req('GET', '/notifications', { token: admin })
  check('admins were notified about the submission', adminNotes.data.some((n) => n.type === 'REVIEW_SUBMITTED' && n.meta?.reviewId === reviewId), JSON.stringify(adminNotes.data.slice(0, 3).map((n) => n.type)))

  // A second review, rejected — it must never reach the storefront.
  const rejectBody = { rating: 1, body: 'Barang oke tapi kurirnya hilang, mau marah ke siapa.' }
  // The buyer already used their one review on this product, so eligibility
  // for a second product needs a second purchase — use the brand fixture
  // instead: it was deleted, so create a fresh one.
  const rejectProduct = (
    await req('POST', '/products', {
      token: admin,
      body: { name: `M8 review reject fixture ${Date.now()}`, price: 50000, stock: 2, category: someCategory },
    })
  ).data
  await req('POST', '/cart/items', { token: buyer.token, body: { productId: rejectProduct.id, quantity: 1 } })
  res = await req('POST', '/orders/checkout', { token: buyer.token, body: { addressId: address.id } })
  const rejectOrder = res.data
  const rejectPayment = (await req('POST', '/payments', { token: buyer.token, body: { orderId: rejectOrder.id } })).data
  const rejectPayBody = JSON.stringify({
    eventId: `evt-${randomUUID()}`,
    type: 'payment.captured',
    providerRef: rejectPayment.providerRef,
    amount: rejectPayment.amount,
    method: 'mock_va',
    occurredAt: new Date().toISOString(),
  })
  await req('POST', '/payments/webhook', { raw: rejectPayBody, signature: sign(rejectPayBody) })

  res = await req('POST', `/reviews/product/${rejectProduct.id}`, { token: buyer.token, body: rejectBody })
  check('second-product review -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const rejectedId = res.data?.id
  res = await req('PATCH', `/admin/reviews/${rejectedId}`, { token: admin, body: { status: 'REJECTED' } })
  check('reject -> 200', res.status === 200 && res.data?.status === 'REJECTED', `${res.status}`)

  res = await req('GET', `/reviews/product/${rejectProduct.id}`)
  check('rejected review is not public', res.data.items.length === 0 && res.data.summary.count === 0, JSON.stringify(res.data.items))

  res = await req('GET', `/reviews/product/${rejectProduct.id}/state`, { token: buyer.token })
  check('author still sees their rejected review', res.data?.review?.status === 'REJECTED', JSON.stringify(res.data?.review))

  res = await req('GET', '/notifications', { token: buyer.token })
  check('author notified about the rejection', res.data.some((n) => n.type === 'REVIEW_REJECTED' && n.meta?.reviewId === rejectedId), JSON.stringify(res.data.slice(0, 3).map((n) => n.type)))

  // The buyer's own list across products.
  res = await req('GET', '/reviews/mine', { token: buyer.token })
  check('my reviews lists both rows', res.data.some((r) => r.id === reviewId) && res.data.some((r) => r.id === rejectedId), JSON.stringify(res.data.map((r) => r.id)))
  check('my reviews names the product', res.data.every((r) => typeof r.product?.name === 'string'), JSON.stringify(res.data[0]))
  check('GET /reviews/mine without token -> 401', (await req('GET', '/reviews/mine')).status === 401)

  // Deleting a review removes it everywhere at once.
  res = await req('DELETE', `/admin/reviews/${rejectedId}`, { token: admin })
  check('delete review -> 200', res.status === 200 && res.data?.deleted === true, `${res.status}`)
  check('delete unknown review -> 404', (await req('DELETE', '/admin/reviews/does-not-exist', { token: admin })).status === 404)
  res = await req('GET', '/reviews/mine', { token: buyer.token })
  check('deleted review left the author list', !res.data.some((r) => r.id === rejectedId), JSON.stringify(res.data.map((r) => r.id)))

  // Cleanup: the reject fixture and its paid order would otherwise linger.
  await patch(rejectOrder.id, 'REFUNDED', 'cleanup after review checks')
  await req('DELETE', `/products/${rejectProduct.id}`, { token: admin })
  await req('DELETE', `/admin/reviews/${reviewId}`, { token: admin })
  res = await req('GET', `/reviews/product/${fixtureId}`)
  check('fixture catalog left with no reviews', res.data.items.length === 0, JSON.stringify(res.data.items))

  // ---------------------------------------------- pencarian cepat (Ctrl+K)
  console.log('\npencarian cepat: /admin/search melayani palette Ctrl+K')
  check('GET /admin/search without token -> 401', (await req('GET', '/admin/search?q=sandal')).status === 401)
  check(
    'GET /admin/search as customer -> 403',
    (await req('GET', '/admin/search?q=sandal', { token: buyer.token })).status === 403,
  )
  check('missing q -> 400', (await req('GET', '/admin/search', { token: admin })).status === 400)
  check('a single letter is too short -> 400', (await req('GET', '/admin/search?q=a', { token: admin })).status === 400)
  check(
    'a limit past the cap -> 400',
    (await req('GET', '/admin/search?q=sandal&limit=100', { token: admin })).status === 400,
  )

  // A name and a SKU nothing else in the catalog shares, so a hit can only be
  // this fixture — a search that matched something seeded would prove nothing.
  const searchMark = `Zq${Date.now()}`
  const searchSku = `${searchMark}-SKU-42`
  const searchProduct = await req('POST', '/products', {
    token: admin,
    body: {
      name: `M8 ${searchMark} sepatu cepat`,
      price: 123000,
      category: someCategory,
      stock: 4,
      // Axes follow the catalog's own convention (color/size). A fixture with a
      // private axis would, if this suite ever died before cleanup, upset the
      // M6-M7 catalog check that reads the first product carrying variants.
      variants: [{ sku: searchSku, options: { color: 'Merah', size: '42' }, stock: 4 }],
    },
  })
  const searchId = searchProduct.data?.id
  check('search fixture created', Boolean(searchId), `${searchProduct.status}`)

  res = await req('GET', `/admin/search?q=${encodeURIComponent(searchMark)}`, { token: admin })
  check('product found by name', (res.data?.products ?? []).some((p) => p.id === searchId), JSON.stringify(res.data?.products))
  check(
    'all three groups are lists',
    Array.isArray(res.data?.products) && Array.isArray(res.data?.orders) && Array.isArray(res.data?.customers),
    JSON.stringify(Object.keys(res.data ?? {})),
  )
  check('the response echoes the query', res.data?.query === searchMark, `${res.data?.query}`)

  res = await req('GET', `/admin/search?q=${encodeURIComponent(searchSku)}`, { token: admin })
  const skuHit = (res.data?.products ?? []).find((p) => p.id === searchId)
  check('product found by variant SKU', Boolean(skuHit), JSON.stringify(res.data?.products))
  check(
    'the SKU that matched is named, not guessed',
    skuHit?.matchedSkus?.includes(searchSku),
    JSON.stringify(skuHit?.matchedSkus),
  )

  // The row the palette opens must be the same product the Produk screen shows
  // — the palette prints these fields verbatim, so they have to be strings.
  const catalogRow = await req('GET', `/products/${searchId}`)
  check('palette row matches the catalog row', catalogRow.data?.name === skuHit?.name, `${catalogRow.data?.name} vs ${skuHit?.name}`)
  check('the palette row carries the category as a name', skuHit?.category === catalogRow.data?.category, `${JSON.stringify(skuHit?.category)} vs ${JSON.stringify(catalogRow.data?.category)}`)
  check(
    'the product row has no object where the palette prints text',
    [...res.data.products].every((p) => typeof p.name === 'string' && typeof p.category === 'string'),
    JSON.stringify(res.data.products.map((p) => ({ name: typeof p.name, category: typeof p.category }))),
  )

  res = await req('GET', `/admin/search?q=${encodeURIComponent(buyer.email)}`, { token: admin })
  check('customer found by email', (res.data?.customers ?? []).some((c) => c.id === buyer.id), JSON.stringify(res.data?.customers))
  check(
    'every order hit really belongs to that customer',
    (res.data?.orders ?? []).length > 0 && (res.data?.orders ?? []).every((o) => o.user?.email === buyer.email),
    JSON.stringify(res.data?.orders?.map((o) => o.user?.email)),
  )
  check(
    'an admin account is never returned as a customer',
    !(res.data?.customers ?? []).some((c) => c.email === 'admin@example.com'),
    JSON.stringify(res.data?.customers?.map((c) => c.email)),
  )
  // These rows are printed verbatim by the palette; a nested object anywhere
  // here would reach the screen as "[object Object]".
  check(
    'order and customer rows hold only printable fields',
    res.data.orders.every(
      (o) =>
        typeof o.id === 'string' &&
        typeof o.status === 'string' &&
        typeof o.totalPrice === 'number' &&
        typeof o.user?.email === 'string',
    ) && res.data.customers.every((c) => typeof c.email === 'string' && typeof c.id === 'string'),
    JSON.stringify([res.data.orders[0], res.data.customers[0]]),
  )

  res = await req('GET', `/admin/search?q=${encodeURIComponent(searchMark)}&limit=1`, { token: admin })
  check('limit is honoured per group', (res.data?.products ?? []).length <= 1, JSON.stringify(res.data?.products))
  check('limit is echoed back', res.data?.limit === 1, `${res.data?.limit}`)

  res = await req('GET', `/admin/search?q=${encodeURIComponent(`tidakada${Date.now()}`)}`, { token: admin })
  check(
    'an unknown query is empty groups, not an error',
    res.status === 200 &&
      res.data.products.length === 0 &&
      res.data.orders.length === 0 &&
      res.data.customers.length === 0,
    `${res.status}`,
  )

  // ---------------------------------------------------- bell notifikasi admin
  console.log('\nbell notifikasi: feed per pengguna, dan pesanan baru sampai ke admin')
  check('GET /notifications without token -> 401', (await req('GET', '/notifications')).status === 401)
  check(
    'GET /notifications/unread-count without token -> 401',
    (await req('GET', '/notifications/unread-count')).status === 401,
  )

  const unreadBefore = (await req('GET', '/notifications/unread-count', { token: admin })).data?.count
  // The fixture carries a variant, and a variant product cannot be carted
  // without naming one — the rule M10 enforces on both sides.
  const carted = await req('POST', '/cart/items', {
    token: buyer.token,
    body: { productId: searchId, quantity: 1, variantSku: searchSku },
  })
  check('the fixture product went into the cart', carted.status === 201, `${carted.status} ${JSON.stringify(carted.data)}`)
  const bellOrder = (await req('POST', '/orders/checkout', { token: buyer.token, body: { addressId: address.id } })).data
  check('the checkout this section relies on succeeded', Boolean(bellOrder?.id), JSON.stringify(bellOrder))

  const unreadAfter = (await req('GET', '/notifications/unread-count', { token: admin })).data?.count
  check('a new order raises the admin unread count', unreadAfter > unreadBefore, `${unreadBefore} -> ${unreadAfter}`)

  const adminFeed = await req('GET', '/notifications', { token: admin })
  const adminRow = (adminFeed.data ?? []).find((n) => (n.meta?.orderId ?? '') === bellOrder.id)
  check('the admin feed carries a row for that order', Boolean(adminRow), JSON.stringify(adminFeed.data?.[0]))
  check('the row is typed ORDER_CREATED', adminRow?.type === 'ORDER_CREATED', `${adminRow?.type}`)
  check('the row arrives unread', adminRow?.readAt === null, JSON.stringify(adminRow?.readAt))
  // Guarded by `Boolean(adminRow)`: without it a missing row would compare
  // undefined to undefined and pass while proving nothing.
  check(
    'the row carries the order id the bell links with',
    Boolean(adminRow) && adminRow.meta?.orderId === bellOrder.id,
    JSON.stringify(adminRow?.meta),
  )

  // The same order writes a different row for the buyer: the feed is per user.
  const buyerFeed = await req('GET', '/notifications', { token: buyer.token })
  check(
    "the admin's row is not in the buyer's feed",
    Boolean(adminRow) && !(buyerFeed.data ?? []).some((n) => n.id === adminRow.id),
    JSON.stringify(buyerFeed.data?.map((n) => n.type)),
  )
  check(
    'the buyer got their own row for the same order',
    Boolean(bellOrder?.id) &&
      (buyerFeed.data ?? []).some((n) => n.type === 'ORDER_CREATED' && n.meta?.orderId === bellOrder.id),
    JSON.stringify(buyerFeed.data?.map((n) => n.type)),
  )

  // `adminRow` is asserted above; these checks report a failure rather than
  // crashing the whole suite if that assertion ever stops holding.
  res = adminRow
    ? await req('POST', `/notifications/${adminRow.id}/read`, { token: admin })
    : { status: 0, data: null }
  check('marking a row read -> 200 with a timestamp', res.status === 200 && Boolean(res.data?.readAt), `${res.status}`)
  check(
    'the unread count drops by exactly one',
    (await req('GET', '/notifications/unread-count', { token: admin })).data?.count === unreadAfter - 1,
    `${(await req('GET', '/notifications/unread-count', { token: admin })).data?.count}`,
  )
  check(
    "another user cannot mark my row read -> 404",
    adminRow
      ? (await req('POST', `/notifications/${adminRow.id}/read`, { token: buyer.token })).status === 404
      : false,
  )
  check(
    'an unknown notification -> 404',
    (await req('POST', '/notifications/does-not-exist/read', { token: admin })).status === 404,
  )

  // The failure path writes an admin row too — that is what makes the bell
  // useful during an incident, so it is asserted rather than assumed. The order
  // is still PENDING, so it doubles as the fixture here.
  const failPayment = bellOrder
    ? await req('POST', '/payments', { token: buyer.token, body: { orderId: bellOrder.id } })
    : { status: 0, data: null }
  check('payment created for the failure check', failPayment.status === 201, `${failPayment.status}`)
  const failBody = failPayment.data
    ? JSON.stringify({
        eventId: `evt-${randomUUID()}`,
        type: 'payment.failed',
        providerRef: failPayment.data.providerRef,
        amount: failPayment.data.amount,
        method: 'mock_va',
        occurredAt: new Date().toISOString(),
      })
    : null
  res = failBody
    ? await req('POST', '/payments/webhook', { raw: failBody, signature: sign(failBody) })
    : { status: 0, data: null }
  check('the failed-payment webhook was applied', res.status === 200, `${res.status} ${JSON.stringify(res.data)}`)

  const failFeed = await req('GET', '/notifications', { token: admin })
  const failRow = (failFeed.data ?? []).find(
    (n) => n.type === 'PAYMENT_FAILED' && n.meta?.orderId === bellOrder?.id,
  )
  check(
    'a failed payment reaches the admin feed',
    Boolean(bellOrder?.id) && Boolean(failRow),
    JSON.stringify(failFeed.data?.[0]),
  )
  check('the failure row arrives unread', failRow?.readAt === null, JSON.stringify(failRow?.readAt))
  check(
    'a failed payment leaves the order pending, not cancelled',
    bellOrder?.id
      ? (await req('GET', `/admin/orders/${bellOrder.id}`, { token: admin })).data?.status === 'PENDING'
      : false,
    'order moved off PENDING',
  )

  res = await req('POST', '/notifications/read-all', { token: admin })
  check('read-all reports how many rows changed', Number.isInteger(res.data?.updated), JSON.stringify(res.data))
  check(
    'after read-all nothing is unread',
    (await req('GET', '/notifications/unread-count', { token: admin })).data?.count === 0,
  )

  // --------------------------------------------------------------- cleanup
  console.log('\ncleanup: removing the fixture from the catalog')
  // The bell order holds stock on the search fixture, so it is cancelled before
  // the product can go.
  if (bellOrder?.id) await req('POST', `/orders/${bellOrder.id}/cancel`, { token: buyer.token })
  res = await req('DELETE', `/products/${searchId}`, { token: admin })
  check('search fixture removed', res.status === 200, `${res.status}`)
  res = await req('DELETE', `/products/${fixtureId}`, { token: admin })
  check('fixture removed', res.status === 200, `${res.status}`)

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('suite crashed:', error)
  process.exit(1)
})
