import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { Header } from '@/app/components/Header'
import { TopBar } from '@/app/components/TopBar'
import { CategoryNavigation } from '@/app/components/CategoryNavigation'
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'MegaMart - Toko Online Terpercaya',
  description: 'Produk premium dengan harga terbaik dan layanan terpercaya',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" className={cn("font-sans", inter.variable)}>
      <body className="bg-white">
        <AuthProvider>
          <TopBar />
          <Header />
          <CategoryNavigation />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
