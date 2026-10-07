import { ProductList } from './ProductList'
import { Footer } from '../components/Footer'

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <ProductList />
      <Footer />
    </main>
  )
}
