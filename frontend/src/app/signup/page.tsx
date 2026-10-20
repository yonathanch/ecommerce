import { SignupForm } from '@/app/auth/SignupForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Daftar | OUTFITX',
  description:
    'Buat akun OUTFITX gratis — checkout lebih cepat, simpan wishlist, dan lacak semua pesananmu.',
}

export default function SignupPage() {
  return <SignupForm />
}
