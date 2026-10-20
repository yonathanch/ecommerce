'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, User } from 'lucide-react'
import axios from '@/lib/api-client'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import {
  AuthError,
  AuthInputIcon,
  AuthShell,
  AuthSubmitButton,
  AuthSwitch,
  FieldError,
  PasswordInput,
  authInputClass,
  humanizeAuthError,
} from '@/app/auth/AuthShell'

const signupSchema = z
  .object({
    name: z.string().min(1, 'Nama lengkap wajib diisi').max(100, 'Nama maksimal 100 karakter'),
    email: z
      .string()
      .min(1, 'Email wajib diisi')
      .email('Masukkan alamat email yang valid'),
    password: z.string().min(8, 'Password minimal 8 karakter'),
    confirm: z.string().min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirm'],
  })

type SignupForm = z.infer<typeof signupSchema>

export function SignupForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  })
  const { login } = useAuth()
  const router = useRouter()

  const [msg, setMsg] = useState('')

  const onSubmit = async (data: SignupForm) => {
    setMsg('')
    // `confirm` exists only to keep the two password fields in sync — the API
    // contract is still { name, email, password }.
    const { confirm: _confirm, ...payload } = data
    try {
      const res = await axios.post('/auth/signup', payload)
      const { accessToken, refreshToken: _r, ...user } = res.data
      login(accessToken, user)
      router.push('/')
    } catch (e) {
      setMsg(humanizeAuthError(e, 'Tidak bisa membuat akun. Coba lagi sebentar lagi.'))
    }
  }

  return (
    <AuthShell
      title="Buat akun OUTFITX"
      subtitle="Daftar gratis dalam semenit — langsung bisa checkout cepat dan simpan favoritmu."
      panelEyebrow="Gratis & cepat"
      panelHeadline="Buat akun, mulai gayamu."
      panelCopy="Satu akun untuk belanja, wishlist, dan semua pesananmu — tanpa ribet."
      footer={
        <AuthSwitch
          prompt="Sudah punya akun?"
          href="/login"
          action="Masuk di sini"
        />
      }
    >
      <AuthError message={msg} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="signup-name"
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            Nama lengkap
          </label>
          <div className="relative">
            <AuthInputIcon icon={User} />
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              placeholder="Nama sesuai identitas"
              className={authInputClass}
              aria-invalid={errors.name ? true : undefined}
              {...register('name')}
            />
          </div>
          <FieldError message={errors.name?.message} />
        </div>

        <div>
          <label
            htmlFor="signup-email"
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            Email
          </label>
          <div className="relative">
            <AuthInputIcon icon={Mail} />
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="nama@email.com"
              className={authInputClass}
              aria-invalid={errors.email ? true : undefined}
              {...register('email')}
            />
          </div>
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <label
            htmlFor="signup-password"
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            Password
          </label>
          <PasswordInput
            id="signup-password"
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            hasError={!!errors.password}
            aria-invalid={errors.password ? true : undefined}
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>

        <div>
          <label
            htmlFor="signup-confirm"
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            Ulangi password
          </label>
          <PasswordInput
            id="signup-confirm"
            autoComplete="new-password"
            placeholder="Ketik ulang password"
            hasError={!!errors.confirm}
            aria-invalid={errors.confirm ? true : undefined}
            {...register('confirm')}
          />
          <FieldError message={errors.confirm?.message} />
        </div>

        <p className="text-xs leading-relaxed text-neutral-500">
          Dengan mendaftar, kamu menyetujui syarat layanan dan kebijakan privasi
          OUTFITX, serta siap menerima informasi promo dari kami.
        </p>

        <div className="pt-1">
          <AuthSubmitButton busy={isSubmitting} busyLabel="Mendaftar…">
            Buat akun
          </AuthSubmitButton>
        </div>
      </form>
    </AuthShell>
  )
}
