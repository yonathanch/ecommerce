'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const slides = [
  {
    eyebrow: 'Best Deal Online on smart watches',
    title: 'SMART WEARABLE.',
    subtitle: 'UP to 80% OFF',
    image: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=700&h=700&fit=crop',
  },
  {
    eyebrow: 'Best Deal Online on smartphones',
    title: 'FLAGSHIP PHONES.',
    subtitle: 'UP to 56% OFF',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=700&h=700&fit=crop',
  },
  {
    eyebrow: 'Best Deal Online on home essentials',
    title: 'SMART LIVING.',
    subtitle: 'UP to 50% OFF',
    image: 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=700&h=700&fit=crop',
  },
  {
    eyebrow: 'Best Deal Online on fashion',
    title: 'TRENDY STYLE.',
    subtitle: 'UP to 70% OFF',
    image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=700&h=700&fit=crop',
  },
  {
    eyebrow: 'Best Deal Online on groceries',
    title: 'FRESH DAILY.',
    subtitle: 'UP to 40% OFF',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=700&h=700&fit=crop',
  },
  {
    eyebrow: 'Best Deal Online on audio',
    title: 'PREMIUM SOUND.',
    subtitle: 'UP to 60% OFF',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&h=700&fit=crop',
  },
  {
    eyebrow: 'Best Deal Online on laptops',
    title: 'POWER MACHINE.',
    subtitle: 'UP to 45% OFF',
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=700&h=700&fit=crop',
  },
]

export function HeroBanner() {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setCurrent((p) => (p + 1) % slides.length), 6000)
    return () => clearInterval(timer)
  }, [])

  const next = () => setCurrent((p) => (p + 1) % slides.length)
  const prev = () => setCurrent((p) => (p - 1 + slides.length) % slides.length)
  const slide = slides[current]

  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-6">
      <div className="relative rounded-xl">
        {/* Arrow kiri */}
        <button
          onClick={prev}
          aria-label="Previous slide"
          className="absolute -left-4 sm:-left-6 top-1/2 -translate-y-1/2 z-20 bg-white text-blue-500 rounded-full p-3 shadow-lg hover:bg-blue-50 transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        {/* Arrow kanan */}
        <button
          onClick={next}
          aria-label="Next slide"
          className="absolute -right-4 sm:-right-6 top-1/2 -translate-y-1/2 z-20 bg-white text-blue-500 rounded-full p-3 shadow-lg hover:bg-blue-50 transition"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="relative rounded-xl overflow-hidden bg-[#232a4d] h-[240px] sm:h-[300px] md:h-[340px]">
          {/* Dekorasi lingkaran */}
          <div className="absolute -right-24 -top-24 w-[420px] h-[420px] rounded-full border border-white/5" />
          <div className="absolute right-10 -bottom-40 w-[380px] h-[380px] rounded-full border border-white/5" />

          {/* Teks */}
          <div className="relative h-full flex flex-col justify-center pl-8 sm:pl-14 md:pl-20 pr-8 md:pr-[45%]">
            <p className="text-white/90 text-base sm:text-lg md:text-xl mb-1.5">{slide.eyebrow}</p>
            <h1 className="text-white font-bold tracking-tight text-3xl sm:text-5xl md:text-6xl leading-none">
              {slide.title}
            </h1>
            <p className="text-white font-medium text-lg sm:text-xl md:text-2xl mt-3">{slide.subtitle}</p>
          </div>

          {/* Gambar produk */}
          <div className="hidden sm:block absolute right-6 md:right-16 top-1/2 -translate-y-1/2 w-[36%] max-w-[360px] h-[72%]">
            <img
              src={slide.image}
              alt={slide.title}
              className="w-full h-full object-cover rounded-2xl shadow-2xl"
            />
          </div>

          {/* Dot */}
          <div className="absolute bottom-6 sm:bottom-8 left-8 sm:left-14 md:left-20 flex items-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-2 rounded-full transition-all ${
                  i === current ? 'bg-white w-7' : 'bg-white/50 w-2 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export const HeroCarousel = HeroBanner
