"use client"

import type React from "react"
import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LogoCircle } from "@/components/logo-circle"

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signErr) throw signErr
      const rawRedirect = params.get("redirectTo")
      const safeRedirect = rawRedirect && rawRedirect.startsWith("/") ? rawRedirect : null
      router.push(safeRedirect ?? "/panel")
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Correo o contraseña incorrectos")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/">
            <LogoCircle className="h-14 w-14" />
          </Link>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Bienvenido de vuelta</h1>
          <p className="text-sm text-muted-foreground">Inicia sesión en Perrones Cuu</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <Button type="submit" size="lg" className="w-full rounded-full font-bold" disabled={loading}>
            {loading ? "Entrando..." : "Iniciar sesión"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/signup" className="font-bold text-primary underline">
              Regístrate
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
