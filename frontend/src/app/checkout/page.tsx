'use client'

import { CheckoutForm } from './CheckoutForm'

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <CheckoutForm onSuccess={() => {}} />
    </div>
  )
}
