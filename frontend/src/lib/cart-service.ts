import React from 'react'

export interface CartItem {
  productId: string
  productName: string
  price: number
  quantity: number
  stock: number
  category: string
}

export class CartService {
  private readonly CART_SESSION_KEY = 'ecommerce_cart'

  getCart(): CartItem[] {
    const cartJson = typeof window !== 'undefined' ? window.sessionStorage.getItem(this.CART_SESSION_KEY) : null
    if (!cartJson) return []
    try {
      return JSON.parse(cartJson)
    } catch {
      return []
    }
  }

  addToCart(product: { id: string; name: string; price: number; stock: number; category: string }, quantity: number = 1) {
    if (quantity < 1) throw new Error('Quantity must be at least 1')
    if (quantity > product.stock) throw new Error('Quantity exceeds stock')
    const cart = this.getCart()
    const existingIndex = cart.findIndex((item) => item.productId === product.id)
    if (existingIndex >= 0) {
      const newQuantity = cart[existingIndex].quantity + quantity
      if (newQuantity > product.stock) throw new Error('Quantity exceeds stock')
      cart[existingIndex].quantity = newQuantity
    } else {
      cart.push({
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity,
        stock: product.stock,
        category: product.category,
      })
    }
    this.saveCart(cart)
    return cart
  }

  updateQuantity(productId: string, quantity: number) {
    if (quantity < 0) throw new Error('Quantity cannot be negative')
    if (quantity === 0) return this.removeFromCart(productId)
    const cart = this.getCart()
    const index = cart.findIndex((item) => item.productId === productId)
    if (index === -1) throw new Error('Item not in cart')
    if (quantity > cart[index].stock) throw new Error('Quantity exceeds stock')
    cart[index].quantity = quantity
    this.saveCart(cart)
    return cart
  }

  removeFromCart(productId: string) {
    const cart = this.getCart()
    const filtered = cart.filter((item) => item.productId !== productId)
    this.saveCart(filtered)
    return filtered
  }

  clearCart() {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(this.CART_SESSION_KEY)
  }

  getCartSummary() {
    const cart = this.getCart()
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0)
    const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
    return { totalItems, totalPrice, items: cart }
  }

  private saveCart(cart: CartItem[]) {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(this.CART_SESSION_KEY, JSON.stringify(cart))
    }
  }
}

export const cartService = new CartService()

// React hook wrapper for components
export function useCart() {
  const [items, setItems] = React.useState<CartItem[]>([])
  
  React.useEffect(() => {
    setItems(cartService.getCart())
  }, [])
  
  const addToCart = (item: { id: string; name: string; price: number; quantity: number }) => {
    cartService.addToCart({ id: item.id, name: item.name, price: item.price, stock: 999, category: '' }, item.quantity)
    setItems(cartService.getCart())
  }
  
  return { items, addToCart }
}
