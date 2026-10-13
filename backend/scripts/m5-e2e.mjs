/**
 * M5 end-to-end check: addresses + checkout (order creation, stock holds).
 *
 * Scope note: since M6 moved stock deduction to the verified payment webhook,
 * this suite asserts the *reservation* contract only (hold created, on-hand
 * stock untouched, hold released on cancel). Deduction, ledger rows, payment
 * capture and admin inventory live in m6-m7-e2e.mjs.
 *
 * Usage: node scripts/m5-e2e.mjs   (backend must be running on :3002)
 */
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

async function req(method, path, { body, token } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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
  const email = `m5-${tag}-${Date.now()}-${seq++}@example.com`
  const res = await req('POST', '/auth/signup', {
    body: { email, password: 'Pass1234', name: `M5 ${tag}` },
  })
  if (res.status !== 201) throw new Error(`signup failed ${res.status} ${JSON.stringify(res.data)}`)
  return { email, token: res.data.accessToken, id: res.data.id }
}

async function signIn(email, password) {
  const res = await req('POST', '/auth/login', { body: { email, password } })
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`)
  return res.data.accessToken
}

const address = (over = {}) => ({
  recipient: 'Budi Santoso',
  phone: '081234567890',
  line1: 'Jl. Merdeka No. 10',
  city: 'Jakarta',
  postalCode: '10110',
  ...over,
})

async function main() {
  const health = await req('GET', '/health')
  if (health.status !== 200) throw new Error('backend not healthy — start it first')

  const admin = await signIn('admin@example.com', 'admin123')
  const userA = await makeUser('a')
  const userB = await makeUser('b')

  const product = async (id) => (await req('GET', `/products/${id}`)).data
  const createProduct = async (name, price, stock) => {
    const res = await req('POST', '/products', {
      token: admin,
      body: { name, description: 'm5 fixture', price, stock, category: 'Baju Pria' },
    })
    if (res.status !== 201) throw new Error(`create product failed ${res.status} ${JSON.stringify(res.data)}`)
    return res.data.id
  }

  // ------------------------------------------------------------------ guards
  console.log('\nauth guard')
  check('GET /addresses without token -> 401', (await req('GET', '/addresses')).status === 401)
  check('POST /orders/checkout without token -> 401', (await req('POST', '/orders/checkout', { body: { addressId: 'x' } })).status === 401)

  // --------------------------------------------------------------- addresses
  console.log('\naddresses')
  let res = await req('GET', '/addresses', { token: userA.token })
  check('list starts empty', res.status === 200 && res.data.length === 0, JSON.stringify(res.data))

  res = await req('POST', '/addresses', { token: userA.token, body: address() })
  check('create -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const addr1 = res.data
  check('first address becomes default', addr1.isDefault === true, JSON.stringify(addr1))

  res = await req('POST', '/addresses', { token: userA.token, body: address({ city: 'Bandung' }) })
  const addr2 = res.data
  check('second address -> 201, not default', res.status === 201 && addr2.isDefault === false, JSON.stringify(addr2))

  res = await req('POST', '/addresses', { token: userA.token, body: { recipient: 'X', phone: '081', line1: '', city: 'Y' } })
  check('invalid payload -> 400', res.status === 400, `${res.status}`)

  res = await req('POST', `/addresses/${addr2.id}/default`, { token: userA.token })
  check('set default -> 200', res.status === 200 && res.data.isDefault === true, JSON.stringify(res.data))
  res = await req('GET', '/addresses', { token: userA.token })
  check('default sorts first', res.data[0].id === addr2.id, JSON.stringify(res.data.map((a) => [a.id, a.isDefault])))
  check('exactly one default', res.data.filter((a) => a.isDefault).length === 1, JSON.stringify(res.data))

  res = await req('PUT', `/addresses/${addr2.id}`, { token: userA.token, body: { city: 'Surabaya' } })
  check('update -> 200 city changed', res.status === 200 && res.data.city === 'Surabaya', JSON.stringify(res.data))

  res = await req('GET', `/addresses/${addr1.id}`, { token: userB.token })
  check('other user GET address -> 404', res.status === 404, `${res.status}`)
  res = await req('PUT', `/addresses/${addr1.id}`, { token: userB.token, body: { city: 'Nope' } })
  check('other user PUT address -> 404', res.status === 404, `${res.status}`)

  res = await req('DELETE', `/addresses/${addr2.id}`, { token: userA.token })
  check('delete default -> 200', res.status === 200, `${res.status}`)
  res = await req('GET', '/addresses', { token: userA.token })
  check('remaining address promoted to default', res.data.length === 1 && res.data[0].isDefault === true, JSON.stringify(res.data))
  const shippingAddressId = res.data[0].id

  // --------------------------------------------------------------- checkout
  console.log('\ncheckout: guards')
  res = await req('POST', '/orders/checkout', { token: userA.token, body: { addressId: shippingAddressId } })
  check('empty cart -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  // Priced above the SUMMER20 minimum purchase so the coupon can apply.
  const fixtureId = await createProduct(`M5 Kemeja ${Date.now()}`, 320000, 5)
  await req('POST', '/cart/items', { token: userA.token, body: { productId: fixtureId, quantity: 2 } })
  res = await req('POST', '/orders/checkout', { token: userA.token, body: { addressId: 'not-an-address' } })
  check('unknown address -> 404', res.status === 404, `${res.status}`)

  const ordersBeforeBadAddress = (await req('GET', '/orders', { token: userB.token })).data.length
  await req('POST', '/cart/items', { token: userB.token, body: { productId: fixtureId, quantity: 1 } })
  res = await req('POST', '/orders/checkout', { token: userB.token, body: { addressId: addr1.id } })
  check('address owned by someone else -> 404', res.status === 404, `${res.status} ${JSON.stringify(res.data)}`)
  check('rejected checkout creates no order', (await req('GET', '/orders', { token: userB.token })).data.length === ordersBeforeBadAddress)
  res = await req('GET', '/cart', { token: userA.token })
  check('rejected checkout keeps the cart', res.data.totalItems === 2, JSON.stringify(res.data))
  await req('POST', '/cart/clear', { token: userB.token })
  res = await req('POST', '/orders/checkout', { token: userA.token, body: {} })
  check('missing addressId -> 400', res.status === 400, `${res.status}`)

  console.log('\ncheckout: order creation with coupon')
  const stockBefore = (await product(fixtureId)).stock
  res = await req('POST', '/orders/checkout', {
    token: userA.token,
    body: { addressId: shippingAddressId, couponCode: 'SUMMER20' },
  })
  check('checkout -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  const order = res.data
  check('subtotal = 640000', order.subtotal === 640000, `${order.subtotal}`)
  check('discount = 100000 (20% capped)', order.discount === 100000, `${order.discount}`)
  check('totalPrice = 540000', order.totalPrice === 540000, `${order.totalPrice}`)
  check('couponCode recorded', order.couponCode === 'SUMMER20', `${order.couponCode}`)
  check('addressId recorded', order.addressId === shippingAddressId, `${order.addressId}`)
  check('shippingAddress snapshot stored', order.shippingAddress?.recipient === 'Budi Santoso', JSON.stringify(order.shippingAddress))
  check('order item carries the price snapshot', order.items?.[0]?.quantity === 2 && order.items?.[0]?.price === 320000, JSON.stringify(order.items))
  check('order starts PENDING and expires', order.status === 'PENDING' && Boolean(order.expiresAt), JSON.stringify({ status: order.status, expiresAt: order.expiresAt }))

  res = await req('GET', '/cart', { token: userA.token })
  check('cart emptied after checkout', res.data.totalItems === 0, JSON.stringify(res.data))

  console.log('\ncheckout: stock is held, not deducted')
  let snap = await product(fixtureId)
  check(`on-hand stock untouched (${stockBefore})`, snap.stock === stockBefore, `${snap.stock}`)
  check('2 units held for the order', snap.reserved === 2, `reserved=${snap.reserved}`)
  check('available reduced by 2', snap.available === stockBefore - 2, `available=${snap.available}`)

  res = await req('GET', `/orders/${order.id}`, { token: userA.token })
  check('order detail exposes the active hold', res.data.reservations?.some((r) => r.status === 'ACTIVE' && r.quantity === 2), JSON.stringify(res.data.reservations))

  console.log('\ncoupon single-use')
  res = await req('POST', '/coupons/validate', { token: userA.token, body: { code: 'SUMMER20', subtotal: 640000 } })
  check('validate after use -> 400 already used', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)
  await req('POST', '/cart/items', { token: userA.token, body: { productId: fixtureId, quantity: 2 } })
  res = await req('POST', '/orders/checkout', {
    token: userA.token,
    body: { addressId: shippingAddressId, couponCode: 'SUMMER20' },
  })
  check('checkout reusing coupon -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)
  res = await req('GET', '/cart', { token: userA.token })
  check('failed checkout keeps the cart', res.data.totalItems === 2, JSON.stringify(res.data))
  check('no extra hold after a failed checkout', (await product(fixtureId)).reserved === 2, `reserved=${(await product(fixtureId)).reserved}`)
  await req('POST', '/cart/clear', { token: userA.token })

  console.log('\ncheckout: unavailable stock is refused')
  const soldOutId = await createProduct(`M5 Sold Out ${Date.now()}`, 200000, 0)
  res = await req('POST', '/cart/items', { token: userA.token, body: { productId: soldOutId, quantity: 1 } })
  check('cannot add a sold-out product', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  // ---------------------------------------------- cancel releases the hold
  console.log('\ncancel: releases holds')
  const availableBeforeCancel = (await product(fixtureId)).available
  res = await req('POST', `/orders/${order.id}/cancel`, { token: userA.token })
  check('cancel -> 200 CANCELLED', res.status === 200 && res.data.status === 'CANCELLED', `${res.status} ${JSON.stringify(res.data)}`)
  check('hold released, availability restored', (await product(fixtureId)).available === availableBeforeCancel + 2, `available=${(await product(fixtureId)).available}`)
  check('on-hand stock never changed', (await product(fixtureId)).stock === stockBefore, `${(await product(fixtureId)).stock}`)
  res = await req('POST', `/orders/${order.id}/cancel`, { token: userA.token })
  check('double cancel -> 400', res.status === 400, `${res.status}`)

  // ------------------------------------------------------------- isolation
  console.log('\norder isolation')
  res = await req('GET', `/orders/${order.id}`, { token: userB.token })
  check('other user cannot read order -> 404', res.status === 404, `${res.status}`)
  res = await req('GET', `/orders/${order.id}`, { token: userA.token })
  check('owner can read order', res.status === 200 && res.data.id === order.id, `${res.status}`)
  check('shipping snapshot survives', res.data.shippingAddress?.city === 'Jakarta', JSON.stringify(res.data.shippingAddress))

  // Keep the demo catalog free of test fixtures: drop what this run created.
  console.log('\ncleanup: removing fixtures from the catalog')
  for (const id of [fixtureId, soldOutId]) {
    const res = await req('DELETE', `/products/${id}`, { token: admin })
    check(`fixture ${id} removed`, res.status === 200, `${res.status}`)
  }

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('\nharness error:', err.message)
  process.exit(1)
})
