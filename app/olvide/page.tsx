"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LogoCircle } from "@/components/logo-circle"
import { BRAND } from "@/lib/constants"

/**
 * "Olvidé mi contraseña".
 *
 * Hasta ahora no existía: quien olvidaba su contraseña se quedaba encerrado
 * para siempre, porque tampoco se podía volver a registrar con el mismo correo.
 * La única salida era escribirle a Endy por WhatsApp — y Endy tampoco podía
 * hacer nada desde su panel.
 *
 * A propósito NO decimos si el correo existe o no: contestar "esa cuenta no
 * existe" le regala a cualquiera una lista de quién es cliente.
 */
export default function OlvidePage() {
  const [email, setEmail] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/nueva-contrasena`,
      })
      if (err) throw err
      setListo(true)
    } catch (err: unknown) {
      // Decirle "revise su internet" cuando lo que pasó es que escribió mal el
      // correo lo manda a perseguir un problema que no tiene.
      const msg = err instanceof Error ? err.message : ""
      setError(
        /invalid|not valid/i.test(msg)
          ? "Ese correo no se ve bien escrito. Revíselo e inténtelo otra vez."
          : /rate limit|too many|security purposes/i.test(msg)
            ? "Ya pidió varios enlaces seguidos. Espere un minuto e inténtelo otra vez."
            : "No pudimos mandar el correo. Revise su internet e inténtelo otra vez.",
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/">
            <LogoCircle className="h-14 w-14" />
          </Link>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Recuperar su contraseña</h1>
          <p className="text-sm text-muted-foreground">Le mandamos un enlace a su correo</p>
        </div>

        {listo ? (
          <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
            <p className="text-sm leading-relaxed">
              Si <b>{email}</b> tiene una cuenta con nosotros, ya le llegó un correo con el enlace para poner una
              contraseña nueva. <b>Revise también la carpeta de spam.</b>
            </p>
            <p className="text-sm text-muted-foreground">
              ¿No le llegó? Escríbanos por WhatsApp al{" "}
              <a
                href={BRAND.whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-primary underline"
              >
                614 594 8513
              </a>{" "}
              y lo resolvemos.
            </p>
            <Link href="/login" className="text-sm font-bold text-primary underline">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form
            onSubmit={enviar}
            className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <Button type="submit" size="lg" className="w-full rounded-full font-bold" disabled={enviando}>
              {enviando ? "Mandando…" : "Mandarme el enlace"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-bold text-primary underline">
                Volver a iniciar sesión
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
