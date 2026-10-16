/**
 * M6 (payment) + M7 (inventory) end-to-end check.
 *
 * Covers:
 * - fashion catalog shape (categories, variants, availability)
 * - checkout holds stock instead of deducting it
 * - payment creation, webhook signature verification, idempotency, amount check
 * - capture -> on-hand deduction + ledger + notification
 * - failed / expired / cancelled lifecycle and hold release
 * - oversell protection with two buyers racing for the last unit
 * - admin stock adjustment, ledgers, low-stock alerts, expired-order sweeper
 *
 * Usage: node scripts/m6-m7-e2e.mjs   (backend must run on :3002, from backend/)
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
  const email = `m6-${tag}-${Date.now()}-${seq++}@example.com`
  const res = await req('POST', '/auth/signup', {
    body: { email, password: 'Pass1234', name: `M6 ${tag}` },
  })
  if (res.status !== 201) throw new Error(`signup failed ${res.status} ${JSON.stringify(res.data)}`)
  return { email, token: res.data.accessToken, id: res.data.id }
}

async function signIn(email, password) {
  const res = await req('POST', '/auth/login', { body: { email, password } })
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`)
  return res.data.accessToken
}

const customer = () => ({
  recipient: 'Ani Lestari',
  phone: '081234567890',
  line1: 'Jl. Sudirman No. 5',
  city: 'Jakarta',
  postalCode: '10220',
})

async function main() {
  const health = await req('GET', '/health')
  if (health.status !== 200) throw new Error('backend not healthy — start it first')

  const admin = await signIn('admin@example.com', 'admin123')
  const buyer = await makeUser('buyer')
  const rival = await makeUser('rival')

  const address = (await req('POST', '/addresses', { token: buyer.token, body: customer() })).data
  const rivalAddress = (
    await req('POST', '/addresses', { token: rival.token, body: customer() })
  ).data

  const product = async (id) => (await req('GET', `/products/${id}`)).data
  const adjust = (body) => req('POST', '/inventory/adjust', { token: admin, body })

  // --------------------------------------------------------------- catalog
  console.log('\ncatalog: fashion categories + variants')
  const categories = await req('GET', '/products/categories')
  const expected = [
    'Baju Wanita',
    'Baju Pria',
    'Baju Anak',
    'Aksesoris',
    'Sweater & Jacket',
    'Sepatu Pria',
    'Sepatu Wanita',
    'Sepatu Anak',
  ]
  check('all 8 fashion categories present', expected.every((c) => categories.data.includes(c)), JSON.stringify(categories.data))

  const list = await req('GET', '/products?limit=100')
  check('catalog has products only from those categories', list.data.items.every((p) => expected.includes(p.category)), JSON.stringify([...new Set(list.data.items.map((p) => p.category))]))
  const withVariants = list.data.items.find((p) => (p.variants ?? []).length > 0)
  check('product exposes color/size variants with SKUs', Boolean(withVariants?.variants?.[0]?.sku && withVariants.variants[0].options?.color), JSON.stringify(withVariants?.variants?.[0]))
  check('list exposes stock, reserved and available', ['stock', 'reserved', 'available'].every((k) => typeof list.data.items[0][k] === 'number'), JSON.stringify(list.data.items[0]))

  // ------------------------------------------------------------- fixtures
  // This suite mutates stock through the sales path, so it creates its own
  // fixtures instead of borrowing the seed catalog (whose products all carry
  // variants, and a cart line for those must name a SKU). Deleting them at the
  // end leaves the demo catalog untouched.
  const createFixture = async (name, price, stock, variants) => {
    const res = await req('POST', '/products', {
      token: admin,
      body: {
        name,
        description: 'm6-m7 fixture',
        price,
        stock,
        category: 'Baju Pria',
        ...(variants ? { variants } : {}),
      },
    })
    if (res.status !== 201) throw new Error(`create fixture failed ${res.status} ${JSON.stringify(res.data)}`)
    return res.data
  }

  // Priced above the SUMMER20 minimum purchase (200000) so the coupon applies.
  const fixture = await createFixture(`M6 Fixture Kemeja ${Date.now()}`, 320000, 10)
  const fixtureBefore = fixture.stock
  console.log(`\nfixture: ${fixture.name} (stock ${fixture.stock}, available ${fixture.available}, price ${fixture.price})`)

  // -------------------------------------------- checkout holds, not deducts
  console.log('\ncheckout: stock is held, not deducted')
  await req('POST', '/cart/items', { token: buyer.token, body: { productId: fixture.id, quantity: 2 } })
  let res = await req('POST', '/orders/checkout', {
    token: buyer.token,
    body: { addressId: address.id, couponCode: 'SUMMER20' },
  })
  check('checkout -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const order = res.data
  check('order starts PENDING with expiry', order.status === 'PENDING' && Boolean(order.expiresAt), JSON.stringify({ status: order.status, expiresAt: order.expiresAt }))

  let snap = await product(fixture.id)
  check(`on-hand stock untouched (${fixtureBefore})`, snap.stock === fixtureBefore, `${snap.stock}`)
  check('2 units are now held', snap.reserved === 2, `reserved=${snap.reserved}`)
  check('available dropped by 2', snap.available === fixtureBefore - 2, `available=${snap.available}`)

  res = await req('GET', `/orders/inventory?productId=${fixture.id}`, { token: buyer.token })
  check('reservation writes no on-hand ledger row', res.data.length === 0, JSON.stringify(res.data))

  // ------------------------------------------------------- payment create
  console.log('\npayment: create')
  res = await req('POST', '/payments', { token: buyer.token, body: { orderId: order.id } })
  check('POST /payments -> 201 PENDING', res.status === 201 && res.data.status === 'PENDING', `${res.status} ${JSON.stringify(res.data)}`)
  const payment = res.data
  check('payment amount equals order total', payment.amount === order.totalPrice, `${payment.amount} vs ${order.totalPrice}`)
  check('payment exposes a gateway url with the reference', typeof payment.paymentUrl === 'string' && payment.paymentUrl.includes(payment.providerRef), `${payment.paymentUrl}`)

  res = await req('POST', '/payments', { token: rival.token, body: { orderId: order.id } })
  check("another user's order -> 404", res.status === 404, `${res.status}`)

  // ------------------------------------------------------ webhook security
  console.log('\nwebhook: signature + idempotency')
  const capturedBody = JSON.stringify({
    eventId: `evt-${randomUUID()}`,
    type: 'payment.captured',
    providerRef: payment.providerRef,
    amount: payment.amount,
    method: 'mock_va',
    occurredAt: new Date().toISOString(),
  })

  res = await req('POST', '/payments/webhook', { raw: capturedBody, signature: 'deadbeef' })
  check('bad signature -> 401', res.status === 401, `${res.status} ${JSON.stringify(res.data)}`)

  res = await req('POST', '/payments/webhook', { raw: capturedBody, signature: 'x'.repeat(64) })
  check('forged signature -> 401', res.status === 401, `${res.status}`)

  const sign = (body) => createHmac('sha256', MOCK_SECRET).update(Buffer.from(body, 'utf8')).digest('hex')

  res = await req('POST', '/payments/webhook', { raw: capturedBody, signature: sign(capturedBody) })
  check('valid signature -> 200 applied', res.status === 200 && res.data.duplicate === false, `${res.status} ${JSON.stringify(res.data)}`)

  res = await req('POST', '/payments/webhook', { raw: capturedBody, signature: sign(capturedBody) })
  check('replay of the same event is a no-op', res.status === 200 && res.data.duplicate === true, `${res.status} ${JSON.stringify(res.data)}`)

  // --------------------------------------------------------- after capture
  console.log('\ncapture effects')
  res = await req('GET', `/orders/${order.id}`, { token: buyer.token })
  check('order is PAID with paidAt', res.data.status === 'PAID' && Boolean(res.data.paidAt), `${res.data.status}`)

  snap = await product(fixture.id)
  check(`on-hand stock deducted (${fixtureBefore - 2})`, snap.stock === fixtureBefore - 2, `${snap.stock}`)
  check('holds released after capture', snap.reserved === 0, `reserved=${snap.reserved}`)

  res = await req('GET', `/payments/order/${order.id}`, { token: buyer.token })
  check('payment is PAID', res.data.some((p) => p.providerRef === payment.providerRef && p.status === 'PAID'), JSON.stringify(res.data.map((p) => p.status)))

  res = await req('GET', `/orders/inventory?productId=${fixture.id}`, { token: buyer.token })
  const deduct = res.data.filter((t) => t.type === 'DEDUCT')
  check('exactly one DEDUCT row of 2 units', deduct.length === 1 && deduct[0].quantity === 2, JSON.stringify(res.data))
  check('ledger before/after is correct', deduct[0]?.stockBefore === fixtureBefore && deduct[0]?.stockAfter === fixtureBefore - 2, JSON.stringify(deduct[0]))

  res = await req('GET', '/notifications', { token: buyer.token })
  check('buyer got a payment notification', res.data.some((n) => n.type === 'ORDER_PAID'), JSON.stringify(res.data.map((n) => n.type)))

  res = await req('POST', `/orders/${order.id}/cancel`, { token: buyer.token })
  check('paid order cannot be cancelled directly', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  // --------------------------------------------------- amount tampering
  console.log('\nwebhook: amount tampering')
  await req('POST', '/cart/items', { token: rival.token, body: { productId: fixture.id, quantity: 1 } })
  const tamperOrder = (
    await req('POST', '/orders/checkout', { token: rival.token, body: { addressId: rivalAddress.id } })
  ).data
  const tamperPayment = (
    await req('POST', '/payments', { token: rival.token, body: { orderId: tamperOrder.id } })
  ).data
  const tamperBody = JSON.stringify({
    eventId: `evt-${randomUUID()}`,
    type: 'payment.captured',
    providerRef: tamperPayment.providerRef,
    amount: 1,
  })
  res = await req('POST', '/payments/webhook', { raw: tamperBody, signature: sign(tamperBody) })
  check('amount mismatch -> 400 and not applied', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)
  res = await req('GET', `/orders/${tamperOrder.id}`, { token: rival.token })
  check('tampered order stays PENDING', res.data.status === 'PENDING', res.data.status)

  // ------------------------------------------------------- failed & expired
  console.log('\nsandbox simulate: failed / expired')
  res = await req('POST', `/payments/simulate/${tamperPayment.providerRef}/failed`, { token: rival.token })
  check('simulate failed -> 200', res.status === 200, `${res.status} ${JSON.stringify(res.data)}`)
  res = await req('GET', `/payments/order/${tamperOrder.id}`, { token: rival.token })
  check('failed payment recorded', res.data.some((p) => p.status === 'FAILED'), JSON.stringify(res.data.map((p) => p.status)))
  res = await req('GET', `/orders/${tamperOrder.id}`, { token: rival.token })
  check('order still payable after a failure', res.data.status === 'PENDING', res.data.status)

  // Cancel that order and confirm the hold + coupon are released.
  res = await req('POST', `/orders/${tamperOrder.id}/cancel`, { token: rival.token })
  check('customer cancels PENDING order -> 200', res.status === 200 && res.data.status === 'CANCELLED', `${res.status}`)
  res = await req('POST', `/orders/${tamperOrder.id}/cancel`, { token: rival.token })
  check('double cancel -> 400', res.status === 400, `${res.status}`)
  snap = await product(fixture.id)
  check('cancelled order released its hold', snap.available === snap.stock, `available=${snap.available} stock=${snap.stock}`)

  // expired payment path
  await req('POST', '/cart/items', { token: rival.token, body: { productId: fixture.id, quantity: 1 } })
  const expOrder = (
    await req('POST', '/orders/checkout', { token: rival.token, body: { addressId: rivalAddress.id } })
  ).data
  const expPayment = (
    await req('POST', '/payments', { token: rival.token, body: { orderId: expOrder.id } })
  ).data
  res = await req('POST', `/payments/simulate/${expPayment.providerRef}/expired`, { token: rival.token })
  check('simulate expired -> 200', res.status === 200, `${res.status}`)
  res = await req('GET', `/orders/${expOrder.id}`, { token: rival.token })
  check('expired payment cancels the order', res.data.status === 'CANCELLED', res.data.status)
  snap = await product(fixture.id)
  check('expired hold released', snap.available === snap.stock, `available=${snap.available}`)

  res = await req('POST', `/payments/simulate/${payment.providerRef}/captured`, { token: rival.token })
  check("simulate on someone else's payment -> 404", res.status === 404, `${res.status}`)
  res = await req('POST', `/payments/simulate/${payment.providerRef}/captured`, { token: buyer.token })
  check('simulate on an already-paid payment is a no-op', res.status === 200 && res.data.duplicate === false, `${res.status} ${JSON.stringify(res.data)}`)

  // --------------------------------------------------- coupon refund on cancel
  console.log('\ncoupon: refunded when an order never completes')
  // A dedicated buyer: the coupon is single-use per user, and the fixture's
  // price (229000) clears the SUMMER20 minimum purchase of 200000.
  const couponUser = await makeUser('coupon')
  const couponAddress = (
    await req('POST', '/addresses', { token: couponUser.token, body: customer() })
  ).data
  await req('POST', '/cart/items', {
    token: couponUser.token,
    body: { productId: fixture.id, quantity: 1 },
  })
  const couponOrder = (
    await req('POST', '/orders/checkout', {
      token: couponUser.token,
      body: { addressId: couponAddress.id, couponCode: 'SUMMER20' },
    })
  ).data
  check('checkout with coupon -> PENDING order', couponOrder?.status === 'PENDING', JSON.stringify(couponOrder))
  check('coupon discount applied', couponOrder?.discount > 0, `${couponOrder?.discount}`)
  res = await req('POST', '/coupons/validate', {
    token: couponUser.token,
    body: { code: 'SUMMER20', subtotal: 500000 },
  })
  check('coupon is single-use while the order lives', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)
  res = await req('POST', `/orders/${couponOrder.id}/cancel`, { token: couponUser.token })
  check('order with coupon cancelled', res.status === 200, `${res.status}`)
  res = await req('POST', '/coupons/validate', {
    token: couponUser.token,
    body: { code: 'SUMMER20', subtotal: 500000 },
  })
  check('coupon usable again after cancel', res.status === 200, `${res.status} ${JSON.stringify(res.data)}`)

  // ------------------------------------------------------- oversell (race)
  console.log('\noversell: two buyers, last unit, concurrent checkout')
  const raceProduct = await createFixture(`M6 Race ${Date.now()}`, 50000, 5)
  await adjust({
    productId: raceProduct.id,
    delta: 1 - (await product(raceProduct.id)).stock,
    reason: 'e2e: set stock to exactly 1',
  })
  let raceSnap = await product(raceProduct.id)
  check('fixture has exactly 1 available', raceSnap.available === 1, JSON.stringify(raceSnap))

  await req('POST', '/cart/items', { token: buyer.token, body: { productId: raceProduct.id, quantity: 1 } })
  await req('POST', '/cart/items', { token: rival.token, body: { productId: raceProduct.id, quantity: 1 } })

  const [ra, rb] = await Promise.all([
    req('POST', '/orders/checkout', { token: buyer.token, body: { addressId: address.id } }),
    req('POST', '/orders/checkout', { token: rival.token, body: { addressId: rivalAddress.id } }),
  ])
  const statuses = [ra.status, rb.status].sort()
  check('exactly one checkout wins the unit', statuses[0] === 201 && statuses[1] === 400, JSON.stringify(statuses))
  raceSnap = await product(raceProduct.id)
  check('loser did not over-reserve', raceSnap.reserved === 1 && raceSnap.available === 0, JSON.stringify(raceSnap))
  check('on-hand stock still intact before payment', raceSnap.stock === 1, `${raceSnap.stock}`)

  const winnerToken = ra.status === 201 ? buyer.token : rival.token
  const loserToken = ra.status === 201 ? rival.token : buyer.token
  const winnerOrder = ra.status === 201 ? ra.data : rb.data

  const winnerPayment = (
    await req('POST', '/payments', { token: winnerToken, body: { orderId: winnerOrder.id } })
  ).data
  res = await req('POST', `/payments/simulate/${winnerPayment.providerRef}/captured`, { token: winnerToken })
  check('winner pays -> 200', res.status === 200, `${res.status}`)
  raceSnap = await product(raceProduct.id)
  check('stock reaches exactly 0 (never negative)', raceSnap.stock === 0 && raceSnap.available === 0, JSON.stringify(raceSnap))

  // loser can no longer add the item
  res = await req('POST', '/cart/items', { token: loserToken, body: { productId: raceProduct.id, quantity: 1 } })
  check('sold-out product cannot be added to cart', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  // ------------------------------------------------------------- M7 admin
  console.log('\nM7: admin inventory')
  res = await req('GET', '/inventory/low-stock', { token: buyer.token })
  check('low-stock requires ADMIN -> 403', res.status === 403, `${res.status}`)

  res = await req('GET', '/inventory/low-stock', { token: admin })
  check('low-stock -> 200 list', res.status === 200 && Array.isArray(res.data), `${res.status}`)
  check('sold-out product is flagged', res.data.some((r) => r.productId === raceProduct.id && r.available === 0), JSON.stringify(res.data.slice(0, 3)))

  // A variant-less product carries its own stock, so a product-level adjust
  // applies to it directly.
  const adjustProduct = await createFixture(`M6 Adjust ${Date.now()}`, 100000, 20)
  const beforeAdjust = (await product(adjustProduct.id)).stock
  res = await adjust({ productId: adjustProduct.id, delta: 5, reason: 'e2e restock' })
  check('adjust +5 -> 200', res.status === 200 && res.data.stock === beforeAdjust + 5, `${res.status} ${JSON.stringify(res.data)}`)
  res = await adjust({ productId: adjustProduct.id, delta: -(beforeAdjust + 10), reason: 'e2e impossible' })
  check('adjust below zero -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)
  res = await adjust({ productId: adjustProduct.id, delta: 0, reason: 'e2e zero' })
  check('delta 0 -> 400', res.status === 400, `${res.status}`)

  // A product with variants has a *derived* stock (the sum of its SKUs), so a
  // product-level adjust is refused — it would desync the total — and only a
  // variant-level correction is accepted. The product total follows along.
  const variantAdjust = await createFixture(`M6 Variant Adjust ${Date.now()}`, 100000, 0, [
    { sku: `M6-ADJ-A-${Date.now()}`, options: { Warna: 'Hitam', Ukuran: '42' }, stock: 4 },
    { sku: `M6-ADJ-B-${Date.now()}`, options: { Warna: 'Putih', Ukuran: '42' }, stock: 1 },
  ])
  check('variant fixture stock = sum of SKUs', variantAdjust.stock === 5, `${variantAdjust.stock}`)
  res = await adjust({ productId: variantAdjust.id, delta: 3, reason: 'e2e product-level on variant product' })
  check('product-level adjust on a variant product -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  const variantSku = variantAdjust.variants[0].sku
  const variantBefore = variantAdjust.variants[0].stock
  res = await adjust({ productId: variantAdjust.id, variantSku, delta: 3, reason: 'e2e variant restock' })
  check('variant adjustment -> 200', res.status === 200 && res.data.stock === variantBefore + 3, `${res.status} ${JSON.stringify(res.data)}`)
  check('product stock follows the variant', (await product(variantAdjust.id)).stock === variantAdjust.stock + 3, `${(await product(variantAdjust.id)).stock}`)

  res = await req('GET', `/inventory/history?productId=${variantAdjust.id}`, { token: admin })
  const adjustRows = res.data.filter((t) => t.type === 'ADJUST')
  check('adjustment is in the ledger as ADJUST', adjustRows.length >= 1, JSON.stringify(res.data))
  check('ledger records the acting admin', adjustRows.every((t) => Boolean(t.userId)), JSON.stringify(adjustRows[0]))
  check('variant ledger row records the SKU', adjustRows.every((t) => t.variantSku === variantSku), JSON.stringify(adjustRows[0]))

  // low stock alert notification for admins
  const adminNotifications = await req('GET', '/notifications', { token: admin })
  check('admins receive LOW_STOCK notifications', adminNotifications.data.some((n) => n.type === 'LOW_STOCK'), JSON.stringify(adminNotifications.data.map((n) => n.type)))

  // -------------------------------------------- sweeper for unpaid orders
  console.log('\nM7: expired order sweeper')
  // The race loser may still hold a sold-out line in its cart; start clean.
  await req('POST', '/cart/clear', { token: buyer.token })
  await req('POST', '/cart/items', { token: buyer.token, body: { productId: fixture.id, quantity: 1 } })
  const staleOrder = (
    await req('POST', '/orders/checkout', { token: buyer.token, body: { addressId: address.id } })
  ).data
  const heldBefore = (await product(fixture.id)).available

  // Force the payment window into the past (setup only; assertions stay on the API).
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()
  await prisma.order.update({
    where: { id: staleOrder.id },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  })
  await prisma.$disconnect()

  res = await req('POST', '/orders/maintenance/expire', { token: buyer.token })
  check('sweeper requires ADMIN -> 403', res.status === 403, `${res.status}`)

  res = await req('POST', '/orders/maintenance/expire', { token: admin })
  check('sweeper runs -> 200', res.status === 200 && res.data.cancelled >= 1, `${res.status} ${JSON.stringify(res.data)}`)

  res = await req('GET', `/orders/${staleOrder.id}`, { token: buyer.token })
  check('stale order cancelled', res.data.status === 'CANCELLED', res.data.status)
  check('stale hold released', (await product(fixture.id)).available === heldBefore + 1, `available=${(await product(fixture.id)).available}`)

  // ----------------------------------------------- notifications endpoints
  console.log('\nnotifications: ownership + read state')
  const buyerNotifications = await req('GET', '/notifications', { token: buyer.token })
  check('buyer has notifications', buyerNotifications.data.length > 0, `${buyerNotifications.data.length}`)
  res = await req('GET', '/notifications/unread-count', { token: buyer.token })
  check('unread count -> 200', res.status === 200 && typeof res.data.count === 'number', JSON.stringify(res.data))
  const unreadId = buyerNotifications.data.find((n) => !n.readAt)?.id
  if (unreadId) {
    res = await req('POST', `/notifications/${unreadId}/read`, { token: rival.token })
    check("cannot read another user's notification -> 404", res.status === 404, `${res.status}`)
    res = await req('POST', `/notifications/${unreadId}/read`, { token: buyer.token })
    check('owner can mark read', res.status === 200 && Boolean(res.data.readAt), `${res.status}`)
  }
  res = await req('POST', '/notifications/read-all', { token: buyer.token })
  check('mark all read -> 200', res.status === 200 && res.data.updated >= 1, JSON.stringify(res.data))

  // --------------------------------------------------------------- cleanup
  // Every product this run created is deleted, so repeated runs leave the
  // demo catalog exactly as they found it.
  console.log('\ncleanup: removing fixtures from the catalog')
  for (const [label, id] of [
    ['fixture', fixture.id],
    ['race product', raceProduct.id],
    ['adjust product', adjustProduct.id],
    ['variant adjust product', variantAdjust.id],
  ]) {
    const del = await req('DELETE', `/products/${id}`, { token: admin })
    check(`${label} removed`, del.status === 200, `${del.status} ${JSON.stringify(del.data)}`)
  }

  // ------------------------------------------------------------ error shape
  console.log('\nerror handling: consistent envelope')
  res = await req('GET', '/orders/does-not-exist', { token: buyer.token })
  check('404 body is consistent and safe', res.status === 404 && res.data.statusCode === 404 && typeof res.data.message === 'string' && Boolean(res.data.path) && Boolean(res.data.timestamp), JSON.stringify(res.data))
  check('no stack trace leaked', !JSON.stringify(res.data).includes('at '), JSON.stringify(res.data))

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('\nharness error:', err.message)
  process.exit(1)
})
