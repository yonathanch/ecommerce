import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { StorefrontChrome } from "@/app/components/StorefrontChrome";
import { Inter } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { cn } from "@/lib/utils";
import { LocaleProvider } from "@/app/providers/LocaleProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "OUTFITX - Toko Online Terpercaya",
  description: "Produk premium dengan harga terbaik dan layanan terpercaya",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // GeistSans only exposes a CSS variable; the admin shell opts in through the
  // `.admin-theme` class so the storefront keeps its own font stack.
  return (
    <html lang="id" className={cn("font-sans", inter.variable, GeistSans.variable)}>
      <body className="bg-white">
        <LocaleProvider>
          <AuthProvider>
            <StorefrontChrome />
            {children}
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
