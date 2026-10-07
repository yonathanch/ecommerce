import { SignupForm } from '@/app/auth/SignupForm'
import Link from 'next/link'

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col justify-center">
      <SignupForm />
      <p className="text-center mt-4">
        Sudah punya akun? <Link href="/login" className="text-blue-600 hover:underline">Login di sini</Link>
      </p>
    </div>
  )
}
