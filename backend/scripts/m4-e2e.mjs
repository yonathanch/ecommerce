/**
 * M4 end-to-end check: cart, wishlist and coupon endpoints.
 *
 * Usage: node scripts/m4-e2e.mjs   (backend must be running on :3002)
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

async function makeUser(tag) {
  const email = `m4-${tag}-${Date.now()}-${seq++}@example.com`
  const res = await req('POST', '/auth/signup', {
    body: { email, password: 'Pass1234', name: `M4 ${tag}` },
  })
  if (res.status !== 201) throw new Error(`signup failed ${res.status} ${JSON.stringify(res.data)}`)
  return { email, token: res.data.accessToken, id: res.data.id }
}

async function signIn(email, password) {
  const res = await req('POST', '/auth/login', { body: { email, password } })
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`)
  return res.data.accessToken
}

let seq = 0

async function main() {
  const health = await req('GET', '/health')
  if (health.status !== 200) throw new Error('backend not healthy — start it first')

  const jwt = await makeUser('cart')
  const other = await makeUser('other')
  const admin = await signIn('admin@example.com', 'admin123')

  // The seed catalog's products all carry variants, so a cart line has to name
  // a SKU. This suite is about cart/coupon mechanics, so it creates its own
  // variant-less fixtures to keep the price math exact and independent of what
  // happens to be seeded — same approach as the M5 suite.
  const createProduct = async (name, price, stock) => {
    const res = await req('POST', '/products', {
      token: admin,
      body: { name, description: 'm4 fixture', price, stock, category: 'Baju Pria' },
    })
    if (res.status !== 201) throw new Error(`create product failed ${res.status} ${JSON.stringify(res.data)}`)
    return res.data
  }

  // ---------------------------------------------------------------- auth guard
  console.log('\nauth guard')
  check('GET /cart without token -> 401', (await req('GET', '/cart')).status === 401)
  check('GET /wishlist without token -> 401', (await req('GET', '/wishlist')).status === 401)
  check('POST /coupons/validate without token -> 401', (await req('POST', '/coupons/validate', { body: { code: 'SUMMER20', subtotal: 1 } })).status === 401)

  // ---------------------------------------------------------------- fixtures
  // Priced above the SUMMER20 minimum purchase (200000) so the coupon can apply.
  const p1 = await createProduct(`M4 Premium ${Date.now()}`, 320000, 50)
  const p2 = await createProduct(`M4 Basics ${Date.now()}`, 79000, 149)
  console.log(`\nfixtures: ${p1.name} (${p1.price}, stock ${p1.stock}) / ${p2.name} (${p2.price}, stock ${p2.stock})`)

  // ---------------------------------------------------------------- empty cart
  console.log('\ncart: empty state')
  let res = await req('GET', '/cart', { token: jwt.token })
  check('GET /cart -> 200', res.status === 200, `${res.status}`)
  check('cart starts empty', Array.isArray(res.data.cart) && res.data.cart.length === 0, JSON.stringify(res.data))
  check('subtotal 0 / totalItems 0', res.data.subtotal === 0 && res.data.totalItems === 0)

  // ---------------------------------------------------------------- add ×2
  console.log('\ncart: add + merge')
  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: p1.id, quantity: 2 } })
  check('POST /cart/items -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  check('first add quantity 2', res.data?.item?.quantity === 2, JSON.stringify(res.data?.item))

  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: p1.id, quantity: 2 } })
  check('merge add -> 201', res.status === 201, `${res.status}`)
  check('merged quantity 4', res.data?.item?.quantity === 4, JSON.stringify(res.data?.item))

  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: p1.id, quantity: 999 } })
  check('over-stock add -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: p1.id, quantity: 0 } })
  check('quantity 0 -> 400', res.status === 400, `${res.status}`)

  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: 'does-not-exist', quantity: 1 } })
  check('unknown product -> 404', res.status === 404, `${res.status}`)

  // second product
  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: p2.id, quantity: 1 } })
  check('add second product -> 201', res.status === 201, `${res.status}`)

  // ---------------------------------------------------------------- summary
  console.log('\ncart: summary')
  res = await req('GET', '/cart', { token: jwt.token })
  const cart = res.data.cart
  const expectedSubtotal = Math.round((p1.price * 4 + p2.price * 1) * 100) / 100
  const expectedItems = 5
  check('two line items', cart.length === 2, JSON.stringify(cart.map((i) => i.productId)))
  check(`subtotal = ${expectedSubtotal}`, res.data.subtotal === expectedSubtotal, `${res.data.subtotal}`)
  check(`totalItems = ${expectedItems}`, res.data.totalItems === expectedItems, `${res.data.totalItems}`)
  check('line includes product name/price/image', Boolean(cart[0].product?.name) && typeof cart[0].unitPrice === 'number', JSON.stringify(cart[0]))

  // ---------------------------------------------------------------- isolation
  console.log('\ncart: per-user isolation')
  res = await req('GET', '/cart', { token: other.token })
  check('other user cart empty', res.data.cart.length === 0 && res.data.totalItems === 0, JSON.stringify(res.data))

  // ---------------------------------------------------------------- update qty
  console.log('\ncart: update quantity')
  res = await req('PUT', `/cart/items/${p1.id}`, { token: jwt.token, body: { quantity: 1 } })
  check('PUT -> 200', res.status === 200, `${res.status}`)
  const p1line = res.data.cart.find((i) => i.productId === p1.id)
  check('quantity now 1', p1line?.quantity === 1, JSON.stringify(p1line))

  res = await req('PUT', `/cart/items/${p1.id}`, { token: jwt.token, body: { quantity: p1.stock + 50 } })
  const clamped = res.data.cart.find((i) => i.productId === p1.id)
  check(`clamped to stock ${p1.stock}`, clamped?.quantity === p1.stock, JSON.stringify(clamped))

  res = await req('PUT', `/cart/items/${p1.id}`, { token: jwt.token, body: { quantity: 0 } })
  check('quantity 0 removes line', !res.data.cart.some((i) => i.productId === p1.id), JSON.stringify(res.data.cart.map((i) => i.productId)))

  res = await req('PUT', '/cart/items/does-not-exist', { token: jwt.token, body: { quantity: 1 } })
  check('PUT unknown item -> 404', res.status === 404, `${res.status}`)

  // ---------------------------------------------------------------- delete
  console.log('\ncart: delete + clear')
  res = await req('DELETE', `/cart/items/${p2.id}`, { token: jwt.token })
  check('DELETE -> 200', res.status === 200, `${res.status}`)
  check('line gone', !res.data.cart.some((i) => i.productId === p2.id))
  res = await req('DELETE', `/cart/items/${p2.id}`, { token: jwt.token })
  check('DELETE again -> 404', res.status === 404, `${res.status}`)

  await req('POST', '/cart/items', { token: jwt.token, body: { productId: p1.id, quantity: 3 } })
  res = await req('POST', '/cart/clear', { token: jwt.token })
  check('POST /cart/clear -> 204', res.status === 204, `${res.status}`)
  res = await req('GET', '/cart', { token: jwt.token })
  check('cart empty after clear', res.data.totalItems === 0 && res.data.cart.length === 0, JSON.stringify(res.data))

  // ------------------------------------------------- variant lines (M10)
  // A product with variants must be carted by SKU: that SKU's stock and price
  // are what the line holds, so an unattributed line would take from a phantom
  // pool. The seed catalog is full of these, so the rule has to hold.
  console.log('\ncart: variant lines')
  const variantRes = await req('POST', '/products', {
    token: admin,
    body: {
      name: `M4 Varian ${Date.now()}`,
      description: 'm4 variant fixture',
      price: 100000,
      stock: 0, // ignored: stock comes from the variants below
      category: 'Baju Pria',
      variants: [
        { sku: `M4-V-RED-M-${Date.now()}`, options: { Warna: 'Merah', Ukuran: 'M' }, price: 110000, stock: 3 },
        { sku: `M4-V-RED-L-${Date.now()}`, options: { Warna: 'Merah', Ukuran: 'L' }, stock: 2 },
      ],
    },
  })
  const variantProduct = variantRes.data
  const skuRedM = variantProduct.variants.find((v) => v.options.Ukuran === 'M').sku
  const skuRedL = variantProduct.variants.find((v) => v.options.Ukuran === 'L').sku
  check('variant fixture stock = sum of SKUs', variantProduct.stock === 5, `${variantProduct.stock}`)

  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: variantProduct.id, quantity: 1 } })
  check('variant product without a SKU -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: variantProduct.id, quantity: 1, variantSku: skuRedM } })
  check('adding a variant SKU -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  check('line prices at the variant price', res.data?.cart?.find((i) => i.variantSku === skuRedM)?.unitPrice === 110000, JSON.stringify(res.data?.cart?.find((i) => i.variantSku === skuRedM)))

  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: variantProduct.id, quantity: 1, variantSku: skuRedM } })
  check('same SKU merges into one line', res.data?.item?.quantity === 2, JSON.stringify(res.data?.item))

  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: variantProduct.id, quantity: 1, variantSku: skuRedL } })
  check('a second SKU is its own line', res.data?.cart?.filter((i) => i.productId === variantProduct.id).length === 2, JSON.stringify(res.data?.cart?.map((i) => i.variantSku)))

  res = await req('POST', '/cart/items', { token: jwt.token, body: { productId: variantProduct.id, quantity: 99, variantSku: skuRedL } })
  check('over-stock on one SKU -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  await req('POST', '/cart/clear', { token: jwt.token })

  // ---------------------------------------------------------------- wishlist
  console.log('\nwishlist')
  res = await req('GET', '/wishlist', { token: jwt.token })
  check('GET /wishlist -> 200 empty', res.status === 200 && Array.isArray(res.data) && res.data.length === 0, JSON.stringify(res.data))

  res = await req('POST', `/wishlist/items/${p1.id}`, { token: jwt.token })
  check('add -> 201', res.status === 201, `${res.status} ${JSON.stringify(res.data)}`)
  check('1 item in wishlist', Array.isArray(res.data) && res.data.length === 1, JSON.stringify(res.data))
  check('item carries product', Boolean(res.data?.[0]?.product?.name), JSON.stringify(res.data?.[0]))

  res = await req('POST', `/wishlist/items/${p1.id}`, { token: jwt.token })
  check('duplicate -> 409', res.status === 409, `${res.status}`)

  res = await req('POST', `/wishlist/items/${p1.id}/toggle`, { token: jwt.token })
  check('toggle removes -> added false', res.data?.added === false, JSON.stringify(res.data))
  res = await req('POST', `/wishlist/items/${p1.id}/toggle`, { token: jwt.token })
  check('toggle re-adds -> added true', res.data?.added === true, JSON.stringify(res.data))

  res = await req('DELETE', `/wishlist/items/${p1.id}`, { token: jwt.token })
  check('delete -> 200 empty', res.status === 200 && res.data.length === 0, JSON.stringify(res.data))
  res = await req('GET', '/wishlist', { token: other.token })
  check('other user wishlist empty', res.data.length === 0, JSON.stringify(res.data))

  // ---------------------------------------------------------------- coupons
  console.log('\ncoupons')
  const subtotal = Math.round(p1.price * 1 * 100) / 100
  const expectedDiscount = Math.min(Math.round(subtotal * 0.2 * 100) / 100, 100000)
  res = await req('POST', '/coupons/validate', { token: jwt.token, body: { code: 'SUMMER20', subtotal } })
  check('SUMMER20 -> 200', res.status === 200, `${res.status} ${JSON.stringify(res.data)}`)
  check(`percent discount = ${expectedDiscount} (20% capped at 100000)`, res.data?.discount === expectedDiscount, JSON.stringify(res.data))
  check('finalAmount = subtotal - discount', res.data?.finalAmount === Math.round((subtotal - expectedDiscount) * 100) / 100, JSON.stringify(res.data))

  res = await req('POST', '/coupons/validate', { token: jwt.token, body: { code: ' summer20 ', subtotal } })
  check('code is trimmed + case-insensitive', res.status === 200, `${res.status}`)

  // WELCOME50 requires a subtotal of at least 300000.
  res = await req('POST', '/coupons/validate', { token: jwt.token, body: { code: 'WELCOME50', subtotal: Math.max(subtotal, 300000) } })
  check('FIXED coupon -> 50000 off', res.data?.discount === 50000, JSON.stringify(res.data))

  res = await req('POST', '/coupons/validate', { token: jwt.token, body: { code: 'WELCOME50', subtotal: 1000 } })
  check('below minPurchase -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  res = await req('POST', '/coupons/validate', { token: jwt.token, body: { code: 'EXPIRED10', subtotal } })
  check('expired -> 400', res.status === 400, `${res.status} ${JSON.stringify(res.data)}`)

  res = await req('POST', '/coupons/validate', { token: jwt.token, body: { code: 'NOPE', subtotal } })
  check('unknown code -> 404', res.status === 404, `${res.status}`)

  // Keep the demo catalog free of test fixtures: drop what this run created.
  console.log('\ncleanup: removing fixtures from the catalog')
  for (const [label, id] of [['p1', p1.id], ['p2', p2.id], ['variant', variantProduct.id]]) {
    const del = await req('DELETE', `/products/${id}`, { token: admin })
    check(`fixture ${label} removed`, del.status === 200, `${del.status}`)
  }

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('\nharness error:', err.message)
  process.exit(1)
})
