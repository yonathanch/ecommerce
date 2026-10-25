'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from '@/lib/api-client'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import {
  AuthError,
  AuthShell,
  AuthSubmitButton,
  AuthSwitch,
  FieldError,
  PasswordInput,
  authInputClass,
  humanizeAuthError,
} from '@/app/auth/AuthShell'

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email wajib diisi')
    .email('Masukkan alamat email yang valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })
  const { login } = useAuth()
  const router = useRouter()

  const [msg, setMsg] = useState('')

  const onSubmit = async (data: LoginForm) => {
    setMsg('')
    try {
      const res = await axios.post('/auth/login', data)
      const { accessToken, refreshToken: _r, ...user } = res.data
      login(accessToken, user)
      router.push('/')
    } catch (e) {
      setMsg(humanizeAuthError(e, 'Tidak bisa masuk. Periksa email dan passwordmu, lalu coba lagi.'))
    }
  }

  return (
    <AuthShell
      greeting="Selamat datang kembali !!!"
      title="Masuk"
      footer={
        <AuthSwitch
          prompt="Belum punya akun?"
          href="/signup"
          action="Daftar"
        />
      }
    >
      <AuthError message={msg} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="nama@email.com"
            className={authInputClass}
            aria-invalid={errors.email ? true : undefined}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <label
            htmlFor="login-password"
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            Password
          </label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            placeholder="Masukkan password"
            hasError={!!errors.password}
            aria-invalid={errors.password ? true : undefined}
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>

        <div className="pt-2">
          <AuthSubmitButton busy={isSubmitting} busyLabel="Masuk…">
            Masuk
          </AuthSubmitButton>
        </div>
      </form>
    </AuthShell>
  )
}
