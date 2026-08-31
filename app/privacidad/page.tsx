import Link from "next/link"
import { LogoCircle } from "@/components/logo-circle"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { createClient } from "@/lib/supabase/server"
import { AvisoPrivacidadContenido } from "@/components/aviso-privacidad"

export const metadata = {
  title: "Aviso de privacidad · Perrones Cuu",
  description: "Aviso de privacidad de Perrones Cuu — cómo manejamos los datos personales de dueños y paseadores.",
}

export default async function PrivacidadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader isLoggedIn={!!user} />
      <main className="flex-1 px-4 py-12 md:py-20">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 shadow-sm md:p-12">
          <Link href="/" className="mb-6 inline-flex items-center gap-2">
            <LogoCircle className="h-9 w-9" />
            <span className="font-display text-lg font-extrabold">Perrones Cuu</span>
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Aviso de privacidad</h1>
          <p className="mt-2 text-sm text-muted-foreground">Última actualización: junio de 2026</p>

          <div className="prose prose-sm mt-8 max-w-none text-foreground/90">
            <AvisoPrivacidadContenido />
          </div>

          <Link
            href="/"
            className="mt-10 inline-block rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
