import { LoginForm } from '@/app/auth/LoginForm'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col justify-center">
      <LoginForm />
      <p className="text-center mt-4">
        Belum punya akun? <Link href="/signup" className="text-blue-600 hover:underline">Daftar di sini</Link>
      </p>
    </div>
  )
}
