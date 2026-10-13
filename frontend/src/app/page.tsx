'use client'

import { HeroBanner } from './components/HeroBanner'
import { CategoryIcons } from './components/CategoryIcons'
import { ProductDealSection } from './components/ProductDealSection'
import { FeaturedBrands } from './components/FeaturedBrands'
import { DailyEssentialsSection } from './components/DailyEssentialsSection'
import { Footer } from './components/Footer'

export default function Home() {
  return (
    <>
      <main className="bg-white">
        {/* Hero Carousel */}
        <HeroBanner />

        {/* Product Deal Section */}
        <ProductDealSection />

        {/* Top Categories */}
        <CategoryIcons />

        {/* Top Popular Brand — name + link per brand */}
        <FeaturedBrands />

        {/* Daily Essentials */}
        <DailyEssentialsSection />
      </main>

      {/* Footer */}
      <Footer />
    </>
  )
}
