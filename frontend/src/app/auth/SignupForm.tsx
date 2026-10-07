'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from '@/lib/api-client'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
})

type SignupForm = z.infer<typeof signupSchema>

export function SignupForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  })
  const { login } = useAuth()
  const router = useRouter()

  const [msg, setMsg] = useState('')

  const onSubmit = async (data: SignupForm) => {
    try {
      const res = await axios.post('/auth/signup', data)
      login(res.data.token, res.data.user)
      router.push('/products')
    } catch (e) {
      setMsg('Error: ' + (e as any).response?.data?.message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md mx-auto p-4 border rounded">
      <h2 className="text-xl mb-4">Signup</h2>
      <input {...register('name')} placeholder="Name" className="w-full mb-2 p-1 border" />
      {errors.name && <p className="text-red-500">{errors.name.message}</p>}
      <input {...register('email')} placeholder="Email" className="w-full mb-2 p-1 border" />
      {errors.email && <p className="text-red-500">{errors.email.message}</p>}
      <input {...register('password')} type="password" placeholder="Password" className="w-full mb-2 p-1 border" />
      {errors.password && <p className="text-red-500">{errors.password.message}</p>}
      <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded">
        {isSubmitting ? 'Mendaftar…' : 'Signup'}
      </button>
      {msg && <p className="mt-2">{msg}</p>}
    </form>
  )
}