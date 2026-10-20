import { LoginForm } from '@/app/auth/LoginForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Masuk | OUTFITX',
  description:
    'Masuk ke akun OUTFITX untuk melanjutkan belanja, melacak pesanan, dan menyimpan produk favorit.',
}

export default function LoginPage() {
  return <LoginForm />
}
