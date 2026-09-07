"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LogoCircle } from "@/components/logo-circle"

/**
 * Poner una contraseña nueva, llegando desde el enlace del correo.
 *
 * Supabase deja la sesión de recuperación puesta al abrir el enlace, así que
 * aquí basta con updateUser. Lo que NO puede pasar es que alguien caiga a esta
 * pantalla sin ese enlace y se quede escribiendo en un formulario que nunca va
 * a guardar: por eso primero se revisa que haya sesión y, si no la hay, se le
 * dice qué hacer en vez de dejarlo picando un botón que no sirve.
 */
export default function NuevaContrasenaPage() {
  const router = useRouter()
  const [revisando, setRevisando] = useState(true)
  const [haySesion, setHaySesion] = useState(false)
  const [pass, setPass] = useState("")
  const [pass2, setPass2] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // El enlace del correo trae el token en el hash; Supabase lo canjea solo,
    // pero tarda un instante. Se escucha el evento y además se pregunta.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sesion) => {
      if (sesion) {
        setHaySesion(true)
        setRevisando(false)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHaySesion(true)
      setRevisando(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (pass.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.")
      return
    }
    if (pass !== pass2) {
      setError("Las dos contraseñas no son iguales.")
      return
    }
    setGuardando(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.updateUser({ password: pass })
      if (err) throw err
      setListo(true)
      setTimeout(() => {
        router.push("/panel")
        router.refresh()
      }, 1800)
    } catch (err: unknown) {
      setError(
        err instanceof Error && /same/i.test(err.message)
          ? "Esa es la misma contraseña que ya tenía. Escriba una distinta."
          : "No se pudo guardar. Vuelva a abrir el enlace del correo e inténtelo otra vez.",
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/">
            <LogoCircle className="h-14 w-14" />
          </Link>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Su contraseña nueva</h1>
        </div>

        {revisando ? (
          <p className="rounded-3xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
            Revisando su enlace…
          </p>
        ) : listo ? (
          <p className="rounded-3xl border border-border bg-card p-6 text-center text-sm font-semibold text-primary shadow-sm">
            ¡Listo! Su contraseña quedó cambiada. Lo estamos llevando a su panel…
          </p>
        ) : !haySesion ? (
          <div className="flex flex-col gap-4 rounded-3xl border-2 border-amber-400 bg-amber-50 p-6 text-center shadow-sm">
            <p className="text-sm leading-relaxed text-amber-950">
              Este enlace ya venció o se abrió mal. Los enlaces duran poco tiempo por seguridad.
            </p>
            <Link href="/olvide" className="text-sm font-bold text-primary underline">
              Pedir uno nuevo
            </Link>
          </div>
        ) : (
          <form
            onSubmit={guardar}
            className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="pass">Contraseña nueva</Label>
              <Input
                id="pass"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pass2">Escríbala otra vez</Label>
              <Input
                id="pass2"
                type="password"
                autoComplete="new-password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <Button type="submit" size="lg" className="w-full rounded-full font-bold" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
